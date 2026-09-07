/**
 * domain/battle/effectOps/selfDamageFromDealt.ts
 * 烙天 用: 直前までにこの発動で与えた合計ダメージ（`ctx.dealtDamage.total`。範囲攻撃なら
 * 命中したヒットすべての合計）に、外れた対象の分（`ctx.dealtDamage.missedPotential`。
 * クリティカルなし想定・damage op が命中判定時に計上）を加えた合計の一定割合を
 * 自傷ダメージとして受ける。外れを狙って自傷を回避することはできない（内部仕様）。
 * periodicSelfDamage と同じ方針でシールド・カット率を経由せず直接HPを減らす（防ぎようがない）。
 * ただし、このダメージで相手側が全滅していた場合（＝この一撃で決着がついていた場合）は
 * 自傷ダメージを受けない（ユーザー確定仕様）。
 */

import type { EffectNode, EffectOp } from '../types'

export const selfDamageFromDealtOp: EffectOp = {
  id: 'selfDamageFromDealt',
  execute(node: EffectNode, ctx) {
    const rate = node.rate as number
    const opposing = ctx.source.isPlayer ? ctx.state.enemies : [ctx.state.player]
    if (opposing.every(t => !t.alive)) return

    const dmg = Math.floor((ctx.dealtDamage.total + ctx.dealtDamage.missedPotential) * rate)
    if (dmg <= 0) return
    ctx.source.hp = Math.max(0, ctx.source.hp - dmg)
    ctx.emit({ effectId: 'fx_debuff', targetRef: 'source', combatantId: ctx.source.id, payload: { text: `-${dmg}`, skillId: ctx.skill.id } })
    if (ctx.source.hp <= 0) {
      ctx.source.alive = false
      ctx.emit({ effectId: 'fx_defeat', targetRef: 'source', combatantId: ctx.source.id })
    }
  },
}
