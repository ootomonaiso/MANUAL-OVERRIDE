import { describe, it, expect } from 'vitest'
import { buildRuntimeRules, type ChoiceRecord } from '../../../src/domain/ruleEngine'
import type { ManualVersion } from '../../../src/domain/types'

function baseVersion(): ManualVersion {
  return {
    version: '1.0',
    manualText: [],
    choices: [],
    hazards: { colors: ['red'], safeColors: ['blue'] },
  }
}

function record(choiceId: string, addFeatures?: string[]): ChoiceRecord {
  return { choiceId, genreParams: {}, addFeatures }
}

describe('buildRuntimeRules - 選択由来のフィーチャー付与 (#105)', () => {
  it('addFeatures を持たない選択では機能が付与されない（movement のみ常時有効）', () => {
    const rules = buildRuntimeRules(baseVersion(), [record('a')], null)
    expect(rules.features.has('movement')).toBe(true)
    expect(rules.features.has('shoot')).toBe(false)
  })

  it('addFeatures を持つ選択でジャンル確定前でも即座に機能が付与される', () => {
    const rules = buildRuntimeRules(baseVersion(), [record('a', ['shoot'])], null)
    expect(rules.features.has('shoot')).toBe(true)
  })

  it('複数選択にまたがって付与フィーチャーが累積 union される', () => {
    const history = [record('a', ['shoot']), record('b', ['dash'])]
    const rules = buildRuntimeRules(baseVersion(), history, null)
    expect(rules.features.has('shoot')).toBe(true)
    expect(rules.features.has('dash')).toBe(true)
  })

  it('同じフィーチャーを重ねて選んでも Set なので重複しない', () => {
    const history = [record('a', ['shoot']), record('b', ['shoot'])]
    const rules = buildRuntimeRules(baseVersion(), history, null)
    const shootCount = [...rules.features].filter(f => f === 'shoot').length
    expect(shootCount).toBe(1)
  })
})
