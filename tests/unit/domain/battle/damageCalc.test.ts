import { describe, it, expect } from 'vitest'
import {
  defenseValueFor, cutRateFromDefense, computeFinalCutRate,
  computeAffinityStage, affinityMultiplier,
  computeOutgoingDamage, computeFinalDamage, computeOutgoingHeal, computeFinalHeal,
  computeHitChance, rollHit, rollCritical, rollCriticalStacks, criticalMultiplierForStacks,
  applyDamage, applyHeal, applyShield,
} from '../../../../src/domain/battle/damageCalc'
import { BATTLE } from '../../../../src/data/tunables'
import type { TraitDef } from '../../../../src/domain/battle/types'
import { makeStats, makeCombatant, makeTrait, constRng, seqRng } from './_helpers'

const NO_TRAITS = new Map<string, TraitDef>()

describe('damageCalc: 参照する防御ステータス', () => {
  const stats = makeStats({ def: 2000, ref: 600 })

  it('物理は DEF を参照する', () => {
    expect(defenseValueFor('physical', stats)).toBe(2000)
  })

  it('魔法は REF を参照する', () => {
    expect(defenseValueFor('magical', stats)).toBe(600)
  })

  it('特殊は (DEF + REF) / 4 を参照する（両方を固めても軽減しづらい）', () => {
    expect(defenseValueFor('special', stats)).toBe(650)
  })
})

describe('damageCalc: カット率', () => {
  it('anchor ちょうどならカット率 0', () => {
    expect(cutRateFromDefense(BATTLE.cut.anchor)).toBe(0)
  })

  it('anchor + divisor でカット率 100% 相当だが上限でクランプされる', () => {
    expect(cutRateFromDefense(BATTLE.cut.anchor + BATTLE.cut.divisor)).toBe(BATTLE.cut.max)
  })

  it('DEF 2000 → 5%（設計書の計算例と一致する）', () => {
    expect(cutRateFromDefense(2000)).toBeCloseTo(0.05, 10)
  })

  it('anchor 未満でも負のカット率にはならない', () => {
    expect(cutRateFromDefense(0)).toBe(0)
  })

  it('ステータス由来・特性由来・シールド・守るはすべて加算される', () => {
    const cut = computeFinalCutRate({
      element: 'physical',
      target: makeStats({ def: 2000 }),       // 0.05
      traitCutRates: [0.1, 0.05],
      shieldCutRate: 0.2,
      guardCutRate: 0.1,
    })
    expect(cut).toBeCloseTo(0.5, 10)
  })

  it('合算しても上限（cut.max）を超えない', () => {
    const cut = computeFinalCutRate({
      element: 'physical',
      target: makeStats({ def: 20000 }),
      traitCutRates: [0.5],
      shieldCutRate: 0.4,
      guardCutRate: 0.5,
    })
    expect(cut).toBe(BATTLE.cut.max)
  })
})

describe('damageCalc: 相性段階', () => {
  const weak = makeTrait({ id: 'weak_phys', effect: [{ op: 'elementAffinity', element: 'physical', affinity: 'weak' }] })
  const resist = makeTrait({ id: 'resist_phys', effect: [{ op: 'elementAffinity', element: 'physical', affinity: 'resist' }] })
  const defs = new Map<string, TraitDef>([[weak.id, weak], [resist.id, resist]])

  it('特性を持たなければ段階 0', () => {
    expect(computeAffinityStage('physical', [], defs)).toBe(0)
  })

  it('弱点特性で +1 段階', () => {
    expect(computeAffinityStage('physical', [{ id: 'weak_phys' }], defs)).toBe(BATTLE.affinity.weakStage)
  })

  it('耐性特性で -1 段階', () => {
    expect(computeAffinityStage('physical', [{ id: 'resist_phys' }], defs)).toBe(BATTLE.affinity.resistStage)
  })

  it('弱点と耐性を同時に持つと相殺されて 0 になる（段階が加算だから成り立つ）', () => {
    expect(computeAffinityStage('physical', [{ id: 'weak_phys' }, { id: 'resist_phys' }], defs)).toBe(0)
  })

  it('同じ方向の特性は積み重なる', () => {
    expect(computeAffinityStage('physical', [{ id: 'weak_phys' }, { id: 'weak_phys' }], defs)).toBe(2)
  })

  it('属性が異なる特性は影響しない', () => {
    expect(computeAffinityStage('magical', [{ id: 'weak_phys' }], defs)).toBe(0)
  })

  it('特殊属性には弱点・耐性が存在しない（常に段階 0）', () => {
    expect(computeAffinityStage('special', [{ id: 'weak_phys' }], defs)).toBe(0)
  })

  it('未知の特性IDは無視される', () => {
    expect(computeAffinityStage('physical', [{ id: 'nope' }], NO_TRAITS)).toBe(0)
  })

  it('相性倍率は 2^段階', () => {
    expect(affinityMultiplier(-1)).toBe(0.5)
    expect(affinityMultiplier(0)).toBe(1)
    expect(affinityMultiplier(1)).toBe(2)
    expect(affinityMultiplier(2)).toBe(4)
  })
})

describe('damageCalc: ダメージ計算', () => {
  it('送出ダメージ = 参照値 × 倍率 × クリ倍率 × 効果倍率', () => {
    expect(computeOutgoingDamage({
      referenceValue: 1365, scaleRate: 1, critMultiplier: 1, effectMultiplier: 1.5,
    })).toBeCloseTo(2047.5, 10)
  })

  it('参照値が負でも送出ダメージは 0 未満にならない', () => {
    expect(computeOutgoingDamage({
      referenceValue: -100, scaleRate: 1, critMultiplier: 1, effectMultiplier: 1,
    })).toBe(0)
  })

  it('最終ダメージ = 送出 × (1 - カット率) × 相性倍率', () => {
    expect(computeFinalDamage({
      outgoingDamage: 2047.5, finalCutRate: 0.05, affinityStage: 1,
    })).toBeCloseTo(3890.25, 10)
  })

  it('カット率が上限でも最終ダメージは 0 にはならない（20% は通る）', () => {
    const d = computeFinalDamage({ outgoingDamage: 1000, finalCutRate: BATTLE.cut.max, affinityStage: 0 })
    expect(d).toBeCloseTo(200, 10)
  })

  it('弱点はカット率適用後に乗るため、防御を固めても効果が残る', () => {
    const cut = computeFinalDamage({ outgoingDamage: 1000, finalCutRate: 0.8, affinityStage: 0 })
    const cutWeak = computeFinalDamage({ outgoingDamage: 1000, finalCutRate: 0.8, affinityStage: 1 })
    expect(cutWeak).toBeCloseTo(cut * 2, 10)
  })
})

describe('damageCalc: 回復計算', () => {
  it('送出回復にもクリティカル倍率が乗る', () => {
    expect(computeOutgoingHeal({
      referenceValue: 1000, scaleRate: 0.8, critMultiplier: 2, effectMultiplier: 1,
    })).toBeCloseTo(1600, 10)
  })

  it('最終回復には被回復倍率のみが乗る（カット率・相性は無関係）', () => {
    expect(computeFinalHeal({ outgoingHeal: 1000, healTakenMultiplier: 1.3 })).toBeCloseTo(1300, 10)
  })

  it('被回復倍率が負でも回復量は 0 で下げ止まる', () => {
    expect(computeFinalHeal({ outgoingHeal: 1000, healTakenMultiplier: -1 })).toBe(0)
  })
})

describe('damageCalc: 命中', () => {
  it('実効命中率 = 命中率 × (1 - 回避率)', () => {
    expect(computeHitChance(0.95, 0.2)).toBeCloseTo(0.76, 10)
  })

  it('命中率が 100% 超なら回避率を打ち消せる', () => {
    expect(computeHitChance(1.5, 0.2)).toBeCloseTo(1, 10)
  })

  it('打ち消した分で 100% を超えることはない（上限クランプ）', () => {
    expect(computeHitChance(3, 0)).toBe(1)
  })

  it('回避率が 100% でも実効命中率は負にならない', () => {
    expect(computeHitChance(0.95, 1)).toBe(0)
  })

  it('命中判定・クリティカル判定は rng < 確率', () => {
    expect(rollHit(0.5, constRng(0.49))).toBe(true)
    expect(rollHit(0.5, constRng(0.5))).toBe(false)
    expect(rollCritical(0.05, constRng(0.049))).toBe(true)
    expect(rollCritical(0.05, constRng(0.05))).toBe(false)
  })

  it('確率 0 なら決して当たらない', () => {
    expect(rollHit(0, constRng(0))).toBe(false)
  })
})

describe('damageCalc: スーパークリティカル（クリティカル率が100%を超えた場合）', () => {
  it('100%未満は通常のクリティカル判定と同じ（1重 or 0重）', () => {
    expect(rollCriticalStacks(0.05, constRng(0.049))).toBe(1)
    expect(rollCriticalStacks(0.05, constRng(0.05))).toBe(0)
  })

  it('101%なら1重が確定し、残り1%の確率で2重目が乗る', () => {
    // 1重確定のあと、超過分1%の抽選を引く。十分小さい値なら成功して2重になり、
    // 続く値が十分大きければそこで止まる（同じ確率で何重にも重なりうる実装のため、
    // 判定を必ず終わらせる値を後ろに続けておく）。
    expect(rollCriticalStacks(1.01, seqRng([0.001, 0.999]))).toBe(2)
    // 十分大きい値なら最初の抽選で失敗し、確定の1重だけで止まる。
    expect(rollCriticalStacks(1.01, seqRng([0.5, 0.999]))).toBe(1)
  })

  it('抽選に連続で成功する限り、同じ確率で何重にも重なり続ける', () => {
    // 0.001 < 0.01 を3回連続で成功させたあと、4回目に 0.999 で失敗させて打ち切る。
    expect(rollCriticalStacks(1.01, seqRng([0.001, 0.001, 0.001, 0.999]))).toBe(1 + 3)
  })

  it('250%なら2重が確定し、残り50%の確率で3重目が乗る', () => {
    expect(rollCriticalStacks(2.5, seqRng([0.49, 0.999]))).toBe(3)
    expect(rollCriticalStacks(2.5, constRng(0.5))).toBe(2)
  })

  it('倍率は「クリティカル倍率 ^ 重なった回数」（1重なら通常のクリティカル倍率のまま）', () => {
    expect(criticalMultiplierForStacks(3, 0)).toBe(1)
    expect(criticalMultiplierForStacks(3, 1)).toBe(3)
    expect(criticalMultiplierForStacks(3, 2)).toBe(9)
    expect(criticalMultiplierForStacks(3, 3)).toBe(27)
  })
})

describe('damageCalc: HP・シールドへの反映', () => {
  it('ダメージはここで1度だけ切り捨てられる', () => {
    const c = makeCombatant({ hp: 5000 })
    const dealt = applyDamage(c, 3890.99)
    expect(dealt).toBe(3890)
    expect(c.hp).toBe(1110)
  })

  it('シールドがあれば先に消費され、余りだけHPへ抜ける', () => {
    const c = makeCombatant({ hp: 5000, shield: 300 })
    applyDamage(c, 500)
    expect(c.shield).toBe(0)
    expect(c.hp).toBe(4800)
  })

  it('シールドで受けきればHPは減らない', () => {
    const c = makeCombatant({ hp: 5000, shield: 800 })
    applyDamage(c, 500)
    expect(c.shield).toBe(300)
    expect(c.hp).toBe(5000)
  })

  it('シールドが割れたときだけコールバックが呼ばれる', () => {
    let broke = 0
    const c = makeCombatant({ hp: 5000, shield: 500 })
    applyDamage(c, 100, () => { broke++ })
    expect(broke).toBe(0)
    applyDamage(c, 400, () => { broke++ })
    expect(broke).toBe(1)
  })

  it('シールドを持たない対象では破壊コールバックが呼ばれない', () => {
    let broke = 0
    const c = makeCombatant({ hp: 5000, shield: 0 })
    applyDamage(c, 100, () => { broke++ })
    expect(broke).toBe(0)
  })

  it('HP が 0 以下になったら 0 に丸めて戦闘不能になる', () => {
    const c = makeCombatant({ hp: 100 })
    applyDamage(c, 999)
    expect(c.hp).toBe(0)
    expect(c.alive).toBe(false)
  })

  it('負のダメージは 0 として扱われる', () => {
    const c = makeCombatant({ hp: 100 })
    expect(applyDamage(c, -50)).toBe(0)
    expect(c.hp).toBe(100)
  })

  it('回復は最大HPでクランプされ、実際に回復した量を返す', () => {
    const c = makeCombatant({ hp: 4800 })
    expect(applyHeal(c, 500, 5000)).toBe(200)
    expect(c.hp).toBe(5000)
  })

  it('回復も切り捨てられる', () => {
    const c = makeCombatant({ hp: 1000 })
    expect(applyHeal(c, 123.9, 5000)).toBe(123)
  })

  it('シールドは加算で積み上がる', () => {
    const c = makeCombatant({ shield: 0 })
    applyShield(c, 300)
    applyShield(c, 200.7)
    expect(c.shield).toBe(500)
  })
})
