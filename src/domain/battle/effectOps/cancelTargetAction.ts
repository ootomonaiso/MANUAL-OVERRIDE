/**
 * domain/battle/effectOps/cancelTargetAction.ts
 * 不意打ち 用: 一定確率で、対象のこのラウンドの行動をキャンセルする。
 * 実際のキャンセルは Combatant.skipNextTurn を立てるだけで、消費（行動速度キューで
 * 実際に飛ばす）は composables/useBattleState.ts::processTurns が行う。
 * `chance` は確率のため、critRate等と同様スキルレベル倍率を掛けない。
 */

import type { EffectNode, EffectOp } from '../types'

export const cancelTargetActionOp: EffectOp = {
  id: 'cancelTargetAction',
  execute(node: EffectNode, ctx) {
    const chance = node.chance as number
    for (const target of ctx.targets) {
      if (!target.alive) continue
      if (ctx.rng() < chance) {
        target.skipNextTurn = true
        ctx.emit({ effectId: 'fx_debuff', targetRef: 'target', combatantId: target.id, payload: { text: '行動不能', skillId: ctx.skill.id } })
      }
    }
  },
}
