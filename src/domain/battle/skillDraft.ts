/**
 * domain/battle/skillDraft.ts
 * ドラフト抽選・入れ替え・レベルアップ・カテゴリポイント（docs/genre/rpg/06-draft.md）。
 */

import { BATTLE, SKILL_POINTS } from '../../data/tunables'
import type {
  BattleState, BattleContent, Combatant, DraftOption, CategoryId, StatKey,
  ActiveSkillDef, PassiveSkillDef, OwnedActive,
} from './types'
import { CATEGORY_IDS } from './types'

// ─────────────────────────────────────────────────────────────
// スキルポイント制度（第7フェーズ）
// ─────────────────────────────────────────────────────────────

/** アクティブの最大レベル（levelMultiplier が頭打ちになる Lv） */
export const MAX_ACTIVE_LEVEL = SKILL_POINTS.pointsForLevel.length
/** Lv4到達に必要な累計ポイント（配分・重複取得の上限） */
export const MAX_ACTIVE_POINTS = SKILL_POINTS.pointsForLevel[MAX_ACTIVE_LEVEL - 1]

/** 累計投資ポイントから実効レベルを導出する（pointsForLevel: index=レベル-1、値=そのレベルへの必要累計値） */
export function levelForPoints(points: number): number {
  let level = 1
  for (let l = 2; l <= MAX_ACTIVE_LEVEL; l++) {
    if (points >= SKILL_POINTS.pointsForLevel[l - 1]) level = l
  }
  return level
}

/** アクティブへポイントを加算し、level を同期させる（上限 MAX_ACTIVE_POINTS で頭打ち）。実際に加算できた量を返す */
export function addActivePoints(owned: OwnedActive, amount: number): number {
  const before = owned.points
  owned.points = Math.min(MAX_ACTIVE_POINTS, owned.points + amount)
  owned.level = levelForPoints(owned.points)
  return owned.points - before
}

// ─────────────────────────────────────────────────────────────
// カテゴリポイント
// ─────────────────────────────────────────────────────────────

export function zeroCategoryPoints(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>
  for (const id of CATEGORY_IDS) out[id] = 0
  return out
}

/** サブカテゴリ合計重み T(N) = 0.75 - 0.25(N-2)^2 を N で割った各サブの重み */
export function subCategoryWeight(n: number): number {
  if (n <= 0) return 0
  const total = 0.75 - 0.25 * Math.pow(n - 2, 2)
  return total / n
}

/** 1つのスキルが、指定カテゴリへ何ポイント寄与するか（主カテゴリはそのまま、副カテゴリは重み付き） */
function contributionAmount(
  def: ActiveSkillDef | PassiveSkillDef, category: CategoryId, base: number,
): number {
  if (def.mainCategory === category) return base
  if (def.subCategories.includes(category)) return base * subCategoryWeight(def.subCategories.length)
  return 0
}

/** 保管中（slotIndex === null）のアクティブスキルはカテゴリポイントに寄与しない */
export function accumulateCategoryPoints(player: Combatant, content: BattleContent): Record<CategoryId, number> {
  const points = zeroCategoryPoints()
  const add = (cat: CategoryId, amount: number) => { points[cat] += amount }

  for (const a of player.actives) {
    if (a.slotIndex === null) continue
    const def = content.skills.get(a.id)
    if (!def || def.kind !== 'active') continue
    const base = 3 * a.level
    add(def.mainCategory, base)
    const w = subCategoryWeight(def.subCategories.length)
    for (const sub of def.subCategories) add(sub, base * w)
  }
  for (const p of player.passives) {
    const def = content.skills.get(p.id)
    if (!def || def.kind !== 'passive') continue
    const base = 1 * p.level
    add(def.mainCategory, base)
    const w = subCategoryWeight(def.subCategories.length)
    for (const sub of def.subCategories) add(sub, base * w)
  }
  return points
}

export interface CategoryContribution {
  id: string
  label: string
  amount: number
}

/** カテゴリ1つぶんの内訳。カテゴリ一覧パネルで「何が効いているか」を見せるのに使う */
export function categoryContributionsOf(
  player: Combatant, content: BattleContent, category: CategoryId,
): CategoryContribution[] {
  const out: CategoryContribution[] = []
  for (const a of player.actives) {
    if (a.slotIndex === null) continue
    const def = content.skills.get(a.id)
    if (!def || def.kind !== 'active') continue
    const amount = contributionAmount(def, category, 3 * a.level)
    if (amount > 0) out.push({ id: a.id, label: def.label, amount })
  }
  for (const p of player.passives) {
    const def = content.skills.get(p.id)
    if (!def || def.kind !== 'passive') continue
    const amount = contributionAmount(def, category, 1 * p.level)
    if (amount > 0) out.push({ id: p.id, label: def.label, amount })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

/** カテゴリ一覧パネルの「次のしきい値」。すべて超えていれば最後のしきい値のまま頭打ちにする */
export function nextCategoryThreshold(current: number): number {
  const next = BATTLE.categoryUnlockThresholds.find(t => t > current)
  return next ?? BATTLE.categoryUnlockThresholds[BATTLE.categoryUnlockThresholds.length - 1]
}

// ─────────────────────────────────────────────────────────────
// ドラフト候補の構築・抽選
// ─────────────────────────────────────────────────────────────

/**
 * ドラフト候補を構築する（第7フェーズで大きく方針転換）。
 * - アクティブ: 未所持は通常候補として1件。セット中（装備済み）は重複候補として
 *   duplicateDraftWeight 倍の重みで出現し、選ぶと+1ポイントが即座に入る。
 *   倉庫保管中（slotIndex===null）は候補に一切出さない（＝重複が二度と出ない）。
 * - パッシブ: 一度でも所持したら以後永久に候補から除外する（重複取得が発生しない）。
 * - 特性: 既存どおり（所持済みを除外するだけ）。
 */
export function buildCandidatePool(
  player: Combatant, content: BattleContent, points: Record<CategoryId, number>,
): DraftOption[] {
  const pool: DraftOption[] = []
  const ownedTraitIds = new Set(player.traits.map(t => t.id))
  const ownedPassiveIds = new Set(player.passives.map(p => p.id))

  for (const def of content.skills.values()) {
    if (def.draftable === false) continue
    if (def.unlockCondition && (points[def.unlockCondition.category] ?? 0) < def.unlockCondition.points) continue

    if (def.kind === 'active') {
      const owned = player.actives.find(a => a.id === def.id)
      if (!owned) {
        pool.push({ kind: 'active', id: def.id, isUnlocked: !!def.unlockCondition })
        continue
      }
      if (owned.slotIndex === null) continue   // 倉庫保管中は候補に出さない
      if (owned.level >= MAX_ACTIVE_LEVEL) continue
      const dup: DraftOption = {
        kind: 'active', id: def.id, currentLevel: owned.level, currentPoints: owned.points, isDuplicate: true,
        isUnlocked: !!def.unlockCondition,
      }
      for (let i = 0; i < SKILL_POINTS.duplicateDraftWeight; i++) pool.push(dup)
    } else {
      if (ownedPassiveIds.has(def.id)) continue   // 一度所持したら二度と候補に出ない
      pool.push({ kind: 'passive', id: def.id, isUnlocked: !!def.unlockCondition })
    }
  }
  for (const def of content.traits.values()) {
    if (def.draftable === false) continue
    if (ownedTraitIds.has(def.id)) continue
    if (def.unlockCondition && (points[def.unlockCondition.category] ?? 0) < def.unlockCondition.points) continue
    pool.push({ kind: 'trait', id: def.id, isUnlocked: !!def.unlockCondition })
  }
  return pool
}

const FALLBACK_STATS: readonly StatKey[] = ['hp', 'str', 'def', 'int', 'ref', 'agi']

function rollFallbackOption(rng: () => number, excluding: readonly StatKey[]): DraftOption {
  const candidates = FALLBACK_STATS.filter(s => !excluding.includes(s))
  const pool = candidates.length > 0 ? candidates : FALLBACK_STATS
  const stat = pool[Math.floor(rng() * pool.length)]
  return { kind: 'passive', id: '__fallback__', isFallback: true, fallbackStat: stat }
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 撃破後の3択を抽選する。重複しない3件（同じ重複候補が複数回入っていても1件扱い）。候補が足りなければステータス微増で埋める */
export function rollDraft(player: Combatant, content: BattleContent, rng: () => number): DraftOption[] {
  const points = accumulateCategoryPoints(player, content)
  const pool = shuffle(buildCandidatePool(player, content, points), rng)

  const picked: DraftOption[] = []
  const usedIds = new Set<string>()
  for (const opt of pool) {
    if (picked.length >= 3) break
    if (usedIds.has(opt.id)) continue
    picked.push(opt)
    usedIds.add(opt.id)
  }
  const usedFallbackStats: StatKey[] = []
  while (picked.length < 3) {
    const fb = rollFallbackOption(rng, usedFallbackStats)
    picked.push(fb)
    if (fb.fallbackStat) usedFallbackStats.push(fb.fallbackStat)
  }
  return picked
}

// ─────────────────────────────────────────────────────────────
// ドラフト選択の適用
// ─────────────────────────────────────────────────────────────

/**
 * ドラフトで選んだ1件をプレイヤーへ適用する。
 * 第7フェーズ以降、新規アクティブは空き枠へ自動セットされるか、空きが無ければ黙って
 * 倉庫（slotIndex: null）へ保管される。ドラフト起因で入れ替え画面（'swapping'）に
 * 割り込むことは無くなった（入れ替えは5戦ごとのスキルパネルでのみ行う）。
 */
export function applyDraftChoice(state: BattleState, option: DraftOption): void {
  const player = state.player

  if (option.isFallback && option.fallbackStat) {
    const amount = option.fallbackStat === 'hp' ? BATTLE.fallbackStatBoost.hp : BATTLE.fallbackStatBoost.other
    player.temporary.push({ stat: option.fallbackStat, flat: amount, scope: 'permanent', sourceId: 'fallback' })
    return
  }

  if (option.kind === 'trait') {
    player.traits.push({ id: option.id })
    return
  }

  if (option.kind === 'passive') {
    if (!player.passives.some(p => p.id === option.id)) {
      player.passives.push({ id: option.id, level: 1 })
    }
    return
  }

  // active
  const existing = player.actives.find(a => a.id === option.id)
  if (existing) {
    addActivePoints(existing, 1)
    return
  }
  player.actives.push({ id: option.id, points: 0, level: 1, cooldown: 0, slotIndex: findFreeSlotIndex(player) })
}

export function findFreeSlotIndex(player: Combatant): number | null {
  const used = new Set(player.actives.filter(a => a.slotIndex !== null).map(a => a.slotIndex))
  for (let i = 0; i < 4; i++) if (!used.has(i)) return i
  return null
}
