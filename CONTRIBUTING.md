# コントリビューションガイド

## 開発参加の手順

```bash
git clone <repo>
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ へ本番ビルド（サーバー不要）
npm run lint         # コード品質チェック
```

---

## プルリクエストを送る前のチェックリスト

```
□ npm run ci     が通る（typecheck + lint + validate + build + bundle-size を一括実行）
□ 変更したジャンル/フィーチャーをゲームで動作確認した
□ マジックナンバーを直書きしていない（下記参照）
□ コメントが "なぜ" だけを書いている（"何を" は書かない）
□ プライベート関数に _ プレフィックスを付けた
□ 新しいFeatureSystem実装やテストを追加した場合、tests/ と src/game/systems/index.ts への登録漏れがないか確認した
```

`npm run ci` は `typecheck` → `lint` → `validate`（JSON検証） → `build` → `bundle-size` を順に実行します。個別に確認したい場合は各スクリプトを単体で実行してください（`npm run typecheck` 等）。

詳細なコーディング規約 → [docs/coding-conventions.md](docs/coding-conventions.md)

---

## リリースとデプロイ（CI/CD）

main への push（PR マージ）で 2 つが自動で走ります。

| トリガー | ワークフロー | 成果物 |
|---|---|---|
| `push: main` | `deploy.yml`（production） | `dist/` を GitHub Pages（`gh-pages`）へ本番デプロイ |
| `push: main` かつ `package.json` の `version` が新しい | `auto-release.yml` → `release.yml` | タグ `v<version>` を発行し、`dist/` を zip / tar.gz にして GitHub Release に添付 |

**Release を出す手順**: `package.json` の `version` を上げて main にマージするだけ。`auto-release.yml` が
未発行の `v<version>` タグを検出したときだけタグを作成して `release.yml` を呼び出します（version 据え置きの
コミットでは Release を作りません）。手動でタグ（`v*.*.*`）を push しても従来どおり `release.yml` が直接動きます。

---

## 主要ドキュメント

| 目的 | ドキュメント |
|---|---|
| はじめて触る | [docs/getting-started.md](docs/getting-started.md) |
| アーキテクチャを知る | [docs/architecture.md](docs/architecture.md) |
| ジャンルを追加する（TypeScript不要・最小構成） | [content/README.md](content/README.md) + `npm run new-genre` |
| ジャンルを追加する（フル機能・見た目も作り込む） | [docs/genre-plugin.md](docs/genre-plugin.md) |
| フィーチャーを追加する | [docs/feature-system.md](docs/feature-system.md) |
| 説明書 JSON を書く | [docs/manual-json.md](docs/manual-json.md) |
| 使える FeatureId 一覧 | [docs/feature-ids.md](docs/feature-ids.md) |
| コーディング規約 | [docs/coding-conventions.md](docs/coding-conventions.md) |

---

## 技術スタック

- **Vite + Vue 3 + TypeScript**（フロントエンド）
- **Canvas 2D API**（ゲームレンダリング）
- **JSON 設定駆動**（ルール・バランス値・ジャンル定義）
- **オフライン完全動作**（サーバー不要、`dist/` をそのまま配布可能）
