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
  /** 生成式初期値（1100 + baseInterval * i の 1100 部分） */
  updateDistancesFirstGenerated: number
  updateDistancesBaseInterval: number
  updateDistancesCount: number
  genreLockedPlayDist: number
  tempoSpeedBonus: number
  enemyDensityRate: number
  globalDifficultyMult: number
  infiniteUpdateInterval: number
  postLockUpdatePace: number
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
  minProb: number
  dominanceRatio: number
  decayRate: number
  baseDecay: number
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

/** puzzle.json — パズルフィーチャー (スライド移動パズル) */
export interface PuzzleGridConfig {
  n: number
  /** このサイズで採用する盤面の目標最短手数（下限） */
  minMoves: number
  /** このサイズで採用する盤面の目標最短手数（上限） */
  maxMoves: number
  timeSec: number
  weightStart: number
  weightEnd: number
}

export interface PuzzleConfig {
  grids: PuzzleGridConfig[]
  cellPx: number
  weightMaxDist: number
  /** 各セルが壁になる確率 0〜1（盤面生成の壁密度） */
  wallRatio: number
  /** 盤面生成の再試行上限。到達時は目標手数に最も近い盤面へフォールバック */
  maxGenAttempts: number
  /** 制限時間スケールの下限（元の時間に対する割合。これ以上は短くしない） */
  timeScaleMin: number
  /** 制限時間が半減するまでの問題数。第(1+N)問で 0.5 倍になる（第1問=1.0倍） */
  timeHalfLifeSteps: number
}

/** survival.json — サバイバルゲーム固有パラメータ */
export interface SurvivalConfig {
  maxHunger: number
  hungerDecayRate: number
  hungerCriticalThreshold: number
  hungerDamageInterval: number
  hungerDamageAmount: number
  meleeDamage: number
  meleeRange: number
  meleeCooldown: number
  meleeArc: number
  meleeActiveRatio: number
  meleeVerticalRatio: number
  meleeCollisionGrace: number
  xpPerKill: number
  xpPerLevel: number
  xpLevelScale: number
  levelUpHealHp: number
  levelUpDamageBonus: number
  foodRestore: number
  weaponDropChance: number
  foodDropChance: number
  weaponUpgradeAmount: number
  hudBarHeight: number
  hudTextSize: number
  hudTopOffset: number
  hudBarWidth: number
  // Melee hit VFX
  meleeHitParticleCount: number
  meleeHitParticleSpeedMin: number
  meleeHitParticleSpeedMax: number
  meleeHitParticleLife: number
  meleeHitParticleColor: string
  meleeHitParticleSize: number
  // Melee swing VFX
  meleeSwingStrokeColor: string
  meleeSwingLineWidth: number
  meleeSwingShadowColor: string
  meleeSwingShadowBlur: number
  // Level up VFX
  levelUpParticleCount: number
  levelUpParticleSpeedMin: number
  levelUpParticleSpeedMax: number
  levelUpParticleLife: number
  levelUpParticleColors: readonly string[]
  levelUpParticleSize: number
  levelUpShakeIntensity: number
  levelUpPopupColor: string
  // Popup colors
  foodPopupColor: string
  weaponPopupColor: string
  // HUD colors
  hudLabelColor: string
  hudHungerColorHigh: string
  hudHungerColorMid: string
  hudHungerColorLow: string
  hudBarBgColor: string
  hudXpTextColor: string
  hudXpBarColor: string
  hudAtkTextColor: string
  hudPanelBgColor: string
  hudPanelPadding: number
  hudPanelRadius: number
  // Kill VFX
  killPopupColor: string
  killParticleCount: number
  killParticleSpeedMin: number
  killParticleSpeedMax: number
  killParticleLife: number
  killParticleColors: readonly string[]
  killParticleSize: number
  killShakeIntensity: number
}

/** near_miss.json — near-miss combo パラメータ */
export interface NearMissConfig {
  /** ハザードとプレイヤーの垂直間隔の閾値（px）。これ以下なら near-miss 判定 */
  nearMissThreshold: number
  /** near-miss がない状態がこれ以上続くと combo が 0 に減衰（秒） */
  nearMissComboDecay: number
}

/** genre_defaults.json — ジャンル定義のデフォルト値 */
export interface GenreDefaultsConfig {
  enableFeatures: string[]
  disableFeatures: string[]
  scoreFormula: string
  theme: string
  bgColor: string
}

/** palette_defaults.json — JSONGenrePlugin のパレットフォールバック */
export interface PaletteDefaultsConfig {
  danger: string
  dangerGlow: string
  safe: string
  safeGlow: string
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

/** hud_safezone.json — HUD再配置 & 可動域セーフゾーン化 */
export interface HudSafezoneConfig {
  /** 横スクロール原点: 上側UIゾーン高さの画面高に対する割合（HUD配置用・可動域clampなし） */
  hbaseTopRatio: number
  /** 横STG: 上側UIゾーン高さの画面高に対する割合 */
  hstgTopRatio: number
  /** 横STG: 下側UIゾーン高さの画面高に対する割合 */
  hstgBottomRatio: number
  /** 縦STG: 左側UIゾーン幅の画面幅に対する割合 */
  vstgLeftRatio: number
  /** 縦STG: 右側UIゾーン幅の画面幅に対する割合 */
  vstgRightRatio: number
  /** 縦STG: ジャンル確定時の初期垂直位置（可動域上端0〜下端1。大きいほど下寄り） */
  vstgInitialYRatio: number
  /** ジャンル遷移演出の所要時間（秒） */
  transitionSec: number
  /** UIゾーンの半透明フィルの不透明度（0〜1） */
  boundaryFadeAlpha: number
  /** ゾーン内側境界に引く区切り線の不透明度（0〜1） */
  boundaryLineAlpha: number
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
  throwScoreWeightsSpeedPenaltyThreshold: number
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
  /** genre が scoreFormula を持たない場合のフォールバック式 */
  defaultScoreFormula: string
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

/** genres.json — ジャンル定義テーブル（正規化済み。ロード時にデフォルト補完される） */
export interface GenreDefJSON {
  id: string
  label: string
  thresholds: Record<string, number>
  /** ベイズ収束の候補に含めるか。省略時 true。false は forcedGenre 専用（glitch 等） */
  resolvable?: boolean
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
  /** ジャンル固有のスポーン密度設定。TSプラグインもこれをマージされる。 */
  spawnDensity?: import('../domain/types').SpawnDensityConfig
  /** BGM再生設定。省略時はBGMなし（音源未準備でもフォールバックで無音継続）。 */
  bgm?: import('../domain/types').BgmConfig
}

/**
 * src/data/genres/*.json に人間が書く生の形式。
 * 必須は id / label / thresholds の3つだけで、残りは normalizeGenreDef が補完する。
 */
export type GenreDefJSONInput =
  Pick<GenreDefJSON, 'id' | 'label' | 'thresholds'> &
  Partial<Omit<GenreDefJSON, 'id' | 'label' | 'thresholds'>>

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
  hud_safezone: HudSafezoneConfig
  game_balance: GameBalanceConfig
  genres: GenresConfig
  bayes: BayesConfig
  special: SpecialConfig
  puzzle: PuzzleConfig
  extra_movement: ExtraMovementConfig
  survival: SurvivalConfig
  near_miss: NearMissConfig
  genre_defaults: GenreDefaultsConfig
  palette_defaults: PaletteDefaultsConfig
}

export type GameConfigSection = keyof GameConfigMap
