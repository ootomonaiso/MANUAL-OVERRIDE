/**
 * domain/battle/damagePreview.ts
 *
 * 「敵が次に使う技でどれくらい削られるか」を戦う前に見せるための見積り。
 * 実ダメージ計算（damageCalc）と同じ式を使うが、乱数要素（命中・クリティカル）は
 * 平均ではなく「当たった・クリティカルではない」場合として扱う。
 * 予告はあくまで判断材料であり、実際の値と1の位まで一致させる必要はない。
 */

import type {
  BattleContent, Combatant, EffectNode, EffectiveStats, Element, SkillDef, StatKey,
} from './types'
import {
  computeFinalCutRate, computeAffinityStage, computeOutgoingDamage, computeFinalDamage,
} from './damageCalc'
import { levelMultiplier, collectEffectMultiplier } from './stats'
import { BATTLE } from '../../data/tunables'

export type DamageMagnitude = 'none' | 'small' | 'medium' | 'large' | 'lethal'

/** 最大HPに対する割合で段階を分ける。境目は「何回耐えられるか」が変わる点に置く */
const MAGNITUDE_THRESHOLDS: readonly { max: number; level: DamageMagnitude }[] = [
  { max: 0.001, level: 'none' },
  { max: 0.12, level: 'small' },
  { max: 0.3, level: 'medium' },
  { max: 0.6, level: 'large' },
]

export const MAGNITUDE_LABEL: Record<DamageMagnitude, string> = {
  none: '無傷',
  small: '小ダメージ',
  medium: '中ダメージ',
  large: '大ダメージ',
  lethal: '致命傷',
}

function shieldCutRateFor(element: Element): number {
  return element === 'special' ? BATTLE.shield.cutRateVsSpecial : BATTLE.shield.cutRate
}

function collectTraitCutRates(target: Combatant, content: BattleContent): number[] {
  const rates: number[] = []
  for (const t of target.traits) {
    const def = content.traits.get(t.id)
    if (!def) continue
    for (const eff of def.effect) {
      if (eff.op === 'cutRate' && typeof eff.amount === 'number') rates.push(eff.amount)
    }
  }
  return rates
}

function readTemporaryCutRate(c: Combatant): number {
  return c.temporary.filter(m => m.stat === 'cutRate').reduce((sum, m) => sum + (m.flat ?? 0), 0)
}

/** damage オペレーションを再帰的に拾い、repeat の回数ぶんだけ足し合わせる */
function sumDamageNodes(
  nodes: readonly EffectNode[],
  onDamage: (element: Element, stat: StatKey, rate: number) => number,
): number {
  let total = 0
  for (const node of nodes) {
    if (node.op === 'damage') {
      const scale = node.scale as { stat: StatKey; rate: number } | undefined
      if (!scale) continue
      total += onDamage(node.element as Element, scale.stat, scale.rate)
      continue
    }
    if (node.op === 'repeat') {
      const times = typeof node.times === 'number' ? node.times : 1
      const body = Array.isArray(node.body) ? (node.body as EffectNode[]) : []
      total += sumDamageNodes(body, onDamage) * times
      for (const key of ['onFirstIteration', 'onLastIteration'] as const) {
        const extra = node[key]
        if (Array.isArray(extra)) total += sumDamageNodes(extra as EffectNode[], onDamage)
      }
    }
  }
  return total
}

/**
 * source が skill を使ったときに target が受けるダメージの見積り。
 * 命中は必中・クリティカルなしとして計算する。
 */
export function estimateSkillDamage(params: {
  source: Combatant
  target: Combatant
  skill: SkillDef
  level: number
  content: BattleContent
  getEffective: (c: Combatant) => EffectiveStats
}): number {
  const { source, target, skill, level, content, getEffective } = params
  const sourceStats = getEffective(source)
  const targetStats = getEffective(target)
  const mult = skill.kind === 'active' ? levelMultiplier(level) : 1
  const traitCutRates = collectTraitCutRates(target, content)
  const guardCutRate = readTemporaryCutRate(target)

  return sumDamageNodes(skill.effect, (element, stat, rate) => {
    const effectMultiplier = collectEffectMultiplier(source, element, content)
    const outgoing = computeOutgoingDamage({
      referenceValue: sourceStats[stat],
      scaleRate: rate * mult,
      critMultiplier: 1,
      effectMultiplier,
    })
    const finalCutRate = computeFinalCutRate({
      element,
      target: targetStats,
      traitCutRates,
      shieldCutRate: target.shield > 0 ? shieldCutRateFor(element) : 0,
      guardCutRate,
    })
    const affinityStage = computeAffinityStage(element, target.traits, content.traits)
    return computeFinalDamage({ outgoingDamage: outgoing, finalCutRate, affinityStage })
  })
}

/** 見積りダメージを最大HPと比べて段階に落とす */
export function damageMagnitude(damage: number, targetMaxHp: number): DamageMagnitude {
  if (targetMaxHp <= 0) return 'none'
  const ratio = damage / targetMaxHp
  for (const t of MAGNITUDE_THRESHOLDS) {
    if (ratio < t.max) return t.level
  }
  return 'lethal'
}
