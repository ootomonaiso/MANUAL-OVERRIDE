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

各セクションは `src/data/config/*.json` からインポートされる:
- `physics`, `shoot`, `throw`, `spawn`, `vfx`, `camera`, `background`, `hazard_vfx`, `ui`, `score`, `difficulty`, `boss`, `rhythm_tuning`, `stealth`, `genre_params`, `game_balance`, `genres`

---

## `manualDeck.ts`

説明書デッキのインポートと MANUAL_DECK の構築。

### エクスポート

| エクスポート | 型 | 概要 |
|---|---|---|
| `MANUAL_DECK` | `Record<string, ManualVersion>` | 全説明書バージョンのマップ |

### 内部インポート

各デッキファイルは `src/data/manuals/*.json` からインポートされる:
- `main_deck.json`, `stg_deck.json`, `rpg_deck.json`, `puzzle_deck.json`, `rhythm_deck.json`, `horror_deck.json`, `aquatic_deck.json`
