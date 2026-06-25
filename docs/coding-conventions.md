# コーディング規約

CLAUDE.md に定義されたルールの**具体的な適用例**と**よくある違反パターン**をまとめたガイドです。

---

## 1. マジックナンバーを書かない

### ルール

> ゲームバランス値 → `src/data/config/*.json` に定義して `tunables.ts` / `gameBalance.ts` 経由で参照。  
> 実装固有の閾値（初期座標、dt 上限など）→ ファイル先頭の `const` 定数として定義。

### 悪い例

```typescript
// ❌ 数値が直書きされている
const bonus = Math.round(150 * quality)
if (this.deathTimer > 0.4) { ... }
rawRules.scrollSpeed = originalSpeed * 1.35
```

### 良い例

```typescript
// ✅ ファイル先頭に定数を置く（実装固有の閾値の場合）
const JUST_BASE_SCORE = 150
const JUST_QUALITY_THRESHOLD = 0.5

// ✅ JSON 設定から読む（ゲームバランス値の場合）
import { UI, RHYTHM_TUNING } from '../../data/tunables'
import { GENRE_LOCKED_BOOST } from '../../data/gameBalance'

if (this.deathTimer > UI.deathTextDelayS) { ... }
const bonus = Math.round(JUST_BASE_SCORE * quality)
rawRules.scrollSpeed = originalSpeed * GENRE_LOCKED_BOOST.mult
```

### どのファイルに書くか

| 値の種類 | 置き場所 | 参照方法 |
|---|---|---|
| 物理パラメータ（重力・速度）| `src/data/config/physics.json` | `PHYSICS.*` または `RULE_DEFAULTS.*` |
| UIタイミング・アニメーション | `src/data/config/ui.json` | `UI.*` |
| リズム・BPM 関連 | `src/data/config/rhythm_tuning.json` | `RHYTHM_TUNING.*` |
| スコア計算 | `src/data/config/score.json` | `SCORE.*` |
| ゲーム進行（ラウンド数等）| `src/data/config/game_balance.json` | `MAX_ROUNDS`, `GENRE_LOCKED_BOOST` 等 |
| 実装固有の固定値 | ファイル先頭 `const` | ローカル参照 |

---

## 2. プライベート関数は `_` プレフィックス

### ルール

> ファイル内プライベート関数 → `_` プレフィックス + camelCase

### 悪い例

```typescript
// ❌ export されていないが _ がない
function parseFile(file, path) { ... }
function isConfigValid(raw) { ... }
function evaluateTrigger(trigger, stats) { ... }
```

### 良い例

```typescript
// ✅ _ プレフィックスで「外から使わない」と明示
function _parseFile(file: ManualDeckFile, path: string) { ... }
function _isConfigValid(raw: unknown) { ... }
function _evaluateTrigger(trigger: LearningTrigger, stats: ActionStats) { ... }
```

### なぜ重要か

- `export` と非 `export` の区別だけでは、同一ファイル内の関数が「内部実装」か「公開API」かが一目でわからない
- クラスの `private` メソッドも同様（`private _methodName()` で統一）
- ESLint の `naming-convention` ルールと連動して静的チェックが効く

---

## 3. コメントは「なぜ」だけ書く

### ルール

> 何をしているかは書かない（コードが語る）。なぜそうしているか（制約・回避策・非自明な不変条件）だけを書く。

### 悪い例

```typescript
// ❌ 関数の動作を説明している（コードを見ればわかる）
// プレイヤーの速度を更新する
function updateVelocity() { ... }

// ❌ 変数名で分かることを書いている
private score = 0  // スコア

// ❌ 呼び出し元を参照している（時間で腐る）
// sideScroller.ts から呼ばれる
export function evaluateLearningRules() { ... }

// ❌ ファイルの概要を書いている（ファイル名が教えてくれる）
/**
 * entities.ts
 * ゲームに登場するエンティティの定義と基本操作
 */
```

### 良い例

```typescript
// ✅ なぜそうするか（制約・非自明な理由）を書いている
// ticks=0 ガード: ゲーム開始直後（統計未蓄積）で誤発動しないよう先頭でチェック
if (stats.ticks === 0) return false

// ✅ 非自明な挙動の理由
// 重力が変化した場合、空中にいる時のみ慣性（vy）を比例調整する
// （無重力ジャンルへの切り替え時に、旧重力下で蓄積した速度がそのまま残り続けるのを防ぐ）
const oldGravity = this.rules.gravity

// ✅ in-place 変更という副作用を1行で警告
// rules 配列を in-place で変更する（triggered フラグを立てる）副作用あり
export function evaluateLearningRules(...) { ... }
```

### 判断基準

コメントを消したとき、コードを読んだ別の開発者が「え、なんでこうなってるの？」と思うなら書く。思わないなら消す。

---

## 4. 重複コードはヘルパーに抽出する

### ルール

> 同じロジックが 2 箇所以上に現れたらヘルパー関数に抽出する。

### 悪い例

```typescript
// ❌ ArenaPlugin.ts と DungeonPlugin.ts で同じ描画ロジック
class ArenaPlugin extends GenrePluginBase {
  private _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    // ...10行
  }
}

class DungeonPlugin extends GenrePluginBase {
  private _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    // ...10行（完全に同じ）
  }
}
```

### 良い例

```typescript
// ✅ 基底クラスに一度だけ定義する
class GenrePluginBase {
  protected _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    // ...10行（1箇所だけ）
  }
}

// サブクラスは super の実装を継承するだけ
class ArenaPlugin extends GenrePluginBase {
  drawMidLayer(ctx, offsetX, W, gY) {
    this._roundRect(ctx, x, y, w, h, 4)  // 継承して使うだけ
  }
}
```

---

## 5. ゲームロジックは Vue コンポーネントに置かない

### ルール

> MVVMパターン: ゲームロジック・ドメイン・View を明確に分離する。

### 悪い例

```vue
<!-- ❌ App.vue でゲームルールを直接操作している -->
<script setup>
watch(() => gameState.lockedGenre.value, () => {
  // ゲームルールを Vue コンポーネントが直接変更している
  const rawRules = toRaw(gameState.rules)
  rawRules.scrollSpeed = rawRules.scrollSpeed * 1.35  // ❌ リアクティブを迂回
  setTimeout(() => {
    rawRules.scrollSpeed = originalSpeed              // ❌ 800 がマジックナンバー
  }, 800)
})
</script>
```

### 良い例

```vue
<!-- ✅ App.vue は composable/domain が公開するインターフェースを呼ぶだけ -->
<script setup>
import { GENRE_LOCKED_BOOST } from './data/gameBalance'

watch(() => gameState.lockedGenre.value, () => {
  // toRaw で取得してスプレッドコピーを渡す（リアクティブオブジェクトを変異しない）
  const current = toRaw(gameState.rules)
  scroller.updateRules({ ...current, scrollSpeed: current.scrollSpeed * GENRE_LOCKED_BOOST.mult })

  setTimeout(() => {
    scroller?.updateRules(toRaw(gameState.rules))  // 現在のルールをそのまま渡す
  }, GENRE_LOCKED_BOOST.durationMs)
})
</script>
```

### 役割の分担

```
App.vue / components/     →  UI イベントを受けて composable を呼ぶ
composables/useGameState  →  フェーズ遷移・選択履歴の管理
domain/ruleEngine         →  ルール合成ロジック（純粋関数）
game/sideScroller         →  物理・描画ループ
```

---

## 6. JSON 駆動を維持する

### ルール

> すべてのルールは JSON で定義する。コードにルールをハードコードしない。

### 悪い例

```typescript
// ❌ ジャンル ID が TS コード中にハードコードされている
function _forceResolve() {
  return resolved !== 'base' ? resolved : 'runner'  // 'runner' が直書き
}

// ❌ フォールバックカラーが TS に直書き
const palette = {
  danger: def.palette?.danger ?? '#ff6b6b',    // ❌ JSON で設定すべき
}
```

### 良い例

```typescript
// ✅ game_balance.json に "defaultFallbackGenre": "runner" と定義して読む
import { DEFAULT_FALLBACK_GENRE } from '../data/gameBalance'

function _forceResolve() {
  return resolved !== 'base' ? resolved : DEFAULT_FALLBACK_GENRE as GenreId
}
```

### ジャンル ID の扱い方

ジャンル ID 文字列（`'stg'`, `'rpg'` など）は型定義には使って良い。  
エンジンのロジック分岐（`if (genre === 'stg')` など）には使わない — プラグインに委譲する。

```typescript
// ✅ OK: 型定義として使う
type GenreId = 'stg' | 'rpg' | 'puzzle' | ...

// ❌ NG: エンジン中で分岐する
if (genre === 'stg') {
  // STG専用処理...
}

// ✅ OK: プラグインに委譲する
const plugin = GameRegistry.getGenre(genre)
plugin.onGenreLocked(world)
```

---

## よくある間違いと対処法

### 「ビルドは通るけど JSON の設定変更が反映されない」

原因: TypeScript 型（`config-types.ts`）に新フィールドを追加し忘れている。

対処:
1. `src/data/config/*.json` にフィールドを追加
2. `src/framework/config-types.ts` の対応 interface にも追加
3. `src/data/gameBalance.ts` または `tunables.ts` でエクスポート

### 「プライベート関数に _ を付けたら ESLint エラーが出た」

原因: ESLint の `no-unused-vars` ルールが `_` プレフィックスの変数を「意図的に未使用」と認識するが、関数名の場合は別扱い。

対処: 関数名の `_` プレフィックスは問題なし。未使用の **変数/引数** の場合は `_arg` の形式で OK。

```typescript
// ✅ 未使用引数に _ プレフィックス（ESLint が警告しない）
onGenreLocked(_world: MutableWorld): void { }

// ✅ プライベート関数の _ プレフィックス（ESLint は問題なし）
function _parseFile(file, path) { ... }
```

### 「新しいジャンルを追加したのに ManualPanel のテーマが当たらない」

原因: `ManualPanel.vue` には `.theme-stg`, `.theme-rpg` など4ジャンル分の CSS しかない。

対処:
1. `ManualPanel.vue` に `.theme-<新ID>` CSS ブロックを追加する、**または**
2. `ManualEntryJSON.style`（`ManualStyleOverride` 型）を使って JSON からインラインスタイルを指定する

`ManualStyleOverride` 型が定義済みで JSON の `style` フィールドに設定できるが、現在コンポーネント側で未接続のため Issue #XXX で対応予定。

---

## ESLint の主要エラーと修正方法

```bash
npm run lint
```

| エラー | 原因 | 修正 |
|---|---|---|
| `no-explicit-any` | `any` を使っている | 具体的な型か `unknown` に変更 |
| `prefer-const` | `let` だが再代入なし | `const` に変更 |
| `eqeqeq` | `==` を使っている | `===` に変更 |
| `naming-convention` | クラス名が PascalCase でない | クラス/インターフェース名を PascalCase に |
