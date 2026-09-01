/**
 * domain/battle/stats.ts
 * 実効値の算出（docs/genre/rpg/02-stats.md）。
 */

import { BATTLE } from '../../data/tunables'
import type {
  BattleStats, EffectiveStats, StatKey, StatModifier,
  Combatant, TemporaryModifier, SkillDef,
} from './types'

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 実効値 = (基礎値 + 実数バフ) × 倍率バフ */
export function computeEffective(base: number, mod: StatModifier): number {
  return (base + mod.flat) * Math.max(0, mod.mult)
}

/** 倍率バフは加算スタック: 1 + Σ(各倍率分) */
export function stackMultipliers(rates: readonly number[]): number {
  return 1 + rates.reduce((sum, r) => sum + r, 0)
}

/**
 * ある対象・あるステータスに現在有効な補正を、所持特性・パッシブ・一時効果から集める。
 * 効果量にはスキルレベルの倍率（2^Lv - 1）が既に反映された amount/rate を渡すこと。
 */
export function collectModifier(
  statKey: StatKey,
  temporary: readonly TemporaryModifier[],
  passiveFlats: readonly number[],
  passiveRates: readonly number[],
): StatModifier {
  let flat = passiveFlats.reduce((a, b) => a + b, 0)
  const rates = [...passiveRates]
  for (const t of temporary) {
    if (t.stat !== statKey) continue
    if (t.flat) flat += t.flat
    if (t.rate) rates.push(t.rate)
  }
  return { flat, mult: stackMultipliers(rates) }
}

/** レベルによる効果量倍率: 2^Lv - 1（Lv1〜4: ×1,×3,×7,×15）。特性は常に Lv1 相当 */
export function levelMultiplier(level: number): number {
  return Math.pow(2, level) - 1
}

/**
 * 対象の実効ステータスをまとめて算出する。
 * modifiers はステータスごとに事前集計した補正（呼び出し側が passives/traits を解決して渡す）。
 */
export function computeEffectiveStats(
  base: BattleStats,
  modifiers: Partial<Record<StatKey, StatModifier>>,
): EffectiveStats {
  const result = {} as EffectiveStats
  for (const key of Object.keys(base) as StatKey[]) {
    if (key === 'evadeRate') continue   // 導出値。下で別途計算
    const mod = modifiers[key] ?? { flat: 0, mult: 1 }
    result[key] = computeEffective(base[key], mod)
  }
  // hitRate はクランプしない（100%超えを許容。実効命中率の算出時にのみクランプする）
  // critRate / critDamageMultiplier もクランプなし（仕様上、上限規定なし）

  const agiEffective = result.agi
  const evadeBase = deriveEvadeBase(agiEffective)
  const evadeMod = modifiers.evadeRate ?? { flat: 0, mult: 1 }
  const evadeRaw = computeEffective(evadeBase, evadeMod)
  result.evadeRate = clamp(evadeRaw, 0, BATTLE.evade.max)

  return result
}

/** 回避率の基礎値: (AGIの実効値 - anchor) / divisor */
export function deriveEvadeBase(agiEffective: number): number {
  return (agiEffective - BATTLE.evade.anchor) / BATTLE.evade.divisor
}

/**
 * skill/trait/passive の効果ノードから、対象キャラの一時/恒常補正を再構築するための
 * 集計器。実際の実効値計算は computeEffectiveStats に委譲する。
 */
export interface FlatRateAccumulator {
  flat: Partial<Record<StatKey, number[]>>
  rate: Partial<Record<StatKey, number[]>>
}

export function newAccumulator(): FlatRateAccumulator {
  return { flat: {}, rate: {} }
}

export function addFlat(acc: FlatRateAccumulator, stat: StatKey, amount: number): void {
  (acc.flat[stat] ??= []).push(amount)
}

export function addRate(acc: FlatRateAccumulator, stat: StatKey, rate: number): void {
  (acc.rate[stat] ??= []).push(rate)
}

export function toModifiers(acc: FlatRateAccumulator): Partial<Record<StatKey, StatModifier>> {
  const out: Partial<Record<StatKey, StatModifier>> = {}
  const keys = new Set([...Object.keys(acc.flat), ...Object.keys(acc.rate)]) as Set<StatKey>
  for (const key of keys) {
    const flats = acc.flat[key] ?? []
    const rates = acc.rate[key] ?? []
    out[key] = {
      flat: flats.reduce((a, b) => a + b, 0),
      mult: stackMultipliers(rates),
    }
  }
  return out
}

/**
 * パッシブによる statBoost 効果を集計する（effectOps から独立して参照できるよう
 * skillDraft/battleEngine 双方から使う純粋関数として stats.ts に置く）。
 */
export function accumulatePassiveStatBoosts(
  owned: ReadonlyArray<{ level: number; def: SkillDef }>,
  acc: FlatRateAccumulator,
): void {
  for (const { level, def } of owned) {
    const mult = def.kind === 'trait' ? 1 : levelMultiplier(level)
    for (const node of def.effect) {
      if (node.op !== 'statBoost') continue
      const stat = node.stat as StatKey
      if (typeof node.amount === 'number') addFlat(acc, stat, node.amount * mult)
      if (typeof node.rate === 'number') addRate(acc, stat, node.rate * mult)
    }
  }
}

/** 一時効果（守る/避ける等）を temporary リストへ変換するヘルパー */
export function buildTemporaryFromBuiltin(
  stat: 'cutRate' | 'evadeRate',
  amount: number,
  sourceId: string,
): TemporaryModifier {
  return { stat: stat as never, flat: amount, scope: 'thisTurn', sourceId }
}

export function currentMaxHp(c: Combatant, effective: EffectiveStats): number {
  return effective.hp > 0 ? effective.hp : 1
}

/** 最大HPが変化した際、現在HPを新しい最大HPでクランプする */
export function clampHpToMax(c: Combatant, newMaxHp: number): void {
  if (c.hp > newMaxHp) c.hp = newMaxHp
}
