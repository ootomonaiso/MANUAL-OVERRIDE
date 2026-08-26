/**
 * src/framework/ConfigLoader.ts
 *
 * import.meta.glob の結果から GameConfigMap を構築。
 * ManualLoader.ts のパターンを踏襲。
 */

import type { GameConfigMap, GameConfigSection, GenreDefJSON, GenreDefJSONInput } from './config-types'

// ジャンル定義の省略可能フィールドのデフォルト値。
// scripts/preprocess.mjs の検証と対になる（補完はここで一元管理）。
// 値の定義元: src/data/config/genre_defaults.json
const GENRE_DEFAULTS = {
  enableFeatures:  [] as string[],
  disableFeatures: [] as string[],
  scoreFormula:    'distance * 1.0 + survivedSec * 5',
  theme:           'plain',
  bgColor:         '#1a1a2e',
} as const

/**
 * 人間が書いた最小構成のジャンルJSON（id / label / thresholds のみ必須）を
 * 完全な GenreDefJSON に補完する。manualReveal はラベルから自動生成。
 */
export function normalizeGenreDef(input: GenreDefJSONInput): GenreDefJSON {
  return {
    ...GENRE_DEFAULTS,
    manualReveal: input.manualReveal ?? `これは${input.label}になりました。`,
    ...input,
  }
}

/**
 * import.meta.glob の結果から GameConfigMap を構築する。
 * 各JSONファイルは { section: <セクション名>, ...フィールド } の形式。
 *
 * @example
 * const raw = import.meta.glob('./config/*.json', { eager: true })
 * const config = loadConfigFromGlob(raw)
 */
export function loadConfigFromGlob(
  modules: Record<string, unknown>,
): GameConfigMap {
  const partial: Partial<GameConfigMap> = {}

  for (const [filePath, mod] of Object.entries(modules)) {
    const raw = (mod as { default?: unknown })?.default ?? mod
    if (!_isConfigFile(raw)) {
      console.warn(`[ConfigLoader] ${filePath}: "section" フィールドが見つかりません。スキップします。`)
      continue
    }
    const { section, ...fields } = raw as { section: string } & Record<string, unknown>
    // $comment_* フィールドをフィルタリング
    const filtered: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(fields)) {
      if (!key.startsWith('$comment')) {
        filtered[key] = val
      }
    }
    if (partial[section as GameConfigSection]) {
      console.warn(`[ConfigLoader] セクション "${section}" が重複しています (${filePath})。上書きします。`)
    }
    partial[section as GameConfigSection] = filtered as never
  }

  return partial as GameConfigMap
}

function _isConfigFile(raw: unknown): raw is { section: string } {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'section' in raw &&
    typeof (raw as Record<string, unknown>).section === 'string'
  )
}
