import { describe, it, expect } from 'vitest'
import { recordGame, loadRecords, DEFAULT_RECORDS } from '../../src/domain/records'
import type { GameResult, SaveRecords } from '../../src/domain/types'

function makeResult(overrides: Partial<GameResult> = {}): GameResult {
  return {
    genre: 'base',
    total: 1000,
    play: 700,
    throw: 300,
    distance: 500,
    survivedSec: 60,
    ...overrides,
  }
}

describe('recordGame', () => {
  it('初回: overallBest が null から設定され newOverall=true', () => {
    const prev: SaveRecords = { ...DEFAULT_RECORDS }
    const result = recordGame(prev, makeResult({ total: 1000 }))
    expect(result.newOverall).toBe(true)
    expect(result.newGenre).toBe(true)
    expect(result.records.overallBest).not.toBeNull()
    expect(result.records.overallBest!.total).toBe(1000)
    expect(result.records.playCount).toBe(1)
  })

  it('高スコアで overallBest を更新し newOverall=true', () => {
    const prev: SaveRecords = {
      ...DEFAULT_RECORDS,
      overallBest: { total: 500, play: 300, throw: 200, genre: 'base', distance: 200, date: '2024-01-01' },
      playCount: 3,
      totalDistance: 600,
      totalPlayTime: 180,
    }
    const result = recordGame(prev, makeResult({ total: 800 }))
    expect(result.newOverall).toBe(true)
    expect(result.records.overallBest!.total).toBe(800)
    expect(result.records.playCount).toBe(4)
    expect(result.records.totalDistance).toBe(1100)
    expect(result.records.totalPlayTime).toBe(240)
  })

  it('低スコアでは overallBest を更新しない（newOverall=false）', () => {
    const prev: SaveRecords = {
      ...DEFAULT_RECORDS,
      overallBest: { total: 1000, play: 700, throw: 300, genre: 'base', distance: 500, date: '2024-01-01' },
      playCount: 2,
      totalDistance: 1000,
      totalPlayTime: 120,
    }
    const result = recordGame(prev, makeResult({ total: 500 }))
    expect(result.newOverall).toBe(false)
    expect(result.records.overallBest!.total).toBe(1000)
  })

  it('ジャンル別ベストが独立に更新される（newGenre=true）', () => {
    const prev: SaveRecords = {
      ...DEFAULT_RECORDS,
      perGenre: { base: { total: 1000, play: 700, throw: 300, genre: 'base', distance: 500, date: '2024-01-01' } },
      playCount: 1,
      totalDistance: 500,
      totalPlayTime: 60,
    }
    const result = recordGame(prev, makeResult({ genre: 'stg', total: 1200 }))
    expect(result.newGenre).toBe(true)
    expect(result.records.perGenre['stg']!.total).toBe(1200)
    // base のベストはそのまま
    expect(result.records.perGenre['base']!.total).toBe(1000)
  })

  it('ジャンル別ベストが更新されない場合、perGenre は不変', () => {
    const prev: SaveRecords = {
      ...DEFAULT_RECORDS,
      perGenre: { stg: { total: 2000, play: 1400, throw: 600, genre: 'stg', distance: 800, date: '2024-01-01' } },
      playCount: 5,
      totalDistance: 3000,
      totalPlayTime: 600,
    }
    const result = recordGame(prev, makeResult({ genre: 'stg', total: 1500 }))
    expect(result.newGenre).toBe(false)
    expect(result.records.perGenre['stg']!.total).toBe(2000)
  })

  it('playCount / totalDistance / totalPlayTime が累積する', () => {
    const prev: SaveRecords = {
      ...DEFAULT_RECORDS,
      playCount: 10,
      totalDistance: 5000,
      totalPlayTime: 3600,
    }
    const result = recordGame(prev, makeResult({ distance: 300, survivedSec: 45 }))
    expect(result.records.playCount).toBe(11)
    expect(result.records.totalDistance).toBe(5300)
    expect(result.records.totalPlayTime).toBe(3645)
  })
})

describe('loadRecords', () => {
  it('壊れた JSON でも DEFAULT_RECORDS を返し例外を投げない', () => {
    const key = 'mo_test_corrupt_v1'
    try {
      localStorage.setItem(key, 'not valid json{{{')
      const result = loadRecords(key)
      expect(result).toEqual(DEFAULT_RECORDS)
    } finally {
      localStorage.removeItem(key)
    }
  })

  it('存在しないキーでも DEFAULT_RECORDS を返す', () => {
    const result = loadRecords('mo_nonexistent_key_xyz')
    expect(result).toEqual(DEFAULT_RECORDS)
  })
})
