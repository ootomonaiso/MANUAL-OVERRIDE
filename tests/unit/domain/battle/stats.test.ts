import { describe, it, expect } from 'vitest'
import {
  clamp, computeEffective, stackMultipliers, levelMultiplier, passiveLevelMultiplier,
  computeEffectiveStats, deriveEvadeBase, newAccumulator, addFlat, addRate, toModifiers,
  accumulatePassiveStatBoosts, collectEffectMultiplier, clampHpToMax,
} from '../../../../src/domain/battle/stats'
import { BATTLE } from '../../../../src/data/tunables'
import { makeStats, makeCombatant, makePassive, makeTrait, makeContent } from './_helpers'

describe('stats: 基本の算術', () => {
  it('実効値 = (基礎値 + 実数バフ) × 倍率バフ', () => {
    expect(computeEffective(1000, { flat: 300, mult: 1.05 })).toBeCloseTo(1365, 6)
  })

  it('倍率が負になっても 0 で下げ止まる（実効値が負にならない）', () => {
    expect(computeEffective(1000, { flat: 0, mult: -2 })).toBe(0)
  })

  it('倍率バフは加算スタックする（1 + Σrate）', () => {
    expect(stackMultipliers([])).toBe(1)
    expect(stackMultipliers([0.5, 0.5])).toBe(2)
    expect(stackMultipliers([-0.3])).toBeCloseTo(0.7, 6)
  })

  it('clamp は下限・上限の両方で止まる', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(0.4, 0, 1)).toBe(0.4)
  })

  it('レベル倍率は 1 + (Lv-1)×0.25（Lv1〜4 で ×1 / ×1.25 / ×1.5 / ×1.75）', () => {
    expect([1, 2, 3, 4].map(levelMultiplier)).toEqual([1, 1.25, 1.5, 1.75])
  })

  it('パッシブ重複強化のレベル倍率はLv4でちょうど2倍になる（第13フェーズ）', () => {
    const values = [1, 2, 3, 4].map(passiveLevelMultiplier)
    expect(values[0]).toBe(1)
    expect(values[3]).toBe(2)
    expect(values[1]).toBeCloseTo(4 / 3, 10)
    expect(values[2]).toBeCloseTo(5 / 3, 10)
  })
})

describe('stats: computeEffectiveStats', () => {
  it('個別ステータスに実数・倍率補正が反映される', () => {
    const eff = computeEffectiveStats(makeStats({ str: 1000 }), {
      str: { flat: 300, mult: 1.05 },
    })
    expect(eff.str).toBeCloseTo(1365, 6)
  })

  it('補正のないステータスは基礎値のまま', () => {
    const eff = computeEffectiveStats(makeStats({ int: 777 }), {})
    expect(eff.int).toBe(777)
  })

  it('回避率は AGI から導出される（基礎値の evadeRate は使われない）', () => {
    const eff = computeEffectiveStats(makeStats({ agi: 26000, evadeRate: 0.99 }), {})
    expect(eff.evadeRate).toBeCloseTo(deriveEvadeBase(26000), 6)
    expect(eff.evadeRate).toBeCloseTo(0.5, 6)
  })

  it('AGI が anchor 以下なら回避率は 0 で下げ止まる', () => {
    const eff = computeEffectiveStats(makeStats({ agi: 0 }), {})
    expect(eff.evadeRate).toBe(0)
  })

  it('回避率は上限（evade.max）でクランプされる', () => {
    const eff = computeEffectiveStats(makeStats({ agi: 1000000 }), {})
    expect(eff.evadeRate).toBe(BATTLE.evade.max)
  })

  it('回避率への直接補正は導出値に上乗せされる', () => {
    const eff = computeEffectiveStats(makeStats({ agi: BATTLE.evade.anchor }), {
      evadeRate: { flat: 0.5, mult: 1 },
    })
    expect(eff.evadeRate).toBeCloseTo(0.5, 6)
  })

  it('命中率は 100% 超えを許容する（クランプしない）', () => {
    const eff = computeEffectiveStats(makeStats({ hitRate: 0.95 }), {
      hitRate: { flat: 0.5, mult: 1 },
    })
    expect(eff.hitRate).toBeCloseTo(1.45, 6)
  })

  it('クリティカル率・クリティカルダメージ倍率もクランプされない', () => {
    const eff = computeEffectiveStats(makeStats({ critRate: 0.9 }), {
      critRate: { flat: 0.5, mult: 1 },
      critDamageMultiplier: { flat: 0, mult: 3 },
    })
    expect(eff.critRate).toBeCloseTo(1.4, 6)
    expect(eff.critDamageMultiplier).toBeCloseTo(6, 6)
  })
})

describe('stats: 補正アキュムレータ', () => {
  it('実数と倍率を積み上げて StatModifier に変換する', () => {
    const acc = newAccumulator()
    addFlat(acc, 'str', 100)
    addFlat(acc, 'str', 200)
    addRate(acc, 'str', 0.25)
    addRate(acc, 'str', 0.25)
    const mods = toModifiers(acc)
    expect(mods.str).toEqual({ flat: 300, mult: 1.5 })
  })

  it('片方しか積まれていないステータスも欠損なく変換される', () => {
    const acc = newAccumulator()
    addRate(acc, 'agi', 0.5)
    expect(toModifiers(acc).agi).toEqual({ flat: 0, mult: 1.5 })
  })
})

describe('stats: accumulatePassiveStatBoosts', () => {
  it('パッシブの statBoost には重複強化のレベル倍率が掛かる（第13フェーズ、Lv4で2倍になる式）', () => {
    const def = makePassive({ id: 'p', effect: [{ op: 'statBoost', stat: 'def', amount: 900 }] })
    const acc = newAccumulator()
    accumulatePassiveStatBoosts([{ level: 2, def }], acc)
    expect(toModifiers(acc).def?.flat).toBe(1200)   // 900 × (4/3)（passiveLevelMultiplier Lv2）
  })

  it('特性の statBoost はレベル倍率を掛けない（常に等倍）', () => {
    const def = makeTrait({ id: 't', effect: [{ op: 'statBoost', stat: 'def', amount: 800 }] })
    const acc = newAccumulator()
    accumulatePassiveStatBoosts([{ level: 4, def }], acc)
    expect(toModifiers(acc).def?.flat).toBe(800)
  })

  it('statBoost 以外の op は無視される', () => {
    const def = makePassive({ id: 'p', effect: [{ op: 'cutRate', amount: 0.1 }] })
    const acc = newAccumulator()
    accumulatePassiveStatBoosts([{ level: 1, def }], acc)
    expect(toModifiers(acc)).toEqual({})
  })

  it('割合ステータス（critRate等）へのパッシブstatBoostはレベル倍率を掛けない（常に等倍）', () => {
    // レベル倍率を掛けると、レベルアップのたびに確率自体が指数的に膨張し、
    // 特にcritDamageMultiplierはスーパークリティカルと絡んで際限なく暴走する
    // （PERCENT_STAT_KEYS参照。三連撃/見切り撃ちで実際に確認されたバランス崩壊）。
    const def = makePassive({ id: 'p', effect: [{ op: 'statBoost', stat: 'critRate', rate: 0.05 }] })
    const acc = newAccumulator()
    accumulatePassiveStatBoosts([{ level: 4, def }], acc)
    expect(toModifiers(acc).critRate?.mult).toBeCloseTo(1.05, 6) // (2^4-1)=15 が掛かっていれば 1.75 になってしまう
  })

  it('critDamageMultiplierへのパッシブstatBoostもレベル倍率を掛けない', () => {
    const def = makePassive({ id: 'p', effect: [{ op: 'statBoost', stat: 'critDamageMultiplier', rate: 0.1 }] })
    const acc = newAccumulator()
    accumulatePassiveStatBoosts([{ level: 3, def }], acc)
    expect(toModifiers(acc).critDamageMultiplier?.mult).toBeCloseTo(1.1, 6) // (2^3-1)=7 が掛かっていれば 1.7 になってしまう
  })
})

describe('stats: collectEffectMultiplier（効果倍率）', () => {
  const traitPhys = makeTrait({ id: 'tp', effect: [{ op: 'effectBoost', element: 'physical', rate: 0.5 }] })
  const traitAny = makeTrait({ id: 'ta', effect: [{ op: 'effectBoost', element: 'any', rate: 0.2 }] })
  const passiveMagic = makePassive({ id: 'pm', effect: [{ op: 'effectBoost', element: 'magical', rate: 0.15 }] })
  const content = makeContent({ traits: [traitPhys, traitAny], skills: [passiveMagic] })

  it('効果倍率を持たなければ 1（等倍）', () => {
    expect(collectEffectMultiplier(makeCombatant(), 'physical', content)).toBe(1)
  })

  it('属性が一致する特性の倍率が乗る', () => {
    const c = makeCombatant({ traits: [{ id: 'tp' }] })
    expect(collectEffectMultiplier(c, 'physical', content)).toBeCloseTo(1.5, 6)
  })

  it('属性が一致しない特性は無視される', () => {
    const c = makeCombatant({ traits: [{ id: 'tp' }] })
    expect(collectEffectMultiplier(c, 'magical', content)).toBe(1)
  })

  it('element: "any" は全属性に乗る', () => {
    const c = makeCombatant({ traits: [{ id: 'ta' }] })
    expect(collectEffectMultiplier(c, 'special', content)).toBeCloseTo(1.2, 6)
  })

  it('複数の効果倍率は加算スタックする', () => {
    const c = makeCombatant({ traits: [{ id: 'tp' }, { id: 'ta' }] })
    expect(collectEffectMultiplier(c, 'physical', content)).toBeCloseTo(1.7, 6)
  })

  it('パッシブ由来の効果倍率には重複強化のレベル倍率が掛かる（第13フェーズ）', () => {
    const c = makeCombatant({ passives: [{ id: 'pm', level: 2, stacks: 0 }] })
    expect(collectEffectMultiplier(c, 'magical', content)).toBeCloseTo(1.2, 6)   // 0.15 × (4/3)（passiveLevelMultiplier Lv2）
  })

  it('未知のIDを持っていても壊れない', () => {
    const c = makeCombatant({ traits: [{ id: 'unknown' }], passives: [{ id: 'unknown2', level: 1, stacks: 0 }] })
    expect(collectEffectMultiplier(c, 'physical', content)).toBe(1)
  })
})

describe('stats: clampHpToMax', () => {
  it('最大HPを超えている現在HPは切り下げられる', () => {
    const c = makeCombatant({ hp: 9000 })
    clampHpToMax(c, 5000)
    expect(c.hp).toBe(5000)
  })

  it('最大HP以下なら変化しない', () => {
    const c = makeCombatant({ hp: 100 })
    clampHpToMax(c, 5000)
    expect(c.hp).toBe(100)
  })
})
