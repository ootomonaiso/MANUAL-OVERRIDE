# Platformer（縦スクロールプラットフォームアクション）実装設計書

ブランチ: `feature/platformer-genre`（origin/main から作成）
日付: 2026-09-10
状態: 設計完了 → 実制作業指示済み

## 1. 概要

`platformer` ジャンルを「横スクロールの面影を残した縦スクロールクライムアクション」
（Icy Tower / Doodle Jump 風）として実装する。

- プレイヤーは重力を持ち、上から降ってくる**一方通行プラットフォーム**（safe ハザード）
  を二段ジャンプで駆け上がる
- 下から**溶岩**が上昇し、触れたら即死
- プラットフォームは sin 波で水平漂動（moving platform）

既存の横スクロール platformer 定義（青空・雲テーマ）は視覚テーマとして維持し、
`scrollDirection: vertical` + 新 Feature `platformer` で挙動を書き換える。

## 2. 前提となるエンジン挙動（コード調査の結果）

設計判断の根拠。実装担当はこれらを必ず理解した上で作業すること。

### 2.1 フレーム順序（`SideScroller._update`）

1. 全 active feature の `preUpdate`
2. `_updateVertical`（縦モード物理: `p.x += vx*dt`, `p.y = clamp(0, H-p.h, p.y + vy*dt)`,
   `p.onGround = false`, ハザードは `h.y += speed*dt` で下降、safe 接触は
   `onSafeHazardTouch`、danger 接触は被弾）
3. 全 active feature の `update`

### 2.2 feature 実行順序は「登録順序」ではなく「features セットの反復順序」

`getActiveSystems(active)` は `active`（= `RuntimeRules.features` の `Set<FeatureId>`）
を反復してシステムを収集する。`buildRuntimeRules` での features 構築順序は
`[...genre.enableFeatures]`（JSON の配列順）→ `movement` → 履歴の `addFeatures`。
**したがって `platformer` を platformer.json の `enableFeatures` 末尾に置けば、
PlatformerFeature の `preUpdate` は MovementFeature より後に実行される。**
（systems/index.ts での登録位置は実行順序に影響しない。可読性のため末尾登録も行う。）

### 2.3 MovementFeature は縦モードで毎フレーム `p.vy` を上書きする

```ts
// MovementFeature.preUpdate（scrollAxis === 'y'）
p.vx = ...runSpeed 系...
p.vy = moveUp ? -runSpeed : moveDown ? runSpeed : 0   // ← 自由移動（重力なし）
```

この上書きが先帧に蓄積した重力・ジャンプ速度を破壊するため、
**MovementFeature に「`platformer` 有効時は `p.vy` の設定をスキップ」する
最小変更を加える**（`p.vx` は従来どおり維持）。これにより `p.vy` は
PlatformerFeature が独占し、通常の重力積分（`p.vy += g*dt` の累積）が成立する。

### 2.4 `onInit` は実行時に呼ばれない

エンジンが呼ぶフックは `onManualUpdated`（updateRules 時・全 active feature 対象）と
`onDisable`（feature が非アクティブ化時）のみ。PuzzleFeature / TetrisFeature と同様に
**`onManualUpdated` 初回呼び出しで `onInit` を実行する `firstInit` パターン**を採用する。

### 2.5 Feature は GameRegistry 上のシングルトン

`startGame()` ごとに新しい `SideScroller` が生成されるが、feature インスタンスは
再利用される。そのため「ゲーム開始時（新スコーラ）」と「プレイ中の説明書更新」を
区別する必要がある。判定方法: **`world.player` のインスタンス同一性**
（Player は各 SideScroller のコンストラクタで新規生成され、スコーラ内で置き換わらない）。
`_lastPlayer !== world.player` なら新ゲームとみなして全初期化を行う。

### 2.6 縦モードのスポーン

`_spawnHazard`（縦モード分岐）は placement を無視し、**全ハザードを画面上端
（y = -h-20）・ランダム X（セーフゾーンを除外した全幅）から出現させて下降させる**。
したがってプラットフォームの縦間隔は
`spawnDensity.interval(ms) / 1000 × scrollSpeed(px/s)` で決まり、
ジャンプ到達性のためジャンル側で `spawnDensity` を絞る必要がある（§5.4）。

### 2.7 描画順序

feature の `render` は障害物描画の**後**・パーティクル/プレイヤーの**前**に呼ばれる。
→ 溶岩は溶岩内に下降したプラットフォームを覆って描画できる（意図どおり）。

### 2.8 その他

- 縦モード背景: `plugin.verticalBackgroundLayers` が真のときのみ遠景/中景（雲・丘）が
  描画される。青空テーマ維持のため PlatformerPlugin で `true` を設定する。
- `classifyHudLayout`: platformer は `shoot` なし → `'other'` → セーフゾーンなし
  （全幅可動）。`beginGenreTransition` の遷移演出もスキップされる（非 STG として正常）。
- `hazard.rect` getter は floatAmp を含む（縦モードスポーンでは floatAmp=0 なので
  実効 `h.rect.y === h.y`）。着地判定は `h.rect.y` を使う。
- `isHazardous`: beat_hazard 未有効なので `!h.isSafe` が危険。全 safe 化すれば
  ハザード接触による被弾は起きない（溶岩のみが死因）。
- `near_miss_combo`: safe ハザードは判定対象外のため、全 safe 化すると無効になる
  （enableFeatures に残してよいがスコア貢献なし。scoreFormula の maxCombo 項は 0）。
- PixelCanvas: `withAlpha` は alphaSteps=8 で量子化され 0.0625 未満は消える。
  溶岩グロー等の薄い要素は **rgba() 色文字列を直接**渡す（`_parseColor` 対応済み）。
- pixelart.size = 4 → rect は 4px グリッドへスナップ（最小 1 セル）。
- `jumpVelocity = -720`（負 = 上向き）、`gravity` 積分で apex = 720²/(2g)。

## 3. ファイル変更一覧

| # | ファイル | 変更種別 | 内容 |
|---|---------|---------|------|
| 1 | `src/data/config/platformer.json` | **新規** | platformer 固有パラメータ（§5.1） |
| 2 | `src/framework/config-types.ts` | 修正 | `PlatformerConfig` インターフェース追加 + `GameConfigMap.platformer` |
| 3 | `src/data/tunables.ts` | 修正 | `export const PLATFORMER = _c.platformer` |
| 4 | `src/framework/ConfigValidator.ts` | 修正 | RANGE_CHECKS 追加（§5.1） |
| 5 | `src/game/systems/PlatformerFeature.ts` | **新規** | 本体（§4） |
| 6 | `src/game/systems/index.ts` | 修正 | import + `registerFeature(new PlatformerFeature())`（末尾） |
| 7 | `src/game/systems/MovementFeature.ts` | 修正 | 縦モードの `p.vy` 設定を platformer 有効時にスキップ（§2.3） |
| 8 | `src/data/genres/platformer.json` | 修正 | `scrollDirection: vertical`、`enableFeatures` 末尾に `platformer`、`spawnDensity` 追加（§5.4） |
| 9 | `schemas/genre.schema.json` | 修正 | `enableFeatures` / `disableFeatures` 両 enum に `"platformer"` |
| 10 | `src/genres/PlatformerPlugin.ts` | 修正 | spawnTable を全 safe プラットフォーム化、`verticalBackgroundLayers = true` |
| 11 | `tests/unit/game/PlatformerFeature.test.ts` | **新規** | ユニットテスト（§7） |
| 12 | `docs/genre/platformer-genre.md` | **新規** | 実装ドキュメント（§8） |
| 13 | `docs/genre/README.md` | 修正 | 索引に platformer 行を追加 |

`Platformer.md`（リポジトリ直下）は git 管理外（`git ls-files` で確認済み）のため削除対象なし。

## 4. PlatformerFeature 設計

### 4.1 状態

```ts
readonly handles = ['platformer'] as const

private lavaSurfaceGap = 0     // 溶岩表面の画面下端からの相対オフセット（px）。resize 安全
private prevBottom = 0         // 前フレームのプレイヤー底辺 Y（着地スイープ判定用）
private driftTime = 0          // 漂動 sin 位相の累積（秒）
private lavaDeathFired = false // 溶岩死の一回性ガード
private firstInit = true       // onManualUpdated 初回 = 全初期化
private lastPlayer: Player | null = null  // 新ゲーム検出（§2.5）
private standingOn: Hazard | null = null  // 着地固定用（§4.4）
```

`p.vy` はローカル保持しない（§2.3 で MovementFeature が上書きしないため、
`p.vy` が唯一の速度ソース）。

### 4.2 フック

- `onInit(world)`:
  `lavaSurfaceGap = PLATFORMER.lavaStartOffset`（画面下端からの相対オフセット。
  縦モードに床がないためプレイヤーは下端で静止し、このオフセットが生存猶予となる）、
  `prevBottom = p.y + p.h`、`driftTime = 0`、`lavaDeathFired = false`、
  `standingOn = null`、`p.vy = 0`、`lastPlayer = world.player`
- `onManualUpdated(world, versionKey)`:
  `isFresh = this.lastPlayer !== world.player`。
  `firstInit || isFresh` のときのみ `onInit(world)` を呼び `firstInit = false`。
  **そうでない場合（同一ゲーム中の説明書更新）は何もリセットしない**
  （溶岩位置をリセットすると実行中に溶岩が画面下へ巻き戻る = #179 型バグ）。
- `onDisable(world)`: 全状態を初期値へ、`firstInit = true`、`lastPlayer = null`、`standingOn = null`。
- 全メソッド先頭に `if (!world.rules.features.has('platformer')) return`
  （`onManualUpdated`/`onInit`/`onDisable` 除く — 它们是生命周期钩子）。

### 4.3 preUpdate（物理前）

```ts
if (!world.rules.features.has('platformer')) return
const p = world.player, r = world.rules
// 水平移動: platformer 固有の高速（フルウィンドウキャンバスでは
// PLAYER_PHYSICS.runSpeed(240) では漂うプラットフォームに水平到達できない）
p.vx = input.keys.has(r.controls.moveRight) ? PLATFORMER.runSpeed
     : input.keys.has(r.controls.moveLeft)  ? -PLATFORMER.runSpeed : 0
// 純重力: 前帧から蓄積した p.vy を積分（MovementFeature は platformer 有効時に
// p.vy を触らないため成立。端末速度でクランプ）
p.vy = Math.min(p.vy + PLATFORMER.gravity * dt, PLATFORMER.maxFallSpeed)
// ジャンプ: 接地時は double_jump 有効なら 2 にリセットしてから 1 消費
if (input.justPressed.has(r.controls.jump) && (p.onGround || p.jumpsLeft > 0)) {
  if (p.onGround) p.jumpsLeft = r.features.has('double_jump') ? 2 : 1
  p.vy = PLAYER_PHYSICS.jumpVelocity
  p.jumpsLeft -= 1
  p.onGround = false
  this.standingOn = null  // 着地固定解除
  soundManager.onJump()
  world.addJump()  // 統計にジャンプを記録
}
```

注意点:
- 上向きキー（moveUp/moveDown）は無効（「泳ぐ」行為は存在しない）。
  MovementFeature 側も platformer 有効時は vy を触らないため一貫する。
- `onGround` は前フレームの `update`（着地）が設定した値を読む
  （`_updateVertical` は物理後に `onGround = false` をするが、それは本フレームの
  preUpdate の後なので影響しない）。
- `addJump()` は `MutableWorld` インターフェースに追加された統計用メソッド。
  横スクロールのジャンプ統計（`stats.jumps`, `firstJumpDone`）と統一し、
  プラットフォームジャンプもプレイスタイル検出に反映される。

### 4.4 update（物理後）

処理順（仕様順）: 着地固定 → 着地 → 溶岩上昇 → 溶岩衝突 → 漂動 → prevBottom 更新。

1. **着地固定（carry-while-standing）**:
    前フレームに固定していたプラットフォームの上に乗っているか確認。
    水平重なりかつ底辺がプラットフォーム頂上の `STANDING_CARRY_BAND_PX` (12px)
    範囲内なら、プレイヤーをプラットフォーム頂上にスナップして一緒に下降。
    ジャンプまたは水平移動で外れたら `standingOn = null`。
2. **一方通行プラットフォーム着地**（safe ハザードのみ）:
    ```ts
    for (const h of world.hazards) {
      if (!h.isSafe) continue
      const sx = world.getHazardScreenX(h)
      if (!(p.x < sx + h.w && p.x + p.w > sx)) continue   // 水平重なり
      if (p.vy < 0) continue                              // 上昇中: 下から通過
      const top = h.rect.y, bottom = p.y + p.h
      const swept  = this.prevBottom <= top && bottom >= top
      const banded = bottom >= top && bottom <= top + PLATFORMER.platformLandingThreshold
      if (swept || banded) {
        p.y = top - p.h; p.vy = 0; p.onGround = true
        p.jumpsLeft = r.features.has('double_jump') ? 2 : 1
        this.standingOn = h  // 着地後、プラットフォームに固定
      }
    }
    ```
    - `swept`: 本フレームに頂上を**上から下へ**掃引した検出。高速落下
      （maxFallSpeed 1200px/s = 20px/frame）でも 24px バンドを飛び越えても着地する。
    - `banded`: 仕様どおりの「頂上〜 +threshold」バンド。
    - 着地すると `standingOn` に設定され、次フレームの着地固定で自動的に
      プラットフォームと一緒に下降する（微小振動が完全に解消される）。
    - プラットフォームがプレイヤー頭上を通過する際、底辺がバンド内（0〜24px 頭上）に
      入るとプレイヤーが最大 24px 上にスナップしてそのプラットフォームに載る。
      仕様バンドの帰結として**許容**（拾い上げ効果になるため）。ドキュメントに明記。
3. **溶岩上昇**: `this.lavaSurfaceGap -= PLATFORMER.lavaRiseRate * dt`
    （画面下端からの相対オフセットを減少。リサイズ安全）。
4. **溶岩衝突**: `!this.lavaDeathFired && p.y + p.h >= H + this.lavaSurfaceGap` のとき
    `lavaDeathFired = true` + `world.modifyPlayerHp(-world.player.maxHp)`（即死）。
5. **漂動**（safe ハザードのみ）:
    ```ts
    this.driftTime += dt
    for (const h of world.hazards) {
      if (!h.isSafe) continue
      const drift = Math.sin(this.driftTime * PLATFORMER.movingPlatformDriftFreq
                    + h.y * 0.01) * PLATFORMER.movingPlatformDriftAmp * dt
      h.x = Math.max(0, Math.min(W - h.w, h.x + drift))
    }
    ```
    `vertical_scroll` feature は**有効にしない**（MovementFeature 側の全ハザード
    ドリフトと二重加算になるため）。
6. `this.prevBottom = p.y + p.h`（着地スナップ後の値を保持）。

### 4.5 render（溶岩）

```ts
if (!world.rules.features.has('platformer')) return
const W = world.canvas.width, H = world.canvas.height
const topY = H + this.lavaSurfaceGap  // 相対オフセットから画面 Y を計算
if (topY >= H) return
const px = new PixelCanvas(ctx)
const glowH = PLATFORMER.lavaHeight * LAVA_GLOW_HEIGHT_RATIO     // 表面 12px 上の熱ハaze
const heatH = PLATFORMER.lavaHeight * LAVA_HEAT_HEIGHT_RATIO    // 表面下の明るい帯 21px
const LINE  = 4                                                  // 表面の明線（ファイル先頭定数）
px.rect(0, topY - glowH, W, glowH, 'rgba(255,170,0,0.22)')   // 薄い要素は rgba 直接
px.rect(0, topY, W, H - topY, PLATFORMER.lavaColor)          // 本体
px.rect(0, topY + LINE, W, heatH, 'rgba(255,170,0,0.3)')     // 熱帯
px.rect(0, topY, W, LINE, PLATFORMER.lavaGlowColor)          // 表面の明線
```

- `LAVA_GLOW_HEIGHT_RATIO = 1/5` と `LAVA_HEAT_HEIGHT_RATIO = 0.35` は
  ファイルトップ定数として宣言（マジックナンバー排除）。

## 5. データ設計

### 5.1 `src/data/config/platformer.json`（新規）

```json
{
  "$comment": "プラットフォームアクション（縦スクロール）固有パラメータ",
  "section": "platformer",
  "gravity": 1500,
  "runSpeed": 480,
  "maxFallSpeed": 1200,
  "lavaRiseRate": 15,
  "lavaStartOffset": 100,
  "lavaHeight": 60,
  "lavaColor": "#ff4400",
  "lavaGlowColor": "#ffaa00",
  "platformLandingThreshold": 24,
  "movingPlatformDriftAmp": 60,
  "movingPlatformDriftFreq": 0.8
}
```

- 仕様ブロックからの**拡張**: `runSpeed`（§4.3 の水平到達性のため）、
  `maxFallSpeed`（落下速度クランプ。スウェプト判定の安全域確保）。
- `platformMinGapY` / `platformMaxGapY` は実装で未使用のため削除。
- `ConfigValidator` RANGE_CHECKS 追加: `gravity >= 0`, `runSpeed >= 0`,
  `maxFallSpeed >= 0`, `lavaRiseRate >= 0`, `platformLandingThreshold >= 0`。
  REQUIRED_SECTIONS には追加しない（survival 等の従来パターンに従い任意セクション）。

### 5.2 `config-types.ts`

```ts
/** platformer.json — プラットフォームアクション（縦スクロール）固有パラメータ */
export interface PlatformerConfig {
  gravity: number
  runSpeed: number
  maxFallSpeed: number
  lavaRiseRate: number
  lavaStartOffset: number
  lavaHeight: number
  lavaColor: string
  lavaGlowColor: string
  platformLandingThreshold: number
  movingPlatformDriftAmp: number
  movingPlatformDriftFreq: number
}
```
`GameConfigMap` に `platformer: PlatformerConfig` を追加。

### 5.3 `tunables.ts`

```ts
// ─────────────────────────────────────────────────────────────
// PLATFORMER — プラットフォームアクション（縦スクロール）
// ─────────────────────────────────────────────────────────────
export const PLATFORMER = _c.platformer
```

### 5.4 `src/data/genres/platformer.json`

- `"scrollDirection": "vertical"` を追加
- `"enableFeatures"`: `["double_jump", "long_air", "platformer"]`
  — **`platformer` は必ず末尾**（§2.2 の preUpdate 順序要件）。
  `wall_jump` は縦モードの全画面右側トリガーで無限ジャンプになるため除外。
  `near_miss_combo` は全 safe ハザードのため無効（スコア貢献 0）のため除外。
- `"scoreFormula"`: `"distance * 0.8 + survivedSec * 5"`
  — `maxCombo` 項は永久 0 のため削除。
- `"spawnDensity"` を追加:
  ```json
  { "baseInterval": 550, "minInterval": 400, "decayRate": 0.0002 }
  ```
  間隔検証（jump apex ≈ 296px、二段ジャンプ到達）:
  - 距離 0（speed 300）: 550ms × 300 = **165px** ✓（maxGapY 170 内）
  - 完全加速（speed 450 @20000px）: 400ms(min) × 450 = **180px** ✓
  - tempo 高め（speed ~500）: 400ms × 500 = 200px ✓（到達 296px + 漂動 60px + バンド 24px で十分）
- その他（thresholds: aerial 5 / combo 4、scoreFormula、controls、theme、bgColor、
  environment: sky、gravity: 1600、endingFlavor）は変更なし。
  （genre の `gravity: 1600` は横モード/updateRules 用。縦モードの実効重力は
  `PLATFORMER.gravity`（1500）が正。両者の乖離はドキュメントに注記。）

### 5.5 spawnTable（PlatformerPlugin）

縦モードでは全エントリが「画面上端・ランダム X」から出現するため、
shape の w/h だけプラットフォーム寸法を決める。**全 safe**（safeChance: 1）で
被弾死因を溶岩のみにする。

```ts
readonly spawnTable: readonly SpawnEntry[] = [
  // 広いプラットフォーム（主たる登段手段）
  { shape: 'rect', placement: 'air', weightStart: 6, weightEnd: 6,
    wRange: [80, 140], hRange: [16, 24], safeChance: 1 },
  // 狭いプラットフォーム（リスク高）
  { shape: 'rect', placement: 'air', weightStart: 4, weightEnd: 4,
    wRange: [44, 76], hRange: [16, 24], safeChance: 1 },
  // ダイヤモンド型（sin 漂動で動く）
  { shape: 'diamond', placement: 'float', weightStart: 2, weightEnd: 3,
    wRange: [40, 52], hRange: [30, 40], safeChance: 1 },
]
```

加えて `readonly verticalBackgroundLayers = true` を追加（縦モードでも雲が描画される）。
残りのテーマ（skyColors / palette / particleColors / drawPlayer / drawFarLayer /
drawMidLayer）は変更しない。

### 5.6 スキーマ

`schemas/genre.schema.json` の `enableFeatures.items.enum` と
`disableFeatures.items.enum` の**両方**に `"platformer"` を追加
（validate-json.mjs が schema 検証するため必須。追加忘れは validate 失敗で検出できる）。

## 6. 数値検証（設計値の妥当性）

| 項目 | 値 | 根拠 |
|------|----|------|
| ジャンプ apex（1回目） | 720²/(2×1500) ≈ 173px | jumpVelocity -720 / PLATFORMER.gravity 1500 |
| 二段ジャンプ追加 apex | 720²/(2×1500) ≈ 173px | 両ジャンプとも jumpVelocity -720（二段ジャンプも同一速度） |
| 到達可能高 | ≈ 346px | 両者合計（二段ジャンプ追加） |
| プラットフォーム間隔（基準） | 165px | baseInterval 550ms × 300px/s |
| 間隔/到達比 | ≈ 0.56 | 余裕あり（+漂動 60px・バンド 24px） |
| 水平到達（二段ジャンプ空中 1.4s） | 480 × 1.4 ≈ 670px | 1440px 幅キャンバスの中央付近から大半のプラットフォームに到達可能 |
| 溶岩到達猶予（ゲーム開始時） | lavaStartOffset ÷ lavaRiseRate = 100 ÷ 15 ≈ 6.7s | 縦モードに床がないためプレイヤーは落下して画面下端（底辺 H）で静止。溶岩は下端より 100px 下から上昇開始。最初のプラットフォーム到達（出現 650px + 画面降下で約 3.1s）に約 3.6s の余裕 |
| プラットフォーム 1 個あたりの猶予 | 165px ÷ 15 ≈ 11s | 溶岩が 1 プラットフォーム分（165px）追いつくのに約 11s。登れば生存 |

## 7. テスト設計（`tests/unit/game/PlatformerFeature.test.ts`）

`tests/unit/game/SurvivalFeature.test.ts` のパターンに従う:
`vi.mock(GameRegistry)`（`getActiveSystems: () => []`）、mock MutableWorld
（canvas: { width: 1280, height: 800 }、rules: features `['platformer','double_jump','movement']`,
scrollAxis 'y'、scrollDirection 'vertical'、controls 明示、gravity 1600）、
`getHazardScreenX: h => h.x`、`modifyPlayerHp` は spy 化。

| # | テスト | 検証 |
|---|--------|------|
| 1 | onInit | `lavaSurfaceGap === PLATFORMER.lavaStartOffset`、`prevBottom === p.y+p.h` |
| 2 | preUpdate: 重力積分 | 連続呼び出しで `p.vy` が `gravity*dt` ずつ**累積増加**する（端末速度でクランプされることも別 case で） |
| 3 | preUpdate: 水平移動 | ArrowRight → `vx === PLATFORMER.runSpeed`、ArrowLeft → `-runSpeed`、無入力 → `0` |
| 4 | preUpdate: ジャンプ | 接地 + jump justPressed → `vy === PLAYER_PHYSICS.jumpVelocity`、`jumpsLeft 2→1`、`onGround=false`、soundManager.onJump 呼出 |
| 5 | preUpdate: 二段ジャンプ | 空中 jumpsLeft=1 → 0 に減算され vy が再設定。jumpsLeft=0 且つ非接地 → ジャンプしない |
| 6 | preUpdate: ジャンプ統計 | ジャンプ時に `addJump()` が呼ばれて `_jumps` がインクリメントされる |
| 7 | update: 着地（上から落下） | vy>0・prevBottom が頂上より上・bottom が [top, top+threshold] → `p.y === top-p.h`、`vy=0`、`onGround=true`、`jumpsLeft=2` |
| 8 | update: 高速落下（swept） | bottom が top+threshold を超過（prevBottom は頂上より上）→ 依然着地 |
| 9 | update: 上昇中は通過 | vy<0 かつ bottom がバンド内 → 着地しない（p.y 不変） |
| 10 | update: 水平非重なり | 玩家在プラットフォーム横外 → 着地しない |
| 11 | update: 溶岩上昇 | `lavaSurfaceGap` が `lavaRiseRate*dt` だけ減少 |
| 12 | update: 溶岩衝突で即死 | 溶岩表面がプレイヤー底辺以下 → `modifyPlayerHp(-maxHp)` が 1 回呼ばれる（2 帧目再発火しない） |
| 13 | update: 溶岩画面外 | gap >= 0 → 死亡しない |
| 14 | update: 着地固定（carry） | 着地後、プラットフォームが下降してもプレイヤー底辺がプラットフォーム top に固定 |
| 15 | update: 着地固定解除 | ジャンプすると `standingOn` が null になる |
| 16 | update: 溶岩猶予期間 | dt>0 で進行、gap=0 に達するまで生存 → gap=0 で死亡 |
| 17 | onManualUpdated: 持久状態 | onInit 後に溶岩位置を変化させ onManualUpdated（同一 player）→ 不変 |
| 18 | onManualUpdated: 新ゲーム | player インスタンスを差し替えて onManualUpdated → 溶岩位置が初期値へリセット |
| 19 | onDisable | 状態がリセットされる（lavaSurfaceGap=0、firstInit 復帰） |
| 20 | feature 非アクティブ | features に 'platformer' なし → preUpdate/update/render すべて無操作 |
| 21 | render | feature 有効時・非アクティブ時とも例外を投げない |
| 22 | render: 可視範囲 | gap < 0 → 溶岩が描画される |
| 23 | render: オフスクリーン | gap >= 0 → 溶岩が描画されない |

## 8. ドキュメント（`docs/genre/platformer-genre.md`）

`docs/genre/tetris-genre.md` / `TEMPLATE.md` の形式に従い、**実装後の実態**を記載:
概要 / アーキテクチャ（§3 のファイル構成）/ ジャンル収束条件
（thresholds: aerial ≥ 5 AND combo ≥ 4、ベイズ収束候補）/ ゲーム仕様
（縦スクロール・重力・一方通行着地・二段ジャンプ・溶岩・漂動・操作方法
←→: 移動（480px/s）、Space: ジャンプ/二段ジャンプ、↑↓: 無効、
スコア式 `distance * 0.8 + survivedSec * 5`）/
設定パラメータ一覧（platformer.json）/ 実装上の注意点（§2 の各 gotcha:
preUpdate 順序 = enableFeatures 配列順、MovementFeature の vy スキップ、
onInit 未呼出と firstInit/lastPlayer パターン、シングルトン跨スコーラ、
着地固定（carry-while-standing）、頭上スナップ 24px、
genre gravity(1600) vs PLATFORMER.gravity(1500) の乖離）/
既知の制限・今後の改善候補（コンベヤベルト・バネ・高さによる背景テーマ変化・
雲の垂直方向スクロール・near_miss_combo の safe 対象外化、など）/
テスト（§7 の件数と結果）/ レビュー履歴（review subagent 実行後に追記）。

`docs/genre/README.md` の索引表に
`| platformer | [platformer-genre.md](../docs/genre/platformer-genre.md) | 縦スクロールクライム（重力・一方通行プラットフォーム・溶岩） |`
を追加（`npm run check-doc-links` がリンク解決を確認する）。

## 9. 検証手順（実装完了後・すべて必須）

1. `npx vitest run`（全ユニットテスト）
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`
5. `npm run validate`
6. `npm run reach-sim`（収束到達性。thresholds 不変で通るはず）
7. `npm run check-doc-links`
8. dev サーバ起動（`Start-Process` で非同期、stdout/stderr をログファイルにリダイレクト、
   PID を記録）→ Playwright で以下を確認:
   - デバッグパネルで `forceGenre: platformer` を設定しゲーム開始
   - スクリーンショット: プラットフォーム（黄色 safe rect）・溶岩（画面下）・プレイヤー
   - 重力落下・ジャンプ・着地・二段ジャンプの動作（フレーム連続キャプチャ or
     `__vue_app__._instance.setupState` 経由の決定論的確認）
   - コンソールエラーなし
   → 確認後サーバ停止（PID kill、ログ確認）

## 10. リスクと判断の記録

| 判断 | 内容 | 理由 |
|------|------|------|
| A | 指示書の「preUpdate で vy=0 リセット + gravity*dt」を**採用せず**、`p.vy += g*dt` の累積積分 + MovementFeature 側スキップに変更 | リセット方式では前帧の速度（ジャンプ -720）が 1 フレームで消滅し、ジャンプが 12px の hop になる（物理破綻）。累積積分が Doodle Jump 挙動の本質 |
| B | preUpdate 実行順序の保証手段を「systems/index.ts 登録位置」ではなく **enableFeatures 配列の末尾**に置く | `getActiveSystems` は features セットの反復順でシステムを返す（登録順ではない）ため |
| C | `vertical_scroll` を enableFeatures に**加えない**、漂動は PlatformerFeature 自前実装 | 二重ドリフト防止（MovementFeature 側は全ハザードを動かす） |
| D | 新ゲーム検出を `world.player` インスタンス同一性で実施 | feature シングルトンがスコーラを跨ぐため。距離等のヒューリスティックより確実 |
| E | spawnTable を全 safe 化 | 被弾死因を溶岩のみに統一（仕様「dies if touched by lava」）。near_miss_combo は無効化されるが scoreFormula 上は maxCombo=0 項のみ影響 |
| F | `runSpeed: 480` を platformer.json に追加 | フルウィンドウキャンバスでは PLAYER_PHYSICS.runSpeed(240) では水平到達不能（§6） |
