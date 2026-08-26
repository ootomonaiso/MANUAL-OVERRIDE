import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSONGenrePlugin } from '../../../src/plugins/JSONGenrePlugin'
import type { GenreJsonDef } from '../../../src/plugins/JSONGenrePlugin'

/**
 * JSONGenrePlugin 視覚プロパティ継承テスト (#260)
 *
 * - TO_DELEGATE_ID に aerial / glitch / stealth が含まれること
 * - JSON 専用ジャンルで視覚プロパティが委譲先から継承されること
 * - JSON の visual で上書き指定した場合に上書きが優先されること
 */
describe('JSONGenrePlugin visual property delegation (#260)', () => {
  let registerGenre: (p: { id: string }) => void
  let hasGenre: (id: string) => boolean
  let resetRegistry: () => void

  beforeEach(async () => {
    const registry = await import('../../../src/engine/GameRegistry')
    registerGenre = registry.registerGenre
    hasGenre = registry.hasGenre
    resetRegistry = registry.resetRegistry

    resetRegistry()

    // 必要な TS プラグインを手動登録
    const { BasePlugin, RunnerPlugin } = await import('../../../src/genres/BasePlugin')
    registerGenre(new BasePlugin())
    registerGenre(new RunnerPlugin())

    const { StgPlugin } = await import('../../../src/genres/StgPlugin')
    registerGenre(new StgPlugin())

    const { AerialStgPlugin } = await import('../../../src/genres/AerialStgPlugin')
    registerGenre(new AerialStgPlugin())

    const { HackSlashPlugin } = await import('../../../src/genres/HackSlashPlugin')
    registerGenre(new HackSlashPlugin())

    const { PuzzlePlugin } = await import('../../../src/genres/PuzzlePlugin')
    registerGenre(new PuzzlePlugin())

    const { PlatformerPlugin } = await import('../../../src/genres/PlatformerPlugin')
    registerGenre(new PlatformerPlugin())

    const { DungeonPlugin } = await import('../../../src/genres/DungeonPlugin')
    registerGenre(new DungeonPlugin())

    const { AquaticPlugin } = await import('../../../src/genres/AquaticPlugin')
    registerGenre(new AquaticPlugin())

    const { ArenaPlugin } = await import('../../../src/genres/ArenaPlugin')
    registerGenre(new ArenaPlugin())

    const { RacingPlugin } = await import('../../../src/genres/RacingPlugin')
    registerGenre(new RacingPlugin())

    const { BulletRunnerPlugin } = await import('../../../src/genres/BulletRunnerPlugin')
    registerGenre(new BulletRunnerPlugin())

    const { SurvivalPlugin } = await import('../../../src/genres/SurvivalPlugin')
    registerGenre(new SurvivalPlugin())

    const { RhythmPlugin } = await import('../../../src/genres/RhythmPlugin')
    registerGenre(new RhythmPlugin())

    const { RpgPlugin } = await import('../../../src/genres/RpgPlugin')
    registerGenre(new RpgPlugin())

    const { TetrisPlugin } = await import('../../../src/genres/TetrisPlugin')
    registerGenre(new TetrisPlugin())
  })

  describe('TO_DELEGATE_ID', () => {
    it('aerial theme → aerial_stg を委譲先として使用する', () => {
      const plugin = new JSONGenrePlugin({ id: 'test_aerial', theme: 'aerial' })
      expect(plugin.id).toBe('test_aerial')
      expect(hasGenre('aerial_stg')).toBe(true)
    })

    it('stealth theme → base を委譲先として使用する', () => {
      const plugin = new JSONGenrePlugin({ id: 'test_stealth', theme: 'stealth' })
      expect(plugin.id).toBe('test_stealth')
      expect(hasGenre('base')).toBe(true)
    })

    it('glitch theme → base を委譲先として使用する', () => {
      const plugin = new JSONGenrePlugin({ id: 'test_glitch', theme: 'glitch' })
      expect(plugin.id).toBe('test_glitch')
      expect(hasGenre('base')).toBe(true)
    })
  })

  describe('視覚プロパティの継承', () => {
    it('aerial テンプレート: parallax が aerial_stg から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_aerial_genre',
        theme: 'aerial',
      })
      expect(plugin.parallax).toEqual({ stars: 0.02, far: 1.0, mid: 1.5 })
    })

    it('aerial テンプレート: starConfig が aerial_stg から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_aerial_genre',
        theme: 'aerial',
      })
      expect(plugin.starConfig).toEqual({
        density: 18,
        sizeRange: [1, 2],
        alphaRange: [0.3, 0.7],
      })
    })

    it('aerial テンプレート: hazardConfig が aerial_stg から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_aerial_genre',
        theme: 'aerial',
      })
      expect(plugin.hazardConfig).toEqual({
        glowBlur: 14,
        pulseSpeed: 2.0,
        pulseAmplitude: 0.1,
      })
    })

    it('aerial テンプレート: particleColors が aerial_stg から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_aerial_genre',
        theme: 'aerial',
      })
      expect(plugin.particleColors).toBeDefined()
      expect(plugin.particleColors?.hit).toBe('#ffb08a')
    })

    it('stg theme: particleColors が StgPlugin から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_stg_genre',
        theme: 'stg',
      })
      expect(plugin.particleColors).toBeDefined()
      expect(plugin.particleColors?.hit).toBe('#88ffff')
    })

    it('puzzle theme: PuzzlePlugin の色を継承する', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_puzzle_genre',
        theme: 'puzzle',
      })
      expect(plugin.skyColors).toBeDefined()
      expect(plugin.skyColors!.length).toBe(2)
    })

    it('aquatic theme: groundLineAlpha / groundDashAlpha が AquaticPlugin から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_aquatic_genre',
        theme: 'aquatic',
      })
      expect(plugin.groundLineAlpha).toBe(0.15)
      expect(plugin.groundDashAlpha).toBe(0.08)
    })

    it('aquatic theme: hazardConfig が AquaticPlugin から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_aquatic_genre',
        theme: 'aquatic',
      })
      expect(plugin.hazardConfig).toBeDefined()
    })

    it('aquatic theme: particleColors が AquaticPlugin から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_aquatic_genre',
        theme: 'aquatic',
      })
      expect(plugin.particleColors).toBeDefined()
    })

    it('stealth theme → base: base の色を継承する', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_stealth_genre',
        theme: 'stealth',
      })
      expect(plugin.skyColors).toEqual(['#0f0f23', '#1a1a3e'])
    })

    it('glitch theme → base: base の色を継承する', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_glitch_genre',
        theme: 'glitch',
      })
      expect(plugin.skyColors).toEqual(['#0f0f23', '#1a1a3e'])
    })

    it('horror theme → base: base の色を継承する', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_horror_genre',
        theme: 'horror',
      })
      expect(plugin.skyColors).toEqual(['#0f0f23', '#1a1a3e'])
    })

    it('bullet_hell theme "stg": particleColors が StgPlugin から継承される', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_bullet_hell_genre',
        theme: 'stg',
      })
      expect(plugin.particleColors).toBeDefined()
      expect(plugin.particleColors?.hit).toBe('#88ffff')
    })
  })

  describe('visual による上書き優先', () => {
    it('visual.parallax 指定時はデリゲートの値を上書きする', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_override_parallax',
        theme: 'aerial',
        visual: {
          parallax: { stars: 0.05, far: 2.0, mid: 3.0 },
        },
      })
      expect(plugin.parallax).toEqual({ stars: 0.05, far: 2.0, mid: 3.0 })
    })

    it('visual.starConfig 指定時はデリゲートの値を上書きする', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_override_star',
        theme: 'aerial',
        visual: {
          starConfig: { density: 30, sizeRange: [2, 4] as [number, number], alphaRange: [0.5, 1.0] as [number, number] },
        },
      })
      expect(plugin.starConfig).toEqual({
        density: 30,
        sizeRange: [2, 4],
        alphaRange: [0.5, 1.0],
      })
    })

    it('visual.hazardConfig 指定時はデリゲートの値を上書きする', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_override_hazard',
        theme: 'aerial',
        visual: {
          hazardConfig: { glowBlur: 20, pulseSpeed: 3.0, pulseAmplitude: 0.2 },
        },
      })
      expect(plugin.hazardConfig).toEqual({ glowBlur: 20, pulseSpeed: 3.0, pulseAmplitude: 0.2 })
    })

    it('visual.particleColors 指定時はデリゲートの値を上書きする', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_override_particles',
        theme: 'aerial',
        visual: {
          particleColors: { hit: '#ff0000', jump: '#00ff00' },
        },
      })
      expect(plugin.particleColors?.hit).toBe('#ff0000')
      expect(plugin.particleColors?.jump).toBe('#00ff00')
    })

    it('visual.groundLineAlpha 指定時はデリゲートの値を上書きする', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_override_groundLine',
        theme: 'aerial',
        visual: { groundLineAlpha: 0.5 },
      })
      expect(plugin.groundLineAlpha).toBe(0.5)
    })

    it('visual.groundDashAlpha 指定時はデリゲートの値を上書きする', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_override_groundDash',
        theme: 'aerial',
        visual: { groundDashAlpha: 0.3 },
      })
      expect(plugin.groundDashAlpha).toBe(0.3)
    })

    it('visual.skyColors 指定時はデリゲートの値を上書きする（既存動作）', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_override_sky',
        theme: 'aerial',
        visual: { skyColors: ['#000000', '#111111'] },
      })
      expect(plugin.skyColors).toEqual(['#000000', '#111111'])
    })
  })

  describe('未指定プロパティのデフォルト動作', () => {
    it('parallax 未指定時はデリゲートの値を継承する（undefined 時は undefined）', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_base_fallback',
        theme: 'plain',
      })
      // base の parallax は undefined
      expect(plugin.parallax).toBeUndefined()
    })

    it('starColor 未指定時は #ffffff がデフォルト（既存動作）', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_star_default',
        theme: 'plain',
      })
      expect(plugin.starColor).toBe('#ffffff')
    })

    it('hazardConfig 未指定時はデリゲートの値を継承する（undefined 時は undefined）', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_no_hazard',
        theme: 'plain',
      })
      // base の hazardConfig は undefined
      expect(plugin.hazardConfig).toBeUndefined()
    })

    it('particleColors 未指定時はデリゲートの値を継承する（undefined 時は undefined）', () => {
      const plugin = new JSONGenrePlugin({
        id: 'test_no_particles',
        theme: 'plain',
      })
      // base の particleColors は undefined
      expect(plugin.particleColors).toBeUndefined()
    })
  })
})
