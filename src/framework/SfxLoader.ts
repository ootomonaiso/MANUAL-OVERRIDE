/**
 * src/framework/SfxLoader.ts
 *
 * src/data/sfx/*.json を import.meta.glob で自動収集し、
 * SFX_DEFS（id → SfxDef のマップ）を構築する。
 * 無効な定義は console.warn してスキップする。
 */

import type { SfxDef } from './sfx-types'

const _modules = import.meta.glob('../data/sfx/*.json', { eager: true })

/** id → SfxDef のマップ。無効な定義は警告してスキップ。 */
export const SFX_DEFS: Readonly<Record<string, SfxDef>> = (() => {
  const defs: Record<string, SfxDef> = {}
  for (const [path, mod] of Object.entries(_modules)) {
    const raw = (mod as { default?: unknown }).default ?? mod
    if (_isValidSfxDef(raw)) {
      defs[raw.id] = raw
    } else {
      console.warn(`[SfxLoader] ${path}: 無効なSFX定義です。スキップします。`)
    }
  }
  return defs
})()

function _isValidSfxDef(raw: unknown): raw is SfxDef {
  if (typeof raw !== 'object' || raw === null) return false
  const d = raw as SfxDef
  return typeof d.id === 'string' && d.id.trim().length > 0 && Array.isArray(d.tracks) && d.tracks.length > 0
}
