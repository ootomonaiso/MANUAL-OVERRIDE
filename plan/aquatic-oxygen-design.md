# Aquatic（水中アクション）酸素ゲージ機能 設計書

- 日付: 2026-09-09
- 対象ブランチ: `feature/aquatic-genre`
- 状態: 承認待ち → Implementer へ発注

## 1. 背景・目的

Aquatic ジャンル（深海ダイブ）の核となるメカニクス「酸素ゲージ」を実装する。
酸素は時間とともに減衰し、障害物に被弾すると大きく減り、安全色ハザード（珊瑚＝safe diamond 等）に
触れると回復する。酸素が 0 になるとゲームオーバー。

現状 `aquatic.json` は `enableFeatures: ["hp", "item_pickup", "slow_precise"]` で
汎用 HP システムを借用しているが、「酸素」という独立した減衰リソースとしては不適切
（HP は 3 段階の離散値で、時間減衰・珊瑚回復の演出に合わない）。
専用の `oxygen` Feature を新設し、`hp` と置換する。

## 2. 調査で判明した重要事項（エンジン修正が必須）

### 2.1 被弾時の即死フォールバックが「被弾吸収」を無視する（既存バグ）

`src/game/sideScroller.ts` の `_onPlayerHit()`（~859 行）:

```ts
for (const sys of getActiveSystems(this.rules.features)) {
  sys.onPlayerHit?.(world)
}
// どのシステムも死亡を処理しなかった場合（hp feature なし）は即死
if (!this.dead) {
  this._die(p)
}
```

コメントの意図は「hp feature なし（どのシステムも被弾を処理しない）場合のみ即死」だが、
コードは `this.dead` の有無しか見ていない。`RpgFeature.onPlayerHit` が HP を 3→2 に減らしても
`dead` は false のままなので、**`hp` feature を持つ全ジャンルで 1 被弾即死**になっている。

実機検証済み（vitest で `SideScroller` を実インスタンス化し、`features: ['hp', 'item_pickup']`、
hp=3 で危険ハザードに 1 被弾）:

```
player.hp after hit = 2     ← RpgFeature が HP を減算
scroller.dead = true        ← エンジンが即死させた
```

影響を受ける現行ジャンル（`enableFeatures` に `hp` を持つ）:
**aquatic / dungeon / glitch / horror / puzzle / rpg / survival**（計 7 種）。
レベルアップ回復・シールド・無敵フレーム・HUD の HP ハートが全て「複数回被弾して生存」を
前提にしているため、これは設計意図に反するバグと判断する。

**このバグを放置すると、oxygen feature をそのまま実装しても
「被弾 → 酸素 100→75 → エンジンが即死」となり、酸素ダメージの仕様（oxygen > 0 で生存）
が機能しない。** したがってエンジン修正を本タスクの必須要素とする。

### 2.2 修正方針: `onPlayerHit` の戻り値で「被弾吸収」を明示する

`FeatureSystem.onPlayerHit` の戻り値を `boolean` に変更する。
`true` = このシステムが被弾を処理した（生存可能）。エンジンは「死亡していない かつ
どのシステムも吸収していない」場合のみ即死させる。

```ts
// sideScroller.ts
let absorbed = false
for (const sys of getActiveSystems(this.rules.features)) {
  if (sys.onPlayerHit?.(world) === true) absorbed = true
}
if (!this.dead && !absorbed) {
  this._die(p)
}
```

既存実装への影響（全 3 件を確認済み）:

| 実装 | 変更 | 挙動変化 |
|---|---|---|
| `RpgFeature.onPlayerHit` | `hp` feature なし → `return false`。あり → 処理して `return true` | **hp ジャンルが 1 被弾即死から複数回生存に変化（バグ修正）** |
| `TetrisFeature.onPlayerHit` | `return false`（無処理のまま） | なし（従来どおり被弾即死） |
| `NearMissComboFeature.onPlayerHit` | `return false`（コンボリセットのみ） | なし |

`onPlayerHit` を実装していないシステムは `undefined` を返すので `=== true` は false =
吸収なし。既存の登録システム全体に対して後方互換。

テストへの影響: `multiHitGuard.test.ts` / `stealthIframe.test.ts` は features を空にしている
ため挙動不変。hp feature で「1 被弾で死亡する」ことをアsertしているテストは存在しない
（全テストを grep 確認済み）。

### 2.3 safe hazard は接触後も残り、`onSafeHazardTouch` が毎フレーム発火する

衝突ループ（`_updateHorizontal` ~823 行 / `_updateVertical` ~655 行）は safe hazard の
除去を行わず、重なり続ける間 `onSafeHazardTouch` を毎フレーム呼び出す。
酸素回復をここで毎フレーム実行すると、珊瑚 1 個で即 max 到達＋ポップアップ・SE・
パーティクルのスパムになる。

**設計判断: safe hazard は接触時に消費する（`world.removeHazardById(hazard)`）。**
「珊瑚に触れたらなくなる」はゲームとして自然で、スパムを根本から解決する。
 aquatic の features（`oxygen` / `item_pickup` / `slow_precise`）には
`color_touch`（safe hazard のスコア処理）が含まれていないため、除去による副作用はない。
逆順イテレーション中の `removeHazardById`（indexOf + splice）は現在の要素の除去なので安全。

## 3. 要件定義

### 3.1 機能要件

| ID | 要件 |
|---|---|
| FR-1 | `oxygen` feature 有効時、酸素は `oxygenDecayRate`/秒 で減少する |
| FR-2 | 酸素は `[0, maxOxygen]` にクランプされる |
| FR-3 | 酸素が 0 になった瞬間、プレイヤーは死亡する（標準の死亡フロー `modifyPlayerHp(-maxHp)` 経由。1 回のみ） |
| FR-4 | 危険ハザード被弾で `oxygenHitDamage` だけ酸素が減り、`oxygenHitPopupColor` のポップアップ＋`onHungerDamage()` SE が再生される |
| FR-5 | 被弾時に oxygen > 0 なら無敵フレーム（`VFX.invincibleDuration`）を付与し生存する（2.1 のエンジン修正が前提） |
| FR-6 | oxygenLowThreshold 以下に**落ちた瞬間**に 1 回だけ警告（`onHungerDamage()` SE ＋「O2 LOW!」ポップアップ）。閾値以上に回復すると再度警告できるようにフラグをリセットする |
| FR-7 | safe hazard 接触で `oxygenCoralRestore` だけ酸素が回復（max クランプ）し、`coralPopupColor` の「+O2」ポップアップ・気泡パーティクル・`onItemPickup()` SE が発生。接触したハザードは除去される（2.3） |
| FR-8 | 画面上部に酸素ゲージ HUD（左上・横バー）を描画する。閾値以上は `oxygenColorHigh`、以下は `oxygenColorLow`。「O2」ラベル付き |
| FR-9 | `oxygen` feature 無効時は一切の処理・描画を行わない（他ジャンルへの影響ゼロ） |
| FR-10 | 説明書更新（`onManualUpdated`）で酸素値は保持される（#179 のスコア巻き戻しバグ回避ルール） |
| FR-11 | ジャンル定義 `aquatic.json` の `enableFeatures` から `hp` を外し `oxygen` を入れる |
| FR-12 | `schemas/genre.schema.json` の `enableFeatures` / `disableFeatures` 両 enum に `oxygen` を追加（validate-json.mjs が Ajv で検証するため必須） |

### 3.2 非機能要件

- `any` 型禁止・`===` 使用・`prefer-const`（ESLint error ルール遵守）
- 数値リテラルの直書き禁止（ゲームバランス値は config、実装固有定数はファイル先頭 const）
- 新規 SFX ファイルは作成しない（既存 `onHungerDamage()` / `onItemPickup()` を再利用）
- 新規 config セクションは `REQUIRED_SECTIONS` に入れない（任意セクション扱い）
- PixelCanvas.withAlpha は alpha < 0.0625 で消えるため、薄い HUD 要素は rgba() 文字列を直接使う

## 4. 設計

### 4.1 ファイル変更一覧

| # | ファイル | 種別 | 内容 |
|---|---|---|---|
| 1 | `src/data/config/oxygen.json` | 新規 | 酸素ゲージパラメータ（§4.2） |
| 2 | `src/framework/config-types.ts` | 変更 | `OxygenConfig` インターフェース追加＋`GameConfigMap.oxygen` 登録 |
| 3 | `src/data/tunables.ts` | 変更 | `export const OXYGEN = _c.oxygen` |
| 4 | `src/framework/ConfigValidator.ts` | 変更 | `RANGE_CHECKS` に oxygen の範囲チェック追加（REQUIRED_SECTIONS には追加しない） |
| 5 | `src/engine/FeatureSystem.ts` | 変更 | `onPlayerHit` の戻り値を `boolean` に変更＋ドキュメント更新（§2.2） |
| 6 | `src/game/sideScroller.ts` | 変更 | `_onPlayerHit` を absorbed 判定に変更（§2.2） |
| 7 | `src/game/systems/RpgFeature.ts` | 変更 | `onPlayerHit` に `return true/false` を付与 |
| 8 | `src/game/systems/TetrisFeature.ts` | 変更 | `onPlayerHit` に `return false` を付与 |
| 9 | `src/game/systems/NearMissComboFeature.ts` | 変更 | `onPlayerHit` に `return false` を付与 |
| 10 | `src/game/systems/OxygenFeature.ts` | 新規 | 酸素ゲージ本体（§4.4） |
| 11 | `src/game/systems/index.ts` | 変更 | `registerFeature(new OxygenFeature())` 登録 |
| 12 | `src/data/genres/aquatic.json` | 変更 | `enableFeatures: ["oxygen", "item_pickup", "slow_precise"]` |
| 13 | `schemas/genre.schema.json` | 変更 | 両 enum に `"oxygen"` 追加 |
| 14 | `docs/genre/aquatic-genre.md` | 新規 | 実装ドキュメント（§6） |
| 15 | `docs/genre/README.md` | 変更 | aquatic 行をドキュメント一覧に追加 |
| 16 | `docs/feature-ids.md` | 変更 | `oxygen` 行を FeatureId リファレンスに追加（生存系セクション＋実装ステータス表） |
| 17 | `tests/unit/game/OxygenFeature.test.ts` | 新規 | ユニットテスト（§5） |

リポジトリ直下に `Aquatic.md` は存在しない（`git ls-files Aquatic.md` 空・`Test-Path` False）ため、
削除対象は無い。

### 4.2 `src/data/config/oxygen.json`

```json
{
  "$comment": "水中アクション固有パラメータ（酸素ゲージ）",
  "section": "oxygen",
  "maxOxygen": 100,
  "oxygenDecayRate": 4.0,
  "oxygenHitDamage": 25,
  "oxygenCoralRestore": 30,
  "oxygenLowThreshold": 30,
  "hudBarWidth": 160,
  "hudBarHeight": 10,
  "hudTopOffset": 12,
  "hudLeftOffset": 12,
  "hudLabelColor": "#aaddff",
  "oxygenColorHigh": "#44ddff",
  "oxygenColorLow": "#ff4444",
  "oxygenBarBgColor": "rgba(0,0,0,0.5)",
  "coralPopupColor": "#66ffee",
  "oxygenHitPopupColor": "#ff6688"
}
```

- `section` キーは `scripts/validate-json.mjs`（`SCHEMAS[name] ?? ['section']`）の必須要件。
- 数値の妥当性: 減衰 4.0/s で満タン→枯渇は 25 秒。被弾 25 で最大 4 回（100→75→50→25→0）。
  珊瑚回復 30 で、安全色 diamond の safeChance 0.6（AquaticPlugin spawnTable）から
  「触れる頻度」がゲームの寿命を支配するバランスになる。
- **HUD 位置の注意**: Vue HUD（`Hud.vue`）のスコアブロックは `other` レイアウト（aquatic）で
  `top:14px; left:18px` に配置され、スコア（34px）＋距離バーで約 x:18〜160, y:14〜60 を占有する。
  canvas ゲージの初期値 (12, 12) と重なって隠れる可能性がある。実機スクリーンショットで
  確認し、重なる場合は `hudTopOffset` を 70 程度へ変更する（JSON のみ修正で可）。

### 4.3 型・tunables・バリデータ

`config-types.ts`（`SurvivalConfig` の直後に追加）:

```ts
/** oxygen.json — 水中アクション（酸素ゲージ） */
export interface OxygenConfig {
  maxOxygen: number
  oxygenDecayRate: number
  oxygenHitDamage: number
  oxygenCoralRestore: number
  oxygenLowThreshold: number
  hudBarWidth: number
  hudBarHeight: number
  hudTopOffset: number
  hudLeftOffset: number
  hudLabelColor: string
  oxygenColorHigh: string
  oxygenColorLow: string
  oxygenBarBgColor: string
  coralPopupColor: string
  oxygenHitPopupColor: string
}
```

`GameConfigMap` に `oxygen: OxygenConfig` を追加。

`tunables.ts`:

```ts
// ─────────────────────────────────────────────────────────────
// OXYGEN — 水中アクション（酸素ゲージ）
// ─────────────────────────────────────────────────────────────
export const OXYGEN = _c.oxygen
```

`ConfigValidator.ts` の `RANGE_CHECKS` に追加（セクション欠落時はスキップされるため安全）:

```ts
{ section: 'oxygen', field: 'maxOxygen',          min: 1 },
{ section: 'oxygen', field: 'oxygenDecayRate',    min: 0 },
{ section: 'oxygen', field: 'oxygenHitDamage',    min: 0 },
{ section: 'oxygen', field: 'oxygenCoralRestore', min: 0 },
{ section: 'oxygen', field: 'oxygenLowThreshold', min: 0, max: 100 },
{ section: 'oxygen', field: 'hudBarWidth',        min: 0 },
{ section: 'oxygen', field: 'hudBarHeight',       min: 0 },
```

### 4.4 `OxygenFeature.ts` 仕様

```
src/game/systems/OxygenFeature.ts   （新規・FeatureSystem 実装）
```

- `readonly handles = ['oxygen'] as const`
- 状態（feature 局所。`Player` へのフィールド追加はしない）:

```ts
interface OxygenState {
  oxygen: number          // 現在の酸素量（0〜maxOxygen）
  lowWarningFired: boolean // 低酸素警告の発火ガード（閾値超過でリセット）
  deathTriggered: boolean  // 枯渇死の二重発火ガード
}
```

- テスト性のため現在の酸素量を読み取れる getter を公開する: `get oxygen(): number`
  （SurvivalFeature は hunger を `Player` に載せてテストしていたが、oxygen は Player 汚染を
  避け feature 局所にする。テストは getter で検証する）

#### 生命周期

| メソッド | 挙動 |
|---|---|
| `onInit(world)` | 状態を新規化（oxygen = `OXYGEN.maxOxygen`、フラグ false） |
| `onManualUpdated(world, versionKey)` | **何もしない**（コメントで理由を明記）。oxygen と 2 フラグは永続状態から導出される値であり、リセットすると #179 型の巻き戻し・警告再発火バグになる |
| `onDisable(world)` | 状態を新規化（Player フィールドを所有していないため復元不要） |

#### `update(world, _input, dt)`

1. `features.has('oxygen')` でなければ return
2. `oxygen -= OXYGEN.oxygenDecayRate * dt`、`[0, maxOxygen]` にクランプ
3. 低酸素警告: `oxygen <= oxygenLowThreshold && !lowWarningFired` なら発火
   （`soundManager.onHungerDamage()` ＋ プレイヤー頭上に `addScorePopup('O2 LOW!', oxygenHitPopupColor)`）。
   `oxygen > oxygenLowThreshold` なら `lowWarningFired = false`（回復で再警告可）
4. `oxygen <= 0 && !deathTriggered` なら `deathTriggered = true`、
   `world.modifyPlayerHp(-world.player.maxHp)` で標準死亡フローを発火
   （TetrisFeature 449 行の死亡トリガーパターンと同型）

#### `onPlayerHit(world): boolean`

1. `features.has('oxygen')` でなければ `return false`
2. `oxygen = max(0, oxygen - OXYGEN.oxygenHitDamage)`
3. ポップアップ: プレイヤー頭上に `-${OXYGEN.oxygenHitDamage} O2`（`oxygenHitPopupColor`）
   ＋ `soundManager.onHungerDamage()`
4. `oxygen > 0` なら `world.player.invincible = VFX.invincibleDuration` を付与
5. どちらの場合も `return true`（被弾を処理した。oxygen <= 0 の場合は
   `deathTriggered = true` ＋ `world.modifyPlayerHp(-world.player.maxHp)` で死亡）

#### `onSafeHazardTouch(world, hazard, screenX)`

1. `features.has('oxygen')` でなければ return
2. `oxygen = min(maxOxygen, oxygen + OXYGEN.oxygenCoralRestore)`
3. `screenX + hazard.w / 2, hazard.y` 付近に気泡パーティクルを数個生成
   （上向き速度。パラメータはファイル先頭 const: 個数 6・life 0.5〜0.9・速度 40〜90 等）
4. `addScorePopup(screenX + hazard.w / 2, hazard.y, '+O2', OXYGEN.coralPopupColor)`
   ＋ `soundManager.onItemPickup()`
5. `world.removeHazardById(hazard)`（§2.3: 接触で珊瑚を消費）

#### `render(ctx, world)`

1. `features.has('oxygen')` でなければ return
2. `const px = new PixelCanvas(ctx)`（`../render` から import）
3. バックグラウンド: `px.rect(hudLeftOffset, hudTopOffset, hudBarWidth, hudBarHeight, oxygenBarBgColor)`
4. フィル: 幅 = `hudBarWidth * oxygen / maxOxygen`。色は
   `oxygen <= oxygenLowThreshold ? oxygenColorLow : oxygenColorHigh`
5. ラベル: `px.text('O2', hudLeftOffset, hudTopOffset - 4, { font: <11px monospace>, fill: hudLabelColor })`
   - フォント定数はファイル先頭 const（例: `const HUD_LABEL_FONT = 'bold 11px "Courier New", monospace'`）
   - `withAlpha` は使わない（alpha 量子化で消える。背景は rgba() 文字列で表現済み）
   - 座標はスクリーン系（feature render は shake 変換後の ctx で呼ばれる。HUD は shake 込みで問題ない）

#### import

```ts
import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { Hazard } from '../entities'
import { OXYGEN, VFX } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'
import { PixelCanvas } from '../render'
```

### 4.5 エンジン修正の詳細（§2.2 の適用箇所）

`src/engine/FeatureSystem.ts`:

```ts
/**
 * オプショナル: プレイヤーが被弾した時に呼ばれる。
 * 独自の被弾演出や状態変化を追加できる。
 * @returns true を返したシステムがある場合、エンジンは即死フォールバックをスキップする
 *          （被弾を「処理した」＝生存可能、という意味）。
 * 省略可。
 */
onPlayerHit?(world: MutableWorld): boolean
```

`src/game/sideScroller.ts` `_onPlayerHit`:

```ts
let absorbed = false
for (const sys of getActiveSystems(this.rules.features)) {
  if (sys.onPlayerHit?.(world) === true) absorbed = true
}
// どのシステムも被弾を処理しなかった場合（hp / oxygen feature なし）は即死
if (!this.dead && !absorbed) {
  this._die(p)
}
```

`RpgFeature.onPlayerHit`:

```ts
onPlayerHit(world: MutableWorld): boolean {
  if (!world.rules.features.has('hp')) return false
  // …既存処理（shield ガード / modifyPlayerHp(-1) / 無敵・パーティクル）は変更しない…
  return true
}
```
（shield 分岐の早期 return も `return true` にする — shield 発動も被弾処理）

`TetrisFeature.onPlayerHit(): boolean` → `return false`
`NearMissComboFeature.onPlayerHit(world): boolean` → 末尾に `return false`

### 4.6 ジャンル定義・スキーマ

`src/data/genres/aquatic.json`:

```diff
- "enableFeatures": ["hp", "item_pickup", "slow_precise"],
+ "enableFeatures": ["oxygen", "item_pickup", "slow_precise"],
```

他フィールド（thresholds: vertical 3 / aerial 3 / survive 4、scoreFormula、controls 等）は変更しない。

`schemas/genre.schema.json`: `enableFeatures.items.enum` と `disableFeatures.items.enum` の両方に
`"oxygen"` を追加（既存の末尾 `tetris_mode` の後）。
`tests/unit/scripts/validateJson.test.ts` は `toContain`（部分集合）検証なので追加で壊れない。

### 4.7 縦スクロールとプレイヤー移動（現状のままで良い）

- `scrollDirection: "vertical"` → `scrollAxis 'y'`。`_updateVertical` はプレイヤーを
  `y ∈ [0, H - p.h]` にクランプするため、画面外へ押し出されることはない（設計書の
  「terrain がプレイヤーを押し上げる／上端からはみ出せばゲームオーバー」は**未実装**で、
  今後の改善候補に記録する）
- 上下移動は `MovementFeature`（`movement` feature が rules にあるかを確認済み: aquatic の
  disableFeatures に `movement` はないため有効）が ArrowUp/Down → vy、左右 → vx を制御
- ジャンル確定時の遷移演出は `classifyHudLayout` が `other` を返すため自動移動なし（現状維持）

## 5. テスト要件

### 5.1 ユニットテスト `tests/unit/game/OxygenFeature.test.ts`（新規）

パターン: `SurvivalFeature.test.ts` の `createMockWorld()`（MutableWorld モック）を流用。
`OXYGEN` / `VFX` は実 config から import。feature の酸素量は公開 getter で検証。
soundManager は `vi.mock`（SurvivalFeature.test.ts と同様に GameRegistry もモック）。

必須ケース:

| # | ケース | 検証 |
|---|---|---|
| T-1 | `update()` で時間経過に酸素が減少 | 1 秒更新で `maxOxygen - oxygenDecayRate` |
| T-2 | 酸素は maxOxygen を超えない | 満タン状態から coral 回復しても maxOxygen |
| T-3 | 酸素 0 で死亡トリガー | `oxygenDecayRate * n` 秒更新後に `modifyPlayerHp` が負値で呼ばれる（スパイ） |
| T-4 | 死亡トリガーは 1 回のみ | 死亡後さらに `update()` を回しても追加呼び出しなし |
| T-5 | `onPlayerHit` で oxygenHitDamage 減算 | 100 → 75 |
| T-6 | `onPlayerHit` かつ oxygen > 0 で無敵付与 | `player.invincible === VFX.invincibleDuration` |
| T-7 | `onPlayerHit` かつ oxygen <= 0 で死亡 | 酸素 10 の状態で被弾 → 死亡トリガー（スパイ） |
| T-8 | `onPlayerHit` は oxygen 有効時に true、無効時に false を返す | エンジン修正の契約 |
| T-9 | `onSafeHazardTouch` で oxygenCoralRestore 回復（max クランプ） | 50 → 80、90 → 100 |
| T-10 | `onSafeHazardTouch` でポップアップ＋パーティクル＋ハザード除去 | popups/particles 配列に記録、`world.hazards` が空 |
| T-11 | 低酸素警告は閾値超過時に 1 回のみ | 30 超過で 1 回、次のフレームは再発火しない。回復後は再発火可 |
| T-12 | `onManualUpdated` で酸素は保持される（#179） | 酸素 40 の状態で更新 → 40 のまま |
| T-13 | feature 無効時 `update()` / `onPlayerHit` / `onSafeHazardTouch` は何もしない | 酸素不変・modifyPlayerHp 未呼び出し・false 返却 |
| T-14 | feature 無効時 `render()` は throw しない | ctx モックで呼び出し |

### 5.2 エンジン修正の回帰テスト（既存テストの維持＋追加）

- 既存: `multiHitGuard.test.ts`（features 空 → 即死は不変）、`stealthIframe.test.ts` 等が
  全てグリーンであること
- **新規**（`tests/unit/game/playerHitAbsorb.test.ts` を推奨）:
  - `SideScroller` 実インスタンス＋`features: ['hp', 'item_pickup']`、hp=3 で 1 被弾 →
    **死亡しない**（`dead === false`、hp=2）← 本設計で初めて成立する挙動
  - 3 被弾（無敵フレームを 0 にして強制的に）→ 死亡
  - `features: []` の 1 被弾 → 即死（従来挙動の維持）

### 5.3 全量ゲート

`npx vitest run` / `npm run typecheck` / `npm run lint` / `npm run build` / `npm run validate`
の全てがグリーン。

## 6. ドキュメント

### 6.1 `docs/genre/aquatic-genre.md`（新規）

`docs/genre/tetris-genre.md` と `docs/genre/TEMPLATE.md` に沿う。必須セクション:

- **概要**: 横スクロールの原点から水中アクションへ変容する経緯・体験の核（酸素管理）
- **アーキテクチャ**: §4.1 のファイル構成ツリー（oxygen.json / OxygenFeature / エンジン修正を含む）
- **ジャンル収束条件**: `aquatic.json` の thresholds（`vertical >= 3` AND `aerial >= 3` AND `survive >= 4`）。
  ベイズ収束（主方式）＋genreParams 軸方式の併用であることを明記
- **ゲーム仕様**:
  - 酸素ゲージ（max 100・減衰 4.0/s・被弾 -25・珊瑚 +30・低酸素警告閾値 30・0 で死亡）
  - 縦スクロール（STG 型。ハザードが下から上に流れる＝プレイヤーは固定・世界が下へスクロール）
  - 操作: ←/→ 左右移動、↑/↓ 上下移動、Space ジャンプ（aquatic.json controls）
  - スコア式: `distance * 0.8 + itemsCollected * 100 + survivedSec * 12`
  - 珊瑚 = safe hazard（diamond の safeChance 0.6 が主。形状を限定しないため全 safe hazard が対象）
- **実装上の注意点**:
  1. `onManualUpdated` で酸素をリセットしない理由（#179）
  2. 死亡トリガーは `modifyPlayerHp(-maxHp)` の 1 回発火パターン（deathTriggered ガード）
  3. safe hazard は接触で除去する理由（毎フレーム発火問題、§2.3）
  4. エンジン修正（onPlayerHit 戻り値）の経緯と、hp ジャンルの挙動変化（1 被弾即死 → 複数回生存）
  5. oxygen は Player フィールドにせず feature 局所状態にした理由
  6. PixelCanvas.withAlpha の alpha 量子化問題（rgba() 文字列を使う）
- **既知の制限 / 今後の改善候補**:
  - 「terrain がプレイヤーを押し上げる」「上端からはみ出せばゲームオーバー」は未実装
    （プレイヤーは画面内にクランプされる）
  - 縦スクロールは STG 型（プレイヤー固定・ハザードが下方へ流れる）。
    設計の「ダイバーが下へ潜り続ける」表現とは異なる
  - 酸素ゲージの HUD 位置が Vue HUD のスコアブロックと干渉する可能性がある
    （oxygen.json の offset で調整可能）
- **テスト**: §5 の結果（件数・PASS 数）

### 6.2 `docs/genre/README.md`

ドキュメント一覧表に追加（既存形式に準拠。リンク先は `./aquatic-genre.md`）:

```
| `aquatic` | aquatic-genre.md | 水中アクション（縦スクロール・酸素ゲージ・珊瑚回復） |
```

### 6.3 `docs/feature-ids.md`

- 「生存 / 近接 / 接近回避系」セクションの表に
  `| oxygen | 酸素ゲージ（時間減衰・被弾ダメージ・珊瑚回復・0 で死亡） | OxygenFeature ✅ |`
- 実装ステータス表に `| OxygenFeature | oxygen | ✅ |`

## 7. 検証手順（完了報告の条件）

1. `npx vitest run` 全 PASS（新規テスト含む）
2. `npm run typecheck` PASS
3. `npm run lint` PASS
4. `npm run build` PASS
5. `npm run validate` PASS
6. **実機確認（必須）**: dev サーバー起動し、aquatic ジャンルで遊べて
   - 酸素ゲージが左上に描画され減衰する
   - 危険ハザード被弾で酸素が減り（即死しない）無敵フレームが入る
   - safe hazard（珊瑚）接触で +O2 回復＆気泡演出＆珊瑚が消える
   - 酸素 0 でゲームオーバー
   を確認。スクリーンショットを撮り、HUD 重なり（§4.2 注意）を確認。
   必要なら debug ツールで aquatic ジャンルを強制する
   （`src/debug/` の DEBUG_MODE。タイトル画面のデバッグ UI を使う）。
   スクリーンショットは `tmp/` に置く（リポジトリ直下禁止）
7. dev サーバーは検証後に必ず停止する

## 8. リスク

| リスク | 影響 | 対策 |
|---|---|---|
| エンジン修正で hp ジャンル（rpg/survival/dungeon/horror/puzzle）の難易度が下がる | プレイ体験の変化 | 設計上「バグ修正」として明示。Playwright スモーク＋レビューで確認。必要なら survival 等の方針を別途 issue 化 |
| oxygen HUD が Vue スコアブロックと重なる | ゲージが見えない | スクリーンショット検証＋offset JSON 調整 |
| safe hazard 除去で他 feature が壊れる | — | aquatic の features に color_touch は無いことを確認済み。他ジャンルは oxygen 無効なので非影響 |
| `onManualUpdated` 時の警告フラグの扱いで警告が重複/消失 | 軽微 | フラグは酸素値から導出されるため保持。T-11/T-12 で検証 |

## 付録 A: 検証中に発見した「二重 startGame」問題（2026-09-09 調査記録）

### 症状

Playwright での実機検証中、O2 ゲージが設定値 4.0/s ではなく約 8.0/s で減衰し、
かつ酸素 0 後もプレイヤーが死亡しない（その後も珊瑚接触で +30 回復する）
という矛盾した挙動が観測された。

### 原因

`tests/aquatic.spec.ts` が **debug-ok の直後に「はじめる」ボタンもクリックしていた**こと。

1. `button.debug-ok` → `onDebugApply()` → `startGame()` で **1 つ目の SideScroller** が開始される
   （phase が `title` 以外へ遷移し、タイトル画面の Vue 解除は次のフレームで実行される）。
2. タイトル解除前の同一フレーム内に `page.click('text=はじめる')` が着弾すると
   `startGame()` が **2 回目**に実行され、**2 つ目の SideScroller** が作成される
   （1 つ目は `stop()` されないまま rAF ループを継続）。
3. FeatureSystem（OxygenFeature 等）は `GameRegistry` 上の **シングルトン** であるため、
   2 つのエンジンが同時に `feature.update()` を呼び、減衰が実時間比で 2 倍化した。
   酸素 0 の死亡トリガー（`modifyPlayerHp(-maxHp)`）も、トリガーを引いた方の
   プレイヤーのみ死亡し、もう一方は酸素 0 のまま生存し続けた（珊瑚 +30 もこの生存側で発火）。

証拠: OxygenFeature.update のラップ計測で、二重起動中は update 呼び出しが約 120 回/秒
（2 インスタンス × 60fps）、`world.survivedSec` が 2 つの異なる値で交互に観測された。
単一インスタンスでは 4.0/s 正確に減衰することを確認済み（ゲーム時間基準）。

### 修正

1. `tests/aquatic.spec.ts`: debug-ok 後の「はじめる」クリックを削除
   （debug-ok が即座にゲームを開始するため不要。再発防止コメントを明記）。
2. `src/App.vue` `startGame()`: 前回の `scroller?.stop()` と
   `cancelAnimationFrame(snapRaf)` を実行してから新インスタンスを生成
   （二重起動の防御的ハードニング。本番では DEBUG_MODE=false でデバッグパネルが
   存在しないため通常フローでは発生しないが、シングルトン共有の壊れ方を封じる）。

### 教訓

- ゲームエンジンのインスタンスライフサイクルと **グローバルな Feature シングルトン** の
  組み合わせは、二重起動が黙って状態を壊す（クラッシュしない）。
  実機で「設定値と実測値の比が整数倍」になったら、まず複数インスタンスの同時実行を疑うこと。
- Playwright の連続クリックは Vue の再描画（フレーム単位の解除）に先ん着し得る。
  「A の操作で消えるはずの B を続けてクリックする」フローは危険。
