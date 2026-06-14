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
  - タイトル画面、チュートリアルスキップ、ゲーム開始、プレイ状態をスクリーンショット

- **test_play.mjs** — ゲームプレイ検証
  - ローディング時間計測、チュートリアルスキップ、スコア表示確認

### チュートリアルテスト

- **test_tutorial.mjs** — チュートリアル画面のフロー検証
  - タイトル → チュートリアル表示 → 内容確認 → ゲーム開始 の全フローをテスト

### アニメーションテスト

- **test_manual_animation.mjs** — 説明書更新時の中央表示アニメーション検証
  - CSS クラスとトランジションの存在確認
  - パネル位置の初期状態・最終状態確認

### 選択肢テスト

- **test_choices.mjs** — 基本的な選択肢分岐（5段階）
  - チュートリアルスキップ後、選択肢表示・クリック・ジャンル変化を確認

- **test_infinite_choices.mjs** — 無限選択肢システム（15段階）
  - ver 9.0+ の大量選択肢対応テスト

- **test_massive_choices.mjs** — 大規模分岐テスト（20段階）
  - 長期プレイでの安定性確認

## テスト実行例

個別にテストを実行する場合：

```bash
node tests/test_tutorial.mjs
node tests/test_game.mjs
node tests/test_choices.mjs
node tests/test_infinite_choices.mjs
```

## 注意事項

- Playwright のブラウザが自動で起動・終了します
- テスト中は localhost:5174 で dev サーバーが走っていることが必須です
- スクリーンショットは `gameplay_*.png` / `tutorial_*.png` ファイルとして保存されます
- チュートリアル画面は各テストで自動スキップされます（test_tutorial.mjs 除く）
