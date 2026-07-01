import { describe, it, expect } from 'vitest'
import {
  evaluateLearningRules,
  describeEffect,
} from '../../../src/domain/LearningSystem'
import type { LearningRule, ActionStats, LearningEffect } from '../../../src/domain/types'

const makeStats = (overrides?: Partial<ActionStats>): ActionStats => ({
  jumps: 0,
  moveRight: 0,
  moveLeft: 0,
  shots: 0,
  ticks: 100,
  ...overrides,
})

describe('evaluateLearningRules', () => {
  it('ticks=0 のときは何のルールも発動しない', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'jumpRate', threshold: 0.5 },
        effect: { type: 'disableAction', payload: 'jump' },
      },
    ]
    const stats = makeStats({ ticks: 0, jumps: 999 })
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(0)
    expect(rules[0].triggered).toBeUndefined()
  })

  it('jumpRate が threshold を超えると発動する', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'jumpRate', threshold: 0.3 },
        effect: { type: 'disableAction', payload: 'jump' },
      },
    ]
    const stats = makeStats({ jumps: 50, ticks: 100 }) // rate = 0.5 > 0.3
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(1)
    expect(fired[0].type).toBe('disableAction')
    expect(rules[0].triggered).toBe(true)
  })

  it('jumpRate が threshold 未満なら発動しない', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'jumpRate', threshold: 0.6 },
        effect: { type: 'disableAction', payload: 'jump' },
      },
    ]
    const stats = makeStats({ jumps: 50, ticks: 100 }) // rate = 0.5 < 0.6
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(0)
    expect(rules[0].triggered).toBeUndefined()
  })

  it('triggerAbove=false のときは threshold 未満で発動する', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'shotRate', threshold: 0.3, triggerAbove: false },
        effect: { type: 'forceFeature', payload: 'slow_precise' },
      },
    ]
    const stats = makeStats({ shots: 10, ticks: 100 }) // rate = 0.1 < 0.3
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(1)
    expect(fired[0].type).toBe('forceFeature')
  })

  it('一度発動したルールは再発動しない', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'jumpRate', threshold: 0.3 },
        effect: { type: 'disableAction', payload: 'jump' },
      },
    ]
    const stats = makeStats({ jumps: 50, ticks: 100 })
    evaluateLearningRules(rules, stats) // 1 回目: 発動
    const fired2 = evaluateLearningRules(rules, stats) // 2 回目: 発動しない
    expect(fired2).toHaveLength(0)
  })

  it('複数のルールが同時に発動する', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'jumpRate', threshold: 0.3 },
        effect: { type: 'disableAction', payload: 'jump' },
      },
      {
        trigger: { type: 'rightRate', threshold: 0.3 },
        effect: { type: 'invertHazard', payload: 'colors' },
      },
    ]
    const stats = makeStats({ jumps: 50, moveRight: 50, ticks: 100 })
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(2)
  })

  it('shotRate の計算が正しい', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'shotRate', threshold: 0.2 },
        effect: { type: 'forceFeature', payload: 'three_way' },
      },
    ]
    const stats = makeStats({ shots: 30, ticks: 100 }) // rate = 0.3 > 0.2
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(1)
  })

  it('leftRate の計算が正しい', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'leftRate', threshold: 0.4 },
        effect: { type: 'changeKey', payload: 'ArrowLeft' },
      },
    ]
    const stats = makeStats({ moveLeft: 50, ticks: 100 }) // rate = 0.5 > 0.4
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(1)
  })

  it('dashRate は dashes が undefined でも動く', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'dashRate', threshold: 0.1 },
        effect: { type: 'forceFeature', payload: 'dash' },
      },
    ]
    const stats = makeStats({ dashes: undefined, ticks: 100 }) // rate = 0 < 0.1
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(0)
  })

  it('dashRate が threshold を超えると発動する', () => {
    const rules: LearningRule[] = [
      {
        trigger: { type: 'dashRate', threshold: 0.1 },
        effect: { type: 'forceFeature', payload: 'dash' },
      },
    ]
    const stats = makeStats({ dashes: 20, ticks: 100 }) // rate = 0.2 > 0.1
    const fired = evaluateLearningRules(rules, stats)
    expect(fired).toHaveLength(1)
  })
})

describe('describeEffect', () => {
  it('disableAction の説明を返す', () => {
    const effect: LearningEffect = { type: 'disableAction', payload: 'jump' }
    expect(describeEffect(effect)).toBe('アクション "jump" を無効化')
  })

  it('invertHazard の説明を返す（durationSec あり）', () => {
    const effect: LearningEffect = { type: 'invertHazard', payload: 'colors', durationSec: 5 }
    expect(describeEffect(effect)).toBe('ハザード色反転（5秒）')
  })

  it('invertHazard の説明を返す（durationSec なし）', () => {
    const effect: LearningEffect = { type: 'invertHazard', payload: 'colors' }
    expect(describeEffect(effect)).toBe('ハザード色反転（永続秒）')
  })

  it('forceFeature の説明を返す', () => {
    const effect: LearningEffect = { type: 'forceFeature', payload: 'slow_precise' }
    expect(describeEffect(effect)).toBe('フィーチャー "slow_precise" を強制有効化')
  })

  it('changeKey の説明を返す', () => {
    const effect: LearningEffect = { type: 'changeKey', payload: 'ArrowLeft' }
    expect(describeEffect(effect)).toBe('キー再マッピング → "ArrowLeft"')
  })
})
