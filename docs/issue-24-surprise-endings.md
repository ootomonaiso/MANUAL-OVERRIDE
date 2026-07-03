# Issue #24: 意外な結末機能

## 概要

ゲームの分岐に「意外な結末」を追加する機能です。プレイヤーのプレイスタイルやカード選択の矛盾を検出することで、通常のジャンル確定とは異なる特別な結末（glitchエンド）を提供します。

## 実装内容

### 1. プレイスタイル検出 (`src/domain/playStyleDetector.ts`)

プレイヤーの操作統計（`ActionStats`）からプレイスタイルを推定します。

#### 検出されるスタイル

| スタイル | 判定基準 |
|----------|----------|
| `aggressive`（攻撃的） | 射撃レートが高い |
| `defensive`（防御的） | ジャンプ・ダッシュレートが高い |
| `explorer`（探索的） | 移動レートが高い |
| `balanced`（均衡） | 全操作が均等に分散 |
| `chaotic`（混沌） | 衝突レートが高い |
| `passive`（消極的） | 操作総数が少ない |

#### 信頼度

検出結果には `confidence`（0〜1）が含まれます。統計量（ticks）が少ないほど信頼度は低くなります。

### 2. 矛盾トラッキング (`src/domain/contradictionTracker.ts`)

カードの `conflictsWith` フィールドを参照し、互いに矛盾するカードが両方選択されているかを検出します。

#### 矛盾スコア

- 1ペアの矛盾 = +0.25
- 最大スコア = 1.0
- 閾値 0.5 以上で glitch エンドがトリガー可能

### 3. サプライズカード (`src/data/cards/surprise-cards.json`)

矛盾を誘発する特殊カード6種を追加しました。

| カードID | ラベル | 矛盾先 |
|----------|--------|--------|
| `c-surprise-chaos` | ルールを意図的に矛盾させる | `c-combo-sequence`, `c-stealth-hide` |
| `c-surprise-paradox` | 同時に相反する2つの状態を作る | `c-enemy-combat`, `c-survive-danger` |
| `c-surprise-void` | 存在しないものを操作できるようにする | `c-general-visual` |
| `c-surprise-loop` | 同じことを繰り返すと変化が起きる | なし |
| `c-surprise-memory` | 過去の選択が今に影響する | なし |
| `c-surprise-break` | ゲームの枠組みそのものを変える | `c-combo-sequence`, `c-tempo-smooth`, `c-stealth-hide` |

### 4. 隠しジャンル: glitch (`src/data/genres/glitch.json`)

矛盾スコアが閾値を超えた場合に発動する隠しジャンルです。

- **ID**: `glitch`
- **ラベル**: 壊れたゲーム
- **テーマカラー**: 赤 (#ff0040)
- **エンディングフレーバー**: 「あなたが選んだ矛盾が、ゲームそのものを壊しました」

### 5. UI 変更

#### EndingPanel.vue

- サプライズエンド表示（glitch 演出付き）
- プレイスタイル表示（信頼度付き）
- 矛盾レベルバー（グラデーション: 緑→赤）

#### App.vue

- `finalizeThrowing` に `ActionStats` を渡すよう変更
- EndingPanel に新プロパスを渡すよう変更

#### sideScroller.ts

- 衝突カウント (`stats.collisions`) を追加
- アイテム収集カウント (`stats.itemsCollected`) を追加
- `GameSnapshot` に新フィールドを追加

## テスト

### ユニットテスト

- `tests/unit/domain/playStyleDetector.test.ts`: プレイスタイル検出ロジック
- `tests/unit/domain/contradictionTracker.test.ts`: 矛盾トラッキングロジック

### Playwright テスト

- `tests/surprise-ending.spec.ts`: E2E テスト

## 型定義

`src/domain/types.ts` に以下の型を追加しました:

- `DetectedPlayStyle`: プレイスタイルの種別
- `PlayStyleResult`: 検出結果（スタイル + 信頼度 + スコア）
- `ContradictionState`: 矛盾状態（ペア + スコア + 影響フラグ）
- `SurpriseEndingType`: サプライズエンドの種別
- `SurpriseEnding`: サプライズエンド情報（タイトル + 説明 + 強制ジャンル）

## アーキテクチャ

```
src/
├── domain/
│   ├── types.ts                    # 新タイプ追加
│   ├── playStyleDetector.ts        # プレイスタイル検出（新規）
│   └── contradictionTracker.ts     # 矛盾トラッキング（新規）
├── data/
│   ├── cards/surprise-cards.json   # サプライズカード（新規）
│   ├── genres/glitch.json          # 隠しジャンル（新規）
│   └── config/genres.json          # glitch テーマ追加
├── game/
│   └── sideScroller.ts             # 衝突カウント追加
├── composables/
│   └── useGameState.ts             # 新機能統合
└── components/
    └── EndingPanel.vue             # UI 追加
```

## 拡張方法

### 新しいプレイスタイルを追加する場合

1. `types.ts` の `DetectedPlayStyle` に種別を追加
2. `playStyleDetector.ts` のスコア計算ロジックに追加
3. `EndingPanel.vue` の `playStyleLabels` にラベルを追加

### 新しいサプライズカードを追加する場合

1. `src/data/cards/surprise-cards.json` にカード定義を追加
2. `conflictsWith` フィールドで矛盾先を指定

### 新しいサプライズエンドを追加する場合

1. `types.ts` の `SurpriseEndingType` に種別を追加
2. `useGameState.ts` の `computeSurpriseEnding` に判定ロジックを追加
3. `EndingPanel.vue` に表示ロジックを追加
