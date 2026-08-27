import { describe, it, expect } from 'vitest'
import { classifyHudLayout, computeSafeZone, type HudLayoutInput } from '../../../src/domain/hudLayout'

function input(over: Partial<HudLayoutInput>): HudLayoutInput {
  return {
    scrollAxis: 'x',
    gravity: 1600,
    genre: 'base',
    features: new Set<string>(),
    ...over,
  }
}

describe('classifyHudLayout', () => {
  it('横STG(stg): 横スクロール + 無重力 + shoot → hstg', () => {
    expect(classifyHudLayout(input({
      scrollAxis: 'x', gravity: 0, genre: 'stg', features: new Set(['shoot', 'three_way']),
    }))).toBe('hstg')
  })

  it('縦STG(aerial_stg/bullet_hell): 縦スクロール + shoot → vstg', () => {
    expect(classifyHudLayout(input({
      scrollAxis: 'y', gravity: 1600, genre: 'aerial_stg', features: new Set(['shoot']),
    }))).toBe('vstg')
  })

  it('base / runner → hbase', () => {
    expect(classifyHudLayout(input({ genre: 'base', features: new Set(['auto_run']) }))).toBe('hbase')
    expect(classifyHudLayout(input({ genre: 'runner', features: new Set(['auto_run', 'double_jump']) }))).toBe('hbase')
  })

  it('aquatic(縦だが shoot なし)は vstg にならず other', () => {
    expect(classifyHudLayout(input({
      scrollAxis: 'y', gravity: 1600, genre: 'aquatic', features: new Set(['hp', 'item_pickup']),
    }))).toBe('other')
  })

  it('tetris(無重力だが shoot なし)は hstg にならず other', () => {
    expect(classifyHudLayout(input({
      scrollAxis: 'x', gravity: 0, genre: 'tetris', features: new Set(['tetris_mode']),
    }))).toBe('other')
  })

  it('RPG 等の対象外ジャンルは other', () => {
    expect(classifyHudLayout(input({ genre: 'rpg', features: new Set(['exp', 'hp']) }))).toBe('other')
  })
})

describe('computeSafeZone', () => {
  const ratios = {
    hbaseTopRatio: 0.25,
    hstgTopRatio: 0.16667, hstgBottomRatio: 0.16667,
    vstgLeftRatio: 0.225, vstgRightRatio: 0.225,
  }

  it('hstg: 上下に帯（合計 1/3）・左右は 0', () => {
    const sz = computeSafeZone('hstg', 1200, 900, ratios)
    expect(sz.top).toBeCloseTo(150, 0)
    expect(sz.bottom).toBeCloseTo(150, 0)
    expect(sz.left).toBe(0)
    expect(sz.right).toBe(0)
  })

  it('vstg: 左右に帯（合計 45%）・上下は 0', () => {
    const sz = computeSafeZone('vstg', 1200, 800, ratios)
    expect(sz.left).toBeCloseTo(270, 0)
    expect(sz.right).toBeCloseTo(270, 0)
    expect(sz.top).toBe(0)
    expect(sz.bottom).toBe(0)
  })

  it('hbase: 上部のみUIゾーン（25%）・下左右は 0', () => {
    const sz = computeSafeZone('hbase', 1200, 800, ratios)
    expect(sz.top).toBeCloseTo(200)
    expect(sz.bottom).toBe(0)
    expect(sz.left).toBe(0)
    expect(sz.right).toBe(0)
  })

  it('other: UIゾーンなし', () => {
    const sz = computeSafeZone('other', 1200, 800, ratios)
    expect(sz).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  })
})
