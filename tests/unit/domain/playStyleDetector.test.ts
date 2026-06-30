import { describe, it, expect } from 'vitest'
import { detectPlayStyle, describePlayStyle, generatePlayStyleNarrative } from '../../../src/domain/playStyleDetector'
import type { ActionStats } from '../../../src/domain/types'

describe('detectPlayStyle', () => {
  it('ticks が少ない場合は検出しない', () => {
    const stats: ActionStats = { jumps: 5, moveRight: 10, moveLeft: 2, shots: 0, ticks: 100 }
    const result = detectPlayStyle(stats)
    expect(result.styles).toEqual([])
    expect(result.dominant).toBeNull()
    expect(result.genreBonus).toEqual({})
  })

  it('low_jumper を検出する', () => {
    const stats: ActionStats = { jumps: 2, moveRight: 500, moveLeft: 100, shots: 0, ticks: 5000 }
    const result = detectPlayStyle(stats)
    const lowJumper = result.styles.find(s => s.style === 'low_jumper')
    expect(lowJumper).toBeDefined()
    expect(lowJumper!.strength).toBeGreaterThan(0)
  })

  it('jump_spammer を検出する', () => {
    // jumpRate > 0.07 = jump_spammer
    const stats: ActionStats = { jumps: 500, moveRight: 2000, moveLeft: 500, shots: 0, ticks: 5000 }
    const result = detectPlayStyle(stats)
    const jumpSpammer = result.styles.find(s => s.style === 'jump_spammer')
    expect(jumpSpammer).toBeDefined()
    expect(jumpSpammer!.strength).toBeGreaterThan(0)
  })

  it('left_runner を検出する', () => {
    // leftRatio > 1.3 = left_runner
    const stats: ActionStats = { jumps: 100, moveRight: 200, moveLeft: 1000, shots: 0, ticks: 5000 }
    const result = detectPlayStyle(stats)
    const leftRunner = result.styles.find(s => s.style === 'left_runner')
    expect(leftRunner).toBeDefined()
    expect(leftRunner!.strength).toBeGreaterThan(0)
  })

  it('collision_prone を検出する', () => {
    // collisionRate > 0.005 = collision_prone
    const stats: ActionStats = { jumps: 100, moveRight: 1000, moveLeft: 500, shots: 0, ticks: 5000, collisions: 50 }
    const result = detectPlayStyle(stats)
    const collisionProne = result.styles.find(s => s.style === 'collision_prone')
    expect(collisionProne).toBeDefined()
    expect(collisionProne!.strength).toBeGreaterThan(0)
  })

  it('sniper を検出する', () => {
    // shotRate >= 0.005 && < 0.02 = sniper
    const stats: ActionStats = { jumps: 100, moveRight: 1000, moveLeft: 500, shots: 50, ticks: 5000 }
    const result = detectPlayStyle(stats)
    const sniper = result.styles.find(s => s.style === 'sniper')
    expect(sniper).toBeDefined()
    expect(sniper!.strength).toBeGreaterThan(0)
  })

  it('複数のスタイルを同時に検出できる', () => {
    const stats: ActionStats = {
      jumps: 2,
      moveRight: 200,
      moveLeft: 1000,
      shots: 0,
      ticks: 5000,
      collisions: 50,
    }
    const result = detectPlayStyle(stats)
    expect(result.styles.length).toBeGreaterThanOrEqual(2)
  })

  it('dominant は最も強いスタイルを返す', () => {
    const stats: ActionStats = {
      jumps: 2,
      moveRight: 200,
      moveLeft: 1000,
      shots: 0,
      ticks: 5000,
      collisions: 50,
    }
    const result = detectPlayStyle(stats)
    expect(result.dominant).toBeDefined()
    // 最も強いスタイルが先頭にある
    expect(result.styles[0].style).toBe(result.dominant)
  })

  it('genreBonus が正しく計算される', () => {
    const stats: ActionStats = {
      jumps: 2,
      moveRight: 500,
      moveLeft: 100,
      shots: 0,
      ticks: 5000,
    }
    const result = detectPlayStyle(stats)
    // low_jumper が検出されれば stealth ボーナスがあるはず
    if (result.styles.find(s => s.style === 'low_jumper')) {
      expect(result.genreBonus.stealth).toBeDefined()
      expect(result.genreBonus.stealth!).toBeGreaterThan(0)
    }
  })
})

describe('describePlayStyle', () => {
  it('全スタイルで文字列を返す', () => {
    const styles = ['low_jumper', 'jump_spammer', 'left_runner', 'collision_prone', 'speed_demon', 'sniper']
    for (const style of styles) {
      const desc = describePlayStyle(style as Parameters<typeof describePlayStyle>[0])
      expect(desc).toBeTypeOf('string')
      expect(desc.length).toBeGreaterThan(0)
    }
  })
})

describe('generatePlayStyleNarrative', () => {
  it('strength が低い場合は null を返す', () => {
    const result = {
      styles: [{ style: 'low_jumper' as const, strength: 0.1 }],
      dominant: 'low_jumper' as const,
      genreBonus: {},
    }
    expect(generatePlayStyleNarrative(result)).toBeNull()
  })

  it('strength が中程度で2行を返す', () => {
    const result = {
      styles: [{ style: 'low_jumper' as const, strength: 0.5 }],
      dominant: 'low_jumper' as const,
      genreBonus: {},
    }
    const narrative = generatePlayStyleNarrative(result)
    expect(narrative).not.toBeNull()
    const lines = narrative!.split('\n')
    expect(lines.length).toBe(2)
  })

  it('strength が高いと3行を返す', () => {
    const result = {
      styles: [{ style: 'low_jumper' as const, strength: 0.8 }],
      dominant: 'low_jumper' as const,
      genreBonus: {},
    }
    const narrative = generatePlayStyleNarrative(result)
    expect(narrative).not.toBeNull()
    const lines = narrative!.split('\n')
    expect(lines.length).toBe(3)
  })

  it('dominant が null の場合は null を返す', () => {
    const result = {
      styles: [],
      dominant: null,
      genreBonus: {},
    }
    expect(generatePlayStyleNarrative(result)).toBeNull()
  })
})
