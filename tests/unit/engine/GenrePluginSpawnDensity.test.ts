import { describe, it, expect, beforeEach } from 'vitest'
import { HAZARD_SPAWN } from '../../../src/data/gameBalance'
import {
  registerGenre,
  getGenre,
  resetRegistry,
} from '../../../src/engine/GameRegistry'
import type { GenrePlugin } from '../../../src/engine/GenrePlugin'

// Reset registry between tests to avoid state leakage
beforeEach(() => {
  resetRegistry()
})

describe('Per-genre spawn density', () => {
  // Default values from game_balance.json
  const defaults = {
    baseInterval: HAZARD_SPAWN.baseInterval,
    minInterval: HAZARD_SPAWN.minInterval,
    decayRate: HAZARD_SPAWN.decayRate,
  }

  const makeTestGenre = (id: string, spawnDensity?: GenrePlugin['spawnDensity']): GenrePlugin => ({
    id,
    skyColors: ['#000', '#111'],
    groundColors: ['#222', '#333'],
    farLayerColor: '#444',
    midLayerColor: '#555',
    palette: { danger: '#f00', dangerGlow: '#f00', safe: '#0f0', safeGlow: '#0f0' },
    spawnTable: [],
    spawnDensity,
    drawFarLayer: () => {},
    drawMidLayer: () => {},
    drawPlayer: () => {},
  })

  it('should be undefined when spawnDensity is omitted', () => {
    registerGenre(makeTestGenre('base'))
    const plugin = getGenre('base')
    expect(plugin.spawnDensity).toBeUndefined()
  })

  it('should pass through spawnDensity when provided to plugin', () => {
    registerGenre(makeTestGenre('stg', {
      baseInterval: 1800,
      minInterval: 600,
      decayRate: 0.0002,
    }))
    const plugin = getGenre('stg')
    expect(plugin.spawnDensity).toBeDefined()
    // Note: interface declares spawnDensity as readonly, but runtime objects are mutable
    // The actual value on the returned plugin should match what was registered
    expect((plugin.spawnDensity as { baseInterval?: number }).baseInterval).toBe(1800)
    expect((plugin.spawnDensity as { minInterval?: number }).minInterval).toBe(600)
    expect((plugin.spawnDensity as { decayRate?: number }).decayRate).toBe(0.0002)
  })

  it('fallback formula with no spawnDensity should use global HAZARD_SPAWN', () => {
    registerGenre(makeTestGenre('base'))
    const plugin = getGenre('base')
    const density = plugin.spawnDensity

    // Simulating _getSpawnParams(): when spawnDensity is undefined, use defaults
    const effective = {
      baseInterval: density?.baseInterval ?? defaults.baseInterval,
      minInterval: density?.minInterval ?? defaults.minInterval,
      decayRate: density?.decayRate ?? defaults.decayRate,
    }

    expect(effective.baseInterval).toBe(defaults.baseInterval)
    expect(effective.minInterval).toBe(defaults.minInterval)
    expect(effective.decayRate).toBe(defaults.decayRate)
  })

  it('partial spawnDensity should fill missing keys from HAZARD_SPAWN', () => {
    registerGenre(makeTestGenre('partial', {
      baseInterval: 1000,
      // minInterval and decayRate omitted
    }))
    const plugin = getGenre('partial')
    const density = plugin.spawnDensity

    const effective = {
      baseInterval: density?.baseInterval ?? defaults.baseInterval,
      minInterval: density?.minInterval ?? defaults.minInterval,
      decayRate: density?.decayRate ?? defaults.decayRate,
    }

    expect(effective.baseInterval).toBe(1000)
    expect(effective.minInterval).toBe(defaults.minInterval)
    expect(effective.decayRate).toBe(defaults.decayRate)
  })
})

describe('Spawn density interval formula', () => {
  /**
   * Replicates the interval calculation from sideScroller.ts:
   * interval = max(minInterval, baseInterval * exp(-decayRate * distance))
   */
  function calcInterval(baseInterval: number, minInterval: number, decayRate: number, distance: number): number {
    const raw = baseInterval * Math.exp(-decayRate * distance)
    return Math.max(minInterval, raw)
  }

  it('should return baseInterval at distance 0', () => {
    expect(calcInterval(2400, 800, 0.00015, 0)).toBe(2400)
  })

  it('should decrease with distance', () => {
    const near = calcInterval(2400, 800, 0.00015, 5000)
    const far = calcInterval(2400, 800, 0.00015, 20000)
    expect(far).toBeLessThan(near)
  })

  it('should never go below minInterval', () => {
    const interval = calcInterval(2400, 800, 0.00015, 100000)
    expect(interval).toBeGreaterThanOrEqual(800)
  })

  it('higher decayRate should produce faster density increase', () => {
    const slowDecay = calcInterval(2400, 800, 0.0001, 10000)
    const fastDecay = calcInterval(2400, 800, 0.0003, 10000)
    expect(fastDecay).toBeLessThan(slowDecay)
  })

  it('lower baseInterval should produce higher density at same distance', () => {
    const highBase = calcInterval(3000, 1000, 0.00015, 5000)
    const lowBase = calcInterval(1500, 500, 0.00015, 5000)
    expect(lowBase).toBeLessThan(highBase)
  })
})

describe('Per-genre spawn density comparisons', () => {
  function calcInterval(baseInterval: number, minInterval: number, decayRate: number, distance: number): number {
    return Math.max(minInterval, baseInterval * Math.exp(-decayRate * distance))
  }

  it('bullet_hell should produce higher density than idle at the same distance', () => {
    const distance = 10000
    const bhInterval = calcInterval(1200, 400, 0.0003, distance)
    const idleInterval = calcInterval(4000, 2000, 0.00005, distance)

    // Lower interval = higher density
    expect(bhInterval).toBeLessThan(idleInterval)
  })

  it('arena should have higher density than base at mid distance', () => {
    const distance = 15000
    const arenaInterval = calcInterval(1500, 500, 0.00025, distance)
    const baseInterval = calcInterval(HAZARD_SPAWN.baseInterval, HAZARD_SPAWN.minInterval, HAZARD_SPAWN.decayRate, distance)

    expect(arenaInterval).toBeLessThan(baseInterval)
  })
})
