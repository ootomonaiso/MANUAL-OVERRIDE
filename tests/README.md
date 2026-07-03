# マニュアルゲーム テスト

このディレクトリには2種類のテストがある。**ブラウザ系**（Playwright でゲームを実際に操作）と
**フィーチャー系**（ソース・JSON設定の整合性を静的に検証、ブラウザ不要）。

## ブラウザ系テスト

開発サーバーを起動してからテストを実行してください：

```bash
# ターミナル1: 開発サーバー起動
npm run dev

# ターミナル2: テスト実行
npm run test
```

### 基本テスト

- **test_game.mjs** — ゲーム起動とプレイ確認
  - タイトル画面、チュートリアルスキップ、ゲーム開始、プレイ状態をスクリーンショット

- **test_play.mjs** — ゲームプレイ検証
  - ローディング時間計測、チュートリアルスキップ、スコア表示確認

### チュートリアルテスト

- **test_tutorial.mjs** — チュートリアル画面のフロー検証
  - タイトル → チュートリアル表示 → 内容確認 → ゲーム開始 の全フローをテスト

### 選択肢テスト

- **test_choices.mjs** — 基本的な選択肢分岐（5段階）
  - チュートリアルスキップ後、選択肢表示・クリック・ジャンル変化を確認

- **test_infinite_choices.mjs** — 無限選択肢システム（15段階）
  - ver 9.0+ の大量選択肢対応テスト

- **test_massive_choices.mjs** — 大規模分岐テスト（20段階）
  - 長期プレイでの安定性確認

### 実行例

個別にテストを実行する場合：

```bash
node tests/test_tutorial.mjs
node tests/test_game.mjs
node tests/test_choices.mjs
node tests/test_infinite_choices.mjs
```

### 注意事項

- Playwright のブラウザが自動で起動・終了します
- テスト中は localhost:5174 で dev サーバーが走っていることが必須です
- スクリーンショットは `gameplay_*.png` / `tutorial_*.png` ファイルとして保存されます
- チュートリアル画面は各テストで自動スキップされます（test_tutorial.mjs 除く）

## フィーチャー系テスト（`feature-*.test.mjs`）

開発サーバー・ブラウザ不要。各 Feature（`dash` / `wall_jump` / `vertical_scroll` / `boss` /
`grid_stop` / `puzzle_solve` / `stealth_mode` / `time_bonus` / `tower`）について、
実装ファイル（`MovementFeature.ts` / `PuzzleFeature.ts` / `SpecialFeature.ts`）が
「未実装警告」を出さなくなっていること、必要な config キーが揃っていること、
そのフィーチャーを有効化するジャンルが **`src/data/genres/*.json`**（実際にロードされる
ジャンル定義。`src/data/config/genres.json` の `genres` 配列は `themeColors` 抽出後は
使われないので参照しないこと）に存在することをアサーションで検証する。

```bash
npm run test:features        # 9ファイル全件実行（CI の feature-tests ジョブと同じ）
node tests/feature-boss.test.mjs   # 個別実行
```

新しい Feature を追加したら、対応する `feature-<id>.test.mjs` をここに追加し、
`npm run test:features` で拾われることを確認する（ファイル名は自動列挙されるため
`package.json` 側の追記は不要）。
