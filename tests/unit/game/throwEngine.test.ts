import { describe, it, expect } from 'vitest'
import { createThrowState, updateThrow, type ThrowState } from '../../../src/game/throwEngine'

// 同一初期条件・同一実時間を異なる fps の dt 分割で投擲シミュレーションし、
// 結果がフレームレートに依存しないことを検証する（#238）。
function _simulateFlight(fps: number, realSeconds: number): ThrowState {
  const state = createThrowState()
  state.phase = 'flying'
  state.vx = 400
  state.vy = 0
  state.manualX = 400
  state.manualY = 100
  state.startY = 100
  state.peakY = 100
  // 地面に到達しないよう canvasHeight を大きくし、1 秒以内には着地・画面外にしない
  const canvasHeight = 100000
  const steps = Math.round(fps * realSeconds)
  const dt = 1 / fps
  for (let i = 0; i < steps; i++) {
    updateThrow(state, dt, canvasHeight)
    if (state.phase !== 'flying') break
  }
  return state
}

describe('throwEngine.updateThrow (空気抵抗の fps 非依存性, #238)', () => {
  it('同一実時間の水平到達距離が fps に依存しない', () => {
    const s60 = _simulateFlight(60, 1.0)
    const s144 = _simulateFlight(144, 1.0)
    // 指数減衰（Math.pow(airFriction, dt*60)）により両 fps でほぼ同一の軌跡になる
    expect(Math.abs(s60.manualX - s144.manualX)).toBeLessThan(1)
  })

  it('滞空時間（airTime）も fps に依存しない', () => {
    const s60 = _simulateFlight(60, 0.5)
    const s144 = _simulateFlight(144, 0.5)
    expect(Math.abs(s60.airTime - s144.airTime)).toBeLessThan(0.001)
  })
})
