/**
 * domain/battle/completeBonus.ts
 * コンプリートボーナス（CLAUDE_TASKS.md 第13フェーズ）。
 *
 * 所持ユニークアクティブ/パッシブの種類数が、ドラフト対象の総数に対して
 * 25/50/75/100% に達するたびに、6成長ステータスへ永続の割合ボーナスを与える。
 * 数十戦目以降、欲しいアクティブが枯渇して旨味のない重複を取らされる問題への
 * 救済として、コレクション自体に価値を持たせる狙い。
 */

import { COMPLETE_BONUS } from '../../data/tunables'
import { GROWTH_STAT_KEYS } from './types'
import type { BattleContent, Combatant } from './types'

function draftableCount(content: BattleContent, kind: 'active' | 'passive'): number {
  let count = 0
  for (const def of content.skills.values()) {
    if (def.kind === kind && def.draftable !== false) count++
  }
  return count
}

/** 所持数/総数の比率が、達成した最も高い閾値に対応するボーナス率を返す（未達なら0） */
function bonusRateFor(owned: number, total: number): number {
  if (total <= 0) return 0
  const ratio = owned / total
  let rate = 0
  for (let i = 0; i < COMPLETE_BONUS.thresholds.length; i++) {
    if (ratio >= COMPLETE_BONUS.thresholds[i]) rate = COMPLETE_BONUS.statBonusRates[i]
  }
  return rate
}

/** sourceId を毎回洗い替えて永続modifierを反映する（skillPanel.ts::syncStatAllocationModifier と同じパターン） */
function applyBonus(player: Combatant, sourceId: string, rate: number): void {
  for (const stat of GROWTH_STAT_KEYS) {
    const key = `${sourceId}:${stat}`
    player.temporary = player.temporary.filter(t => t.sourceId !== key)
    if (rate > 0) player.temporary.push({ stat, rate, scope: 'permanent', sourceId: key })
  }
}

/**
 * アクティブ/パッシブそれぞれの所持数からコンプリートボーナスを再計算する。
 * 所持数が変わりうるタイミング（ドラフト選択の直後）で毎回呼び直す想定
 * （useBattleState.ts::selectDraftOption 参照）。
 */
export function syncCompleteBonus(player: Combatant, content: BattleContent): void {
  const activeRate = bonusRateFor(player.actives.length, draftableCount(content, 'active'))
  const passiveRate = bonusRateFor(player.passives.length, draftableCount(content, 'passive'))
  applyBonus(player, 'completeBonusActive', activeRate)
  applyBonus(player, 'completeBonusPassive', passiveRate)
}
