/**
 * domain/battle/effectOps/modifier.ts
 * 一時的な補正を付与する。既定は発動元(source)への付与
 * （「最後の攻撃のみクリティカル率上昇」のような自己バフの表現のため）。
 * 対象へ与えるデバフには applyTo: "target" を指定する。
 */

import type { EffectNode, EffectOp, StatKey, ModifierScope } from '../types'
import { isPercentStat } from '../types'
import { levelMultiplier } from '../stats'

interface ModifierParams {
  stat: StatKey | 'cutRate'
  amount?: number
  rate?: number
  /** 発動時点の自分の実効ステータスを参照して amount を決める（例: STR参照でDEFを強化）。amount と併用時は加算される */
  scale?: { stat: StatKey; rate: number }
  scope: ModifierScope
  /** scope: 'rounds' のときだけ使う持続ラウンド数 */
  rounds?: number
  applyTo?: 'source' | 'target'
}

function readParams(node: EffectNode): ModifierParams {
  const scale = node.scale as { stat: string; rate: number } | undefined
  return {
    stat: node.stat as StatKey | 'cutRate',
    amount: node.amount as number | undefined,
    rate: node.rate as number | undefined,
    scale: scale ? { stat: scale.stat as StatKey, rate: scale.rate } : undefined,
    scope: node.scope as ModifierScope,
    rounds: node.rounds as number | undefined,
    applyTo: (node.applyTo as 'source' | 'target' | undefined) ?? 'source',
  }
}

export const modifierOp: EffectOp = {
  id: 'modifier',
  execute(node, ctx) {
    const { stat, amount, rate, scale, scope, rounds, applyTo } = readParams(node)
    // 割合ステータス（クリティカル率等）はレベル倍率を掛けない。掛けると
    // レベルアップのたびに「確率」や「倍率」自体が指数的に膨張し、特に
    // critRate/critDamageMultiplier はスーパークリティカルと絡んで際限なく
    // 暴走する（PERCENT_STAT_KEYS のコメント参照）。
    const mult = isPercentStat(stat) ? 1 : (ctx.skill.kind === 'active' ? levelMultiplier(ctx.level) : 1)
    // scale は常に発動元(source)の実効ステータスを参照する（damage/heal/shield の scale と同じ規約）。
    // applyTo:'target' のデバフでも「かける側の力量」で量を決めたいことがあるため、対象側ではなく発動元を見る
    const scaleAmount = scale ? ctx.getEffective(ctx.source)[scale.stat] * scale.rate : undefined
    const combinedAmount = amount !== undefined || scaleAmount !== undefined
      ? (amount ?? 0) + (scaleAmount ?? 0)
      : undefined
    const recipients = applyTo === 'target' ? ctx.targets : [ctx.source]
    for (const recipient of recipients) {
      if (!recipient.alive) continue
      recipient.temporary.push({
        stat,
        flat: combinedAmount !== undefined ? combinedAmount * mult : undefined,
        rate: rate !== undefined ? rate * mult : undefined,
        scope,
        roundsRemaining: scope === 'rounds' ? rounds : undefined,
        sourceId: ctx.skill.id,
      })
      const isBuff = (combinedAmount ?? 0) >= 0 && (rate ?? 0) >= 0
      ctx.emit({ effectId: isBuff ? 'fx_buff' : 'fx_debuff', targetRef: applyTo === 'target' ? 'target' : 'source',
        combatantId: recipient.id })
    }
  },
}
