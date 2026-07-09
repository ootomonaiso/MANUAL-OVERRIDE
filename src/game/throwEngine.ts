import type { ThrowResult } from '../domain/types'
import { calcThrowScore } from '../domain/scoreCalc'
import { THROW } from '../data/tunables'

// ドラッグ → 投擲シミュレーションの状態
export interface ThrowState {
  phase: 'idle' | 'dragging' | 'flying' | 'done'
  // ドラッグ
  startX: number; startY: number
  currentX: number; currentY: number
  power: number        // 0〜1（ゲージ表示用）
  // 飛行中
  manualX: number; manualY: number
  vx: number; vy: number
  airTime: number
  peakY: number
  // 結果
  result: ThrowResult | null
  score: number
}

export function createThrowState(): ThrowState {
  return {
    phase: 'idle',
    startX: 0, startY: 0, currentX: 0, currentY: 0,
    power: 0,
    manualX: 0, manualY: 0, vx: 0, vy: 0,
    airTime: 0, peakY: Infinity,
    result: null, score: 0,
  }
}

export function onDragStart(state: ThrowState, x: number, y: number): void {
  state.phase = 'dragging'
  state.startX = x; state.startY = y
  state.currentX = x; state.currentY = y
  state.manualX = x; state.manualY = y
}

export function onDragMove(state: ThrowState, x: number, y: number): void {
  if (state.phase !== 'dragging') return
  state.currentX = x; state.currentY = y
  const dx = state.startX - x
  const dy = state.startY - y
  const dist = Math.sqrt(dx * dx + dy * dy)
  state.power = Math.min(1, dist / THROW.powerDistanceDivisor)
}

export function onRelease(state: ThrowState): void {
  if (state.phase !== 'dragging') return

  const dx = state.startX - state.currentX
  const dy = state.startY - state.currentY
  const dist = Math.sqrt(dx * dx + dy * dy)
  const speed = Math.min(THROW.maxPower, dist * THROW.speedMultiplier)

  const angle = Math.atan2(dy, dx)   // 引っ張った方向へ飛ぶ
  state.vx = Math.cos(angle) * speed
  state.vy = Math.sin(angle) * speed
  state.phase = 'flying'
  state.airTime = 0
  state.peakY = state.manualY
}

export function updateThrow(state: ThrowState, dt: number, canvasHeight: number): void {
  if (state.phase !== 'flying') return

  state.vx *= THROW.airFriction
  state.vy += THROW.gravity * dt

  state.manualX += state.vx * dt
  state.manualY += state.vy * dt
  state.airTime += dt

  if (state.manualY < state.peakY) state.peakY = state.manualY

  // 地面（画面下部）または画面外
  if (
    state.manualY >= canvasHeight + THROW.landingMargin ||
    state.manualX < THROW.outOfBoundsLeft ||
    state.manualX > THROW.outOfBoundsRight
  ) {
    _finalize(state)
  }
}

function _finalize(state: ThrowState): void {
  const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy)
  // ドラッグなしで離された場合も最低限の弧高を保証（スコア0回避）
  const arcHeight = Math.max(30, state.startY - state.peakY)
  state.result = { airTime: state.airTime, arcHeight, speed }
  state.score = calcThrowScore(state.result)
  state.phase = 'done'
}
