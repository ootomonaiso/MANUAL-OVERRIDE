import { describe, it, expect } from 'vitest'
import { pushRecent, collectSfxWarnings, UNWIRED_SFX_IDS, RECENT_LIMIT } from '../../../src/tools/sfxTestLogic'
import { SFX_DEFS } from '../../../src/framework/SfxLoader'
import type { SfxDef } from '../../../src/framework/sfx-types'

describe('sfxTestLogic.pushRecent', () => {
  it('新規IDを先頭に追加する', () => {
    expect(pushRecent([], 'jump')).toEqual(['jump'])
  })

  it('既存IDが選ばれたら重複させず先頭へ移動する', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it(`上限(${RECENT_LIMIT}件)を超えたら古いものから切り捨てる`, () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, i) => `id${i}`)
    const result = pushRecent(full, 'new-id')
    expect(result.length).toBe(RECENT_LIMIT)
    expect(result[0]).toBe('new-id')
    expect(result).not.toContain(`id${RECENT_LIMIT - 1}`)
  })

  it('limit を明示指定できる', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a'])
  })
})

describe('sfxTestLogic.UNWIRED_SFX_IDS', () => {
  it('全件が SFX_DEFS に実在する（手動保守リストの typo 検出）', () => {
    for (const id of UNWIRED_SFX_IDS) {
      expect(SFX_DEFS[id]).toBeDefined()
    }
  })
})

describe('sfxTestLogic.collectSfxWarnings', () => {
  it('不正な定義の警告を id ごとに集約する', () => {
    const defs: Record<string, SfxDef> = {
      broken: {
        id: 'broken',
        tracks: [{ kind: 'osc', wave: 'sine', freq: -1, durationSec: 0.1, volume: 0.5 }],
      },
      ok: SFX_DEFS.jump,
    }
    const warnings = collectSfxWarnings(defs)
    expect(warnings.get('broken')?.length).toBeGreaterThan(0)
    expect(warnings.has('ok')).toBe(false)
  })

  it('呼び出し後に console.warn を元に戻す', () => {
    const original = console.warn
    collectSfxWarnings({})
    expect(console.warn).toBe(original)
  })

  it('本番の SFX_DEFS 全件では警告が出ない', () => {
    const warnings = collectSfxWarnings(SFX_DEFS)
    expect(warnings.size).toBe(0)
  })
})
