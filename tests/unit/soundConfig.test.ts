import { describe, it, expect } from 'vitest'
import { GAME_CONFIG } from '../../src/data/config'

describe('GAME_CONFIG.sound', () => {
  it('sound セクションが存在する', () => {
    expect(GAME_CONFIG.sound).toBeDefined()
  })

  it('音量が 0〜1 の範囲', () => {
    expect(GAME_CONFIG.sound.masterVolume).toBeGreaterThanOrEqual(0)
    expect(GAME_CONFIG.sound.masterVolume).toBeLessThanOrEqual(1)
    expect(GAME_CONFIG.sound.sfxVolume).toBeGreaterThanOrEqual(0)
    expect(GAME_CONFIG.sound.sfxVolume).toBeLessThanOrEqual(1)
    expect(GAME_CONFIG.sound.bgmVolume).toBeGreaterThanOrEqual(0)
    expect(GAME_CONFIG.sound.bgmVolume).toBeLessThanOrEqual(1)
  })

  it('bgmBpm > 0', () => {
    expect(GAME_CONFIG.sound.bgmBpm).toBeGreaterThan(0)
  })

  it('muteStorageKey は文字列', () => {
    expect(typeof GAME_CONFIG.sound.muteStorageKey).toBe('string')
    expect(GAME_CONFIG.sound.muteStorageKey.length).toBeGreaterThan(0)
  })
})

describe('GAME_CONFIG.juice', () => {
  it('juice セクションが存在する', () => {
    expect(GAME_CONFIG.juice).toBeDefined()
  })

  it('hitStopScale が 0〜1', () => {
    expect(GAME_CONFIG.juice.hitStopScale).toBeGreaterThanOrEqual(0)
    expect(GAME_CONFIG.juice.hitStopScale).toBeLessThanOrEqual(1)
  })

  it('hitStopDurationSec > 0', () => {
    expect(GAME_CONFIG.juice.hitStopDurationSec).toBeGreaterThan(0)
  })

  it('killShakeIntensity > 0', () => {
    expect(GAME_CONFIG.juice.killShakeIntensity).toBeGreaterThan(0)
  })

  it('killFlashParticles > 0', () => {
    expect(GAME_CONFIG.juice.killFlashParticles).toBeGreaterThan(0)
  })

  it('comboMilestones が at 昇順', () => {
    const ms = GAME_CONFIG.juice.comboMilestones
    for (let i = 1; i < ms.length; i++) {
      expect(ms[i].at).toBeGreaterThan(ms[i - 1].at)
    }
  })

  it('comboMilestones の label が空でない', () => {
    for (const m of GAME_CONFIG.juice.comboMilestones) {
      expect(m.label.length).toBeGreaterThan(0)
    }
  })

  it('nearMissGapPx > 0', () => {
    expect(GAME_CONFIG.juice.nearMissGapPx).toBeGreaterThan(0)
  })

  it('nearMissScore > 0', () => {
    expect(GAME_CONFIG.juice.nearMissScore).toBeGreaterThan(0)
  })

  it('nearMissMinIntervalSec > 0', () => {
    expect(GAME_CONFIG.juice.nearMissMinIntervalSec).toBeGreaterThan(0)
  })

  it('milestoneInterval > 0', () => {
    expect(GAME_CONFIG.juice.milestoneInterval).toBeGreaterThan(0)
  })

  it('milestoneTextSize > 0', () => {
    expect(GAME_CONFIG.juice.milestoneTextSize).toBeGreaterThan(0)
  })

  it('speedLines.enabled が boolean', () => {
    expect(typeof GAME_CONFIG.juice.speedLines.enabled).toBe('boolean')
  })

  it('speedLines の数値が正', () => {
    const sl = GAME_CONFIG.juice.speedLines
    expect(sl.minSpeed).toBeGreaterThan(0)
    expect(sl.fullSpeed).toBeGreaterThan(sl.minSpeed)
    expect(sl.count).toBeGreaterThan(0)
    expect(sl.alpha).toBeGreaterThan(0)
    expect(sl.width).toBeGreaterThan(0)
    expect(sl.lenMin).toBeGreaterThan(0)
    expect(sl.lenMax).toBeGreaterThan(sl.lenMin)
    expect(sl.speedMult).toBeGreaterThan(0)
  })
})
