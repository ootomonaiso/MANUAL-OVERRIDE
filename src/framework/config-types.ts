/**
 * src/framework/config-types.ts
 *
 * JSON設定ファイルのTypeScript型定義。
 * 各セクション（physics.json, shoot.json, ...）の構造を定義する。
 *
 * PHYSICS(tunables) と PLAYER_PHYSICS(gameBalance) を physics セクションで統合。
 * TEMPO_SPEED_BONUS と DIFFICULTY.tempoSpeedBonus も difficulty セクションに統合。
 */

import type { Controls } from '../domain/types'

/** physics.json — プレイヤー物理（旧 PHYSICS + PLAYER_PHYSICS 統合） */
export interface PhysicsConfig {
  defaultGravity: number
  defaultPlayerMaxHp: number
  playerWidth: number
  playerHeight: number
  playerStartX: number
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
  /** 地面Y座標のキャンバス下端からのオフセット（px） */
  groundYOffset: number
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
  hazardCullBelow: number
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
  defaultColorTouchScore: number
  distanceScoreRate: number
  longAirScoreRate: number
  /** エンディンググレードの閾値（合計スコア） */
  gradeThresholds: { S: number; A: number; B: number; C: number }
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
  infiniteUpdateInterval: number
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
  defaultBpm: number
  bpmTempoBonus: number
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
  justInputMinQuality: number
  justInputScoreBase: number
  justInputPopupOffsetY: number
  justInputParticleVy: number
  justInputParticleLife: number
  justInputParticleSize: number
}

/** stealth.json — ステルス */
export interface StealthConfig {
  stealthAlpha: number
  stealthDurationSec: number
  stealthCooldownSec: number
  stealthSafeBonus: number
  detectionRange: number
}

/** bayes.json — ベイズ収束 */
export interface BayesConfig {
  convergenceThreshold: number
  minProb: number
  dominanceRatio: number
  decayRate: number
  baseDecay: number
  candidateThreshold: number
}

/** special.json — 特殊フィーチャー (タワー / ボス撃破 / タイムボーナス) */
export interface SpecialConfig {
  towerFireIntervalSec: number
  towerRangePx: number
  towerKillScore: number
  bossKillScore: number
  timeBonusIntervalSec: number
  timeBonusScore: number
}

/** puzzle.json — パズルフィーチャー */
export interface PuzzleConfig {
  gridSize: number
  movePhaseSec: number
  solvePhaseSec: number
  solveScore: number
}

/** extra_movement.json — 拡張移動フィーチャー */
export interface ExtraMovementConfig {
  verticalDriftFreq: number
  verticalDriftAmp: number
  wallJumpParticleCount: number
  wallJumpParticleAngleSpread: number
  wallJumpParticleSpeedMin: number
  wallJumpParticleSpeedRange: number
  wallJumpParticleVyBoost: number
  wallJumpParticleLife: number
  wallJumpParticleColor: string
  wallJumpParticleSize: number
  dashParticleCount: number
  dashParticleSpeedMin: number
  dashParticleSpeedRange: number
  dashParticleSpreadX: number
  dashParticleSpreadY: number
  dashParticleLife: number
  dashParticleColor: string
  dashParticleSize: number
  dashTrailParticleVy: number
  dashTrailParticleSpreadY: number
  dashTrailParticleLife: number
  dashTrailParticleColor: string
  dashTrailParticleSize: number
  dashTrailAlphaMax: number
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
  genreLockedBoostMult: number
  genreLockedBoostDurationMs: number
  defaultFallbackGenre: string
  /** ジャンルパラメータのジッター幅（±20%） */
  paramJitterRange: number
}

/**
 * ジャンルのビジュアル設定。
 * TSプラグイン（XxxPlugin.ts）を書かなくても、この設定だけでCanvas描画が決まる。
 *
 * template: ベースとなるビジュアルスタイル（省略時はthemeから自動選択）
 *   - 'runner'  → 横スクロール・地上風景
 *   - 'space'   → 宇宙・SF（STG系）
 *   - 'dungeon' → 暗い洞窟・RPG系
 *   - 'rhythm'  → ネオン・音楽系
 *   - 'puzzle'  → 明るい・パズル系
 *   - 'aquatic' → 水中・海洋系
 */
export interface GenreVisualConfig {
  template?: 'runner' | 'space' | 'dungeon' | 'rhythm' | 'puzzle' | 'aquatic'
  skyColors?: [string, string]
  groundColor?: string
  farLayerColor?: string
  midLayerColor?: string
  starColor?: string
  palette?: {
    danger?: string
    dangerGlow?: string
    safe?: string
    safeGlow?: string
  }
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
  /** TSプラグインなしでビジュアルをカスタマイズする場合に指定。省略時はthemeから自動決定。 */
  visual?: GenreVisualConfig
}

export interface ThemeColorDef {
  accent: string
  border: string
  hint?: string
  font?: string
  bg?: string
  glow?: string
}

export interface GenresConfig {
  genres: GenreDefJSON[]
  themeColors?: Record<string, ThemeColorDef>
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
  bayes: BayesConfig
  special: SpecialConfig
  puzzle: PuzzleConfig
  extra_movement: ExtraMovementConfig
}

export type GameConfigSection = keyof GameConfigMap
