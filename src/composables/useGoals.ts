/**
 * src/composables/useGoals.ts
 *
 * セッション目標の ViewModel。
 * 目標の選択 / 進捗監視 / 達成 / ボーナスを管理する。
 */

import { ref, readonly } from 'vue'
import { pickGoal, goalProgress, goalBonus } from '../domain/goals'
import type { GoalDef, SaveRecords } from '../domain/types'
import { GOALS } from '../data/tunables'

export function useGoals() {
  const currentGoal = ref<GoalDef | null>(null)
  const achieved = ref(false)

  function start(records: SaveRecords): void {
    const goal = pickGoal(records, GOALS)
    currentGoal.value = goal ?? null
    achieved.value = false
  }

  function progressFor(s: { distance: number; playScore: number; survivedSec: number }): number {
    return currentGoal.value ? goalProgress(currentGoal.value, s) : 0
  }

  function markAchieved(): void {
    achieved.value = true
  }

  function bonus(): number {
    return goalBonus(currentGoal.value, achieved.value)
  }

  function reset(): void {
    currentGoal.value = null
    achieved.value = false
  }

  return {
    currentGoal: readonly(currentGoal),
    achieved: readonly(achieved),
    progressFor,
    start,
    markAchieved,
    bonus,
    reset,
  }
}
