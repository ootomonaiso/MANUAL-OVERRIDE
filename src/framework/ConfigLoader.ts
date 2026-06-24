/**
 * src/framework/ConfigLoader.ts
 *
 * import.meta.glob の結果から GameConfigMap を構築。
 * ManualLoader.ts のパターンを踏襲。
 */

import type { GameConfigMap, GameConfigSection } from './config-types'

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
    if (!isConfigFile(raw)) {
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

function isConfigFile(raw: unknown): raw is { section: string } {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'section' in raw &&
    typeof (raw as Record<string, unknown>).section === 'string'
  )
}
