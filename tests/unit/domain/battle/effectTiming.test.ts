import { describe, it, expect } from 'vitest'
import { estimateHitCount } from '../../../../src/domain/battle/effectTiming'
import { node } from './_helpers'

describe('effectTiming: estimateHitCount', () => {
  it('damage/heal/shield をそれぞれ1回として数える', () => {
    expect(estimateHitCount([
      node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } }),
      node('heal', { element: 'special', scale: { stat: 'int', rate: 1 } }),
      node('shield', { element: 'special', scale: { stat: 'def', rate: 1 } }),
    ])).toBe(3)
  })

  it('modifier等、非ダメージ系のopは数えない', () => {
    expect(estimateHitCount([
      node('modifier', { stat: 'str', amount: 100, scope: 'thisTurn' }),
      node('statBoost', { stat: 'def', amount: 100 }),
      node('noop', {}),
    ])).toBe(0)
  })

  it('repeatは times を掛け合わせる（三連撃 想定）', () => {
    expect(estimateHitCount([
      node('repeat', { times: 3, body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 0.6 } })] }),
    ])).toBe(3)
  })

  it('弾幕のような times:20 も正しく数える', () => {
    expect(estimateHitCount([
      node('repeat', { times: 20, body: [node('damage', { element: 'magical', scale: { stat: 'int', rate: 0.08 } })] }),
    ])).toBe(20)
  })

  it('repeatの前後に別の効果があれば加算される', () => {
    expect(estimateHitCount([
      node('repeat', { times: 3, body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 0.6 } })] }),
      node('heal', { element: 'special', scale: { stat: 'int', rate: 0.5 } }),
    ])).toBe(4)
  })

  it('空の効果は0', () => {
    expect(estimateHitCount([])).toBe(0)
  })
})
