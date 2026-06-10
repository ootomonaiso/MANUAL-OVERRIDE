# docs/guide/ — 入門ガイド

このフォルダは「プロジェクトに初めて触れる人が、順番に読んで全体像をつかむ」ためのガイドです。

詳細なリファレンスは `docs/` 直下の各ドキュメントを参照してください。

---

## 読む順番

```
00-overview.md
  ↓ ゲームの目的と4つの主要概念を把握する
01-genre-system.md
  ↓ ジャンル・パラメータ・フィーチャーの関係を理解する
02-manual-json.md
  ↓ 説明書JSONの読み書きができるようになる
03-adding-content.md
  ↓ 新ジャンル・フィーチャーを自分で追加できるようになる
```

---

## 各ファイルの概要

| ファイル | 内容 |
|---|---|
| [00-overview.md](00-overview.md) | ゲームが何をするか・主要概念の関係・ゲームの進行フェーズ |
| [01-genre-system.md](01-genre-system.md) | 12軸パラメータ・ジャンル収束のしくみ・フィーチャーとは何か |
| [02-manual-json.md](02-manual-json.md) | 説明書JSONの構造・選択肢の追加手順・よくあるミス |
| [03-adding-content.md](03-adding-content.md) | 新ジャンル追加（4ステップ）・新フィーチャー追加（3ステップ） |

---

## 詳細リファレンス（docs/ 直下）

概念は把握できた、次は実装の詳細を知りたい、という場合は以下を参照してください。

- [genre-system.md](../genre-system.md) — 全21ジャンルの定義・収束アルゴリズム
- [feature-ids.md](../feature-ids.md) — 全フィーチャーID・実装ステータス一覧
- [manual-json.md](../manual-json.md) — 説明書JSONの全フィールド仕様
- [adding-content.md](../adding-content.md) — コンテンツ追加の実践手順・チェックリスト
- [genre-plugin.md](../genre-plugin.md) — GenrePlugin の全メソッド仕様
- [feature-system.md](../feature-system.md) — FeatureSystem の実装ガイド
