# ゲームフレームワーク仕様書

> このドキュメントは現在の実装を正確に記述し、設計上の課題と未実装箇所を明示する。  
> 新機能追加・リファクタリング前の読み物として位置づける。

---

## 目次

1. [設計原則](#1-設計原則)
2. [レイヤー構成](#2-レイヤー構成)
3. [フレームライフサイクル](#3-フレームライフサイクル)
4. [FeatureSystem インターフェース](#4-featuresystem-インターフェース)
5. [GenrePlugin インターフェース](#5-genreplugin-インターフェース)
6. [MutableWorld API](#6-mutableworld-api)
7. [座標系](#7-座標系)
8. [GameRegistry](#8-gameregistry)
9. [実装ステータス一覧](#9-実装ステータス一覧)
10. [🚧 課題と不足箇所](#10--課題と不足箇所)

---

## 1. 設計原則

| 原則 | 説明 |
|---|---|
| **JSON 駆動** | ルール・ジャンル・スコア重みはすべて定数オブジェクトで定義。ロジックにハードコードしない |
| **プラグイン登録** | ジャンルと機能は GameRegistry に登録する形で追加する。エンジン本体に if/else を追加しない |
| **オプショナルフック** | インターフェースに必須メソッドを増やさない。新イベントは `?:` で宣言する |
| **ゼロ循環依存** | domain → engine → game の一方向。逆方向インポートは禁止 |
| **オフライン完結** | ビルド後の `dist/` はネットワーク不要で動作する |

---

## 2. レイヤー構成

```
┌─────────────────────────────────────────────────────────┐
│  Vue UI Layer (App.vue / components/ / composables/)    │
│  HUD・ManualPanel・ChoicePanel・ThrowOverlay・Ending    │
└────────────────────┬──────────────────────────┬─────────┘
                     │ RuntimeRules              │ GameSnapshot
┌────────────────────▼──────────────────────────▼─────────┐
│  Game Loop  (game/sideScroller.ts)                      │
│  物理・衝突・スポーン・描画ルーティング                  │
│  GameRegistry 経由で FeatureSystem / GenrePlugin を呼ぶ │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
┌──────────▼────────┐       ┌──────────▼────────────────┐
│  GenrePlugin      │       │  FeatureSystem             │
│  (src/genres/)    │       │  (src/game/systems/)       │
│  視覚テーマ        │       │  ゲームメカニクス           │
│  スポーンテーブル  │       │  弾・リズム・移動・HP 等   │
└──────────┬────────┘       └──────────┬────────────────┘
           └──────────────┬────────────┘
                 ┌────────▼──────────────┐
                 │  GameRegistry         │
                 │  registerGenre()      │
                 │  registerFeature()    │
                 │  getActiveSystems()   │
                 └────────┬──────────────┘
                 ┌────────▼──────────────┐
                 │  Domain Layer         │
                 │  domain/types.ts      │
                 │  domain/ruleEngine    │
                 │  domain/genreResolver │
                 │  domain/scoreCalc     │
                 └────────┬──────────────┘
                 ┌────────▼──────────────┐
                 │  Data Layer           │
                 │  data/genres.ts       │
                 │  data/gameBalance.ts  │
                 │  data/tunables.ts     │
                 │  data/manuals/*.json  │
                 └───────────────────────┘
```

### レイヤー間の依存ルール

- `domain/` は Vue にも Canvas にも依存しない純粋関数・型定義のみ
- `engine/` は `domain/types` と `game/entities` に依存してよい
- `game/systems/` は `engine/` と `data/` に依存してよい。`game/sideScroller` には依存しない
- `sideScroller.ts` は `engine/GameRegistry` 経由でシステムを取得する。直接 import しない

---

## 3. フレームライフサイクル

```
requestAnimationFrame
  │
  ├─ _computeInputEdges()
  │    justPressed / justReleased を this.keys と前フレームの差分で計算
  │
  ├─ _update(dt)  ← dead でない場合のみ
  │
  │  [1] PRE-PHYSICS フェーズ
  │      buildWorld() → InputSnapshot を構築
  │      for (sys of getActiveSystems(features)):
  │        sys.preUpdate?(world, input, dt)
  │      ↑ 主に MovementFeature が player.vx をセット
  │
  │  [2] PHYSICS フェーズ  ← scrollAxis === 'y' か 'x' で分岐
  │    ┌─ 縦スクロール (scrollAxis='y') ─────────────────────┐
  │    │  player.x += player.vx * dt  (左右移動のみ)         │
  │    │  player は画面下部に固定 (重力なし)                  │
  │    │  hazards が上から降下 (y += scrollSpeed * dt)       │
  │    │  hazard スポーン (distance 累積)                    │
  │    │  衝突判定 (スクリーン座標同士)                       │
  │    │    isHazardous → _onPlayerHit(p)                   │
  │    │    safe       → onSafeHazardTouch フック dispatch   │
  │    └─────────────────────────────────────────────────────┘
  │    ┌─ 横スクロール (scrollAxis='x') ───────────────────── ┐
  │    │  ジャンプ: coyote + jumpBuffer + double_jump        │
  │    │  重力: vy += gravity * fallMult * dt                │
  │    │    (fallMult = player.onGround ? 1.0 : PHYSICS.airMultiplier)
  │    │    airMultiplier により空中落下速度を調整可能       │
  │    │  着地: landSquash アニメ                             │
  │    │  X移動: auto_run でなければ player.x += vx * dt     │
  │    │  スクロール: distance += speed * dt                 │
  │    │             cameraX  = distance - leadOffset        │
  │    │  hazard スポーン・pulse 更新                        │
  │    │  衝突判定 (hazard.x - cameraX でスクリーン変換)     │
  │    │    beat_hazard 反転考慮                             │
  │    │    isHazardous → _onPlayerHit(p)                   │
  │    │    safe       → onSafeHazardTouch フック dispatch   │
  │    └─────────────────────────────────────────────────────┘
  │
  │  [3] POST-PHYSICS フェーズ (共通)
  │      buildWorld() → InputSnapshot を構築
  │      for (sys of getActiveSystems(features)):
  │        sys.update(world, input, dt)
  │      アイテムクリーンアップ (dead / 画面外)
  │      パーティクル物理
  │      スコアポップアップ更新
  │      画面シェイク減衰
  │      距離スコア加算
  │
  └─ _render()
       shakeX/Y 適用 (ctx.translate)
       _drawBackground()  → GenrePlugin.drawFarLayer / drawMidLayer
       items 描画
       hazards 描画  → GenrePlugin.drawHazard?(可オーバーライド)
       for (sys): sys.render?(ctx, world)  ← 弾・ビートマーカー等
       パーティクル描画
       スコアポップアップ描画
       _drawPlayer()  → GenrePlugin.drawPlayer()
       死亡オーバーレイ (dead のとき)
```

### フェーズ別の用途

| フェーズ | 用途 | 呼ばれるフック |
|---|---|---|
| PRE-PHYSICS | 入力→速度マッピング | `preUpdate?` |
| PHYSICS | 重力・衝突・座標更新 | `_onPlayerHit` → `onPlayerHit?` / `onSafeHazardTouch?` |
| POST-PHYSICS | ゲームロジック・スコア・演出 | `update` |
| RENDER | Canvas 描画 | `render?` |
| イベント（随時） | ジャンル確定・ルール更新 | `onInit?` / `onManualUpdated?` |

---

## 4. FeatureSystem インターフェース

```typescript
interface FeatureSystem {
  readonly handles: FeatureId | ReadonlyArray<FeatureId>

  // ─── 必須 ───────────────────────────────────────────────
  update(world: MutableWorld, input: InputSnapshot, dt: number): void

  // ─── オプショナル ────────────────────────────────────────
  preUpdate?(world: MutableWorld, input: InputSnapshot, dt: number): void
  render?(ctx: CanvasRenderingContext2D, world: MutableWorld): void
  onInit?(world: MutableWorld): void
  onPlayerHit?(world: MutableWorld): void
  onSafeHazardTouch?(world: MutableWorld, hazard: Hazard, screenX: number): void
  onPlayerDeath?(world: MutableWorld): void         // ← sideScroller から未呼び出し
  onManualUpdated?(world: MutableWorld, versionKey: string): void
  onComboChange?(world: MutableWorld, combo: number): void  // ← 未呼び出し
  onItemPickup?(world: MutableWorld, itemType: string): void // ← 未呼び出し
  onBossSpawn?(world: MutableWorld): void                   // ← 未呼び出し
  onPlayerJump?(world: MutableWorld): void                  // ← 未呼び出し
}
```

### フック呼び出しタイミング（実装済み ✅ / 未呼び出し ⚠️）

| フック | 呼び出し元 | 状態 |
|---|---|---|
| `preUpdate` | sideScroller._update → PRE-PHYSICS フェーズ | ✅ |
| `update` | sideScroller._update → POST-PHYSICS フェーズ | ✅ |
| `render` | sideScroller._render | ✅ |
| `onInit` | sideScroller.updateRules + 各 Feature の onInit | ✅ |
| `onPlayerHit` | sideScroller._onPlayerHit → dispatch | ✅ |
| `onSafeHazardTouch` | 衝突ループの safe 分岐 | ✅ |
| `onManualUpdated` | sideScroller.updateRules | ✅ |
| `onPlayerDeath` | sideScroller._die() | ✅ |
| `onComboChange` | ShootFeature.update（combo 変化時） | ✅ |
| `onItemPickup` | RpgFeature.update（アイテム収集時） | ✅ |
| `onBossSpawn` | sideScroller（ボススポーン時） | ✅ |
| `onPlayerJump` | sideScroller（ジャンプ発動時） | ✅ |
| `onPlayerLand` | sideScroller（着地時） | ✅ |
| `onHazardDestroyed` | ShootFeature.update（ハザード破壊時） | ✅ |

### 登録

```typescript
// src/game/systems/index.ts
registerFeature(new MyFeature())
```

一つのシステムが複数の FeatureId を handles に宣言できる。  
`getActiveSystems(features)` は同一インスタンスを重複返却しない（Set でデdup）。

---

## 5. GenrePlugin インターフェース

### 必須プロパティ（全ジャンルで定義が必要）

| プロパティ | 型 | 説明 |
|---|---|---|
| `id` | `GenreId` | ジャンル識別子 |
| `skyColors` | `[string, string]` | 空グラデーションの上端・下端色 |
| `groundColors` | `[string, string]` | 地面グラデーション |
| `palette` | `{danger, dangerGlow, safe, safeGlow}` | ハザード配色 |
| `spawnTable` | `SpawnEntry[]` | ハザード出現テーブル（距離に応じた重み付き） |

### 必須メソッド

| メソッド | 説明 |
|---|---|
| `drawFarLayer(ctx, offsetX, W, gY)` | 遠景描画（山・星など） |
| `drawMidLayer(ctx, offsetX, W, gY)` | 中景描画 |
| `drawPlayer(ctx, w, h, onGround, runCycle)` | プレイヤー描画 |

### オプショナルプロパティ

| プロパティ | 説明 |
|---|---|
| `starColor?` | 星フィールドの色（null で非表示） |
| `starConfig?` | 星の密度・サイズ・透明度レンジ |
| `parallax?` | `{ stars, far, mid }` 視差倍率 |
| `hazardConfig?` | pulseSpeed / pulseAmplitude / glowBlur のオーバーライド |
| `groundLineAlpha?` / `groundDashAlpha?` | 地面ラインの透明度 |
| `particleColors?` | `{ hit, jump, land, death }` パーティクル色 |
| `scrollSpeedBonus?` | このジャンルのスクロール速度加算 |
| `playerScale?` | プレイヤー描画スケール |

### オプショナルフック

| フック | 説明 |
|---|---|
| `onGenreLocked?(world)` | ジャンル確定時に1回 |
| `onUpdate?(world, dt)` | 毎フレーム（ジャンル専用ロジック） |
| `drawHazard?(ctx, h, sx, r)` | ハザード描画オーバーライド（true で標準描画をスキップ） |
| `drawForeground?(ctx, cam, W, H, gY)` | 最前面レイヤー |
| `drawGenreHUD?(ctx, world)` | ジャンル専用 HUD |
| `onPlayerJump?(world)` | ジャンプ時の演出 |
| `onPlayerLand?(world)` | 着地時の演出 |
| `onHazardDestroyed?(world, h)` | ハザード破壊時 |
| `onManualUpdated?(world, key)` | ルール更新時 |

---

## 6. MutableWorld API

FeatureSystem と GenrePlugin が毎フレーム受け取るコンテキスト。  
sideScroller の内部状態を直接公開せず、メソッド越しにのみ変更できる。

### 読み取りプロパティ

| プロパティ | 型 | 説明 |
|---|---|---|
| `player` | `Player` | x, y, vx, vy, w, h, hp, maxHp, exp, onGround, jumpsLeft, invincible, airTime, landSquash |
| `hazards` | `Hazard[]` | 現フレームのハザード（参照は mutable） |
| `items` | `Item[]` | 現フレームのアイテム（参照は mutable） |
| `bullets` | `Bullet[]` | 弾リスト（ShootFeature が管理） |
| `rules` | `RuntimeRules` | 現フレームのルールセット（イミュータブル） |
| `distance` | `number` | 走行距離 px（フレーム開始時点のスナップショット） |
| `survivedSec` | `number` | 生存時間 秒 |
| `canvas` | `HTMLCanvasElement` | Canvas 要素 |
| `ctx` | `CanvasRenderingContext2D` | 2D 描画コンテキスト |
| `cameraX` | `number` | 横スクロール時のカメラ X（ワールド→スクリーン変換用） |
| `gameStats` | `Readonly<GameStats>` | kills / combo / maxCombo / beatHits / beatHazardInverted |

### 書き込みメソッド

```typescript
// スコア・UI
addScore(amount: number): void
addScorePopup(x: number, y: number, text: string, color: string): void
triggerShake(intensity: number): void
addParticle(x, y, vx, vy, life, color, size?): void

// ワールド操作
spawnHazard(h: Hazard): void
spawnItem(item: Item): void
removeHazardById(h: Hazard): void

// ゲーム状態
modifyPlayerHp(delta: number): void     // 0 以下で死亡
resetCombo(): void
setTimescale(scale, durationSec?): void // ← TODO: 未実装

// 統計（FeatureSystem 専用）
setKills(n: number): void
setCombo(n: number): void               // maxCombo も自動更新
addBeatHit(): void
setBeatHazardInverted(v: boolean): void
```

### 注意点

- `buildWorld()` はフレームごとに複数回コールされる（PRE, POST, 衝突ループ）。  
  スナップショット値（`distance`, `cameraX`）はコール時点の値になる。
- `player` の参照は mutable。`player.invincible = X` のような直接書き込みも可能だが、  
  副作用が見えにくくなるため、できる限り write メソッドを通す。

---

## 7. 座標系

### 現状（⚠️ モードで不統一）

| | 横スクロール (`scrollAxis='x'`) | 縦スクロール (`scrollAxis='y'`) |
|---|---|---|
| `player.x` | **スクリーン座標** | **スクリーン座標** |
| `hazard.x` | **ワールド座標** | **スクリーン座標** |
| `bullet.x` | **ワールド座標** | **スクリーン座標** |
| 衝突判定 | `sx = hazard.x - cameraX` で変換必要 | 変換不要 |

### 変換ルール

```typescript
const isVertical = world.rules.scrollAxis === 'y'

// ハザードのスクリーン X を求める
const hazardScreenX = isVertical ? hazard.x : hazard.x - world.cameraX

// プレイヤーのワールド X を求める（弾の発射位置など）
const playerWorldX = isVertical ? player.x : player.x + world.cameraX
```

---

## 8. GameRegistry

```typescript
// 登録（起動時に src/genres/index.ts と src/game/systems/index.ts で実行）
registerGenre(plugin: GenrePlugin): void
registerFeature(system: FeatureSystem): void

// 取得（エンジン内から毎フレーム使用）
getGenre(id: GenreId): GenrePlugin           // 未登録なら 'base' にフォールバック
getActiveSystems(features: Set<FeatureId>): FeatureSystem[]  // 重複なし

// 開発ユーティリティ
devValidateRegistry(allFeatureIds): void    // 未登録 ID の警告
debugPrint(): void
```

`getActiveSystems` は `features` に含まれる FeatureId のいずれかを `handles` に持つシステムを返す。  
1つのシステムが複数の FeatureId を handles していても1回だけ含まれる。

---

## 9. 実装ステータス一覧

### FeatureSystem

| クラス | 担当 FeatureId | preUpdate | update | render | その他フック | 状態 |
|---|---|---|---|---|---|---|
| ShootFeature | shoot / three_way / charge_shot / spread_shot / bomb / enemy_hp | ─ | ✅ | ✅ | onManualUpdated | ✅ |
| RhythmFeature | beat_hazard / just_input / beat_dash | ─ | ✅ | ✅ | onManualUpdated | ✅ |
| MovementFeature | auto_run / slow_precise / double_jump / long_air / dash / wall_jump / vertical_scroll | ✅ | ✅ | ✅ | onInit | ✅（slide / gravity_flip のみ未実装・warn） |
| RpgFeature | hp / exp / item_pickup / shield | ─ | ✅ | ─ | onPlayerHit | ✅（shield のみスタブ） |
| SpecialFeature | stealth_mode / time_bonus / tower / color_touch / boss | ─ | ✅ | ─ | onSafeHazardTouch | ✅ |
| PuzzleFeature | grid_stop / puzzle_solve | ─ | ✅ | ─ | ─ | ✅ |
| TetrisFeature | tetris_mode | ✅ | ✅ | ✅ | onInit | ✅ |

> 旧 `ExtraMovementFeature`（dash / wall_jump / vertical_scroll）は `MovementFeature` に統合された。

### GenrePlugin

| クラス | ジャンル | spawnTable | drawPlayer | 専用 HUD | 状態 |
|---|---|---|---|---|---|
| BasePlugin | base / runner | ✅ | ✅ | ─ | ✅ |
| StgPlugin | stg | ✅ | ✅ | ─ | ✅ |
| RpgPlugin | rpg | ✅ | ✅ | ─ | ✅ |
| RhythmPlugin | rhythm | ✅ | ✅ | ─ | ✅ |
| PuzzlePlugin | puzzle | ✅ | ✅ | ─ | ✅ |
| AerialStgPlugin | aerial_stg | ✅ | ✅ | ─ | ✅ |
| SurvivalPlugin | survival | ✅ | ✅ | ─ | ✅ |
| BulletRunnerPlugin | bullet_runner | ✅ | ✅ | ─ | ✅ |
| PlatformerPlugin | platformer | ✅ | ✅ | ─ | ✅ |
| RacingPlugin | racing | ✅ | ✅ | ─ | ✅ |
| ArenaPlugin | arena | ✅ | ✅ | ─ | ✅ |
| AquaticPlugin | aquatic | ✅ | ✅ | ─ | ✅ |
| DungeonPlugin | dungeon | ✅ | ✅ | ─ | ✅ |
| HackSlashPlugin | hack_slash | ✅ | ✅ | ─ | ✅ |
| TetrisPlugin | tetris | ✅ | ✅ | ✅(TetrisFeature) | ✅ |
| JSONフォールバック | bullet_hell / stealth_action / tower_def / sports / idle / horror | ✅ | ✅ | ─ | ✅（JSONGenrePlugin で描画） |

### ドメイン・ユーティリティ

| モジュール | 機能 | 状態 |
|---|---|---|
| domain/ruleEngine.ts | buildRuntimeRules — 選択履歴 → RuntimeRules 合成 | ✅ |
| domain/genreResolver.ts | resolveGenre — genreParams → ジャンル収束 | ✅ |
| domain/scoreCalc.ts | 最終スコア計算（play × 0.7 + throw × 0.3） | ✅ |
| domain/LearningSystem.ts | 行動統計→ルール変更（`evaluateLearningRules`）。sideScroller のループに統合済み | ✅ |
| framework/ | ManualLoader / ManualBuilder / ManualValidator / ConfigLoader / ConfigValidator | ✅ |

---

## 10. 🚧 課題と不足箇所

### A. フック呼び出しの実装状況（実装完了 ✅）

すべてのフックが実装され、適切なタイミングで呼び出されるようになりました。

| フック | 実装時期 | 呼び出し元 |
|---|---|---|
| `onPlayerDeath` | ✅ 実装済み | `sideScroller._die()` |
| `onComboChange` | ✅ 実装済み | `ShootFeature.update()` |
| `onItemPickup` | ✅ 実装済み | `RpgFeature.update()` |
| `onBossSpawn` | ✅ 実装済み | `sideScroller._update()` |
| `onPlayerJump` | ✅ 実装済み | `sideScroller._update()` |
| `onPlayerLand` | ✅ 実装済み | `sideScroller._update()` |
| `onHazardDestroyed` | ✅ 実装済み | `ShootFeature.update()` |
| `onManualUpdated` | ✅ 実装済み | `sideScroller.updateRules()` |

---

### B. buildWorld() の多重コール（優先度: 中）

現在 `_buildWorld()` は 1 フレームに最大 3 回コールされる：

1. PRE-PHYSICS フェーズ（`preUpdate` 用）
2. 衝突ループ（`onSafeHazardTouch` 用）
3. POST-PHYSICS フェーズ（`update` 用）
4. `_onPlayerHit`（`onPlayerHit` 用）

`buildWorld()` はクロージャを持つオブジェクトを毎回 new するため、GC 負荷がある。  
`distance` や `cameraX` はスナップショットなので「同じ world を使い回せない」課題があるが、  
world を mutable にしてフレーム末に更新する方式に変えれば 1 インスタンスに統一できる。

```typescript
// 案: sideScroller が world を 1 インスタンス保持
private _world: MutableWorld | null = null

// フレーム開始時に距離・カメラを更新
private _refreshWorld(): void {
  this._world!.distance  = this.distance
  this._world!.cameraX   = this.cameraX
  // ...各フィールドをパッチ更新
}
```

---

### C. 座標系の不統一（優先度: 中 → ✅ 実装済み）

横スクロール時にハザードはワールド座標、プレイヤーはスクリーン座標という設計は  
FeatureSystem を実装するたびに「どちらの座標か？」という認知コストを生む。

**実装完了（2026-05-31）:**

```typescript
// MutableWorld に座標変換ヘルパーを追加 ✅
interface MutableWorld {
  readonly scrollMode: 'x' | 'y'

  // ハザードのスクリーン X を取得（モード非依存）
  getHazardScreenX(h: Hazard): number

  // プレイヤーのワールド X を取得（モード非依存）
  getPlayerWorldX(): number
}
```

これにより FeatureSystem の実装者は `isVertical` 分岐を書かなくてよくなり、座標系の混乱が排除される。

---

### D. sideScroller.ts の肥大化（優先度: 低〜中）

現在 ~750 行。以下の責務が混在している：

| 責務 | 行数（概算） |
|---|---|
| 入力処理（justPressed/justReleased） | ~30 行 |
| 物理シミュレーション（重力・ジャンプ・コヨーテ） | ~100 行 |
| 衝突検出 | ~60 行 |
| スポーン | ~60 行 |
| Feature/Genre ディスパッチ | ~30 行 |
| レンダリング（背景・プレイヤー・ハザード） | ~300 行 |
| パーティクル・ポップアップ | ~40 行 |
| スコア計算 | ~20 行 |

**推奨分割案:**

```
game/
  sideScroller.ts       coordinator のみ（~200 行）
  physics/
    PhysicsEngine.ts    ジャンプ・重力・コヨーテ
  collision/
    CollisionSystem.ts  AABB・フック dispatch
  rendering/
    Renderer.ts         Canvas 描画のルーティング
    ParticleSystem.ts   パーティクル管理
```

---

### E. 未実装 Feature の空スタブ（優先度: 中 → ✅ 実装済み）

かつてスタブだった Feature は順次実装され、現在は以下の少数のみが未実装で残る：

```
MovementFeature: slide / gravity_flip   （有効化時に console.warn）
RpgFeature:      shield                  （onPlayerHit のスタブのみ）
```

**実装ステータス（現状）:**

- ✅ **MovementFeature**: 旧 ExtraMovementFeature を統合。dash / wall_jump / vertical_scroll は実装済み。slide / gravity_flip のみ未実装（console.warn）
- ✅ **PuzzleFeature**: grid_stop / puzzle_solve を実装
- ✅ **SpecialFeature**: stealth_mode / time_bonus / tower / boss / color_touch を実装
- ✅ **TetrisFeature**: tetris_mode を実装
- ⚠️ **RpgFeature**: shield は未実装のまま（onPlayerHit のスタブ実装済み）

未実装 feature が有効化された場合は開発コンソールに console.warn を出力するため、即座に発見可能。

---

### F. Learning System（実装完了 ✅）

`domain/LearningSystem.ts` の `evaluateLearningRules` が `sideScroller.ts` のループに統合済み。  
`ActionStats`（jumps / moveRight / shots 等）を一定間隔で評価し、`LearningRule` のトリガー成立時に  
危険色反転・アクション無効化などの `LearningEffect` を発動する（発動時は `learningNotification` で通知）。  
ルールは `ManualVersion.learningRules`（JSON）で定義する。

---

### G. setTimescale の実装（優先度: 完了 ✅）

`world.setTimescale()` は完全に実装されており、以下のメカニズムで動作します：

```typescript
// sideScroller.ts 内
private _timescaleScale = 1.0
private _timescaleRemaining = -1

// フレーム内で適用
const dt = rawDt * this._timescaleScale
```

`RhythmFeature` など、スロー演出が必要な Feature はこれを活用できます。

---

### H. framework/ ディレクトリ（実装完了 ✅）

`src/framework/` は完全に実装されており、以下で構成されます：

```
src/framework/
  index.ts              — 公開 API エクスポート
  ManualLoader.ts       — JSON → ManualVersion のパース
  ManualBuilder.ts      — プログラム的な説明書生成 API
  ManualValidator.ts    — 開発時・実行時バリデーション
  types.ts              — 型定義
```

説明書 JSON はスキーマバリデーション済みで、不正な構造は早期に検出されます。

---

### I. GenrePluginBase（実装完了 ✅）

`engine/GenrePluginBase.ts` が実装され、すべてのジャンルプラグインが継承できるようになりました：

```typescript
abstract class GenrePluginBase implements GenrePlugin {
  // 必須フィールド・メソッド（サブクラスで実装）
  abstract readonly id: GenreId
  abstract drawFarLayer(ctx, offsetX, W, gY): void
  abstract drawMidLayer(ctx, offsetX, W, gY): void
  abstract drawPlayer(ctx, w, h, onGround, runCycle): void

  // オプショナルメソッド（no-op デフォルト実装）
  onGenreLocked(_world): void { }
  onUpdate(_world, _dt): void { }
  drawHazard(...): boolean { return false }
  // ...その他
}
```

これにより、プラグイン間のコード重複が最小化されました。

---

## 課題サマリー（2026-05-31 更新）

### 実装完了 ✅

| # | 課題 | 完了内容 |
|---|---|---|
| A | フック呼び出し実装 | すべてのフック（onPlayerDeath, onComboChange, onItemPickup 等）が実装され、適切に呼び出されている |
| C | 座標系の不統一 | MutableWorld に getHazardScreenX / getPlayerWorldX ヘルパーメソッド実装 |
| E | 空スタブの実装 | 旧 ExtraMovementFeature を Movement に統合。Puzzle / Special / Tetris は実装済み。残る未実装は slide / gravity_flip / shield のみ（warning 出力） |
| G | setTimescale 実装 | タイムスケール機構が完全実装。RhythmFeature などで活用可能 |
| H | framework/ 実装 | ManualLoader, ManualBuilder, ManualValidator が完全実装 |
| I | GenrePluginBase 実装 | 抽象基底クラスが実装されすべてのプラグインが継承 |

### fallMult の詳細説明

115 行目に記載の `fallMult` は以下の仕様：

```typescript
const fallMult = world.player.onGround ? 1.0 : PHYSICS.airMultiplier
const vy = player.vy + gravity * fallMult * dt
```

- **onGround=true（着地状態）**: fallMult=1.0 → 重力加速度そのまま（実質的に重力は動作しない）
- **onGround=false（空中）**: fallMult=PHYSICS.airMultiplier（デフォルト 1.2）→ 空中落下時は重力加速度 1.2 倍

これにより「着地判定から失われるまでの間、重力を段階的に制御」できる。

### 設計改善提案（将来の最適化）

| # | 課題 | 優先度 | 説明 |
|---|---|---|---|
| B | buildWorld 多重コール | 中 | フレーム内で複数回コールされている。mutable world の再利用で GC 負荷削減可能 |
| D | sideScroller 肥大 | 低 | 関心の分離（物理・衝突・描画の分割）で保守性向上 |
| F | Learning System | 完了 ✅ | `evaluateLearningRules` が sideScroller のループに統合済み |
