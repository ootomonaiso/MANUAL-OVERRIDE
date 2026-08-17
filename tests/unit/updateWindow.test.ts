import { describe, it, expect } from 'vitest'
import { computeUpdateWindow } from '../../src/domain/updateWindow'

// UPDATE_DISTANCES の初め 5 件（gameBalance.ts の生成ロジックに準拠）
const DISTANCES = [300, 800, 1500, 2400, 3500]
const INFINITE_INTERVAL = 2000

describe('computeUpdateWindow', () => {
  it('progress 0 → { start: 0, end: DISTANCES[0] }', () => {
    const w = computeUpdateWindow(0, DISTANCES, INFINITE_INTERVAL)
    expect(w).toEqual({ start: 0, end: 300 })
  })

  it('d1 < progress < d2 → { start: d1, end: d2 }', () => {
    const w = computeUpdateWindow(1000, DISTANCES, INFINITE_INTERVAL)
    expect(w).toEqual({ start: 800, end: 1500 })
  })

  it('progress = d1（境界） → { start: d1, end: d2 }', () => {
    const w = computeUpdateWindow(800, DISTANCES, INFINITE_INTERVAL)
    expect(w).toEqual({ start: 800, end: 1500 })
  })

  it('最後の距離を超過 → infinite の floor ウィンドウ', () => {
    // progress = 3500 + 1500 → floor(1500/2000) = 0 → { 3500, 5500 }
    const w = computeUpdateWindow(5000, DISTANCES, INFINITE_INTERVAL)
    expect(w).toEqual({ start: 3500, end: 5500 })

    // progress = 3500 + 2000 → floor(2000/2000) = 1 → { 5500, 7500 }
    const w2 = computeUpdateWindow(5500, DISTANCES, INFINITE_INTERVAL)
    expect(w2).toEqual({ start: 5500, end: 7500 })
  })

  it('境界値 progress = 最後の距離 → { start: last, end: last + interval }', () => {
    const w = computeUpdateWindow(3500, DISTANCES, INFINITE_INTERVAL)
    expect(w).toEqual({ start: 3500, end: 5500 })
  })

  it('空配列 → { start: 0, end: infiniteInterval }', () => {
    const w = computeUpdateWindow(0, [], INFINITE_INTERVAL)
    expect(w).toEqual({ start: 0, end: 2000 })
  })
})
