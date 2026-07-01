import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChoiceRecord } from '../../../src/domain/ruleEngine'
import type { ContradictionState } from '../../../src/domain/types'

// CARD_POOL をモック（import.meta.glob に依存しないテスト用データ）
const mockCardPool = [
  {
    id: 'c-card-a',
    label: 'Card A',
    manualText: ['Text A'],
    conflictsWith: ['c-card-b'],
  },
  {
    id: 'c-card-b',
    label: 'Card B',
    manualText: ['Text B'],
    conflictsWith: ['c-card-a'],
  },
  {
    id: 'c-card-c',
    label: 'Card C',
    manualText: ['Text C'],
    conflictsWith: ['c-card-a', 'c-card-b'],
  },
  {
    id: 'c-card-d',
    label: 'Card D',
    manualText: ['Text D'],
    // conflictsWith なし
  },
]

vi.doMock('../../../src/data/cardPool', () => ({
  CARD_POOL: mockCardPool,
  sampleCards: vi.fn(),
}))

// モック後にインポート
const { trackContradictions, shouldTriggerGlitchEnd, contradictionPercentage } =
  await import('../../../src/domain/contradictionTracker')

describe('trackContradictions', () => {
  const baseRecord = (id: string): ChoiceRecord => ({
    choiceId: id,
    genreParams: {},
  })

  it('空の履歴で矛盾なしを返す', () => {
    const result = trackContradictions([])
    expect(result.pairs).toEqual([])
    expect(result.score).toBe(0)
    expect(result.hasEffect).toBe(false)
  })

  it('矛盾するカードを両方選んでいるとペアが検出される', () => {
    const history: ChoiceRecord[] = [
      baseRecord('c-card-a'),
      baseRecord('c-card-b'),
    ]
    const result = trackContradictions(history)
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]).toEqual({ idA: 'c-card-a', idB: 'c-card-b' })
    expect(result.score).toBeGreaterThan(0)
  })

  it('矛盾するカードの片方のみではペアが検出されない', () => {
    const history: ChoiceRecord[] = [baseRecord('c-card-a')]
    const result = trackContradictions(history)
    expect(result.pairs).toEqual([])
    expect(result.score).toBe(0)
  })

  it('3枚の矛盾カードで複数のペアが検出される', () => {
    const history: ChoiceRecord[] = [
      baseRecord('c-card-a'),
      baseRecord('c-card-b'),
      baseRecord('c-card-c'),
    ]
    const result = trackContradictions(history)
    // c-card-c は c-card-a と c-card-b の両方と矛盾
    // c-card-a と c-card-b も互いに矛盾
    expect(result.pairs.length).toBeGreaterThanOrEqual(2)
  })

  it('矛盾のないカードはペアに含めない', () => {
    const history: ChoiceRecord[] = [
      baseRecord('c-card-a'),
      baseRecord('c-card-d'),
    ]
    const result = trackContradictions(history)
    expect(result.pairs).toEqual([])
  })

  it('同じペアが重複して検出されない', () => {
    const history: ChoiceRecord[] = [
      baseRecord('c-card-a'),
      baseRecord('c-card-b'),
    ]
    const result = trackContradictions(history)
    const pairKeys = result.pairs.map(p => [p.idA, p.idB].sort().join('|'))
    expect(pairKeys).toEqual(expect.arrayContaining([expect.any(String)]))
    // 重複なし
    expect(pairKeys.length).toBe(new Set(pairKeys).size)
  })
})

describe('shouldTriggerGlitchEnd', () => {
  it('矛盾スコアが閾値以上なら true を返す', () => {
    const state: ContradictionState = { pairs: [], score: 0.6, hasEffect: true }
    expect(shouldTriggerGlitchEnd(state)).toBe(true)
  })

  it('矛盾スコアが閾値未満なら false を返す', () => {
    const state: ContradictionState = { pairs: [], score: 0.3, hasEffect: false }
    expect(shouldTriggerGlitchEnd(state)).toBe(false)
  })
})

describe('contradictionPercentage', () => {
  it('スコア 0 で 0% を返す', () => {
    const state: ContradictionState = { pairs: [], score: 0, hasEffect: false }
    expect(contradictionPercentage(state)).toBe(0)
  })

  it('スコア 0.5 で 50% を返す', () => {
    const state: ContradictionState = { pairs: [], score: 0.5, hasEffect: false }
    expect(contradictionPercentage(state)).toBe(50)
  })

  it('スコア 1 で 100% を返す', () => {
    const state: ContradictionState = { pairs: [], score: 1, hasEffect: true }
    expect(contradictionPercentage(state)).toBe(100)
  })
})
