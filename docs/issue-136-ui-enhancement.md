# UIビジュアルクオリティ向上（Issue #136）

## 概要

UI コンポーネント（HUD・選択肢パネル・エンディング等）のデザイン刷新と、
ゲーム全体のカラースキーム統一、ローディング画面の追加を行いました。

## 実装内容

### 1. グローバルCSS変数システム（`src/styles/global.css`）

- 全色・フォント・間隔・エフェクトをCSS変数として一元管理
- ジャンル別テーマ（21種）を `.theme-global-{name}` クラスで定義
- `--genre-accent`, `--genre-border`, `--genre-bg`, `--genre-glow`, `--genre-text`, `--genre-font` の6変数で全コンポーネントを統一的に制御

### 2. ローディング画面（`src/components/LoadingScreen.vue`）

- ゲーム初期化中に表示されるアニメーション付きローディング画面
- ロゴアニメーション（パルス点灯）、ステータスメッセージ切替、進捗バー
- `pointer-events: none` により、タイトル画面の操作を妨害しない

### 3. HUD刷新（`src/components/Hud.vue`）

- スコア文字色・距離バー・ジャンルバッジをジャンルテーマに対応
- スコア加算ポップアップ機能（スコア増加時にランダム位置に +N ポップアップ表示）
- 全プロパティをCSS変数経由で制御

### 4. 選択肢パネル強化（`src/components/ChoicePanel.vue`）

- ホバー時にカードが右にスライド + アクセント色インセットシャドウ
- 選択確定時にフラッシュアニメーション
- キーボードフォーカス時にアクセント色のアウトラインを表示
- アローアイコンがホバー時に右に移動

### 5. エンディング画面強化（`src/components/EndingPanel.vue`）

- ジャンル別背景エフェクト（21種）:
  - STG系 → 星空パーティクル
  - RPG/ダンジョン → 金色ラジアルグラデ
  - パズル/放置 → グリッドパターン
  - リズム → 紫グラデ
  - ホラー → 赤ラジアルグラデ
  - テトリス → グリッドライン
  - グリッチ → 走査線アニメーション
- フレーバーテキストの表示タイミングを分離（3.2秒後にフェードイン）

### 6. フォント統一

- `--font-mono`, `--font-main`, `--font-display`, `--font-hand` の4種を定義
- 各コンポーネントが適切なフォント変数を使用

## ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/styles/global.css` | **新規** - グローバルCSS変数・ジャンルテーマ定義 |
| `src/main.ts` | global.css インポート追加 |
| `src/components/LoadingScreen.vue` | **新規** - ローディング画面 |
| `src/components/Hud.vue` | 刷新 - ポップアップ・テーマ変数対応 |
| `src/components/ChoicePanel.vue` | 強化 - ホバー/確定アニメーション・説明文 |
| `src/components/EndingPanel.vue` | 強化 - 背景エフェクト・フレーバータイミング |
| `src/App.vue` | ローディング画面統合・グローバルCSS削除 |
| `tests/ui-enhancement.spec.ts` | **新規** - UIテスト（9件） |
| `tests/unit/domain/genreTheme.test.ts` | **新規** - ジャンルテーマユニットテスト |
## テスト結果

- ユニットテスト: 34件 全件パス
- Playwrightテスト: 9件 全件パス（UI enhancement）
- スモークテスト: 4件 全件パス（既存テスト影響なし）
