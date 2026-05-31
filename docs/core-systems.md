# コアシステム詳細解説

本ドキュメントは、ゲームの中核となる5つのシステムについて、コード内容を詳しく解説します。

## 1. sideScroller.ts - Canvas ゲームループと物理エンジン

**ファイル:** `src/game/sideScroller.ts`  
**責務:** Canvas 2D での描画、プレイヤー・ハザード・敵の物理計算、衝突判定、フレーム管理

### 概要

`SideScroller` クラスは requestAnimationFrame ベースのゲームループを実装しています。毎フレーム以下の処理を実行します：

```
入力処理 → 物理更新 → 衝突判定 → スコア更新 → 描画
```

### 主要なメソッド

#### `constructor(canvas, rules)`
Canvas をセットアップし、ゲーム世界（`MutableWorld`）を初期化します。

```typescript
this.canvas = canvas
this.ctx = canvas.getContext('2d')!
this.world = createMutableWorld()
```

#### `update(dt: number)`
**呼び出し頻度:** 毎フレーム  
**パラメータ:** `dt` = 前フレームからの経過時間（ミリ秒）

主な処理：

1. **入力処理** - キー入力に基づいてプレイヤーの速度を計算
   ```typescript
   const moveInput = (this.keys.moveRight ? 1 : 0) - (this.keys.moveLeft ? 1 : 0)
   this.world.player.vx = moveInput * PLAYER_SPEED
   ```

2. **重力・ジャンプ** - 重力を適用し、ジャンプ状態を管理
   ```typescript
   if (!this.world.player.onGround) {
     this.world.player.vy += GRAVITY * (dt / 1000)
   }
   ```

3. **スクロール** - カメラを自動前進
   ```typescript
   this.world.cameraX += effectiveScrollSpeed * (dt / 1000)
   ```

4. **エンティティ更新** - プレイヤー、ハザード、敵、弾の位置を更新
5. **FeatureSystem 呼び出し** - 各フィーチャーの `update()` メソッドを実行
6. **衝突判定** - AABB（軸並行バウンディングボックス）衝突判定を実行

#### `render()`
**呼び出し頻度:** 毎フレーム

Canvas にすべてのエンティティを描画します：

1. **背景色** - 現在のジャンルに応じて背景色を設定
2. **プレイヤー** - 位置 (screenX, screenY) に四角形を描画
3. **ハザード・敵** - colors に基づいて描画
4. **弾・パーティクル** - フィーチャーシステムが描画処理を委譲
5. **HUD テキスト** - 距離スコアなど

### 衝突判定ロジック

AABB 衝突判定を使用：

```typescript
function checkCollision(a: Entity, b: Entity): boolean {
  return a.x < b.x + b.width &&
         a.x + a.width > b.x &&
         a.y < b.y + b.height &&
         a.y + a.height > b.y
}
```

衝突時の処理：

- **危険色との接触** → `onPlayerHit()` フック呼び出し（ゲームオーバー）
- **安全色との接触** → `onSafeHazardTouch()` フック呼び出し（フィーチャーが処理）

### 座標系の一貫性

**重要:** 座標系は 2つあります：

- **ワールド座標** - スクロールに関係ない絶対座標
- **スクリーン座標** - Canvas 上の表示位置（カメラによって変換）

```typescript
// ワールド座標からスクリーン座標への変換
screenX = worldX - cameraX

// スクリーン座標からワールド座標への変換
worldX = screenX + cameraX
```

すべての物理計算はワールド座標で行い、描画時のみスクリーン座標に変換します。

---

## 2. genreResolver.ts - ジャンル判定ロジック

**ファイル:** `src/domain/genreResolver.ts`  
**責務:** 選択肢の蓄積パラメータからジャンルを判定

### 概要

プレイヤーの選択肢を通じて蓄積される「ジャンルパラメータ」（tempo, range, enemy, growth など 12 軸）から、どのジャンルへ収束するかを判定します。

### 主要な関数

#### `accumulateParams(paramsList: GenreParams[]): GenreParams`

選択肢履歴からパラメータを累積します。

```typescript
const accumulated: GenreParams = {}
for (const params of paramsList) {
  for (const [key, value] of Object.entries(params)) {
    accumulated[key as GenreParam] = (accumulated[key as GenreParam] ?? 0) + value
  }
}
return accumulated
```

**例:**
```
選択肢1: { tempo: 2, enemy: 1 }
選択肢2: { tempo: 1, rhythm: 2 }
累積結果: { tempo: 3, enemy: 1, rhythm: 2 }
```

#### `resolveGenre(accumulated: GenreParams, genres: GenreDef[]): GenreId`

累積パラメータからジャンルを判定します。

**判定ロジック:**

1. 各ジャンルの閾値（`thresholds`）をチェック
2. すべての閾値を満たす（**AND 条件**）ジャンルを抽出
3. 複数該当する場合は、**超過量の合計が最大** のジャンルを採用

```typescript
// 例
const accumulated = { tempo: 5, enemy: 4, range: 3 }

// runner: { tempo: 5 } → 満たしている（超過: tempo=0）
// stg:    { range: 4, enemy: 4 } → range 不足（0 < 4）→ 不採用
// rhythm: { tempo: 4, rhythm: 4 } → rhythm 不足 → 不採用

// 結果: runner
```

#### `resolveGenreProgress(accumulated: GenreParams, genres: GenreDef[]): GenreProgress`

現在のジャンル確定状況を進捗率で返します。デバッグパネル用。

```typescript
{
  closestGenre: 'stg',           // 最も接近したジャンル
  progress: 0.75,                // 確定までの進捗（0-1）
}
```

### パラメータ設計の思想

12 の軸は **ゲーム体験の本質的な違い** を表します：

| 軸 | 体験 | 代表ジャンル |
|----|------|----------|
| tempo | スピード感 | ランナー、リズム |
| range | 射程距離 | STG |
| enemy | 戦闘激化 | STG、アリーナ |
| combo | 連続成功 | パズル、ハックスラッシュ |
| growth | 成長・育成 | RPG、ダンジョン |
| rhythm | リズム精度 | リズムゲーム |

**設計: 選択肢は** ジャンル名を隠し、ルール変更という形で提示します。

```json
{
  "label": "スピードをどんどん上げる",
  "genreParams": { "tempo": 3 }
  // → プレイヤーには「スピードが上がる」に見える
  //   実は tempo パラメータが蓄積され、ランナーへの分岐が促進される
}
```

---

## 3. useGameState.ts - フェーズ管理と状態ハブ

**ファイル:** `src/composables/useGameState.ts`  
**責務:** ゲーム全体のフェーズ遷移と状態管理

### フェーズ遷移図

```
title → tutorial → updating ↔ playing → genreLocked → throwing → ending
         (スタート)    ↑
                   ルール更新の度に
                   このループに入る
```

### 主要な状態

```typescript
const phase = ref<Phase>('title')           // 現在のフェーズ
const lockedGenre = ref<GenreId | null>(null)
const rules = ref<RuntimeRules>(/* ... */)  // 現在のルール
const choiceHistory = ref<Choice[]>([])
const finalScore = ref<FinalScore | null>(null)
```

### 主要なメソッド

#### `startGame()`
タイトルから tutorial フェーズに遷移。ゲーム開始。

#### `triggerUpdate()`
playing/tutorial フェーズから updating フェーズに遷移。2択パネルを表示。

#### `choose(choiceId: string)`
選択肢を選択。

1. 選択肢の genreParams を履歴に記録
2. ruleEngine で新しい RuntimeRules を合成
3. genreResolver で収束ジャンルを判定
4. 閾値達成時は genreLocked フェーズへ遷移

#### `startThrowing(playScore: number)`
ギブアップボタンまたは gameover → throwing フェーズへ遷移。投擲 UI を表示。

#### `finalizeThrowing(throwResult: ThrowResult, playScore: number)`
投擲完了。スコア計算して ending フェーズへ遷移。

---

## 4. ruleEngine.ts - ルール合成エンジン

**ファイル:** `src/domain/ruleEngine.ts`  
**責務:** 説明書バージョン + 選択履歴 → 実行時ルール（RuntimeRules）の合成

### 概要

ゲームの実行時ルール（操作方法、危険色、有効フィーチャー など）は、すべて JSON から合成されます。**コードにルールをハードコードしない** という設計原則を支えるのがこのエンジンです。

### 主要な関数

#### `buildRuntimeRules(deck, choiceHistory, balance, genres): RuntimeRules`

**入力:**
- `deck` - すべての説明書バージョン定義
- `choiceHistory` - プレイヤーの選択履歴
- `balance` - ゲームバランス設定
- `genres` - ジャンル定義

**処理:**

1. **バージョンツリーを辿る**
   ```typescript
   let current = deck['1.0']  // ルートバージョン
   for (const choice of choiceHistory) {
     current = deck[choice.next]  // 選択に基づいて次へ
   }
   ```

2. **操作方法を合成（後勝ち）**
   ```typescript
   const controls: Controls = { jump: 'Space', ... }
   // 各バージョンで定義された controls を上書き適用
   ```

3. **危険色・安全色を合成**
   ```typescript
   const hazardColors = new Set(current.hazards.colors)
   const safeColors = new Set(current.hazards.safeColors)
   ```

4. **ジャンル確定**
   ```typescript
   const accumulated = accumulateParams(choiceHistory.map(c => c.genreParams))
   const genre = resolveGenre(accumulated, genres)
   ```

5. **機能フラグを確定**
   ```typescript
   const features = new Set<FeatureId>()
   const genreDef = genres.find(g => g.id === genre)
   features.addAll(genreDef.enableFeatures)
   features.deleteAll(genreDef.disableFeatures)
   ```

6. **学習ルールを適用**（必要に応じて）

### 出力: RuntimeRules

```typescript
interface RuntimeRules {
  controls: Controls                // キーバインディング
  hazardColors: Set<string>        // 危険色（RGB）
  safeColors: Set<string>          // 安全色（RGB）
  features: Set<FeatureId>         // 有効フィーチャー
  genre: GenreId                   // 確定ジャンル
  scrollSpeed: number              // スクロール速度 px/s
  bpm?: number                     // リズムゲーム用
}
```

### 重要な特性

**純粋関数:** 同じ入力に対して必ず同じ出力を返します。
→ テストが容易で、デバッグも予測可能

**後勝ち（上書き）:** 後に定義されたバージョンの設定が前の設定を上書き
```json
ver 1.0: { controls: { jump: 'Space' } }
ver 2.0: { controls: { jump: 'W' } }
→ 最終的に jump: 'W'
```

---

## 5. scoreCalc.ts - スコア計算エンジン

**ファイル:** `src/domain/scoreCalc.ts`  
**責備:** プレイスコア + 投擲スコア → 最終スコア

### スコア計算式

```
最終スコア = プレイスコア × 0.7 + 投擲スコア × 0.3
```

### プレイスコア計算

**入力:** ゲームプレイ中に蓄積された統計

```typescript
interface ScoreVars {
  distance: number      // 移動距離（px）
  kills: number         // 撃破敵数
  combo: number         // 現在のコンボ数
  exp: number           // 獲得経験値
  beatHits: number      // リズム正解数
  survivedSec: number   // 生存秒数
}
```

**計算方法:** ジャンルの `scoreFormula` 文字列を安全に評価

```typescript
// genres.ts の定義例
{
  id: 'stg',
  scoreFormula: "kills * 100 + distance * 0.5"
}

// scoreCalc が評価して実行
const playScore = evaluateFormula("kills * 100 + distance * 0.5", vars)
```

### 式の安全性

**eval は使わない** ため、許可される操作は限定されています：

- 変数参照：`distance`, `kills`, `combo` など
- 数値リテラル：`100`, `0.5` など
- 算術演算：`+`, `-`, `*`, `/`
- 括弧：`(` `)`

**許可されない：**
- 関数呼び出し：`Math.max()` → エラー
- オブジェクト操作：`obj.method()` → エラー
- ロジック演算：`&&`, `||` → エラー

これにより、**デザイナーが JSON で自由にスコア式を定義しながらセキュア** です。

### 投擲スコア計算

投擲フェーズでドラッグした説明書の放物線物理から：

```typescript
interface ThrowResult {
  airTime: number       // 滞空時間（秒）
  arcHeight: number     // 弧の最大高さ（px）
  speed: number         // リリース時の速度（px/s）
}

const throwScore = 
  result.airTime * 0.5 +      // 滞空時間を重視
  result.arcHeight * 0.4 +    // 弧の高さも重視
  - result.speed * 0.1        // 速すぎるとペナルティ
```

---

## 相互関係図

```
App.vue (入口)
  ↓
useGameState (フェーズ管理)
  ↓
ruleEngine (ルール合成)
  ↓
genreResolver (ジャンル判定)
  ↓
sideScroller (Canvas描画 + 物理)
  ↓
scoreCalc (スコア計算)
```

各システムは **入出力インターフェースで疎結合** されており、JSON 設定の変更に対応できる設計になっています。

