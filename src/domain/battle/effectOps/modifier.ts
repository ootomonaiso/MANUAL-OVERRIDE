/**
 * domain/battle/effectOps/modifier.ts
 * 一時的な補正を付与する。既定は発動元(source)への付与
 * （「最後の攻撃のみクリティカル率上昇」のような自己バフの表現のため）。
 * 対象へ与えるデバフには applyTo: "target" を指定する。
 */

import type { EffectNode, EffectOp, StatKey, ModifierScope } from '../types'
import { levelMultiplier } from '../stats'

interface ModifierParams {
  stat: StatKey | 'cutRate'
  amount?: number
  rate?: number
  scope: ModifierScope
  applyTo?: 'source' | 'target'
}

function readParams(node: EffectNode): ModifierParams {
  return {
    stat: node.stat as StatKey | 'cutRate',
    amount: node.amount as number | undefined,
    rate: node.rate as number | undefined,
    scope: node.scope as ModifierScope,
    applyTo: (node.applyTo as 'source' | 'target' | undefined) ?? 'source',
  }
}

export const modifierOp: EffectOp = {
  id: 'modifier',
  execute(node, ctx) {
    const { stat, amount, rate, scope, applyTo } = readParams(node)
    const mult = ctx.skill.kind === 'active' ? levelMultiplier(ctx.level) : 1
    const recipients = applyTo === 'target' ? ctx.targets : [ctx.source]
    for (const recipient of recipients) {
      if (!recipient.alive) continue
      recipient.temporary.push({
        stat,
        flat: amount !== undefined ? amount * mult : undefined,
        rate: rate !== undefined ? rate * mult : undefined,
        scope,
        sourceId: ctx.skill.id,
      })
      const isBuff = (amount ?? 0) >= 0 && (rate ?? 0) >= 0
      ctx.emit({ effectId: isBuff ? 'fx_buff' : 'fx_debuff', targetRef: applyTo === 'target' ? 'target' : 'source',
        combatantId: recipient.id })
    }
  },
}
