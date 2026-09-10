import { describe, it, expect } from 'vitest'
import { GENRES } from '../../../src/data/genres'

/**
 * GENRES 変換の整合性テスト（#262）
 *
 * src/data/genres.ts のマッピングが bgm 属性を正しく伝搬しているか、
 * または未定義ジャンルで undefined になるかを確認する。
 */
describe('GENRES bgm 伝搬 (#262)', () => {
  it('tetris ジャンルは bgm 設定を持つ', () => {
    const tetris = GENRES.find(g => g.id === 'tetris')
    expect(tetris).toBeDefined()
    expect(tetris!.bgm).toBeDefined()
    expect(tetris!.bgm!.src).toBe('bgm/tetris.ogg')
    expect(tetris!.bgm!.loop).toBe(true)
    expect(tetris!.bgm!.volume).toBe(0.5)
    expect(tetris!.bgm!.fadeInMs).toBe(1000)
  })

  it('bgm 未定義のジャンル（stg）では bgm が undefined である', () => {
    const stg = GENRES.find(g => g.id === 'stg')
    expect(stg).toBeDefined()
    expect(stg!.bgm).toBeUndefined()
  })

  it('bgm 未定義のジャンル（rpg）では bgm が undefined である', () => {
    const rpg = GENRES.find(g => g.id === 'rpg')
    expect(rpg).toBeDefined()
    expect(rpg!.bgm).toBeUndefined()
  })

  it('全ジャンルの bgm が undefined あるいは BgmConfig として整合している', () => {
    for (const genre of GENRES) {
      if (genre.bgm === undefined) continue
      expect(genre.bgm.src, `${genre.id}.bgm.src は文字列であるべき`).toBeTypeOf('string')
      expect(genre.bgm.src.length, `${genre.id}.bgm.src は空文字列ではない`).toBeGreaterThan(0)
      if (typeof genre.bgm.loop === 'boolean') {
        expect(genre.bgm.loop).toBeTypeOf('boolean')
      }
      if (typeof genre.bgm.volume === 'number') {
        expect(genre.bgm.volume).toBeGreaterThanOrEqual(0)
        expect(genre.bgm.volume).toBeLessThanOrEqual(1)
      }
      if (typeof genre.bgm.fadeInMs === 'number') {
        expect(genre.bgm.fadeInMs).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('全ジャンルに id と label が定義されている', () => {
    for (const genre of GENRES) {
      expect(genre.id).toBeTruthy()
      expect(genre.label).toBeTruthy()
    }
  })

  it('tetris は thresholds に combo と craft を持つ', () => {
    const tetris = GENRES.find(g => g.id === 'tetris')
    expect(tetris).toBeDefined()
    expect(tetris!.thresholds.combo).toBeGreaterThan(0)
    expect(tetris!.thresholds.craft).toBeGreaterThan(0)
  })

  it('bullet_hell は boss_stationary / hp を有効化し enemy_hp を無効化・スコア式に hitsOnBoss / maxHitCombo を使用', () => {
    const bh = GENRES.find(g => g.id === 'bullet_hell')
    expect(bh).toBeDefined()
    expect(bh!.enableFeatures).toContain('boss_stationary')
    expect(bh!.enableFeatures).toContain('hp')
    expect(bh!.enableFeatures).not.toContain('enemy_hp')
    expect(bh!.disableFeatures).not.toContain('enemy_hp')

    const formula = bh!.scoreFormula
    expect(formula).toMatch(/hitsOnBoss/)
    expect(formula).toMatch(/maxHitCombo/)
    expect(formula).toMatch(/survivedSec/)
  })
})
