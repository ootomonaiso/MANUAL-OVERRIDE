import { describe, it, expect, beforeEach } from 'vitest'
import { resolveWeight, type SpawnEntry } from '../../../src/engine/types'
import {
  registerGenre,
  registerFeature,
  getGenre,
  getActiveSystems,
  hasGenre,
  resetRegistry,
} from '../../../src/engine/GameRegistry'
import type { GenrePlugin } from '../../../src/engine/GenrePlugin'
import type { FeatureSystem } from '../../../src/engine/FeatureSystem'

// テスト間で singleton 状態をリセット（#3 修正）
beforeEach(() => {
  resetRegistry()
})

describe('resolveWeight', () => {
  const makeEntry = (ws: number, we: number): SpawnEntry => ({
    shape: 'rect',
    placement: 'ground',
    weightStart: ws,
    weightEnd: we,
    wRange: [20, 40],
    hRange: [20, 40],
  })

  it('distance=0 で weightStart を返す', () => {
    const entry = makeEntry(1, 10)
    expect(resolveWeight(entry, 0)).toBe(1)
  })

  it('distance=maxDist で weightEnd を返す', () => {
    const entry = makeEntry(1, 10)
    expect(resolveWeight(entry, 3000)).toBe(10)
  })

  it('中間の distance で線形補間する', () => {
    const entry = makeEntry(1, 10)
    // t = 1500/3000 = 0.5 → 1 + (10-1) * 0.5 = 5.5
    expect(resolveWeight(entry, 1500)).toBe(5.5)
  })

  it('distance > maxDist で maxDist にクリップされる', () => {
    const entry = makeEntry(1, 10)
    expect(resolveWeight(entry, 6000)).toBe(10)
  })

  it('weightStart == weightEnd で一定値', () => {
    const entry = makeEntry(5, 5)
    expect(resolveWeight(entry, 0)).toBe(5)
    expect(resolveWeight(entry, 1500)).toBe(5)
    expect(resolveWeight(entry, 3000)).toBe(5)
  })

  it('weightEnd < weightStart で減少する', () => {
    const entry = makeEntry(10, 1)
    expect(resolveWeight(entry, 0)).toBe(10)
    expect(resolveWeight(entry, 3000)).toBe(1)
  })

  it('maxDist カスタム値を使用できる', () => {
    const entry = makeEntry(0, 100)
    expect(resolveWeight(entry, 500, 1000)).toBe(50) // t = 500/1000 = 0.5
  })
})

describe('GameRegistry', () => {
  const makeTestGenre = (id: string): GenrePlugin => ({
    id,
    skyColors: ['#000', '#111'],
    groundColors: ['#222', '#333'],
    farLayerColor: '#444',
    midLayerColor: '#555',
    palette: { danger: '#f00', dangerGlow: '#f00', safe: '#0f0', safeGlow: '#0f0' },
    spawnTable: [],
    drawFarLayer: () => {},
    drawMidLayer: () => {},
    drawPlayer: () => {},
  })

  describe('registerGenre', () => {
    it('ジャンルを登録できる', () => {
      registerGenre(makeTestGenre('test-genre'))
      expect(hasGenre('test-genre')).toBe(true)
    })
  })

  describe('getGenre', () => {
    it('登録されたジャンルを取得できる', () => {
      registerGenre(makeTestGenre('test-genre'))
      const plugin = getGenre('test-genre')
      expect(plugin.id).toBe('test-genre')
    })

    it('存在しないジャンルは base にフォールバックする', () => {
      // base が登録されていない環境ではエラーをスロー
      expect(() => getGenre('nonexistent-genre-xyz')).toThrow() // #11 修正
    })
  })

  describe('registerFeature', () => {
    it('Feature を登録できる', () => {
      const system: FeatureSystem = {
        handles: 'test-feature',
        update: () => {},
      }
      registerFeature(system)
      const systems = getActiveSystems(new Set(['test-feature']))
      expect(systems).toHaveLength(1)
    })

    it('複数の FeatureId を handles できる', () => {
      const system: FeatureSystem = {
        handles: ['multi-a', 'multi-b'],
        update: () => {},
      }
      registerFeature(system)
      const systems = getActiveSystems(new Set(['multi-a', 'multi-b']))
      // Both IDs map to the same system, so only 1 unique system
      expect(systems).toHaveLength(1)
    })
  })

  describe('getActiveSystems', () => {
    it('空のセットで空配列を返す', () => {
      const systems = getActiveSystems(new Set())
      expect(systems).toEqual([])
    })

    it('登録されていない FeatureId は無視される', () => {
      const systems = getActiveSystems(new Set(['nonexistent-feature']))
      expect(systems).toEqual([])
    })

    it('重複する FeatureId は1度だけ返す', () => {
      registerFeature({
        handles: ['dedup-a', 'dedup-b'],
        update: () => {},
      })
      const systems = getActiveSystems(new Set(['dedup-a', 'dedup-b']))
      expect(systems).toHaveLength(1)
    })
  })

  describe('hasGenre', () => {
    it('登録済みのジャンルで true', () => {
      registerGenre(makeTestGenre('has-test'))
      expect(hasGenre('has-test')).toBe(true)
    })

    it('未登録のジャンルで false', () => {
      expect(hasGenre('definitely-not-registered-xyz')).toBe(false)
    })
  })
})
