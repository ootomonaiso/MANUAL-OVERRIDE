# 取扱説明書を読むゲーム

説明書が更新されるたびにルールを選び、横スクロールを育てていく体験型ゲーム。  
Vite + Vue 3 + TypeScript で構築。

詳細なドキュメントは [docs/](./docs/) を参照してください。

## クイックスタート

```bash
npm install
npm run dev      # 開発サーバー起動 (localhost:5173)
npm run build    # 本番ビルド
```

## ゲームの流れ

1. チュートリアル - 基本操作（左右移動+ジャンプ）を覚える
2. 説明書更新フェーズ - 2択を選んでルール変更
3. ジャンル確定 - 選択の蓄積により20+ ジャンルへ分岐
4. 投擲フェーズ - 説明書をドラッグして投げる
5. エンディング - スコア表示と別ルート示唆

## 次のステップ

- 何もわからない: [docs/README.md](./docs/README.md) を読んでください
- はじめての開発: [docs/getting-started.md](./docs/getting-started.md)
- 新ジャンルを作る: [docs/genre-plugin.md](./docs/genre-plugin.md)
- 新フィーチャーを作る: [docs/feature-system.md](./docs/feature-system.md)
- 説明書を追加する: [docs/manual-json.md](./docs/manual-json.md)
- タスク一覧: [docs/TASKS.md](./docs/TASKS.md)
- 変更履歴: [docs/CHANGELOG.md](./docs/CHANGELOG.md)

## 実装ステータス

完全実装済み:
- Canvas 物理エンジン
- 20+ ジャンル定義 + GenrePlugin システム
- 8+ フィーチャーシステム
- 無限選択肢 (100+)
- JSON 駆動ルール設計
- オフライン完全動作

---

詳しくは [docs/](./docs/README.md) をご覧ください。
