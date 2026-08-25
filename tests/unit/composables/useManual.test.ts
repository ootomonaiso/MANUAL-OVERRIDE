import { describe, it, expect } from 'vitest'
import { useManual } from '../../../src/composables/useManual'
import type { ManualVersion } from '../../../src/domain/types'

/** テスト用の ManualVersion を生成するヘルパー */
function makeManual(version: string, manualText: string[] = [`line of ver.${version}`]): ManualVersion {
  return { version, manualText, choices: [], hazards: { colors: ['#ff0000'], safeColors: ['#00ff00'] } }
}

describe('useManual — 履歴 id 一意性 (#218)', () => {
  it('recordUpdate ごとに id が単調増加すること', () => {
    const manual = useManual(() => makeManual('1.0'))

    manual.recordUpdate(makeManual('1.1'))
    manual.recordUpdate(makeManual('1.2'))
    manual.recordUpdate(makeManual('1.3'))

    const ids = manual.history.value.map(h => h.id)
    expect(ids[0]).toBeLessThan(ids[1])
    expect(ids[1]).toBeLessThan(ids[2])
  })

  it('version が "5/5" にクランプして重複しても id は一意である (#218)', () => {
    const manual = useManual(() => makeManual('1.0'))

    // MAX_ROUNDS=5 を超える更新をシミュレート
    for (let i = 0; i < 10; i++) {
      manual.recordUpdate(makeManual('5/5', [`${i}`]))
    }

    const ids = manual.history.value.map(h => h.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)

    // version はすべて "5/5" で重複している
    const versions = manual.history.value.map(h => h.version)
    expect(versions.every(v => v === '5/5')).toBe(true)
  })

  it('1回目の更新で id が付与される', () => {
    const manual = useManual(() => makeManual('1.0'))

    manual.recordUpdate(makeManual('1.0'))
    expect(manual.history.value[0].id).toBeGreaterThan(0)
  })

  it('スライスは4件まで（古いものが削除される）', () => {
    const manual = useManual(() => makeManual('1.0'))

    for (let i = 0; i < 6; i++) {
      manual.recordUpdate(makeManual(`v${i}`))
    }
    expect(manual.history.value.length).toBe(4)
    for (const h of manual.history.value) {
      expect(h.id).toBeDefined()
    }
  })
})
