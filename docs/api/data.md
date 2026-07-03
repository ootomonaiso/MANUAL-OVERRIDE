# `src/data/` — 設定・マニュアルデータエントリポイント

JSON ファイルのインポートと型付きエクスポート。

---

## `config.ts`

JSON 設定ファイルのインポートと GameConfigMap の構築。

### エクスポート

| エクスポート | 型 | 概要 |
|---|---|---|
| `GAME_CONFIG` | `GameConfigMap` | 全セクションを結合した設定マップ |

### 内部インポート

`src/data/config/*.json`（21ファイル）を `import.meta.glob` で自動収集して構築する:
- `background`, `bayes`, `boss`, `camera`, `difficulty`, `extra_movement`, `game_balance`, `genre_params`, `genres`, `hazard_vfx`, `physics`, `puzzle`, `rhythm_tuning`, `score`, `shoot`, `spawn`, `special`, `stealth`, `throw`, `ui`, `vfx`

加えて、ジャンル定義は `src/data/genres/*.json`（22ファイル）を別途 glob で収集し、`genres` セクションへ合成して注入する。新しい config / ジャンル JSON を追加するだけで自動認識され、`config.ts` の編集は不要。

---

## `manualDeck.ts`

説明書デッキのインポートと MANUAL_DECK の構築。

### エクスポート

| エクスポート | 型 | 概要 |
|---|---|---|
| `MANUAL_DECK` | `Record<string, ManualVersion>` | 全説明書バージョンのマップ |

### 内部インポート

`src/data/manuals/*.json` を `import.meta.glob` で自動収集して構築する（`TEMPLATE.json` はサンプルのため除外）:
- `base.json`, `action-branch.json`, `advanced-branch.json`, `flow-branch.json`, `tetris-branch.json`

新しいデッキ JSON を追加するだけで自動的に `MANUAL_DECK` へ組み込まれる（`manualDeck.ts` の編集は不要）。
