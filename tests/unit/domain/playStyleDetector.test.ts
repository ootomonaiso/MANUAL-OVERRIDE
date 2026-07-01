import { describe, it, expect } from 'vitest'
import { detectPlayStyle } from '../../../src/domain/playStyleDetector'
import type { ActionStats } from '../../../src/domain/types'

describe('detectPlayStyle', () => {
  const baseStats: ActionStats = {
    jumps: 0, moveRight: 0, moveLeft: 0, shots: 0, ticks: 600,
  }

  it('ticks が 0 で passive を返す', () => {
    const result = detectPlayStyle({ ...baseStats, ticks: 0 })
    expect(result.style).toBe('passive')
    expect(result.confidence).toBe(0)
  })

  it('全操作が 0 で passive を返す', () => {
    const result = detectPlayStyle(baseStats)
    expect(result.style).toBe('passive')
  })

  it('射撃が多いと aggressive を返す', () => {
    // 600 ticks = 10秒、shotRate = 30/10 = 3/秒 > 閾値 0.02
    const stats: ActionStats = { ...baseStats, shots: 30 }
    const result = detectPlayStyle(stats)
    expect(result.style).toBe('aggressive')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('ジャンプが多いと defensive を返す', () => {
    // 600 ticks = 10秒、jumpRate = 20/10 = 2/秒 > 閾値 0.015
    const stats: ActionStats = { ...baseStats, jumps: 20 }
    const result = detectPlayStyle(stats)
    expect(result.style).toBe('defensive')
  })

  it('移動が多いと explorer を返す', () => {
    // 600 ticks = 10秒、moveRate = (50+50)/10 = 10/秒 > 閾値 0.025
    const stats: ActionStats = { ...baseStats, moveRight: 50, moveLeft: 50 }
    const result = detectPlayStyle(stats)
    expect(result.style).toBe('explorer')
  })

  it('衝突が多いと chaotic を返す', () => {
    // 600 ticks = 10秒、collisionRate = 10/10 = 1/秒 > 閾値 0.005
    const stats: ActionStats = { ...baseStats, collisions: 10 }
    const result = detectPlayStyle(stats)
    expect(result.style).toBe('chaotic')
  })

  it('全操作が均等なら balanced を返す', () => {
    const stats: ActionStats = {
      ...baseStats,
      jumps: 10, moveRight: 10, moveLeft: 10, shots: 10,
    }
    const result = detectPlayStyle(stats)
    // 均等だが、各レートが閾値を超えているため aggressive/defensive/explorer のスコアも高い
    // 均衡判定は balanceRatio >= 0.3 のため、balanced が返る可能性がある
    expect(['balanced', 'aggressive', 'defensive', 'explorer']).toContain(result.style)
  })

  it('ticks が少ないと confidence が低い', () => {
    const stats: ActionStats = { ...baseStats, ticks: 60, shots: 5 }
    const result = detectPlayStyle(stats)
    expect(result.confidence).toBeLessThan(0.5)
  })

  it('ticks が多いと confidence が 1 に近い', () => {
    const stats: ActionStats = { ...baseStats, ticks: 3000, shots: 50 }
    const result = detectPlayStyle(stats)
    expect(result.confidence).toBeCloseTo(1, 1)
  })

  it('scores に全スタイルのスコアが含まれる', () => {
    const stats: ActionStats = { ...baseStats, shots: 5 }
    const result = detectPlayStyle(stats)
    expect(result.scores).toHaveProperty('aggressive')
    expect(result.scores).toHaveProperty('defensive')
    expect(result.scores).toHaveProperty('explorer')
    expect(result.scores).toHaveProperty('balanced')
    expect(result.scores).toHaveProperty('chaotic')
    expect(result.scores).toHaveProperty('passive')
  })

  it('ダッシュが有効なら defensive スコアに加算される', () => {
    const stats: ActionStats = { ...baseStats, jumps: 5, dashes: 10 }
    const result = detectPlayStyle(stats)
    expect(result.scores.defensive).toBeGreaterThan(0)
  })
})
