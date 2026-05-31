import type { Controls } from '../domain/types'

// 説明書更新が発動する走行距離（px）
export const UPDATE_DISTANCES = [900, 2200, 3800] as const

// スコア比率
export const SCORE_RATIO = { play: 0.7, throw: 0.3 } as const

// 投擲スコア重み
export const THROW_SCORE_WEIGHTS = {
  airTime: 0.5,
  arcHeight: 0.4,
  speedPenalty: 0.1,
} as const

// ベースのスクロール速度（px/s）
export const BASE_SCROLL_SPEED = 200

// テンポ値ごとの速度加算（px/s）
export const TEMPO_SPEED_BONUS = 28

// 障害物の出現間隔カーブ
export const HAZARD_SPAWN = {
  baseInterval: 4000,
  minInterval: 1500,
  decayRate: 0.00008,
} as const

// プレイヤー物理
export const PLAYER_PHYSICS = {
  width: 36,
  height: 52,
  jumpVelocity: -680,        // 初速
  jumpCutMultiplier: 0.42,   // 早離し時に速度をこの倍率に
  gravity: 1800,             // 通常重力
  fallGravityMult: 1.75,     // 落下時の重力倍率（重めの落下感）
  groundY: 0,
  runSpeed: 240,
  coyoteFrames: 9,           // 床を離れてからジャンプを許容するフレーム数
  jumpBufferFrames: 10,      // 着地前のジャンプ先行入力許容フレーム数
}

// デフォルトコントロール
export const DEFAULT_CONTROLS: Controls = {
  jump: 'Space',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
}
