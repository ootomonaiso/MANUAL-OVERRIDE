/**
 * gameBalance.ts
 *
 * ゲーム進行の核となるバランスパラメータ。
 * src/data/config.ts の GAME_CONFIG から値を再エクスポートする薄いラッパー。
 */

import type { Controls } from '../domain/types'
import { GAME_CONFIG } from './config'

const _gb = GAME_CONFIG.game_balance
const _d  = GAME_CONFIG.difficulty
const _p  = GAME_CONFIG.physics

// ─────────────────────────────────────────────────────────────
// UPDATE_DISTANCES — 説明書更新が発動する距離配列
// ─────────────────────────────────────────────────────────────
const _generateUpdateDistances = (): readonly number[] => {
  const dc = GAME_CONFIG.difficulty
  const intervals: number[] = [...dc.updateDistancesInitial]
  const startIdx = dc.updateDistancesInitial.length
  for (let i = startIdx; i < dc.updateDistancesCount; i++) {
    intervals.push(1100 + dc.updateDistancesBaseInterval * i)
  }
  return intervals
}
export const UPDATE_DISTANCES = _generateUpdateDistances()

// ─────────────────────────────────────────────────────────────
// SCORE_RATIO — 最終スコア比率
// ─────────────────────────────────────────────────────────────
export const SCORE_RATIO = {
  play: _gb.scoreRatioPlay,
  throw: _gb.scoreRatioThrow,
} as const

// ─────────────────────────────────────────────────────────────
// THROW_SCORE_WEIGHTS — 投擲スコア重み
// ─────────────────────────────────────────────────────────────
export const THROW_SCORE_WEIGHTS = {
  airTime: _gb.throwScoreWeightsAirTime,
  arcHeight: _gb.throwScoreWeightsArcHeight,
  speedPenalty: _gb.throwScoreWeightsSpeedPenalty,
} as const

// ─────────────────────────────────────────────────────────────
// BASE_SCROLL_SPEED — 基本スクロール速度
// ─────────────────────────────────────────────────────────────
export const BASE_SCROLL_SPEED = _gb.baseScrollSpeed

// ─────────────────────────────────────────────────────────────
// TEMPO_SPEED_BONUS — tempoの影響度
// ─────────────────────────────────────────────────────────────
export const TEMPO_SPEED_BONUS = _d.tempoSpeedBonus

// ─────────────────────────────────────────────────────────────
// DISTANCE_ACCEL — 距離ベース加速設定
// ─────────────────────────────────────────────────────────────
export const DISTANCE_ACCEL = {
  maxBonus:  _gb.distanceAccelMaxBonus,
  fullDist:  _gb.distanceAccelFullDist,
} as const

// ─────────────────────────────────────────────────────────────
// HAZARD_SPAWN — ハザードスポーン曲線
// ─────────────────────────────────────────────────────────────
export const HAZARD_SPAWN = {
  baseInterval: _gb.hazardSpawnBaseInterval,
  minInterval: _gb.hazardSpawnMinInterval,
  decayRate: _gb.hazardSpawnDecayRate,
} as const

// ─────────────────────────────────────────────────────────────
// PLAYER_PHYSICS — プレイヤー物理（フィールド名変換対応）
// ─────────────────────────────────────────────────────────────
export const PLAYER_PHYSICS = {
  width:              _p.playerWidth,
  height:             _p.playerHeight,
  jumpVelocity:       _p.jumpVelocity,
  doubleJumpVelocity: _p.doubleJumpVelocity,
  jumpCutMultiplier:  _p.jumpCutMultiplier,
  gravity:            _p.gravity,
  fallGravityMult:    _p.fallGravityMult,
  groundY:            0,
  runSpeed:           _p.runSpeed,
  slowPreciseRatio:   _p.slowPreciseRatio,
  landSquashDecay:    _p.landSquashDecay,
  landSquashAmount:   _p.landSquashAmount,
  coyoteFrames:       _p.coyoteFrames,
  jumpBufferFrames:   _p.jumpBufferFrames,
  playerMinX:         _p.playerMinX,
  playerMaxXRatio:    _p.playerMaxXRatio,
  airFrictionX:       _p.airFrictionX,
  dashSpeed:          _p.dashSpeed,
  dashDurationSec:    _p.dashDurationSec,
  dashCooldownSec:    _p.dashCooldownSec,
  dashIframesSec:     _p.dashIframesSec,
  wallJumpPushSpeed:  _p.wallJumpPushSpeed,
}

// ─────────────────────────────────────────────────────────────
// DEFAULT_CONTROLS — デフォルトキーバインド
// ─────────────────────────────────────────────────────────────
export const DEFAULT_CONTROLS: Controls = {
  jump: 'Space',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
}
