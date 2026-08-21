/**
 * src/domain/goals.ts
 *
 * セッション目標の純粋関数。
 * pickGoal: ベスト距離から stretch 目標を選ぶ
 * goalProgress: 現在の進捗率 (0〜1+)
 * isGoalAchieved: 達成判定
 * goalBonus: ボーナススコア
 */

import type { GoalDef, GoalSelectionConfig, SaveRecords } from './types'

/**
 * 記録に基づいて目標を1つ選ぶ。
 * - 記録なし → starterGoalId の目標
 * - ある → 現ベスト距離の stretchFactor 倍を超える最小の distance 目標
 *   （存在しなければ最大の distance 目標）。スコア目標は混在させない。
 */
export function pickGoal(
  records: SaveRecords,
  cfg: { goals: GoalDef[]; selection: GoalSelectionConfig },
): GoalDef | undefined {
  const { goals, selection } = cfg
  const distanceGoals = goals.filter(g => g.metric === 'distance')
  const starter = goals.find(g => g.id === selection.starterGoalId)

  if (!records.overallBest || records.overallBest.distance <= 0 || distanceGoals.length === 0) {
    return starter ?? distanceGoals[0]
  }

  const threshold = records.overallBest.distance * selection.stretchFactor
  const candidates = distanceGoals.filter(g => g.target > threshold)
  if (candidates.length === 0) {
    // 最大の distance 目標へフォールバック
    return distanceGoals.reduce((best, g) => (g.target > best.target ? g : best), distanceGoals[0])
  }
  // 最小の target を選ぶ
  return candidates.reduce((best, g) => (g.target < best.target ? g : best), candidates[0])
}

/**
 * 目標の進捗率を計算する。min(1, s[metric] / target)。target<=0 なら 1。
 * metric 'score' は playScore を指す。
 */
export function goalProgress(
  goal: GoalDef,
  s: { distance: number; playScore: number; survivedSec: number },
): number {
  if (goal.target <= 0) return 1
  let value = 0
  switch (goal.metric) {
    case 'distance': value = s.distance; break
    case 'score': value = s.playScore; break
    case 'survivedSec': value = s.survivedSec; break
  }
  return Math.min(1, value / goal.target)
}

/**
 * 目標が達成されたか。
 */
export function isGoalAchieved(
  goal: GoalDef,
  s: { distance: number; playScore: number; survivedSec: number },
): boolean {
  return goalProgress(goal, s) >= 1
}

/**
 * ボーナススコアを返す。達成 && goal あり → goal.bonus、否则 0。
 */
export function goalBonus(goal: GoalDef | null, achieved: boolean): number {
  if (!goal || !achieved) return 0
  return goal.bonus
}
