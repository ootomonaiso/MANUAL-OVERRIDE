/**
 * domain/battle/effectOps/periodicSelfDamage.ts
 * 龍鱗 用: 継続ダメージ（デバフ扱い）を自身に登録する。実際のHP減算はここでは行わない ——
 * battleEngine.ts::endOfRound の applyPeriodicSelfEffects() が毎ラウンド処理する
 * （シールド・カット率を無視して直接HPを減らす。自滅を許容する）。
 * ratio にはスキルレベル倍率を掛けない（「毎ターン最大HPの15%を失う」という固定コストのため）。
 */

import type { EffectNode, EffectOp } from '../types'

export const periodicSelfDamageOp: EffectOp = {
  id: 'periodicSelfDamage',
  execute(node: EffectNode, ctx) {
    const ratio = node.ratio as number
    ctx.source.periodicSelfEffects.push({ kind: 'trueDamagePercentMaxHp', ratio, sourceId: ctx.skill.id })
  },
}
