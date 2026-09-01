/**
 * domain/battle/effectOps/shield.ts
 * シールド付与。回復と同じく命中判定・カット率・属性相性は適用せず、クリティカルは適用する。
 * 複数回の付与は加算（applyShield 側で担保）。
 */

import type { EffectNode, EffectOp, StatKey, Element } from '../types'
import { rollCritical, applyShield } from '../damageCalc'
import { levelMultiplier, collectEffectMultiplier } from '../stats'

interface ShieldParams {
  element: Element
  scale: { stat: StatKey; rate: number }
}

function readParams(node: EffectNode): ShieldParams {
  const scale = node.scale as { stat: string; rate: number }
  return { element: node.element as Element, scale: { stat: scale.stat as StatKey, rate: scale.rate } }
}

export const shieldOp: EffectOp = {
  id: 'shield',
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
      const amount = referenceValue * scaleRate * critMultiplier * effectMultiplier

      applyShield(target, amount)

      ctx.emit({ effectId: 'fx_shield_gain', targetRef: 'target', combatantId: target.id,
        payload: { text: `+${Math.floor(amount)}` } })
      if (isCrit) ctx.emit({ effectId: 'fx_critical', targetRef: 'target', combatantId: target.id })
    }
  },
}
