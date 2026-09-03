/**
 * genres/playerBaseAnim.ts
 *
 * 標準プレイヤーキャラ（player_base）のフレーム選択ロジック。
 * 純粋関数として実装し、描画処理と分離することで単体テストを可能にする。
 *
 * 状態 → フレーム 対応表:
 *   静止:  onGround && |vx| < idleThreshold → 'idle'
 *   走行:  onGround && |vx| >= idleThreshold → run_a → run_b → run_c → run_d（runCycle 連動）
 *   上昇:  !onGround && vy < 0              → 'jump_up'
 *   落下:  !onGround && vy >= 0             → 'jump_fall'
 */

import type { PlayerAnimState } from '../engine/GenrePlugin'
import { VFX } from '../data/tunables'

/** 走行アニメのフレーム名一覧（4 枚） */
export const RUN_FRAMES = ['run_a', 'run_b', 'run_c', 'run_d'] as const

/** 静止判定の速度閾値（px/s）。VFX.idleThreshold を参照する。 */
const IDLE_SPEED_THRESHOLD = VFX.idleThreshold

/**
 * 負値を考慮したモジュロ演算。
 * JS の `%` は負値でも負の剰余を返すため、常に [0, n) の範囲になるよう補正。
 */
function _mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

/**
 * プレイヤーのアニメーション状態から表示フレーム名を決定する純粋関数。
 *
 * @param s - 現在のプレイヤーアニメーション状態
 * @returns 表示すべきフレーム名
 */
export function selectPlayerFrame(s: PlayerAnimState): string {
  if (!s.onGround) {
    return s.vy < 0 ? 'jump_up' : 'jump_fall'
  }
  if (Math.abs(s.vx) < IDLE_SPEED_THRESHOLD) {
    return 'idle'
  }
  const idx = _mod(Math.floor(s.runCycle * RUN_FRAMES.length), RUN_FRAMES.length)
  return RUN_FRAMES[idx]
}

// genres/index.ts の import.meta.glob 対策。
// このファイルはジャンルプラグインではなく、フレーム選択ロジックのみを提供する。
// null を default export することで glob による自動登録を回避する。
export default null
