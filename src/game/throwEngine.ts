import type { ThrowResult } from '../domain/types'
import { calcThrowScore } from '../domain/scoreCalc'
import { THROW } from '../data/tunables'

// ドラッグ → 投擲シミュレーションの状態
export interface ThrowState {
  phase: 'idle' | 'dragging' | 'flying' | 'done'
  // ドラッグ
  startX: number; startY: number
  currentX: number; currentY: number
  power: number        // 0〜1（ゲージ表示用。実速度と常に一致させる）
  // 飛行中
  manualX: number; manualY: number
  vx: number; vy: number
  airTime: number
  peakY: number
  spin: number         // 発射時の回転速度（deg/s）— 強い投擲ほど速く回る
  // 結果
  result: ThrowResult | null
  score: number
  landedOnGround: boolean   // 画面下部に着地したか（横に消えた場合は false）
}

// 引っ張り距離を 0〜1 のパワーに正規化する。ゲージ表示と実速度の両方がこの値を使う
function _dragPower(dist: number): number {
  return Math.min(1, dist / THROW.powerDistanceDivisor)
}

export function createThrowState(): ThrowState {
  return {
    phase: 'idle',
    startX: 0, startY: 0, currentX: 0, currentY: 0,
    power: 0,
    manualX: 0, manualY: 0, vx: 0, vy: 0,
    airTime: 0, peakY: Infinity, spin: 0,
    result: null, score: 0,
    landedOnGround: false,
  }
}

export function onDragStart(state: ThrowState, x: number, y: number): void {
  state.phase = 'dragging'
  state.startX = x; state.startY = y
  state.currentX = x; state.currentY = y
  // 説明書は掴んだ位置へ「拾い上げる」— 以降ドラッグに追従する
  state.manualX = x; state.manualY = y
}

export function onDragMove(state: ThrowState, x: number, y: number): void {
  if (state.phase !== 'dragging') return
  state.currentX = x; state.currentY = y
  // 説明書を指に追従させる（投擲前のフィードバック）
  state.manualX = x; state.manualY = y
  const dx = x - state.startX
  const dy = y - state.startY
  state.power = _dragPower(Math.sqrt(dx * dx + dy * dy))
}

export function onRelease(state: ThrowState): void {
  if (state.phase !== 'dragging') return

  // スワイプした方向へそのまま飛ぶ（覚える必要のない直感操作）
  const dx = state.currentX - state.startX
  const dy = state.currentY - state.startY
  const speed = state.power * THROW.maxPower

  const angle = Math.atan2(dy, dx)
  state.vx = Math.cos(angle) * speed
  state.vy = Math.sin(angle) * speed
  state.spin = 220 + state.power * 520   // 弱くてもクルッと回り、強いほど激しく回転
  state.phase = 'flying'
  state.airTime = 0
  // 弧の高さは離した位置を基準に測る（拾い上げ位置から離れていても正しく測れる）
  state.startY = state.currentY
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
  const hitGround = state.manualY >= canvasHeight + THROW.landingMargin
  const offSide = state.manualX < THROW.outOfBoundsLeft || state.manualX > THROW.outOfBoundsRight
  if (hitGround || offSide) {
    state.landedOnGround = hitGround && !offSide
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
