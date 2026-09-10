/**
 * domain/battle/effectOps/periodicTargetDamage.ts
 * 風の剣 用: 自身にバフとして登録し、ラウンド終了時に相手側全体へ直接ダメージを与える。
 * 実際のHP減算はここでは行わない —— battleEngine.ts::endOfRound の
 * applyPeriodicTargetEffects() が毎ラウンド処理する（periodicSelfDamage と同じ方針で
 * シールド・カット率を無視する）。
 * 同一スキル由来（sourceId）の効果が重複した場合は新規に増やさず、残存ラウンド数を延長する
 * （同時に2つ発生しない、というユーザー確定仕様）。
 */

import type { Element, EffectNode, EffectOp, StatKey } from '../types'
import { levelMultiplier } from '../stats'

export const periodicTargetDamageOp: EffectOp = {
  id: 'periodicTargetDamage',
  execute(node: EffectNode, ctx) {
    const element = node.element as Element
    const scale = node.scale as { stat: StatKey; rate: number }
    const duration = node.duration as number
    const mult = ctx.skill.kind === 'active' ? levelMultiplier(ctx.level) : 1
    const rate = scale.rate * mult

    const existing = ctx.source.periodicTargetEffects.find(pe => pe.sourceId === ctx.skill.id)
    if (existing) {
      existing.roundsRemaining += duration
    } else {
      ctx.source.periodicTargetEffects.push({
        element, scaleStat: scale.stat, rate, roundsRemaining: duration, sourceId: ctx.skill.id,
      })
    }
  },
}
