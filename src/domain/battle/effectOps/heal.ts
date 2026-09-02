/**
 * domain/battle/effectOps/heal.ts
 * 回復。命中判定・カット率・属性相性は適用しない。クリティカルは適用する。
 */

import type { EffectContext, EffectNode, EffectOp, StatKey, Element } from '../types'
import { computeOutgoingHeal, computeFinalHeal, rollCritical, applyHeal } from '../damageCalc'
import { levelMultiplier, collectEffectMultiplier } from '../stats'

interface HealParams {
  element: Element
  scale: { stat: StatKey; rate: number }
}

function readParams(node: EffectNode): HealParams {
  const scale = node.scale as { stat: string; rate: number }
  return { element: node.element as Element, scale: { stat: scale.stat as StatKey, rate: scale.rate } }
}

/** 対象側の被回復倍率（加算スタック）。特性・パッシブから収集する */
function healTakenMultiplier(target: EffectContext['targets'][number], ctx: EffectContext): number {
  const rates: number[] = []
  for (const t of target.traits) {
    const def = ctx.content.traits.get(t.id)
    if (!def) continue
    for (const eff of def.effect) {
      if (eff.op === 'healTaken' && typeof eff.rate === 'number') rates.push(eff.rate)
    }
  }
  return 1 + rates.reduce((a, b) => a + b, 0)
}

export const healOp: EffectOp = {
  id: 'heal',
  execute(node, ctx) {
    const { element, scale } = readParams(node)
    const sourceStats = ctx.getEffective(ctx.source)
    const referenceValue = sourceStats[scale.stat]
    const mult = ctx.skill.kind === 'active' ? levelMultiplier(ctx.level) : 1
    const scaleRate = scale.rate * mult

    for (const target of ctx.targets) {
      if (!target.alive) continue
      const isCrit = rollCritical(sourceStats.critRate, ctx.rng)
      const critMultiplier = isCrit ? sourceStats.critDamageMultiplier : 1

      const effectMultiplier = collectEffectMultiplier(ctx.source, element, ctx.content)
      const outgoing = computeOutgoingHeal({
        referenceValue, scaleRate, critMultiplier, effectMultiplier,
      })
      const finalHeal = computeFinalHeal({
        outgoingHeal: outgoing,
        healTakenMultiplier: healTakenMultiplier(target, ctx),
      })

      const maxHp = ctx.getEffective(target).hp
      applyHeal(target, finalHeal, maxHp)

      ctx.emit({ effectId: 'fx_heal', targetRef: 'target', combatantId: target.id,
        payload: { text: `+${Math.floor(finalHeal)}`, skillId: ctx.skill.id } })
      if (isCrit) ctx.emit({ effectId: 'fx_critical', targetRef: 'target', combatantId: target.id })
    }
  },
}
