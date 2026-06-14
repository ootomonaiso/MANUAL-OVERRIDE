/**
 * src/framework/ConfigValidator.ts
 *
 * 設定値の整合性検証。
 * - 全セクションの存在確認
 * - 必須フィールドの型チェック
 * - 数値範囲のチェック
 */

import type { GameConfigMap, GameConfigSection } from './config-types'

export interface ConfigValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const REQUIRED_SECTIONS: GameConfigSection[] = [
  'physics', 'shoot', 'throw', 'spawn', 'vfx', 'camera', 'background',
  'hazard_vfx', 'ui', 'score', 'difficulty', 'boss', 'rhythm_tuning',
  'stealth', 'genre_params', 'game_balance', 'genres'
]

const REQUIRED_NUMBER_FIELDS: Partial<Record<GameConfigSection, string[]>> = {
  physics: ['playerWidth', 'playerHeight', 'jumpVelocity', 'runSpeed',
            'coyoteFrames', 'jumpBufferFrames'],
  shoot:   ['bulletSpeed', 'bulletWidth', 'bulletHeight', 'shotCooldown', 'comboResetTime'],
  throw:   ['gravity', 'maxPower', 'powerDistanceDivisor', 'speedMultiplier'],
  spawn:   ['firstSpawnDist', 'enemyHpAmount', 'itemDropChance', 'itemExpChance'],
  vfx:     ['hitShakeIntensity', 'deathShakeIntensity', 'particleGravity', 'runCycleRate'],
  camera:  ['leadOffset', 'parallaxStars', 'parallaxFar', 'parallaxMid', 'parallaxGround'],
  background: ['groundHeight', 'starSectorWidth', 'starCountPerSector', 'mountainStep'],
  hazard_vfx: ['glowBlur', 'pulseSpeed', 'hpBarHeight', 'rectCornerRadius'],
  ui:      ['popupLifeSec', 'deathOverlayAlpha', 'beatMarkerAlphaDivisor'],
  score:   ['distanceScoreRate', 'longAirScoreRate'],
  difficulty: ['updateDistancesBaseInterval', 'updateDistancesCount', 'tempoSpeedBonus'],
  boss:    ['firstBossDist', 'bossHp', 'bossWidth', 'bossHeight'],
  rhythm_tuning: ['minBpm', 'maxBpm', 'justWindowSec', 'justMultiplier'],
  stealth: ['stealthAlpha', 'stealthDurationSec', 'stealthCooldownSec', 'detectionRange'],
  genre_params: ['recommendedSingleChoice', 'recommendedMaxPerAxis'],
  game_balance: ['scoreRatioPlay', 'scoreRatioThrow', 'baseScrollSpeed'],
}

const RANGE_CHECKS: Array<{
  section: GameConfigSection
  field: string
  min?: number
  max?: number
}> = [
  { section: 'physics',    field: 'jumpVelocity',   max: 0 },
  { section: 'physics',    field: 'jumpCutMultiplier', min: 0, max: 1 },
  { section: 'physics',    field: 'slowPreciseRatio', min: 0, max: 1 },
  { section: 'physics',    field: 'dashSpeed',      min: 0 },
  { section: 'physics',    field: 'dashDurationSec', min: 0 },
  { section: 'physics',    field: 'dashCooldownSec', min: 0 },
  { section: 'physics',    field: 'wallJumpPushSpeed', min: 0 },
  { section: 'shoot',      field: 'bulletSpeed',    min: 0 },
  { section: 'shoot',      field: 'shotCooldown',   min: 0 },
  { section: 'shoot',      field: 'comboResetTime', min: 0 },
  { section: 'throw',      field: 'gravity',        min: 0 },
  { section: 'throw',      field: 'maxPower',       min: 0 },
  { section: 'throw',      field: 'airFriction',    min: 0, max: 1 },
  { section: 'spawn',      field: 'itemDropChance', min: 0, max: 1 },
  { section: 'spawn',      field: 'itemExpChance',  min: 0, max: 1 },
  { section: 'vfx',        field: 'shakeDecay',     min: 0, max: 1 },
  { section: 'vfx',        field: 'deathShakeDecay', min: 0, max: 1 },
  { section: 'vfx',        field: 'invincibleDuration', min: 0 },
  { section: 'camera',     field: 'leadOffset',     min: 0 },
  { section: 'camera',     field: 'parallaxStars',  min: 0 },
  { section: 'background', field: 'groundHeight',   min: 0 },
  { section: 'background', field: 'starAlphaMin',   min: 0, max: 1 },
  { section: 'background', field: 'mountainAlpha',  min: 0, max: 1 },
  { section: 'background', field: 'buildingAlpha',  min: 0, max: 1 },
  { section: 'hazard_vfx', field: 'pulseAmplitude', min: 0 },
  { section: 'hazard_vfx', field: 'hpBarBgAlpha',   min: 0, max: 1 },
  { section: 'hazard_vfx', field: 'hpBarThreshold', min: 0, max: 1 },
  { section: 'ui',         field: 'popupLifeSec',   min: 0 },
  { section: 'ui',         field: 'deathOverlayAlpha', min: 0, max: 1 },
  { section: 'ui',         field: 'beatMarkerMaxAlpha', min: 0, max: 1 },
  { section: 'score',      field: 'distanceScoreRate', min: 0 },
  { section: 'score',      field: 'longAirScoreRate', min: 0 },
  { section: 'difficulty', field: 'tempoSpeedBonus', min: 0 },
  { section: 'difficulty', field: 'enemyDensityRate', min: 0, max: 1 },
  { section: 'difficulty', field: 'globalDifficultyMult', min: 0 },
  { section: 'boss',       field: 'firstBossDist',  min: 0 },
  { section: 'boss',       field: 'bossHp',         min: 1 },
  { section: 'boss',       field: 'bossWidth',      min: 1 },
  { section: 'boss',       field: 'bossHeight',     min: 1 },
  { section: 'rhythm_tuning', field: 'minBpm',      min: 1 },
  { section: 'rhythm_tuning', field: 'maxBpm',      min: 1 },
  { section: 'rhythm_tuning', field: 'justWindowSec', min: 0 },
  { section: 'rhythm_tuning', field: 'justMultiplier', min: 0 },
  { section: 'stealth',    field: 'stealthAlpha',   min: 0, max: 1 },
  { section: 'stealth',    field: 'stealthDurationSec', min: 0 },
  { section: 'stealth',    field: 'stealthCooldownSec', min: 0 },
  { section: 'game_balance', field: 'scoreRatioPlay', min: 0, max: 1 },
  { section: 'game_balance', field: 'scoreRatioThrow', min: 0, max: 1 },
  { section: 'game_balance', field: 'baseScrollSpeed', min: 0 },
]

export function validateGameConfig(config: GameConfigMap): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 全セクションの存在確認
  for (const sec of REQUIRED_SECTIONS) {
    if (!config[sec]) {
      errors.push(`セクション "${sec}" が見つかりません (src/data/config/${sec}.json を確認してください)`)
    }
  }

  // 必須フィールドの型チェック
  for (const [section, fields] of Object.entries(REQUIRED_NUMBER_FIELDS)) {
    const sec = config[section as GameConfigSection] as unknown as Record<string, unknown>
    if (!sec) continue
    for (const field of fields!) {
      if (typeof sec[field] !== 'number') {
        errors.push(`config.${section}.${field}: number が必要です (${typeof sec[field]} が渡されました)`)
      }
    }
  }

  // 数値範囲チェック
  for (const { section, field, min, max } of RANGE_CHECKS) {
    const sec = config[section] as unknown as Record<string, unknown>
    if (!sec) continue
    const val: unknown = sec[field]
    if (typeof val !== 'number') continue
    if (min !== undefined && val < min) {
      errors.push(`config.${section}.${field} = ${val} は最小値 ${min} を下回っています`)
    }
    if (max !== undefined && val > max) {
      errors.push(`config.${section}.${field} = ${val} は最大値 ${max} を超えています`)
    }
  }

  // genres: 必須フィールド
  if (config.genres?.genres) {
    for (const g of config.genres.genres) {
      if (!g.id) {
        errors.push(`genres[].id が未指定のエントリーがあります`)
      }
      if (!g.theme) {
        warnings.push(`genres[id="${g.id}"].theme が未指定です`)
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

export function devValidateConfig(config: GameConfigMap): void {
  if (import.meta.env?.PROD) return

  const result = validateGameConfig(config)
  for (const w of result.warnings) {
    console.warn('[ConfigValidator]', w)
  }
  for (const e of result.errors) {
    console.error('[ConfigValidator]', e)
  }
  if (result.ok && result.warnings.length === 0) {
    console.info('[ConfigValidator] ✅ 設定の整合性チェック: 問題なし')
  }
}
