import { describe, it, expect } from 'vitest'
import { evaluateLearningRules } from '../../../src/domain/LearningSystem'
import type { LearningRule, ActionStats } from '../../../src/domain/types'

const baseStats: ActionStats = {
  jumps: 0, moveRight: 0, moveLeft: 0, shots: 0, ticks: 600,
}

function jumperRule(): LearningRule {
  return {
    id: 'frequent-jumper-doublejump',
    trigger: { type: 'jumpRate', threshold: 0.012, triggerAbove: true },
    effect: { type: 'forceFeature', payload: 'double_jump' },
  }
}

describe('evaluateLearningRules', () => {
  it('統計が不足（ticks<300）のうちは発火しない (#171-2)', () => {
    // rate = 50/100 = 0.5 と閾値を大きく超えるが、サンプル不足で誤発火させない
    const rules = [jumperRule()]
    const fired = evaluateLearningRules(rules, { ...baseStats, ticks: 100, jumps: 50 })
    expect(fired).toHaveLength(0)
    expect(rules[0].triggered).toBeFalsy()
  })

  it('jumpRate が閾値を超えたら forceFeature を発火する', () => {
    // rate = 12/600 = 0.02 > 0.012
    const rules = [jumperRule()]
    const fired = evaluateLearningRules(rules, { ...baseStats, jumps: 12 })
    expect(fired).toHaveLength(1)
    expect(fired[0]).toEqual({ type: 'forceFeature', payload: 'double_jump' })
    expect(rules[0].triggered).toBe(true)
  })

  it('jumpRate が閾値未満なら発火しない', () => {
    // rate = 4/600 = 0.0067 < 0.012
    const fired = evaluateLearningRules([jumperRule()], { ...baseStats, jumps: 4 })
    expect(fired).toHaveLength(0)
  })

  it('一度発火したルールは再発火しない（triggered ガード）', () => {
    const rules = [jumperRule()]
    evaluateLearningRules(rules, { ...baseStats, jumps: 12 })
    const second = evaluateLearningRules(rules, { ...baseStats, jumps: 30 })
    expect(second).toHaveLength(0)
  })

  it('triggerAbove:false は rate が閾値を下回ると発火する（サンプルは十分）', () => {
    const rule: LearningRule = {
      trigger: { type: 'shotRate', threshold: 0.05, triggerAbove: false },
      effect: { type: 'invertHazard', payload: '', durationSec: 5 },
    }
    // rate = 0/600 = 0 < 0.05 だが ticks>=300 なので発火する
    const fired = evaluateLearningRules([rule], { ...baseStats, shots: 0 })
    expect(fired).toHaveLength(1)
  })
})
