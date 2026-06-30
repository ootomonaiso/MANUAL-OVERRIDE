# 新ジャンル・フィーチャーを追加するには

[← 02-manual-json.md](02-manual-json.md) の続きです。

---

## 何をどこに書けばゲームに反映されるか

このプロジェクトはコードとデータが明確に分かれています。多くの場合、コードを書かずにJSONだけで変更が完結します。

| やりたいこと | 必要な作業 | コード変更 |
|---|---|---|
| 説明書の選択肢を追加 | `src/data/manuals/*.json` を編集 | 不要 |
| 新しいジャンルを追加 | `src/data/genres/<id>.json`（+ 任意で TS プラグイン） | 任意 |
| 新しいフィーチャーを追加 | TypeScript 2箇所 | 必要 |

---

## 新ジャンルを追加する流れ

3つのステップがあります（型定義の編集は不要 — `GenreId` は `string` 型です）。

### ステップ 1: ジャンル定義をJSONに追加する

`src/data/genres/my_genre.json` を新規作成します。`src/data/genres/*.json` は `import.meta.glob` で自動収集されるため、ファイルを置くだけで登録されます（`src/data/config/genres.json` はテーマカラー等の補助設定で、定義本体ではありません）。

```json
{
  "id": "my_genre",
  "label": "マイジャンル",
  "thresholds": { "tempo": 4, "aerial": 3 },
  "enableFeatures": ["double_jump", "dash"],
  "disableFeatures": ["grid_stop"],
  "scoreFormula": "distance * 1.5 + combo * 60",
  "manualReveal": "これはマイジャンルになりました。",
  "endingFlavor": "あなたは独自のゲームを作り上げた。",
  "theme": "plain",
  "bgColor": "#0a1020"
}
```

主要フィールドの意味：

| フィールド | 説明 |
|---|---|
| `thresholds` | ジャンル確定に必要な最低パラメータ値（AND条件） |
| `enableFeatures` | 確定時に有効になるフィーチャー |
| `disableFeatures` | 確定時に無効になるフィーチャー |
| `scoreFormula` | 最終スコアの計算式（使える変数は後述） |
| `manualReveal` | 確定時に説明書に書き込まれる宣言文 |
| `endingFlavor` | 投擲後のエンディング画面に表示される一文 |
| `theme` | 説明書UIの見た目（`ManualTheme`）。`plain` / `stg` / `rpg` / `puzzle` / `rhythm` / `horror` / `aquatic` / `tetris` など全15種 |

scoreFormula で使える変数: `distance` / `kills` / `combo` / `maxCombo` / `exp` / `beatHits` / `survivedSec` / `accuracy` / `deaths` / `itemsCollected` / `bossKills` / `stealthBonus` / `colorTouches`

### ステップ 2: 視覚テーマを実装する（任意）

専用ビジュアルが必要な場合のみ実装します。省略すると `theme` から `JSONGenrePlugin` が自動でフォールバック描画します。`src/genres/MyGenrePlugin.ts` を新規作成し、`GenrePluginBase` を継承して背景・プレイヤーの見た目を実装します。

```typescript
import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { GenreId } from '../domain/types'
import type { SpawnEntry } from '../engine/types'

export class MyGenrePlugin extends GenrePluginBase {
  readonly id: GenreId = 'my_genre'

  readonly skyColors    = ['#001028', '#002050'] as const
  readonly groundColors = ['#003060', '#001030'] as const
  readonly farLayerColor  = '#002050'
  readonly midLayerColor  = '#001540'
  readonly starColor: string | undefined = '#88aaff'

  readonly palette = {
    danger: '#ff4444', dangerGlow: '#ff8888',
    safe:   '#44ff88', safeGlow:   '#88ffcc',
  }

  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',  placement: 'ground', weightStart: 8, weightEnd: 4, wRange: [35, 65], hRange: [40, 75] },
    { shape: 'spike', placement: 'ground', weightStart: 1, weightEnd: 4, wRange: [35, 55], hRange: [50, 80] },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 遠景の描画
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 中景の描画
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    // プレイヤーの描画
  }
}
```

### ステップ 3: 登録する

ファイル末尾で `default export` するだけです。`src/genres/index.ts` が `import.meta.glob` で自動収集するため、`index.ts` の編集は不要です。

```typescript
export default new MyGenrePlugin()   // ← これだけ
```

---

## 新フィーチャーを追加する流れ

2つのステップがあります（`FeatureId` は `string` 型なので型定義の編集は不要です）。

### ステップ 1: FeatureSystem クラスを実装する

`src/game/systems/MyFeature.ts` を新規作成します。

```typescript
import type { FeatureSystem } from '../FeatureSystem'

export class MyFeature implements FeatureSystem {
  readonly handles = 'my_feature'

  // 毎フレーム呼ばれる
  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    // ゲームロジックを書く
  }

  // 描画（省略可）
  render?(ctx: CanvasRenderingContext2D, world: MutableWorld): void { }

  // 被弾時（省略可）
  onPlayerHit?(world: MutableWorld): void { }
}
```

### ステップ 2: 登録する

`src/game/systems/index.ts` に追加します。

```typescript
import { MyFeature } from './MyFeature'
registerFeature(new MyFeature())
```

---

## 選択肢がジャンルに届くようにパラメータを設計する

新しいジャンルを追加しても、選択肢のパラメータ設計が合っていなければジャンルに到達できません。

`thresholds` の値を設計したら、手元で合計を計算して確認します。

```
例: thresholds: { tempo: 4, aerial: 3 }

  ver 2.0 の選択肢で { tempo: 2, aerial: 1 } を加算
  ver 3.0 の選択肢で { tempo: 2, aerial: 2 } を加算
  合計: { tempo: 4, aerial: 3 } → 閾値ちょうど → 確定
```

既存ジャンルとのパラメータ競合にも注意してください。全ジャンルの閾値は `src/data/genres/*.json` で確認できます。

---

## 参照ドキュメント

- [docs/adding-content.md](../adding-content.md) — コンテンツ追加の実践手順・チェックリスト
- [docs/genre-plugin.md](../genre-plugin.md) — GenrePlugin の全メソッド仕様
- [docs/feature-system.md](../feature-system.md) — FeatureSystem の全フック一覧
- [docs/feature-ids.md](../feature-ids.md) — 既存フィーチャーの実装ステータス
