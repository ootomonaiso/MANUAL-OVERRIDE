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
□ npm run build  がエラーなしで通る
□ npm run lint   で error が 0 件
□ 変更したジャンル/フィーチャーをゲームで動作確認した
□ マジックナンバーを直書きしていない（下記参照）
□ コメントが "なぜ" だけを書いている（"何を" は書かない）
□ プライベート関数に _ プレフィックスを付けた
```

詳細なコーディング規約 → [docs/coding-conventions.md](docs/coding-conventions.md)

---

## 主要ドキュメント

| 目的 | ドキュメント |
|---|---|
| はじめて触る | [docs/getting-started.md](docs/getting-started.md) |
| アーキテクチャを知る | [docs/architecture.md](docs/architecture.md) |
| ジャンルを追加する | [docs/genre-plugin.md](docs/genre-plugin.md) |
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
