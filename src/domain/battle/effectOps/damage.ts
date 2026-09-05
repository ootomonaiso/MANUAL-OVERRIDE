/**
 * domain/battle/effectOps/damage.ts
 * ダメージ付与。命中判定はこの op のみが行う（回復・シールド・バフは行わない）。
 */

import type { EffectContext, EffectNode, EffectOp, StatKey, Element, EffectiveStats } from '../types'
import {
  computeHitChance, rollHit, rollCriticalStacks, criticalMultiplierForStacks,
  computeOutgoingDamage, computeFinalDamage,
  computeFinalCutRate, computeAffinityStage,
  applyDamage,
} from '../damageCalc'
import { levelMultiplier, collectEffectMultiplier } from '../stats'
import { BATTLE } from '../../../data/tunables'
import { emitCriticalEffect } from './criticalFx'

interface DamageParams {
  element: Element
  /** stat（単一ステータス参照）と statOptions（複数のうち実効値が最も高いものを参照。自摸＝STR/INTの高い方 想定）は排他 */
  scale: { stat?: StatKey; statOptions?: StatKey[]; rate: number }
}

function readParams(node: EffectNode): DamageParams {
  const scale = node.scale as { stat?: string; statOptions?: string[]; rate: number }
  return {
    element: node.element as Element,
    scale: {
      stat: scale.stat as StatKey | undefined,
      statOptions: scale.statOptions as StatKey[] | undefined,
      rate: scale.rate,
    },
  }
}

/** scale.stat（単一） / scale.statOptions（複数のうち実効値が最も高いもの。自摸＝STR/INTの高い方 想定）のどちらでも参照値を取り出す */
function resolveReferenceValue(sourceStats: EffectiveStats, scale: DamageParams['scale']): number {
  if (scale.statOptions && scale.statOptions.length > 0) {
    return Math.max(...scale.statOptions.map(s => sourceStats[s]))
  }
  return sourceStats[scale.stat as StatKey]
}

/** 対象が持つ特性由来のカット率合計を集計する（cutRate op） */
function collectTraitCutRates(target: EffectContext['targets'][number], ctx: EffectContext): number[] {
  const rates: number[] = []
  for (const t of target.traits) {
    const def = ctx.content.traits.get(t.id)
    if (!def) continue
    for (const eff of def.effect) {
      if (eff.op === 'cutRate' && typeof eff.amount === 'number') rates.push(eff.amount)
    }
  }
  return rates
}

export const damageOp: EffectOp = {
  id: 'damage',
  execute(node, ctx) {
    const { element, scale } = readParams(node)
    const sourceStats = ctx.getEffective(ctx.source)
    const referenceValue = resolveReferenceValue(sourceStats, scale)
    const mult = ctx.skill.kind === 'active' ? levelMultiplier(ctx.level) : 1
    const scaleRate = scale.rate * mult

    for (const target of ctx.targets) {
      if (!target.alive) continue
      const targetStats = ctx.getEffective(target)

      const hitChance = computeHitChance(sourceStats.hitRate, targetStats.evadeRate)
      if (!rollHit(hitChance, ctx.rng)) {
        ctx.emit({ effectId: 'fx_miss', targetRef: 'target', combatantId: target.id, payload: { skillId: ctx.skill.id } })
        continue
      }
      // カウンター/反射板: 反撃態勢中の対象への命中は、即時反撃せずキューに積むだけにする。
      // 攻撃側の一連の行動（repeatを含む）が完全に終わってから battleEngine.ts::useActiveSkill が
      // まとめて消費する（多段ヒットへの対応、ユーザー確定仕様）。
      // pendingCounter.element は「反撃自体の属性」と「どの属性の被弾に反応するか」を兼ねる
      // （反射＝受けた属性と同じ属性で返す、という前提。カウンター＝物理のみ、反射板＝魔法のみ反応）
      if (target.pendingCounter && target.pendingCounter.element === element) target.queuedCounterHits++

      const critStacks = rollCriticalStacks(sourceStats.critRate, ctx.rng)
      const critMultiplier = criticalMultiplierForStacks(sourceStats.critDamageMultiplier, critStacks)

      const effectMultiplier = collectEffectMultiplier(ctx.source, element, ctx.content)
      const outgoing = computeOutgoingDamage({
        referenceValue, scaleRate, critMultiplier, effectMultiplier,
      })

      const finalCutRate = computeFinalCutRate({
        element, target: targetStats,
        traitCutRates: collectTraitCutRates(target, ctx),
        shieldCutRate: target.shield > 0 ? shieldCutRateFor(element) : 0,
        guardCutRate: readTemporaryFlat(target, 'cutRate'),
      })
      const affinityStage = computeAffinityStage(element, target.traits, ctx.content.traits)

      const finalDamage = computeFinalDamage({ outgoingDamage: outgoing, finalCutRate, affinityStage })

      let shieldBroke = false
      const absorbedByShield = target.shield > 0
      applyDamage(target, finalDamage, () => { shieldBroke = true })

      ctx.emit({ effectId: `fx_hit_${element}`, targetRef: 'target', combatantId: target.id,
        payload: { text: String(Math.floor(finalDamage)), absorbedByShield, skillId: ctx.skill.id } })
      emitCriticalEffect(ctx, target.id, critStacks)
      if (affinityStage > 0) ctx.emit({ effectId: 'fx_weakness', targetRef: 'target', combatantId: target.id })
      if (affinityStage < 0) ctx.emit({ effectId: 'fx_resisted', targetRef: 'target', combatantId: target.id })
      if (shieldBroke) ctx.emit({ effectId: 'fx_shield_break', targetRef: 'target', combatantId: target.id })
      if (!target.alive) ctx.emit({ effectId: 'fx_defeat', targetRef: 'target', combatantId: target.id })
    }
  },
}

/** シールドのカット率（05-skills.md: 通常20% / 特殊属性に対しては40%） */
export function shieldCutRateFor(element: Element): number {
  return element === 'special' ? BATTLE.shield.cutRateVsSpecial : BATTLE.shield.cutRate
}

function readTemporaryFlat(c: EffectContext['targets'][number], stat: 'cutRate'): number {
  return c.temporary.filter(m => m.stat === stat).reduce((sum, m) => sum + (m.flat ?? 0), 0)
}
