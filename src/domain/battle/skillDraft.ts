/**
 * domain/battle/skillDraft.ts
 * ドラフト抽選・入れ替え・レベルアップ・カテゴリポイント（docs/genre/rpg/06-draft.md）。
 */

import { BATTLE } from '../../data/tunables'
import type {
  BattleState, BattleContent, Combatant, DraftOption, CategoryId, StatKey,
  ActiveSkillDef, PassiveSkillDef,
} from './types'
import { CATEGORY_IDS } from './types'

// ─────────────────────────────────────────────────────────────
// スキルレベルアップ
// ─────────────────────────────────────────────────────────────

/**
 * index = 現在レベル、値 = 次のレベルに必要な重複取得数。
 * 当初は [0, 1, 3, 5] だったが、Lv1→Lv2 の1個で levelMultiplier が ×1→×3 に跳ね上がり
 * 「もう1回引いただけで3倍」になって強すぎたため、初手のジャンプを緩めて [0, 2, 3, 4] にした。
 * Lv4到達までの合計必要数は9個のままで変えていない（levelMultiplier のバランス根拠を崩さないため）。
 */
export const STACKS_REQUIRED = [0, 2, 3, 4] as const

/** 重複取得によりスタックを1つ加算し、必要数に達したらレベルアップさせる（Lv4で頭打ち） */
export function addStack(owned: { level: number; stacks: number }): void {
  if (owned.level >= 4) return
  owned.stacks++
  const required = STACKS_REQUIRED[owned.level]
  if (owned.stacks >= required) {
    owned.level++
    owned.stacks -= required
  }
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

function isSlotsFull(player: Combatant): boolean {
  return player.actives.filter(a => a.slotIndex !== null).length >= 4
}

function buildCandidatePool(
  player: Combatant, content: BattleContent, points: Record<CategoryId, number>,
): DraftOption[] {
  const pool: DraftOption[] = []
  const ownedTraitIds = new Set(player.traits.map(t => t.id))

  for (const def of content.skills.values()) {
    if (def.draftable === false) continue
    if (def.unlockCondition && (points[def.unlockCondition.category] ?? 0) < def.unlockCondition.points) continue

    if (def.kind === 'active') {
      const owned = player.actives.find(a => a.id === def.id)
      if (owned && owned.level >= 4) continue
      pool.push({
        kind: 'active', id: def.id,
        currentLevel: owned?.level, currentStacks: owned?.stacks,
        isUnlocked: !!def.unlockCondition,
        requiresSwap: !owned && isSlotsFull(player),
      })
    } else {
      const owned = player.passives.find(p => p.id === def.id)
      if (owned && owned.level >= 4) continue
      pool.push({
        kind: 'passive', id: def.id,
        currentLevel: owned?.level, currentStacks: owned?.stacks,
        isUnlocked: !!def.unlockCondition,
      })
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

/** アクティブ枠が全て埋まっていて、なおかつ入れ替え不要な候補（パッシブ・特性・所持スキルの重複取得） */
function requiresSwap(opt: DraftOption): boolean {
  return opt.kind === 'active' && opt.requiresSwap === true
}

/** 撃破後の3択を抽選する。重複しない3件。候補が足りなければステータス微増で埋める */
export function rollDraft(player: Combatant, content: BattleContent, rng: () => number): DraftOption[] {
  const points = accumulateCategoryPoints(player, content)
  const pool = shuffle(buildCandidatePool(player, content, points), rng)

  const picked: DraftOption[] = []
  const usedIds = new Set<string>()

  // アクティブ枠が全て埋まっている時、3択が「入れ替えないと選べないアクティブ」だけに
  // なると、変えたくない編成でも強制的に入れ替えを迫られてしまう。入れ替え不要な候補が
  // プールに1つでもあれば、それを最初の1枠として確保しておく。
  if (isSlotsFull(player)) {
    const safe = pool.find(opt => !requiresSwap(opt))
    if (safe) { picked.push(safe); usedIds.add(safe.id) }
  }

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

export interface DraftApplyResult {
  needsSwapSelection: boolean
}

/** ドラフトで選んだ1件をプレイヤーへ適用する */
export function applyDraftChoice(
  state: BattleState, option: DraftOption,
): DraftApplyResult {
  const player = state.player

  if (option.isFallback && option.fallbackStat) {
    const amount = option.fallbackStat === 'hp' ? BATTLE.fallbackStatBoost.hp : BATTLE.fallbackStatBoost.other
    player.temporary.push({ stat: option.fallbackStat, flat: amount, scope: 'permanent', sourceId: 'fallback' })
    return { needsSwapSelection: false }
  }

  if (option.kind === 'trait') {
    player.traits.push({ id: option.id })
    return { needsSwapSelection: false }
  }

  if (option.kind === 'passive') {
    const existing = player.passives.find(p => p.id === option.id)
    if (existing) addStack(existing)
    else player.passives.push({ id: option.id, level: 1, stacks: 0 })
    return { needsSwapSelection: false }
  }

  // active
  const existing = player.actives.find(a => a.id === option.id)
  if (existing) {
    addStack(existing)
    return { needsSwapSelection: false }
  }
  const freeSlot = findFreeSlotIndex(player)
  if (freeSlot !== null) {
    player.actives.push({ id: option.id, level: 1, stacks: 0, cooldown: 0, slotIndex: freeSlot })
    return { needsSwapSelection: false }
  }
  state.pendingSwapSkillId = option.id
  return { needsSwapSelection: true }
}

function findFreeSlotIndex(player: Combatant): number | null {
  const used = new Set(player.actives.filter(a => a.slotIndex !== null).map(a => a.slotIndex))
  for (let i = 0; i < 4; i++) if (!used.has(i)) return i
  return null
}

/** 入れ替え先の枠を確定する。外れたスキルはレベル・スタックを保持したまま保管中になる */
export function confirmSwap(player: Combatant, pendingSkillId: string, targetSlotIndex: number): void {
  const outgoing = player.actives.find(a => a.slotIndex === targetSlotIndex)
  if (outgoing) outgoing.slotIndex = null
  player.actives.push({ id: pendingSkillId, level: 1, stacks: 0, cooldown: 0, slotIndex: targetSlotIndex })
}
