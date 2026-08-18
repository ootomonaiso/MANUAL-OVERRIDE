import { describe, it, expect } from 'vitest'
import { pickGoal, goalProgress, isGoalAchieved, goalBonus } from '../../src/domain/goals'
import type { GoalDef, SaveRecords } from '../../src/domain/types'

const DEFAULT_GOALS_CFG = {
  goals: [
    { id: 'dist_300', label: '300m', metric: 'distance' as const, target: 300, bonus: 100 },
    { id: 'dist_500', label: '500m', metric: 'distance' as const, target: 500, bonus: 200 },
    { id: 'dist_1000', label: '1000m', metric: 'distance' as const, target: 1000, bonus: 400 },
    { id: 'score_1000', label: 'スコア1000', metric: 'score' as const, target: 1000, bonus: 150 },
    { id: 'survive_60', label: '60秒', metric: 'survivedSec' as const, target: 60, bonus: 200 },
  ],
  selection: {
    strategy: 'stretch' as const,
    stretchFactor: 1.25,
    starterGoalId: 'dist_300',
  },
}

describe('pickGoal', () => {
  it('記録なし → starterGoal を返す', () => {
    const records: SaveRecords = {
      overallBest: null,
      perGenre: {},
      playCount: 0,
      totalDistance: 0,
      totalPlayTime: 0,
    }
    const goal = pickGoal(records, DEFAULT_GOALS_CFG)
    expect(goal.id).toBe('dist_300')
  })

  it('ベスト距離 200 → stretchFactor 1.25 倍 = 250 を超える最小 distance 目標 (300)', () => {
    const records: SaveRecords = {
      overallBest: { total: 500, play: 300, throw: 200, genre: 'base', distance: 200, date: '2024-01-01' },
      perGenre: {},
      playCount: 1,
      totalDistance: 200,
      totalPlayTime: 30,
    }
    const goal = pickGoal(records, DEFAULT_GOALS_CFG)
    expect(goal.id).toBe('dist_300')
  })

  it('ベスト距離 400 → stretchFactor 1.25 倍 = 500 を超える最小 distance 目標 (500 は超えない → 1000)', () => {
    const records: SaveRecords = {
      overallBest: { total: 500, play: 300, throw: 200, genre: 'base', distance: 400, date: '2024-01-01' },
      perGenre: {},
      playCount: 1,
      totalDistance: 400,
      totalPlayTime: 60,
    }
    const goal = pickGoal(records, DEFAULT_GOALS_CFG)
    // 400 * 1.25 = 500, target > 500 が必要。dist_500(target=500) は超えない。
    expect(goal.id).toBe('dist_1000')
  })

  it('最大 distance 目標を超える記録 → 最大の distance 目標へフォールバック', () => {
    const records: SaveRecords = {
      overallBest: { total: 5000, play: 3000, throw: 2000, genre: 'base', distance: 1000, date: '2024-01-01' },
      perGenre: {},
      playCount: 10,
      totalDistance: 5000,
      totalPlayTime: 600,
    }
    const goal = pickGoal(records, DEFAULT_GOALS_CFG)
    expect(goal.id).toBe('dist_1000')
  })
})

describe('goalProgress', () => {
  it('0 の進捗', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 100, bonus: 10 }
    expect(goalProgress(goal, { distance: 0, playScore: 0, survivedSec: 0 })).toBe(0)
  })

  it('中間の進捗', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 100, bonus: 10 }
    expect(goalProgress(goal, { distance: 50, playScore: 0, survivedSec: 0 })).toBe(0.5)
  })

  it('target 以上は 1 にクランプ', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 100, bonus: 10 }
    expect(goalProgress(goal, { distance: 150, playScore: 0, survivedSec: 0 })).toBe(1)
  })

  it('target=0 のとき 1 を返す', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 0, bonus: 10 }
    expect(goalProgress(goal, { distance: 0, playScore: 0, survivedSec: 0 })).toBe(1)
  })

  it('score metric で playScore を参照する', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'score', target: 1000, bonus: 10 }
    expect(goalProgress(goal, { distance: 0, playScore: 500, survivedSec: 0 })).toBe(0.5)
  })

  it('survivedSec metric で生存時間を参照する', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'survivedSec', target: 60, bonus: 10 }
    expect(goalProgress(goal, { distance: 0, playScore: 0, survivedSec: 30 })).toBe(0.5)
  })
})

describe('isGoalAchieved', () => {
  it('達成: 進捗 >= 1', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 100, bonus: 10 }
    expect(isGoalAchieved(goal, { distance: 100, playScore: 0, survivedSec: 0 })).toBe(true)
  })

  it('未達成: 進捗 < 1', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 100, bonus: 10 }
    expect(isGoalAchieved(goal, { distance: 99, playScore: 0, survivedSec: 0 })).toBe(false)
  })
})

describe('goalBonus', () => {
  it('達成 + goal あり → bonus を返す', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 100, bonus: 150 }
    expect(goalBonus(goal, true)).toBe(150)
  })

  it('未達成 → 0', () => {
    const goal: GoalDef = { id: 'x', label: 'x', metric: 'distance', target: 100, bonus: 150 }
    expect(goalBonus(goal, false)).toBe(0)
  })

  it('goal null → 0', () => {
    expect(goalBonus(null, true)).toBe(0)
  })
})
