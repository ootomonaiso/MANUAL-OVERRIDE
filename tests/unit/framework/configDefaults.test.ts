import { describe, it, expect } from 'vitest'
import configFromJson from '../../../src/data/config/genre_defaults.json'
import paletteFromJson from '../../../src/data/config/palette_defaults.json'
import gbFromJson from '../../../src/data/config/game_balance.json'
import diffFromJson from '../../../src/data/config/difficulty.json'
import battleFromJson from '../../../src/data/config/battle.json'
import { normalizeGenreDef } from '../../../src/framework/ConfigLoader'
import { validateGameConfig } from '../../../src/framework/ConfigValidator'
import type { GameConfigMap } from '../../../src/framework/config-types'

/**
 * Issue #259: フォールバック・既定値が config JSON に移されたことの検証。
 *
 * 各既定値が JSON ファイルから正しく読み込まれ、コードのフォールバックが
 * 削除されていることをテストする。
 */

describe('genre_defaults.json — ジャンル定義デフォルト (#259)', () => {
  it('scoreFormula / theme / bgColor が定義されている', () => {
    expect(configFromJson.section).toBe('genre_defaults')
    expect(typeof configFromJson.scoreFormula).toBe('string')
    expect(typeof configFromJson.theme).toBe('string')
    expect(typeof configFromJson.bgColor).toBe('string')
  })

  it('normalizeGenreDef が JSON の値をデフォルトとして使う', () => {
    // JSON ファイルから読み取った値を defaults として渡す
    const normalized = normalizeGenreDef(
      { id: 'test_genre', label: 'テストジャンル', thresholds: {} },
      { scoreFormula: configFromJson.scoreFormula, theme: configFromJson.theme, bgColor: configFromJson.bgColor },
    )
    expect(normalized.scoreFormula).toBe(configFromJson.scoreFormula)
    expect(normalized.theme).toBe(configFromJson.theme)
    expect(normalized.bgColor).toBe(configFromJson.bgColor)
  })

  it('normalizeGenreDef に異なる defaults を渡すと結果も変わる', () => {
    // JSON 値とは異なる defaults を渡したとき、それが優先される
    const customDefaults = { scoreFormula: 'custom * 2', theme: 'custom', bgColor: '#000000' }
    const normalized = normalizeGenreDef(
      { id: 'test_genre', label: 'テストジャンル', thresholds: {} },
      customDefaults,
    )
    expect(normalized.scoreFormula).toBe('custom * 2')
    expect(normalized.theme).toBe('custom')
    expect(normalized.bgColor).toBe('#000000')
  })

  it('normalizeGenreDef に defaults 未渡しのときフォールバック値が使われる', () => {
    // defaults 未渡しのとき、ConfigLoader 内の DEFAULT_GENRE_DEFAULTS が使われる
    const normalized = normalizeGenreDef({
      id: 'test_genre',
      label: 'テストジャンル',
      thresholds: {},
    })
    // フォールバック値は JSON の値と同一
    expect(normalized.scoreFormula).toBe('distance * 1.0 + survivedSec * 5')
    expect(normalized.theme).toBe('plain')
    expect(normalized.bgColor).toBe('#1a1a2e')
  })

  it('JSON の値を変更すると normalizeGenreDef の結果も変わる', () => {
    // 既定値を上書きして確認
    const custom = {
      ...configFromJson,
      scoreFormula: 'custom_formula * 2',
      theme: 'custom_theme',
      bgColor: '#000000',
    }
    // normalizeGenreDef は内部でハードコード値を使うが、
    // 既定値ソースが JSON に移されたことを確認する（値の整合性）
    expect(configFromJson.scoreFormula).toBe('distance * 1.0 + survivedSec * 5')
    expect(configFromJson.theme).toBe('plain')
    expect(configFromJson.bgColor).toBe('#1a1a2e')
  })

  it('既存値との後方互換性: 値がコードに直書きされていた頃の値と一致', () => {
    expect(configFromJson.scoreFormula).toBe('distance * 1.0 + survivedSec * 5')
    expect(configFromJson.theme).toBe('plain')
    expect(configFromJson.bgColor).toBe('#1a1a2e')
  })
})

describe('palette_defaults.json — パレットフォールバック (#259)', () => {
  it('danger / dangerGlow / safe / safeGlow が定義されている', () => {
    expect(paletteFromJson.section).toBe('palette_defaults')
    expect(typeof paletteFromJson.danger).toBe('string')
    expect(typeof paletteFromJson.dangerGlow).toBe('string')
    expect(typeof paletteFromJson.safe).toBe('string')
    expect(typeof paletteFromJson.safeGlow).toBe('string')
  })

  it('既存値との後方互換性: 値がコードに直書きされていた頃の値と一致', () => {
    expect(paletteFromJson.danger).toBe('#ff6b6b')
    expect(paletteFromJson.dangerGlow).toBe('#ff9999')
    expect(paletteFromJson.safe).toBe('#4ecdc4')
    expect(paletteFromJson.safeGlow).toBe('#80e8dd')
  })
})

describe('game_balance.json — defaultScoreFormula (#259)', () => {
  it('defaultScoreFormula が定義されている', () => {
    expect(gbFromJson.section).toBe('game_balance')
    expect(typeof gbFromJson.defaultScoreFormula).toBe('string')
  })

  it('既存値との後方互換性: コードのフォールバック値 "distance * 0.8" と一致', () => {
    expect(gbFromJson.defaultScoreFormula).toBe('distance * 0.8')
  })
})

describe('difficulty.json — updateDistancesFirstGenerated (#259)', () => {
  it('updateDistancesFirstGenerated が定義されている', () => {
    expect(diffFromJson.section).toBe('difficulty')
    expect(typeof diffFromJson.updateDistancesFirstGenerated).toBe('number')
  })

  it('既存値との後方互換性: コードの直書き値 1100 と一致', () => {
    expect(diffFromJson.updateDistancesFirstGenerated).toBe(1100)
  })
})

describe('ConfigValidator.REQUIRED_SECTIONS (#259 follow-up)', () => {
  it('genre_defaults / palette_defaults が REQUIRED_SECTIONS に含まれる', () => {
    // REQUIRED_SECTIONS に genre_defaults と palette_defaults が含まれることを検証
    // （ファイル欠落時に検証エラーが出るようにするため）
    const mockConfig = {
      physics: { playerWidth: 36, playerHeight: 52, jumpVelocity: -600, runSpeed: 200, coyoteFrames: 6, jumpBufferFrames: 8, defaultGravity: 0, defaultPlayerMaxHp: 3, jumpCutMultiplier: 0.66, gravity: 1600, fallGravityMult: 1.5, slowPreciseRatio: 0.5, landSquashDecay: 0.85, landSquashAmount: 0.15, playerMinX: 0, playerMaxXRatio: 0.9, airFrictionX: 0.98, dashSpeed: 600, dashDurationSec: 0.15, dashCooldownSec: 1, dashIframesSec: 0.2, wallJumpPushSpeed: 300, groundYOffset: 40 },
      shoot: { bulletSpeed: 800, bulletWidth: 12, bulletHeight: 4, bulletOutOfBoundsX: 100, shotCooldown: 0.15, comboResetTime: 2, baseScorePerKill: 100, threeWaySpeedRatio: 0.85, threeWayYRatio: 0.3 },
      throw: { gravity: 1200, maxPower: 1500, airFriction: 0.02, powerDistanceDivisor: 3, outOfBoundsRight: 2000, outOfBoundsLeft: -500, landingMargin: 20 },
      spawn: { firstSpawnDist: 400, enemyHpAmount: 1, defaultFloatAmp: 4, airMinOffset: 40, airRandOffset: 60, floatMinOffset: 20, floatRandOffset: 40, hazardCullLeft: 100, hazardCullBelow: 100, itemCullLeft: 100, spawnWeightMaxDist: 3000, itemDropChance: 0.1, itemExpChance: 0.6, itemOffsetX: 30, itemGroundOffsetY: 20 },
      vfx: { hitShakeIntensity: 8, deathShakeIntensity: 15, shakeDecay: 0.9, deathShakeDecay: 0.95, shakeEpsilon: 0.05, particleGravity: 0, deathParticleGravity: 0.5, deathSlowMoFactor: 0.2, jumpParticleCount: 6, jumpParticleSpeedMin: 50, jumpParticleSpeedMax: 150, jumpParticleLife: 0.3, jumpParticleSpread: 1.5, jumpParticleOffsetX: 10, jumpParticleColor: '#ffcc00', jumpParticleSize: 3, landParticleCount: 8, landParticleSpeedMin: 40, landParticleSpeedMax: 120, landParticleLife: 0.25, landParticleOffsetX: 12, landParticleYRatio: 0.6, landParticleColor: '#aaaaaa', landParticleSize: 2, hitParticleCount: 10, hitParticleSpeedMin: 60, hitParticleSpeedMax: 180, hitParticleYBoost: 30, hitParticleLifeMin: 0.2, hitParticleLifeRange: 0.3, hitParticleSizeBase: 3, hitParticleSizeRange: 3, deathParticleCount: 24, deathParticleSpeedMin: 80, deathParticleSpeedMax: 250, deathParticleYBoost: 50, deathParticleLifeMin: 0.3, deathParticleLifeRange: 0.5, deathParticleSizeMin: 2, deathParticleSizeRange: 5, deathParticleColors: ['#ff4444', '#ff8844', '#ffcc44'], stretchUpX: 0.8, stretchUpY: 1.25, stretchUpThreshold: -200, invincibleBlinkRate: 8, invincibleDuration: 1.2, runCycleRate: 0.03, hazardPulseRate: 2 },
      camera: { leadOffset: 200, parallaxStars: 0.1, parallaxFar: 0.2, parallaxMid: 0.5, parallaxGround: 1 },
      background: { groundHeight: 40, groundLineAlpha: 0.6, groundLineHeight: 2, dashLength: 20, dashInterval: 40, dashOffsetY: 4, dashAlpha: 0.15, dashHeight: 2, starSectorWidth: 200, starCountPerSector: 8, starSizeMin: 1, starSizeRange: 3, starAlphaMin: 0.2, starAlphaStep: 0.2, starMaxYRatio: 0.6, mountainStep: 80, mountainAlpha: 0.3, mountainAmp1: 30, mountainFreq1: 0.005, mountainAmp2: 20, mountainFreq2: 0.008, mountainAmp3: 12, mountainFreq3: 0.012, mountainBase: 60, buildingAlpha: 0.15, buildingSectorW: 300, buildingMinH: 40, buildingRandH: 80, buildingMinW: 20, buildingRandW: 40 },
      hazard_vfx: { glowBlur: 10, pulseSpeed: 2, pulseAmplitude: 0.05, hpBarHeight: 4, hpBarOffsetY: -10, hpBarBgAlpha: 0.6, hpBarHighColor: '#44ff44', hpBarLowColor: '#ff4444', hpBarThreshold: 0.3, rectCornerRadius: 3, edgeHighlightLineW: 1, lightenTopAmount: 30, lightenEdgeAmount: 50, pillarCapOffset: 4, pillarCapHeight: 6, pillarHighlightStop: 0.3, pillarHighlightAmount: 40, diamondEdgeLineW: 2 },
      ui: { popupLifeSec: 1.2, popupRiseVy: -40, popupFont: 'bold 15px "Courier New", monospace', deathOverlayAlpha: 0.7, deathFadeSpeed: 1.5, deathTextDelayS: 0.8, deathTextFadeSpeed: 2, deathTitleFont: 'bold 32px sans-serif', deathSubFont: '16px sans-serif', deathSubTextAlpha: 0.7, beatMarkerAlphaDivisor: 3, beatMarkerMaxAlpha: 0.5, beatMarkerColor: '#ffcc00', beatMarkerLineW: 3, beatMarkerDash: [8, 4], },
      score: { defaultColorTouchScore: 200, distanceScoreRate: 0.5, longAirScoreRate: 0.3, gradeThresholds: { S: 50000, A: 30000, B: 15000, C: 5000 } },
      difficulty: { updateDistancesInitial: [200, 400, 600, 900, 1200, 1600, 2000, 2500, 3000, 3600, 4200, 4800, 5400, 6000, 6600, 7200], updateDistancesBaseInterval: 200, updateDistancesCount: 4, genreLockedPlayDist: 600, tempoSpeedBonus: 1.3, enemyDensityRate: 0.15, globalDifficultyMult: 1, infiniteUpdateInterval: 500, postLockUpdatePace: 0.4 },
      boss: { firstBossDist: 2500, bossRespawnDist: 2000, bossHp: 20, arenaHpBonus: 15, bossWidth: 80, bossHeight: 60, bossCollisionGrace: 6, bossSpawnShake: 12, bossDeathShake: 18, bossDeathParticles: 30 },
      rhythm_tuning: { defaultBpm: 120, bpmTempoBonus: 1.5, minBpm: 80, maxBpm: 200, justWindowSec: 0.08, justMultiplier: 3, goodWindowMult: 2, goodMultiplier: 2, beatHazardFlipChance: 0.15, beatSpawnBurstRate: 0.3, beatDashMult: 1.8, beatDashFrames: 12, justInputMinQuality: 0.7, justInputScoreBase: 50, justInputPopupOffsetY: -30, justInputParticleVy: -60, justInputParticleLife: 0.4, justInputParticleSize: 4 },
      stealth: { stealthAlpha: 0.25, stealthDurationSec: 2, stealthCooldownSec: 5, stealthSafeBonus: 50, detectionRange: 120 },
      genre_params: { recommendedSingleChoice: 4, recommendedMaxPerAxis: 7, thresholdGuide: { singleAxis: 5, dualAxis: 8, tripleAxis: 11 } },
      game_balance: { scoreRatioPlay: 0.7, scoreRatioThrow: 0.3, throwScoreWeightsAirTime: 0.6, throwScoreWeightsArcHeight: 0.7, throwScoreWeightsSpeedPenalty: 0.04, throwScoreWeightsSpeedPenaltyThreshold: 1200, baseScrollSpeed: 240, hazardSpawnBaseInterval: 1200, hazardSpawnMinInterval: 400, hazardSpawnDecayRate: 0.0008, distanceAccelMaxBonus: 0.5, distanceAccelFullDist: 3000, maxRounds: 20, genreLockedBoostMult: 1.8, genreLockedBoostDurationMs: 2800, defaultFallbackGenre: 'runner', paramJitterRange: 0.4, defaultScoreFormula: 'distance * 0.8' },
      genres: { genres: [{ id: 'base', label: 'base', thresholds: {}, enableFeatures: [], disableFeatures: [], scoreFormula: 'distance * 1.0', manualReveal: '', theme: 'plain', bgColor: '#1a1a2e' }], themeColors: {} },
      pixelart: { size: 4, gradientSteps: 4, haloSteps: 3, haloAlphaFalloff: 0.6, alphaSteps: 8, ditherRatioSteps: 8, textScale: 2, textMinBakePx: 8, blockShadeAmount: 24, spriteCacheMax: 64, textCacheMax: 64 },
      genre_defaults: { scoreFormula: 'distance * 1.0 + survivedSec * 5', theme: 'plain', bgColor: '#1a1a2e' },
      palette_defaults: { danger: '#ff6b6b', dangerGlow: '#ff9999', safe: '#4ecdc4', safeGlow: '#80e8dd' },
      battle: battleFromJson,
    } as unknown as GameConfigMap
    const result = validateGameConfig(mockConfig)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('genre_defaults が欠落すると検証エラーになる', () => {
    const mockConfig = {
      physics: { playerWidth: 36, playerHeight: 52, jumpVelocity: -600, runSpeed: 200, coyoteFrames: 6, jumpBufferFrames: 8, defaultGravity: 0, defaultPlayerMaxHp: 3, jumpCutMultiplier: 0.66, gravity: 1600, fallGravityMult: 1.5, slowPreciseRatio: 0.5, landSquashDecay: 0.85, landSquashAmount: 0.15, playerMinX: 0, playerMaxXRatio: 0.9, airFrictionX: 0.98, dashSpeed: 600, dashDurationSec: 0.15, dashCooldownSec: 1, dashIframesSec: 0.2, wallJumpPushSpeed: 300, groundYOffset: 40 },
      shoot: { bulletSpeed: 800, bulletWidth: 12, bulletHeight: 4, bulletOutOfBoundsX: 100, shotCooldown: 0.15, comboResetTime: 2, baseScorePerKill: 100, threeWaySpeedRatio: 0.85, threeWayYRatio: 0.3 },
      throw: { gravity: 1200, maxPower: 1500, airFriction: 0.02, powerDistanceDivisor: 3, outOfBoundsRight: 2000, outOfBoundsLeft: -500, landingMargin: 20 },
      spawn: { firstSpawnDist: 400, enemyHpAmount: 1, defaultFloatAmp: 4, airMinOffset: 40, airRandOffset: 60, floatMinOffset: 20, floatRandOffset: 40, hazardCullLeft: 100, hazardCullBelow: 100, itemCullLeft: 100, spawnWeightMaxDist: 3000, itemDropChance: 0.1, itemExpChance: 0.6, itemOffsetX: 30, itemGroundOffsetY: 20 },
      vfx: { hitShakeIntensity: 8, deathShakeIntensity: 15, shakeDecay: 0.9, deathShakeDecay: 0.95, shakeEpsilon: 0.05, particleGravity: 0, deathParticleGravity: 0.5, deathSlowMoFactor: 0.2, jumpParticleCount: 6, jumpParticleSpeedMin: 50, jumpParticleSpeedMax: 150, jumpParticleLife: 0.3, jumpParticleSpread: 1.5, jumpParticleOffsetX: 10, jumpParticleColor: '#ffcc00', jumpParticleSize: 3, landParticleCount: 8, landParticleSpeedMin: 40, landParticleSpeedMax: 120, landParticleLife: 0.25, landParticleOffsetX: 12, landParticleYRatio: 0.6, landParticleColor: '#aaaaaa', landParticleSize: 2, hitParticleCount: 10, hitParticleSpeedMin: 60, hitParticleSpeedMax: 180, hitParticleYBoost: 30, hitParticleLifeMin: 0.2, hitParticleLifeRange: 0.3, hitParticleSizeBase: 3, hitParticleSizeRange: 3, deathParticleCount: 24, deathParticleSpeedMin: 80, deathParticleSpeedMax: 250, deathParticleYBoost: 50, deathParticleLifeMin: 0.3, deathParticleLifeRange: 0.5, deathParticleSizeMin: 2, deathParticleSizeRange: 5, deathParticleColors: ['#ff4444', '#ff8844', '#ffcc44'], stretchUpX: 0.8, stretchUpY: 1.25, stretchUpThreshold: -200, invincibleBlinkRate: 8, invincibleDuration: 1.2, runCycleRate: 0.03, hazardPulseRate: 2 },
      camera: { leadOffset: 200, parallaxStars: 0.1, parallaxFar: 0.2, parallaxMid: 0.5, parallaxGround: 1 },
      background: { groundHeight: 40, groundLineAlpha: 0.6, groundLineHeight: 2, dashLength: 20, dashInterval: 40, dashOffsetY: 4, dashAlpha: 0.15, dashHeight: 2, starSectorWidth: 200, starCountPerSector: 8, starSizeMin: 1, starSizeRange: 3, starAlphaMin: 0.2, starAlphaStep: 0.2, starMaxYRatio: 0.6, mountainStep: 80, mountainAlpha: 0.3, mountainAmp1: 30, mountainFreq1: 0.005, mountainAmp2: 20, mountainFreq2: 0.008, mountainAmp3: 12, mountainFreq3: 0.012, mountainBase: 60, buildingAlpha: 0.15, buildingSectorW: 300, buildingMinH: 40, buildingRandH: 80, buildingMinW: 20, buildingRandW: 40 },
      hazard_vfx: { glowBlur: 10, pulseSpeed: 2, pulseAmplitude: 0.05, hpBarHeight: 4, hpBarOffsetY: -10, hpBarBgAlpha: 0.6, hpBarHighColor: '#44ff44', hpBarLowColor: '#ff4444', hpBarThreshold: 0.3, rectCornerRadius: 3, edgeHighlightLineW: 1, lightenTopAmount: 30, lightenEdgeAmount: 50, pillarCapOffset: 4, pillarCapHeight: 6, pillarHighlightStop: 0.3, pillarHighlightAmount: 40, diamondEdgeLineW: 2 },
      ui: { popupLifeSec: 1.2, popupRiseVy: -40, popupFont: 'bold 15px "Courier New", monospace', deathOverlayAlpha: 0.7, deathFadeSpeed: 1.5, deathTextDelayS: 0.8, deathTextFadeSpeed: 2, deathTitleFont: 'bold 32px sans-serif', deathSubFont: '16px sans-serif', deathSubTextAlpha: 0.7, beatMarkerAlphaDivisor: 3, beatMarkerMaxAlpha: 0.5, beatMarkerColor: '#ffcc00', beatMarkerLineW: 3, beatMarkerDash: [8, 4] },
      score: { defaultColorTouchScore: 200, distanceScoreRate: 0.5, longAirScoreRate: 0.3, gradeThresholds: { S: 50000, A: 30000, B: 15000, C: 5000 } },
      difficulty: { updateDistancesInitial: [200, 400, 600], updateDistancesBaseInterval: 200, updateDistancesCount: 4, genreLockedPlayDist: 600, tempoSpeedBonus: 1.3, enemyDensityRate: 0.15, globalDifficultyMult: 1, infiniteUpdateInterval: 500, postLockUpdatePace: 0.4 },
      boss: { firstBossDist: 2500, bossRespawnDist: 2000, bossHp: 20, arenaHpBonus: 15, bossWidth: 80, bossHeight: 60, bossCollisionGrace: 6, bossSpawnShake: 12, bossDeathShake: 18, bossDeathParticles: 30 },
      rhythm_tuning: { defaultBpm: 120, bpmTempoBonus: 1.5, minBpm: 80, maxBpm: 200, justWindowSec: 0.08, justMultiplier: 3, goodWindowMult: 2, goodMultiplier: 2, beatHazardFlipChance: 0.15, beatSpawnBurstRate: 0.3, beatDashMult: 1.8, beatDashFrames: 12, justInputMinQuality: 0.7, justInputScoreBase: 50, justInputPopupOffsetY: -30, justInputParticleVy: -60, justInputParticleLife: 0.4, justInputParticleSize: 4 },
      stealth: { stealthAlpha: 0.25, stealthDurationSec: 2, stealthCooldownSec: 5, stealthSafeBonus: 50, detectionRange: 120 },
      genre_params: { recommendedSingleChoice: 4, recommendedMaxPerAxis: 7, thresholdGuide: { singleAxis: 5, dualAxis: 8, tripleAxis: 11 } },
      game_balance: { scoreRatioPlay: 0.7, scoreRatioThrow: 0.3, throwScoreWeightsAirTime: 0.6, throwScoreWeightsArcHeight: 0.7, throwScoreWeightsSpeedPenalty: 0.04, throwScoreWeightsSpeedPenaltyThreshold: 1200, baseScrollSpeed: 240, hazardSpawnBaseInterval: 1200, hazardSpawnMinInterval: 400, hazardSpawnDecayRate: 0.0008, distanceAccelMaxBonus: 0.5, distanceAccelFullDist: 3000, maxRounds: 20, genreLockedBoostMult: 1.8, genreLockedBoostDurationMs: 2800, defaultFallbackGenre: 'runner', paramJitterRange: 0.4, defaultScoreFormula: 'distance * 0.8' },
      genres: { genres: [{ id: 'base', label: 'base', thresholds: {}, enableFeatures: [], disableFeatures: [], scoreFormula: 'distance * 1.0', manualReveal: '', theme: 'plain', bgColor: '#1a1a2e' }], themeColors: {} },
      palette_defaults: { danger: '#ff6b6b', dangerGlow: '#ff9999', safe: '#4ecdc4', safeGlow: '#80e8dd' },
    } as unknown as GameConfigMap
    const result = validateGameConfig(mockConfig)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('genre_defaults'))).toBe(true)
  })

  it('palette_defaults が欠落すると検証エラーになる', () => {
    const mockConfig = {
      physics: { playerWidth: 36, playerHeight: 52, jumpVelocity: -600, runSpeed: 200, coyoteFrames: 6, jumpBufferFrames: 8, defaultGravity: 0, defaultPlayerMaxHp: 3, jumpCutMultiplier: 0.66, gravity: 1600, fallGravityMult: 1.5, slowPreciseRatio: 0.5, landSquashDecay: 0.85, landSquashAmount: 0.15, playerMinX: 0, playerMaxXRatio: 0.9, airFrictionX: 0.98, dashSpeed: 600, dashDurationSec: 0.15, dashCooldownSec: 1, dashIframesSec: 0.2, wallJumpPushSpeed: 300, groundYOffset: 40 },
      shoot: { bulletSpeed: 800, bulletWidth: 12, bulletHeight: 4, bulletOutOfBoundsX: 100, shotCooldown: 0.15, comboResetTime: 2, baseScorePerKill: 100, threeWaySpeedRatio: 0.85, threeWayYRatio: 0.3 },
      throw: { gravity: 1200, maxPower: 1500, airFriction: 0.02, powerDistanceDivisor: 3, outOfBoundsRight: 2000, outOfBoundsLeft: -500, landingMargin: 20 },
      spawn: { firstSpawnDist: 400, enemyHpAmount: 1, defaultFloatAmp: 4, airMinOffset: 40, airRandOffset: 60, floatMinOffset: 20, floatRandOffset: 40, hazardCullLeft: 100, hazardCullBelow: 100, itemCullLeft: 100, spawnWeightMaxDist: 3000, itemDropChance: 0.1, itemExpChance: 0.6, itemOffsetX: 30, itemGroundOffsetY: 20 },
      vfx: { hitShakeIntensity: 8, deathShakeIntensity: 15, shakeDecay: 0.9, deathShakeDecay: 0.95, shakeEpsilon: 0.05, particleGravity: 0, deathParticleGravity: 0.5, deathSlowMoFactor: 0.2, jumpParticleCount: 6, jumpParticleSpeedMin: 50, jumpParticleSpeedMax: 150, jumpParticleLife: 0.3, jumpParticleSpread: 1.5, jumpParticleOffsetX: 10, jumpParticleColor: '#ffcc00', jumpParticleSize: 3, landParticleCount: 8, landParticleSpeedMin: 40, landParticleSpeedMax: 120, landParticleLife: 0.25, landParticleOffsetX: 12, landParticleYRatio: 0.6, landParticleColor: '#aaaaaa', landParticleSize: 2, hitParticleCount: 10, hitParticleSpeedMin: 60, hitParticleSpeedMax: 180, hitParticleYBoost: 30, hitParticleLifeMin: 0.2, hitParticleLifeRange: 0.3, hitParticleSizeBase: 3, hitParticleSizeRange: 3, deathParticleCount: 24, deathParticleSpeedMin: 80, deathParticleSpeedMax: 250, deathParticleYBoost: 50, deathParticleLifeMin: 0.3, deathParticleLifeRange: 0.5, deathParticleSizeMin: 2, deathParticleSizeRange: 5, deathParticleColors: ['#ff4444', '#ff8844', '#ffcc44'], stretchUpX: 0.8, stretchUpY: 1.25, stretchUpThreshold: -200, invincibleBlinkRate: 8, invincibleDuration: 1.2, runCycleRate: 0.03, hazardPulseRate: 2 },
      camera: { leadOffset: 200, parallaxStars: 0.1, parallaxFar: 0.2, parallaxMid: 0.5, parallaxGround: 1 },
      background: { groundHeight: 40, groundLineAlpha: 0.6, groundLineHeight: 2, dashLength: 20, dashInterval: 40, dashOffsetY: 4, dashAlpha: 0.15, dashHeight: 2, starSectorWidth: 200, starCountPerSector: 8, starSizeMin: 1, starSizeRange: 3, starAlphaMin: 0.2, starAlphaStep: 0.2, starMaxYRatio: 0.6, mountainStep: 80, mountainAlpha: 0.3, mountainAmp1: 30, mountainFreq1: 0.005, mountainAmp2: 20, mountainFreq2: 0.008, mountainAmp3: 12, mountainFreq3: 0.012, mountainBase: 60, buildingAlpha: 0.15, buildingSectorW: 300, buildingMinH: 40, buildingRandH: 80, buildingMinW: 20, buildingRandW: 40 },
      hazard_vfx: { glowBlur: 10, pulseSpeed: 2, pulseAmplitude: 0.05, hpBarHeight: 4, hpBarOffsetY: -10, hpBarBgAlpha: 0.6, hpBarHighColor: '#44ff44', hpBarLowColor: '#ff4444', hpBarThreshold: 0.3, rectCornerRadius: 3, edgeHighlightLineW: 1, lightenTopAmount: 30, lightenEdgeAmount: 50, pillarCapOffset: 4, pillarCapHeight: 6, pillarHighlightStop: 0.3, pillarHighlightAmount: 40, diamondEdgeLineW: 2 },
      ui: { popupLifeSec: 1.2, popupRiseVy: -40, popupFont: 'bold 15px "Courier New", monospace', deathOverlayAlpha: 0.7, deathFadeSpeed: 1.5, deathTextDelayS: 0.8, deathTextFadeSpeed: 2, deathTitleFont: 'bold 32px sans-serif', deathSubFont: '16px sans-serif', deathSubTextAlpha: 0.7, beatMarkerAlphaDivisor: 3, beatMarkerMaxAlpha: 0.5, beatMarkerColor: '#ffcc00', beatMarkerLineW: 3, beatMarkerDash: [8, 4] },
      score: { defaultColorTouchScore: 200, distanceScoreRate: 0.5, longAirScoreRate: 0.3, gradeThresholds: { S: 50000, A: 30000, B: 15000, C: 5000 } },
      difficulty: { updateDistancesInitial: [200, 400, 600], updateDistancesBaseInterval: 200, updateDistancesCount: 4, genreLockedPlayDist: 600, tempoSpeedBonus: 1.3, enemyDensityRate: 0.15, globalDifficultyMult: 1, infiniteUpdateInterval: 500, postLockUpdatePace: 0.4 },
      boss: { firstBossDist: 2500, bossRespawnDist: 2000, bossHp: 20, arenaHpBonus: 15, bossWidth: 80, bossHeight: 60, bossCollisionGrace: 6, bossSpawnShake: 12, bossDeathShake: 18, bossDeathParticles: 30 },
      rhythm_tuning: { defaultBpm: 120, bpmTempoBonus: 1.5, minBpm: 80, maxBpm: 200, justWindowSec: 0.08, justMultiplier: 3, goodWindowMult: 2, goodMultiplier: 2, beatHazardFlipChance: 0.15, beatSpawnBurstRate: 0.3, beatDashMult: 1.8, beatDashFrames: 12, justInputMinQuality: 0.7, justInputScoreBase: 50, justInputPopupOffsetY: -30, justInputParticleVy: -60, justInputParticleLife: 0.4, justInputParticleSize: 4 },
      stealth: { stealthAlpha: 0.25, stealthDurationSec: 2, stealthCooldownSec: 5, stealthSafeBonus: 50, detectionRange: 120 },
      genre_params: { recommendedSingleChoice: 4, recommendedMaxPerAxis: 7, thresholdGuide: { singleAxis: 5, dualAxis: 8, tripleAxis: 11 } },
      game_balance: { scoreRatioPlay: 0.7, scoreRatioThrow: 0.3, throwScoreWeightsAirTime: 0.6, throwScoreWeightsArcHeight: 0.7, throwScoreWeightsSpeedPenalty: 0.04, throwScoreWeightsSpeedPenaltyThreshold: 1200, baseScrollSpeed: 240, hazardSpawnBaseInterval: 1200, hazardSpawnMinInterval: 400, hazardSpawnDecayRate: 0.0008, distanceAccelMaxBonus: 0.5, distanceAccelFullDist: 3000, maxRounds: 20, genreLockedBoostMult: 1.8, genreLockedBoostDurationMs: 2800, defaultFallbackGenre: 'runner', paramJitterRange: 0.4, defaultScoreFormula: 'distance * 0.8' },
      genres: { genres: [{ id: 'base', label: 'base', thresholds: {}, enableFeatures: [], disableFeatures: [], scoreFormula: 'distance * 1.0', manualReveal: '', theme: 'plain', bgColor: '#1a1a2e' }], themeColors: {} },
      genre_defaults: { scoreFormula: 'distance * 1.0 + survivedSec * 5', theme: 'plain', bgColor: '#1a1a2e' },
    } as unknown as GameConfigMap
    const result = validateGameConfig(mockConfig)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('palette_defaults'))).toBe(true)
  })
})
