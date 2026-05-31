/**
 * gameBalance.ts
 *
 * ゲーム進行の核となるバランスパラメータ。スコア計算、テンポ、難易度に直結する値。
 * tunables.ts と異なり、ここの値はゲーム全体のリズムに影響する。
 *
 * 注意: このファイルを編集する場合、tunables.ts の DIFFICULTY セクションとの整合性を保つこと。
 */

import type { Controls } from '../domain/types'

// 説明書更新が発動する走行距離（px）
// DIFFICULTY.updateDistances と同じ値を保つこと
// 無制限に選択肢が続く（100段階まで、1500px間隔）
const _generateUpdateDistances = () => {
  const intervals: number[] = [1100, 2400, 3900]  // 初期値
  const baseInterval = 1500
  for (let i = 3; i < 100; i++) {
    intervals.push(1100 + baseInterval * i)
  }
  return intervals as const
}
export const UPDATE_DISTANCES = _generateUpdateDistances()

/** 最終スコア = プレイスコア * 70% + 投擲スコア * 30% */
export const SCORE_RATIO = { play: 0.7, throw: 0.3 } as const

/** 投擲フェーズのスコア重み配分 */
export const THROW_SCORE_WEIGHTS = {
  airTime: 0.5,      // 滞空時間重視
  arcHeight: 0.4,    // 弧の高さ重視
  speedPenalty: 0.1, // 速度ペナルティ
} as const

/** 基本スクロール速度。actualSpeed = BASE + tempo * TEMPO_SPEED_BONUS */
export const BASE_SCROLL_SPEED = 300

/** tempo値の影響度。DIFFICULTY.tempoSpeedBonus と同値を保つ */
export const TEMPO_SPEED_BONUS = 28

/** ハザードスポーン曲線パラメータ。distance の指数関数で間隔を短縮 */
export const HAZARD_SPAWN = {
  baseInterval: 2400,  // 開始時の基本間隔（ms）→ より頻繁に出現
  minInterval: 800,    // 最小間隔（加速の上限）→ 最大時の密度を上げる
  decayRate: 0.00015,  // 減衰率。大きいほど加速が早い → 加速を少し早めに
} as const

/** プレイヤー物理パラメータ。tunables.ts の PHYSICS と同じ値 */
export const PLAYER_PHYSICS = {
  width: 36,
  height: 52,
  jumpVelocity: -720,        // ジャンプ初速（調整済）
  jumpCutMultiplier: 0.45,   // 早離し時の速度倍率（調整済）
  gravity: 1650,             // 通常重力（調整済）
  fallGravityMult: 1.65,     // 落下時の重力倍率（調整済）
  groundY: 0,
  runSpeed: 240,
  coyoteFrames: 9,           // コヨーテタイム（フレーム数）
  jumpBufferFrames: 10,      // ジャンプバッファ（フレーム数）
}

/** デフォルトコントロール */
export const DEFAULT_CONTROLS: Controls = {
  jump: 'Space',
  moveLeft: 'ArrowLeft',
  moveRight: 'ArrowRight',
}
