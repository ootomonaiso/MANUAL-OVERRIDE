/**
 * src/framework/config-types.ts
 *
 * JSON設定ファイルのTypeScript型定義。
 * 各セクション（physics.json, shoot.json, ...）の構造を定義する。
 *
 * PHYSICS(tunables) と PLAYER_PHYSICS(gameBalance) を physics セクションで統合。
 * TEMPO_SPEED_BONUS と DIFFICULTY.tempoSpeedBonus も difficulty セクションに統合。
 */

import type { GenreId, FeatureId, ManualTheme, EnvironmentId, ScrollDirection, Controls } from '../domain/types'

/** physics.json — プレイヤー物理（旧 PHYSICS + PLAYER_PHYSICS 統合） */
export interface PhysicsConfig {
  playerWidth: number
  playerHeight: number
  jumpVelocity: number
  doubleJumpVelocity: number
  jumpCutMultiplier: number
  gravity: number
  fallGravityMult: number
  runSpeed: number
  slowPreciseRatio: number
  landSquashDecay: number
  landSquashAmount: number
  coyoteFrames: number
  jumpBufferFrames: number
  playerMinX: number
  playerMaxXRatio: number
  airFrictionX: number
  dashSpeed: number
  dashDurationSec: number
  dashCooldownSec: number
  dashIframesSec: number
  wallJumpPushSpeed: number
}

/** shoot.json — 射撃システム */
export interface ShootConfig {
  bulletSpeed: number
  bulletWidth: number
  bulletHeight: number
  bulletOutOfBoundsX: number
  shotCooldown: number
  comboResetTime: number
  baseScorePerKill: number
  threeWaySpeedRatio: number
  threeWayYRatio: number
}

/** throw.json — 投擲エンジン */
export interface ThrowConfig {
  gravity: number
  maxPower: number
  airFriction: number
  powerDistanceDivisor: number
  speedMultiplier: number
  outOfBoundsRight: number
  outOfBoundsLeft: number
  landingMargin: number
}

/** spawn.json — ハザード・アイテムスポーン */
export interface SpawnConfig {
  firstSpawnDist: number
  enemyHpAmount: number
  defaultFloatAmp: number
  airMinOffset: number
  airRandOffset: number
  floatMinOffset: number
  floatRandOffset: number
  hazardCullLeft: number
  itemCullLeft: number
  spawnWeightMaxDist: number
  itemDropChance: number
  itemExpChance: number
  itemOffsetX: number
  itemGroundOffsetY: number
  expItemScore: number
  expItemExpGain: number
  itemPulseRate: number
  hazardSpawnOffsetX: number
}

/** vfx.json — 視覚エフェクト */
export interface VfxConfig {
  hitShakeIntensity: number
  deathShakeIntensity: number
  shakeDecay: number
  deathShakeDecay: number
  shakeEpsilon: number
  particleGravity: number
  deathParticleGravity: number
  deathSlowMoFactor: number
  jumpParticleCount: number
  jumpParticleSpeedMin: number
  jumpParticleSpeedMax: number
  jumpParticleLife: number
  jumpParticleSpread: number
  jumpParticleOffsetX: number
  jumpParticleColor: string
  jumpParticleSize: number
  landParticleCount: number
  landParticleSpeedMin: number
  landParticleSpeedMax: number
  landParticleLife: number
  landParticleOffsetX: number
  landParticleYRatio: number
  landParticleColor: string
  landParticleSize: number
  hitParticleCount: number
  hitParticleSpeedMin: number
  hitParticleSpeedMax: number
  hitParticleYBoost: number
  hitParticleLifeMin: number
  hitParticleLifeRange: number
  hitParticleSizeBase: number
  hitParticleSizeRange: number
  deathParticleCount: number
  deathParticleSpeedMin: number
  deathParticleSpeedMax: number
  deathParticleYBoost: number
  deathParticleLifeMin: number
  deathParticleLifeRange: number
  deathParticleSizeMin: number
  deathParticleSizeRange: number
  deathParticleColors: string[]
  stretchUpX: number
  stretchUpY: number
  stretchUpThreshold: number
  invincibleBlinkRate: number
  invincibleDuration: number
  runCycleRate: number
  hazardPulseRate: number
}

/** camera.json — カメラ・視差スクロール */
export interface CameraConfig {
  leadOffset: number
  parallaxStars: number
  parallaxFar: number
  parallaxMid: number
  parallaxGround: number
}

/** background.json — 背景描画 */
export interface BackgroundConfig {
  groundHeight: number
  groundLineAlpha: number
  groundLineHeight: number
  dashLength: number
  dashInterval: number
  dashOffsetY: number
  dashAlpha: number
  dashHeight: number
  starSectorWidth: number
  starCountPerSector: number
  starSizeMin: number
  starSizeRange: number
  starAlphaMin: number
  starAlphaStep: number
  starMaxYRatio: number
  mountainStep: number
  mountainAlpha: number
  mountainAmp1: number
  mountainFreq1: number
  mountainAmp2: number
  mountainFreq2: number
  mountainAmp3: number
  mountainFreq3: number
  mountainBase: number
  buildingAlpha: number
  buildingSectorW: number
  buildingMinH: number
  buildingRandH: number
  buildingMinW: number
  buildingRandW: number
}

/** hazard_vfx.json — ハザード描画 */
export interface HazardVfxConfig {
  glowBlur: number
  pulseSpeed: number
  pulseAmplitude: number
  hpBarHeight: number
  hpBarOffsetY: number
  hpBarBgAlpha: number
  hpBarHighColor: string
  hpBarLowColor: string
  hpBarThreshold: number
  rectCornerRadius: number
  edgeHighlightLineW: number
  lightenTopAmount: number
  lightenEdgeAmount: number
  pillarCapOffset: number
  pillarCapHeight: number
  pillarHighlightStop: number
  pillarHighlightAmount: number
  diamondEdgeLineW: number
}

/** ui.json — UI表示 */
export interface UiConfig {
  popupLifeSec: number
  popupRiseVy: number
  popupFont: string
  deathOverlayAlpha: number
  deathFadeSpeed: number
  deathTextDelayS: number
  deathTextFadeSpeed: number
  deathTitleFont: string
  deathSubFont: string
  deathSubTextAlpha: number
  beatMarkerAlphaDivisor: number
  beatMarkerMaxAlpha: number
  beatMarkerColor: string
  beatMarkerLineW: number
  beatMarkerDash: number[]
}

/** score.json — スコア */
export interface ScoreConfig {
  distanceScoreRate: number
  longAirScoreRate: number
}

/** difficulty.json — 難易度 + TEMPO_SPEED_BONUS */
export interface DifficultyConfig {
  updateDistancesInitial: number[]
  updateDistancesBaseInterval: number
  updateDistancesCount: number
  genreLockedPlayDist: number
  tempoSpeedBonus: number
  enemyDensityRate: number
  globalDifficultyMult: number
}

/** boss.json — ボス */
export interface BossConfig {
  firstBossDist: number
  bossRespawnDist: number
  bossHp: number
  arenaHpBonus: number
  bossWidth: number
  bossHeight: number
  bossCollisionGrace: number
  bossSpawnShake: number
  bossDeathShake: number
  bossDeathParticles: number
}

/** rhythm_tuning.json — リズムゲーム */
export interface RhythmTuningConfig {
  minBpm: number
  maxBpm: number
  justWindowSec: number
  justMultiplier: number
  goodWindowMult: number
  goodMultiplier: number
  beatHazardFlipChance: number
  beatSpawnBurstRate: number
  beatDashMult: number
  beatDashFrames: number
}

/** stealth.json — ステルス */
export interface StealthConfig {
  stealthAlpha: number
  stealthDurationSec: number
  stealthCooldownSec: number
  stealthSafeBonus: number
  detectionRange: number
}

/** genre_params.json — ジャンルパラメータ設計支援 */
export interface GenreParamsConfig {
  recommendedSingleChoice: number
  recommendedMaxPerAxis: number
  thresholdGuide: {
    singleAxis: number
    dualAxis: number
    tripleAxis: number
  }
}

/** game_balance.json — スコア比率・スクロール速度 */
export interface GameBalanceConfig {
  scoreRatioPlay: number
  scoreRatioThrow: number
  throwScoreWeightsAirTime: number
  throwScoreWeightsArcHeight: number
  throwScoreWeightsSpeedPenalty: number
  baseScrollSpeed: number
  hazardSpawnBaseInterval: number
  hazardSpawnMinInterval: number
  hazardSpawnDecayRate: number
  distanceAccelMaxBonus: number
  distanceAccelFullDist: number
  maxRounds: number
}

/** genres.json — ジャンル定義テーブル */
export interface GenreDefJSON {
  id: string
  label: string
  thresholds: Record<string, number>
  enableFeatures: string[]
  disableFeatures: string[]
  scoreFormula: string
  manualReveal: string
  endingFlavor?: string
  theme: string
  bgColor: string
  environment?: string
  scrollDirection?: string
  gravity?: number
  controls?: Partial<Controls>
}

export interface GenresConfig {
  genres: GenreDefJSON[]
}

/** GameConfigMap: セクション名 → 設定オブジェクトのマッピング */
export interface GameConfigMap {
  physics: PhysicsConfig
  shoot: ShootConfig
  throw: ThrowConfig
  spawn: SpawnConfig
  vfx: VfxConfig
  camera: CameraConfig
  background: BackgroundConfig
  hazard_vfx: HazardVfxConfig
  ui: UiConfig
  score: ScoreConfig
  difficulty: DifficultyConfig
  boss: BossConfig
  rhythm_tuning: RhythmTuningConfig
  stealth: StealthConfig
  genre_params: GenreParamsConfig
  game_balance: GameBalanceConfig
  genres: GenresConfig
}

export type GameConfigSection = keyof GameConfigMap
