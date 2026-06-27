# テトリスジャンル実装ドキュメント

## 概要

テトリスジャンルは、従来の横スクロールを完全に置き換えるブロックパズルゲームである。
プレイヤーが説明書の2択を繰り返す中で `combo` と `craft` パラメータが閾値を超えると、
ゲームがテトリスへ収束する。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/game/systems/TetrisFeature.ts` | テトリスゲームロジックの純粋関数群 + FeatureSystem 実装 |
| `src/genres/TetrisPlugin.ts` | テトリスのビジュアルテーマ（暗色背景 + ネオンブロック） |
| `src/data/genres/tetris.json` | ジャンル定義JSON |
| `src/data/config/genres.json` | テトリスのジャンルエントリ + テーマカラー |
| `src/data/cards/tetris-cards.json` | テトリス関連カード6枚 |
| `tests/unit/game/TetrisFeature.test.ts` | ユニットテスト（46テストケース） |
| `tests/tetris.spec.ts` | Playwright E2Eテスト |

## ゲーム仕様

### ボード

- 10列 × 20行のグリッド
- セルサイズ 24px
- 7種類のテトロミノ（I, O, T, S, Z, J, L）

### 操作

| キー | 動作 |
|---|---|
| ← → | 左右移動 |
| Space | 時計回り回転（CW） |
| ↓ (タップ) | ハードドロップ（即座に落下） |
| ↓ (長押し) | ソフトドロップ（高速落下） |

### スコア

| 行消去数 | 基本スコア |
|---|---|
| 1行 | 100 |
| 2行 | 300 |
| 3行 | 500 |
| 4行（テトリス） | 800 |

実際には `(基本スコア + ストリークボーナス) × (level + 1)` で計算される。
ストリークボーナスは連続消去2回目以降に `streak * 50` が加算される。

| 追加行為 | スコア |
|---|---|
| ソフトドロップ | 1/セル |
| ハードドロップ | 2/落下セル |

### レベルシステム

- 10行消去ごとにレベルアップ
- レベル越高く、ドロップ速度が速くなる（`getDropInterval()` で制御）
- ドロップ間隔は `DEFAULT_DROP_INTERVAL * 0.75^level` で計算され、`MIN_DROP_INTERVAL` で下限が設定されている

### 7-Bagランダム化

標準的なテトリスアルゴリズムに従い、7種類のピースを1セットずつシャッフルして順番に配置する。
これにより、特定のピースが長時間出現しないことを防止する。

### ゴーストピース

落下予定位置を半透明で表示し、プレイヤーが正確な配置位置を確認できるようにする。

## 技術的詳細

### 純粋関数設計

ゲームロジックはすべて純粋関数として実装されており、ユニットテストで網羅的に検証可能である。

| 関数 | 役割 |
|---|---|
| `createEmptyGrid()` | 空のグリッド生成 |
| `initialState()` | ゲーム状態の初期化 |
| `fetchNextPieceId()` | 7-Bagから次のピースIDを取得（副作用あり） |
| `spawnPiece()` | アクティブピースの配置 |
| `isValidPlacement()` | 配置可能か検証 |
| `rotatePiece()` | ピース回転（壁蹴り対応） |
| `canPieceDrop()` | 落下可能か検証 |
| `hardDrop()` | ハードドロップ実行 |
| `lockPiece()` | ピース固定 + 行消去判定 |
| `clearLines()` | 行消去 + スコア計算 |
| `getDropInterval()` | レベルに応じたドロップ間隔 |

### FeatureSystem 統合

TetrisFeatureクラスは `FeatureSystem` インターフェースを実装し、以下のフックを提供する：

- `update()`: ゲームループでの状態更新（ドロップ、入力行、スコア）
- `render()`: Canvas への描画（ボード、ピース、ゴースト、HUD）

### JSON駆動

ジャンル定義は `tetris.json` で管理され、以下のプロパティを持つ：

```json
{
  "id": "tetris",
  "label": "テトリス",
  "thresholds": { "combo": 6, "craft": 4 },
  "enableFeatures": ["tetris"],
  "disableFeatures": ["auto_run", "shoot", "beat_hazard", "enemy_hp"],
  "scoreFormula": "playScore",
  "manualReveal": "これはテトリスになりました。ブロックを積み上げて行を消してください。",
  "theme": "tetris",
  "bgColor": "#0a0a14",
  "scrollDirection": "none",
  "gravity": 0,
  "endingFlavor": "あなたはブロックを積み上げ続けた。説明書もブロックの一つになった。"
}
```

## テスト戦略

### ユニットテスト（50ケース）

- グリッド操作の全パターン
- 7-Bagランダム化の正しさ
- 行消去ロジック
- 衝突判定
- 回転・壁蹴り
- スコア計算
- レベルアップ

### E2Eテスト

- ゲーム起動後のCanvas表示確認
- テトリス操作キー送信でのクラッシュなし確認
- Canvasサイズ検証

## 今後の改善ポイント

- ホールド機能の追加
- T-Spin判定の追加
- モバイル対応（タッチ操作）
- ドロップ間隔・スコア倍率等をJSON駆動化
