# マニュアルゲーム テスト

Playwright を使用したブラウザベースのテストスイートです。

## セットアップ

開発サーバーを起動してからテストを実行してください：

```bash
# ターミナル1: 開発サーバー起動
npm run dev

# ターミナル2: テスト実行
npm run test
```

## テストファイル一覧

### 基本テスト

- **test_game.mjs** — ゲーム起動とプレイ確認
  - タイトル画面、ゲーム開始、プレイ状態をスクリーンショット

- **test_play.mjs** — ゲームプレイ検証
  - ローディング時間計測、スコア表示確認

### 選択肢テスト

- **test_choices.mjs** — 基本的な選択肢分岐（5段階）
  - 選択肢表示、クリック、ジャンル変化を確認

- **test_infinite_choices.mjs** — 無限選択肢システム（15段階）
  - ver 9.0+ の大量選択肢対応テスト

- **test_massive_choices.mjs** — 大規模分岐テスト（20段階）
  - 長期プレイでの安定性確認

## テスト実行例

個別にテストを実行する場合：

```bash
node tests/test_game.mjs
node tests/test_choices.mjs
node tests/test_infinite_choices.mjs
```

## 注意事項

- Playwright のブラウザが自動で起動・終了します
- テスト中は localhost:5173 で dev サーバーが走っていることが必須です
- スクリーンショットは `gameplay_*.png` ファイルとして保存されます
