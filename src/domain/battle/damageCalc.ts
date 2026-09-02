/**
 * domain/battle/damageCalc.ts
 * ダメージ・回復・命中判定（docs/genre/rpg/03-damage-calc.md）。
 */

import { BATTLE } from '../../data/tunables'
import { clamp } from './stats'
import type { Element, EffectiveStats, Combatant, OwnedTrait, TraitDef } from './types'

export function defenseValueFor(element: Element, stats: EffectiveStats): number {
  switch (element) {
    case 'physical': return stats.def
    case 'magical':  return stats.ref
    case 'special':  return (stats.def + stats.ref) / 4
  }
}

/** カット率 = (防御ステータス - anchor) / divisor、下限0・上限 max */
export function cutRateFromDefense(defenseValue: number): number {
  const raw = (defenseValue - BATTLE.cut.anchor) / BATTLE.cut.divisor
  return clamp(raw, 0, BATTLE.cut.max)
}

/**
 * 最終カット率 = ステータス由来 + 特性由来(加算) + シールド由来 + 守る由来、上限でクランプ。
 * traitCutRates / shieldCutRate / guardCutRate はすべて加算スタックの対象。
 */
export function computeFinalCutRate(params: {
  element: Element
  target: EffectiveStats
  traitCutRates: readonly number[]
  shieldCutRate: number
  guardCutRate: number
}): number {
  const statCut = cutRateFromDefense(defenseValueFor(params.element, params.target))
  const sum = statCut
    + params.traitCutRates.reduce((a, b) => a + b, 0)
    + params.shieldCutRate
    + params.guardCutRate
  return clamp(sum, 0, BATTLE.cut.max)
}

// ─────────────────────────────────────────────────────────────
// 相性段階
// ─────────────────────────────────────────────────────────────

/** 特性から弱点・耐性を集計し、相性段階を求める。特殊属性は常に0 */
export function computeAffinityStage(
  element: Element,
  targetTraits: readonly OwnedTrait[],
  traitDefs: ReadonlyMap<string, TraitDef>,
): number {
  if (element === 'special') return 0
  let stage = 0
  for (const t of targetTraits) {
    const def = traitDefs.get(t.id)
    if (!def) continue
    for (const eff of def.effect) {
      if (eff.op !== 'elementAffinity' || eff.element !== element) continue
      stage += eff.affinity === 'weak' ? BATTLE.affinity.weakStage : BATTLE.affinity.resistStage
    }
  }
  return stage
}

export function affinityMultiplier(stage: number): number {
  return Math.pow(2, stage)
}

// ─────────────────────────────────────────────────────────────
// ダメージ
// ─────────────────────────────────────────────────────────────

/** 攻撃側で完結する値（対象に依存しない） */
export function computeOutgoingDamage(params: {
  referenceValue: number
  scaleRate: number
  critMultiplier: number
  effectMultiplier: number
}): number {
  return Math.max(0, params.referenceValue) * params.scaleRate
       * params.critMultiplier * params.effectMultiplier
}

/** 対象側の補正を適用して最終ダメージを得る（丸めない。呼び出し側でHP反映直前に丸める） */
export function computeFinalDamage(params: {
  outgoingDamage: number
  finalCutRate: number
  affinityStage: number
}): number {
  return Math.max(0, params.outgoingDamage)
       * (1 - params.finalCutRate)
       * affinityMultiplier(params.affinityStage)
}

// ─────────────────────────────────────────────────────────────
// 回復
// ─────────────────────────────────────────────────────────────

export function computeOutgoingHeal(params: {
  referenceValue: number
  scaleRate: number
  critMultiplier: number
  effectMultiplier: number
}): number {
  return Math.max(0, params.referenceValue) * params.scaleRate
       * params.critMultiplier * params.effectMultiplier
}

/** 回復にはカット率・属性相性を適用しない */
export function computeFinalHeal(params: {
  outgoingHeal: number
  healTakenMultiplier: number
}): number {
  return Math.max(0, params.outgoingHeal) * Math.max(0, params.healTakenMultiplier)
}

// ─────────────────────────────────────────────────────────────
// 命中
// ─────────────────────────────────────────────────────────────

/** 実効命中率 = 命中率 × (1 - 回避率)。hitRate 自体はクランプしない */
export function computeHitChance(attackerHitRate: number, targetEvadeRate: number): number {
  return clamp(attackerHitRate * (1 - targetEvadeRate), 0, 1)
}

export function rollHit(hitChance: number, rng: () => number): boolean {
  return rng() < hitChance
}

export function rollCritical(critRate: number, rng: () => number): boolean {
  return rng() < critRate
}

/**
 * クリティカル率が100%を超えた分を「スーパークリティカル」の追加抽選に使う。
 * 例: critRate=1.01（101%）なら通常クリティカルが1重確定し、残り1%で2重目を抽選する。
 * 抽選に成功した場合は同じ確率（この例では1%）でさらに3重目…と際限なく重ねられる
 * （確率は毎回同じ値のまま独立試行を繰り返すだけで、幾何級数的に発生率が下がる）。
 * 戻り値はクリティカルが重なった回数（0=クリティカルなし、1=通常クリティカル、2以上=スーパークリティカル）。
 */
export function rollCriticalStacks(critRate: number, rng: () => number): number {
  if (critRate < 1) return rollCritical(critRate, rng) ? 1 : 0
  let stacks = Math.floor(critRate)
  const chance = critRate - stacks
  while (chance > 0 && rng() < chance) stacks++
  return stacks
}

/** スーパークリティカルの倍率 = クリティカル倍率 ^ 重なった回数（1重なら通常のクリティカル倍率と同じ） */
export function criticalMultiplierForStacks(critDamageMultiplier: number, stacks: number): number {
  return stacks <= 0 ? 1 : Math.pow(critDamageMultiplier, stacks)
}

// ─────────────────────────────────────────────────────────────
// 丸め・HP反映
// ─────────────────────────────────────────────────────────────

/** ダメージをシールド優先で消費しつつHPへ反映する。切り捨てはここで1回のみ行う */
export function applyDamage(
  target: Combatant,
  rawDamage: number,
  onShieldBreak?: () => void,
): number {
  const dmg = Math.floor(Math.max(0, rawDamage))
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, dmg)
    target.shield -= absorbed
    const rest = dmg - absorbed
    if (rest > 0) target.hp -= rest
    if (target.shield === 0) onShieldBreak?.()
  } else {
    target.hp -= dmg
  }
  if (target.hp <= 0) {
    target.hp = 0
    target.alive = false
  }
  return dmg
}

/** 回復をHPへ反映する。最大HPでクランプする */
export function applyHeal(target: Combatant, rawHeal: number, maxHp: number): number {
  const heal = Math.floor(Math.max(0, rawHeal))
  const before = target.hp
  target.hp = Math.min(maxHp, target.hp + heal)
  return target.hp - before
}

/** シールドを付与する（複数回付与時は加算） */
export function applyShield(target: Combatant, rawAmount: number): number {
  const amount = Math.floor(Math.max(0, rawAmount))
  target.shield += amount
  return amount
}
