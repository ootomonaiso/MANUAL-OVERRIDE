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

// framework/index.ts 経由だとバレル export が ManualLoader.ts を re-export しており、
// ManualLoader.ts → data/gameBalance.ts → data/config.ts → framework(barrel) の循環importに
// なるため、ここでは実体モジュールから直接importして循環を回避する。
import { loadConfigFromGlob, normalizeGenreDef } from '../framework/ConfigLoader'
import { devValidateConfig } from '../framework/ConfigValidator'
import type { GenreDefJSON, GenreDefJSONInput } from '../framework/config-types'

const _rawModules = import.meta.glob('./config/*.json', { eager: true })

// src/data/genres/*.json を自動収集してジャンル定義を組み立てる。
// 必須は id / label / thresholds のみ。残りは normalizeGenreDef が補完する。
const _genreModules = import.meta.glob('./genres/*.json', { eager: true })
const _genreList: GenreDefJSON[] = []
for (const [path, mod] of Object.entries(_genreModules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as Partial<GenreDefJSONInput>
  if (typeof raw.id !== 'string' || typeof raw.label !== 'string' || typeof raw.thresholds !== 'object') {
    console.error(`[config] ${path}: id / label / thresholds は必須です。このジャンルはスキップされます。`)
    continue
  }
  _genreList.push(normalizeGenreDef(raw as GenreDefJSONInput))
}

// genres.json の代わりに合成セクションとして注入する
// themeColors は genres.json から直接取得（上書き防止のため）
const _genresJsonModule = (_rawModules as Record<string, { default?: unknown }>)['./config/genres.json']
const _genresJsonRaw = (_genresJsonModule?.default ?? _genresJsonModule) as { themeColors?: Record<string, unknown> }
const _themeColors = _genresJsonRaw?.themeColors ?? {}

const _merged: Record<string, unknown> = {
  ..._rawModules,
  '__genres__': { section: 'genres', genres: _genreList, themeColors: _themeColors },
}

export const GAME_CONFIG = loadConfigFromGlob(_merged)

devValidateConfig(GAME_CONFIG)
