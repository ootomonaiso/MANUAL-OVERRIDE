/**
 * src/data/config.ts
 *
 * ゲーム設定の統合エントリーポイント。
 * src/data/config/*.json を自動収集し、GAME_CONFIG を構築。
 *
 * ── ジャンルの追加 ───────────────────────────────────────────
 * src/data/genres/ に新しい JSON ファイルを置くだけで自動登録される。
 * このファイルを編集する必要はない。
 * ────────────────────────────────────────────────────────────
 */

import { loadConfigFromGlob, devValidateConfig } from '../framework'
import type { GenreDefJSON } from '../framework/config-types'

const _rawModules = import.meta.glob('./config/*.json', { eager: true })

// src/data/genres/*.json を自動収集してジャンル定義を組み立てる
const _genreModules = import.meta.glob('./genres/*.json', { eager: true })
const _genreList = Object.values(_genreModules)
  .map(m => ((m as { default?: unknown }).default ?? m) as GenreDefJSON)
  .filter(g => typeof (g as GenreDefJSON).id === 'string')

// genres.json の代わりに合成セクションとして注入する
const _merged: Record<string, unknown> = {
  ..._rawModules,
  '__genres__': { section: 'genres', genres: _genreList },
}

export const GAME_CONFIG = loadConfigFromGlob(_merged)

devValidateConfig(GAME_CONFIG)
