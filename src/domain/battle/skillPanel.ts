/**
 * domain/battle/skillPanel.ts
 * 5戦ごとのスキル/ステータスポイント配分パネル（CLAUDE_TASKS.md 第7フェーズ）。
 * ドラフト（skillDraft.ts）とは別の後処理として、通常のドラフトがすべて終わった後に挟まる。
 */

import { BATTLE } from '../../data/tunables'
import type { BattleState, Combatant, GrowthStatKey } from './types'
import { addActivePoints, findFreeSlotIndex, levelForPoints, MAX_ACTIVE_POINTS } from './skillDraft'

/** パネル: 装備中のアクティブを外して倉庫へ戻す。投資済みポイントは全額 state.skillPoints へ還元される */
export function unequipActive(state: BattleState, activeId: string): void {
  const owned = state.player.actives.find(a => a.id === activeId)
  if (!owned || owned.slotIndex === null) return
  state.skillPoints += owned.points
  owned.points = 0
  owned.level = 1
  owned.slotIndex = null
}

/**
 * パネル: 倉庫中のアクティブを装備する。空き枠があれば直接装備し true を返す。
 * 空きが無ければ何もせず false を返す（呼び出し側が 'swapping' へ遷移し、
 * confirmSwap() で入れ替え先の枠を確定させる）。
 */
export function equipToFreeSlot(player: Combatant, activeId: string): boolean {
  const owned = player.actives.find(a => a.id === activeId)
  if (!owned || owned.slotIndex !== null) return false
  const freeSlot = findFreeSlotIndex(player)
  if (freeSlot === null) return false
  owned.slotIndex = freeSlot
  return true
}

/** パネル/入れ替え確定: 倉庫中の所持アクティブを指定枠へ装備する。埋まっていれば元の技は倉庫へ戻る */
export function confirmSwap(player: Combatant, incomingSkillId: string, targetSlotIndex: number): void {
  const incoming = player.actives.find(a => a.id === incomingSkillId)
  if (!incoming) return
  const outgoing = player.actives.find(a => a.slotIndex === targetSlotIndex)
  if (outgoing) outgoing.slotIndex = null
  incoming.slotIndex = targetSlotIndex
}

/** パネル: 未配分のスキルポイントを、セット中のアクティブへ配分する（Lv4上限）。実際に配分できた量を返す */
export function allocateSkillPoint(state: BattleState, activeId: string, amount: number): number {
  const owned = state.player.actives.find(a => a.id === activeId && a.slotIndex !== null)
  if (!owned || amount <= 0) return 0
  const spend = Math.min(amount, state.skillPoints, MAX_ACTIVE_POINTS - owned.points)
  if (spend <= 0) return 0
  addActivePoints(owned, spend)
  state.skillPoints -= spend
  return spend
}

/** パネル: セット中のアクティブから投資済みポイントを引き戻し、未配分プールへ戻す。実際に引き戻せた量を返す */
export function deallocateSkillPoint(state: BattleState, activeId: string, amount: number): number {
  const owned = state.player.actives.find(a => a.id === activeId && a.slotIndex !== null)
  if (!owned || amount <= 0) return 0
  const refund = Math.min(amount, owned.points)
  if (refund <= 0) return 0
  owned.points -= refund
  owned.level = levelForPoints(owned.points)
  state.skillPoints += refund
  return refund
}

function syncStatAllocationModifier(player: Combatant, stat: GrowthStatKey, points: number): void {
  player.temporary = player.temporary.filter(t => t.sourceId !== `statPanel:${stat}`)
  if (points > 0) {
    const perPoint = stat === 'hp' ? BATTLE.fallbackStatBoost.hp : BATTLE.fallbackStatBoost.other
    player.temporary.push({ stat, flat: points * perPoint, scope: 'permanent', sourceId: `statPanel:${stat}` })
  }
}

/**
 * パネル: 成長ステータスへの配分数を newAmount に変更する。増分は未配分プールの残量まで、
 * 減分はそのままプールへ戻す。いつでも呼べる（すでに配分済みの分も自由に組み替えられる）。
 */
export function setStatAllocation(state: BattleState, stat: GrowthStatKey, newAmount: number): void {
  const current = state.statAllocations[stat] ?? 0
  const clamped = Math.max(0, Math.floor(newAmount))
  const delta = clamped - current
  const actualDelta = delta > 0 ? Math.min(delta, state.statPoints) : delta
  if (actualDelta === 0) return
  state.statPoints -= actualDelta
  state.statAllocations[stat] = current + actualDelta
  syncStatAllocationModifier(state.player, stat, state.statAllocations[stat])
}

/** パネル: 全ステータスポイントの配分をリセットし、未配分プールへ戻す */
export function resetStatAllocations(state: BattleState): void {
  for (const stat of Object.keys(state.statAllocations) as GrowthStatKey[]) {
    const current = state.statAllocations[stat] ?? 0
    if (current <= 0) continue
    state.statPoints += current
    state.statAllocations[stat] = 0
    syncStatAllocationModifier(state.player, stat, 0)
  }
}
