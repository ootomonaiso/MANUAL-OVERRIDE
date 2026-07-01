import { describe, it, expect } from 'vitest'
import {
  createThrowState,
  onDragStart,
  onDragMove,
  onRelease,
  updateThrow,
  type ThrowState,
} from '../../../src/game/throwEngine'

// 1フレーム分の dt（16ms ≈ 60fps）
const DT_16MS = 0.016

// 投擲操作のシミュレーションヘルパー（#7 修正）
function _simulateThrow(
  state: ThrowState,
  dragStartX: number,
  dragStartY: number,
  dragEndX: number,
  dragEndY: number,
): void {
  onDragStart(state, dragStartX, dragStartY)
  onDragMove(state, dragEndX, dragEndY)
  onRelease(state)
}

describe('createThrowState', () => {
  it('idle 状態の初期値を返す', () => {
    const state = createThrowState()
    expect(state.phase).toBe('idle')
    expect(state.startX).toBe(0)
    expect(state.startY).toBe(0)
    expect(state.power).toBe(0)
    expect(state.result).toBeNull()
    expect(state.score).toBe(0)
    expect(state.peakY).toBe(Infinity)
  })
})

describe('onDragStart', () => {
  it('dragging 状態に遷移する', () => {
    const state = createThrowState()
    onDragStart(state, 100, 200)
    expect(state.phase).toBe('dragging')
    expect(state.startX).toBe(100)
    expect(state.startY).toBe(200)
    expect(state.currentX).toBe(100)
    expect(state.currentY).toBe(200)
  })
})

describe('onDragMove', () => {
  it('dragging 状態でないときは何もしない', () => {
    const state = createThrowState()
    onDragMove(state, 100, 200)
    expect(state.currentX).toBe(0) // idle のまま
  })

  it('ドラッグ距離に応じて power が計算される', () => {
    const state = createThrowState()
    onDragStart(state, 100, 200)
    onDragMove(state, 300, 200) // dx=200, dy=0 → dist=200
    // power = min(1, 200 / 200) = 1
    expect(state.power).toBe(1)
  })

  it('power は 1 を超えない', () => {
    const state = createThrowState()
    onDragStart(state, 100, 200)
    onDragMove(state, 1000, 200) // dx=900 → power = min(1, 900/200) = 1
    expect(state.power).toBe(1)
  })

  it('短いドラッグで power が 0 に近い', () => {
    const state = createThrowState()
    onDragStart(state, 100, 200)
    onDragMove(state, 110, 200) // dx=10 → power = 10/200 = 0.05
    expect(state.power).toBe(0.05)
  })
})

describe('onRelease', () => {
  it('dragging 状態でないときは何もしない', () => {
    const state = createThrowState()
    onRelease(state)
    expect(state.phase).toBe('idle')
  })

  it('flying 状態に遷移する', () => {
    const state = createThrowState()
    _simulateThrow(state, 200, 300, 100, 200)
    expect(state.phase).toBe('flying')
    expect(state.airTime).toBe(0)
  })

  it('引っ張った方向に速度が設定される', () => {
    const state = createThrowState()
    _simulateThrow(state, 200, 300, 0, 300) // dx=200, dy=0 → 右方向
    expect(state.vx).toBeGreaterThan(0)
    expect(state.vy).toBeCloseTo(0)
  })

  it('斜めに引っ張ると両方向に速度が設定される', () => {
    const state = createThrowState()
    _simulateThrow(state, 200, 300, 0, 100) // dx=200, dy=200 → 右上方向
    expect(state.vx).toBeGreaterThan(0)
    expect(state.vy).toBeGreaterThan(0)
  })

  it('速度は maxPower で制限される', () => {
    const state = createThrowState()
    _simulateThrow(state, 200, 300, -10000, 300) // 非常に長いドラッグ
    // maxPower=1400 を超えない
    const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2)
    expect(speed).toBeLessThanOrEqual(1400)
  })
})

describe('updateThrow', () => {
  it('flying 状態でないときは何もしない', () => {
    const state = createThrowState()
    updateThrow(state, DT_16MS, 600)
    expect(state.phase).toBe('idle')
  })

  it('重力が適用される', () => {
    const state = createThrowState()
    _simulateThrow(state, 300, 100, 100, 100)
    state.manualX = 300
    state.manualY = 100
    state.peakY = 100
    updateThrow(state, 0.1, 600)
    // 重力で Y が増加
    expect(state.manualY).toBeGreaterThan(100)
  })

  it('空気抵抗が適用される', () => {
    const state = createThrowState()
    _simulateThrow(state, 300, 100, 100, 100)
    const initialVx = state.vx
    state.manualX = 300
    state.manualY = 100
    state.peakY = 100
    updateThrow(state, 0.1, 600)
    // 空気抵抗で X 速度が減少
    expect(state.vx).toBeLessThan(initialVx)
  })

  it('画面外に出ると done に遷移する', () => {
    const state = createThrowState()
    _simulateThrow(state, 300, 100, 100, 100)
    state.manualX = 300
    state.manualY = 595 // canvasHeight=600 + landingMargin=100 = 700 の手前
    state.peakY = 100
    state.vy = 1200 // 下向きの速度 (vy += 800*0.1=80 → 1280, dy=128 → 595+128=723 >= 700)
    updateThrow(state, 0.1, 600)
    expect(state.phase).toBe('done')
    expect(state.result).not.toBeNull()
  })

  it('左側の画面外に出ても done に遷移する', () => {
    const state = createThrowState()
    _simulateThrow(state, 300, 100, 600, 100) // 右に引いて左に飛ぶ
    state.manualX = -150 // outOfBoundsLeft=-200 の内側
    state.manualY = 100
    state.peakY = 100
    state.vx = -1000 // 左向き
    updateThrow(state, 0.1, 600)
    expect(state.phase).toBe('done')
  })

  it('右側の画面外に出ても done に遷移する', () => {
    const state = createThrowState()
    _simulateThrow(state, 300, 100, 100, 100)
    state.manualX = 2350 // outOfBoundsRight=2400 の内側
    state.manualY = 100
    state.peakY = 100
    state.vx = 1000 // 右向き
    updateThrow(state, 0.1, 600)
    expect(state.phase).toBe('done')
  })

  it('done 状態で結果とスコアが計算される', () => {
    const state = createThrowState()
    _simulateThrow(state, 300, 100, 100, 100)
    state.manualX = 300
    state.manualY = 650 // canvasHeight=600 + landingMargin=100 = 700 の手前
    state.peakY = 50
    state.airTime = 1.5
    state.vx = 200
    state.vy = 800 // vy += 800*0.1=80 → 880, dy=88 → 650+88=738 >= 700
    updateThrow(state, 0.1, 600)
    expect(state.phase).toBe('done')
    expect(state.result).not.toBeNull()
    expect(state.result!.airTime).toBeGreaterThan(0)
    expect(state.result!.arcHeight).toBeGreaterThan(0)
    expect(state.score).toBeGreaterThan(0)
  })

  it('peakY は最高点を記録する', () => {
    const state = createThrowState()
    _simulateThrow(state, 300, 300, 100, 100)
    state.manualX = 300
    state.manualY = 300
    state.peakY = 300
    state.vy = -500 // 上向き
    updateThrow(state, 0.1, 600)
    // peakY は startY より小さくなる（上方向）
    expect(state.peakY).toBeLessThanOrEqual(300)
  })
})
