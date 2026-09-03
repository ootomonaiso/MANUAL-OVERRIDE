import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SideScroller } from '../../../src/game/sideScroller'
import { BasePlugin } from '../../../src/genres/BasePlugin'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { PLAYER_PHYSICS } from '../../../src/data/gameBalance'

/** happy-dom は Canvas 2D context をサポートしないためモック */
const mockCtx = {
  save: () => {}, restore: () => {},
  fillRect: () => {}, fillText: () => {},
  beginPath: () => {}, arc: () => {}, fill: () => {},
  stroke: () => {}, moveTo: () => {}, lineTo: () => {},
  closePath: () => {},
  setTransform: () => {}, translate: () => {}, scale: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  clearRect: () => {},
  strokeRect: () => {},
  measureText: () => ({ width: 0 }),
  font: '', textAlign: '', fillStyle: '', strokeStyle: '',
  lineWidth: 0, lineCap: '', lineJoin: '',
  shadowBlur: 0, shadowColor: '',
  globalAlpha: 1,
} as unknown as CanvasRenderingContext2D

vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  .mockImplementation((type: string) => type === '2d' ? mockCtx : null)

vi.mock('../../../src/plugins/SoundManager', () => ({
  soundManager: {
    onJump: () => {}, onLand: () => {}, onShoot: () => {},
    onEnemyDestroyed: () => {}, onEnemyHit: () => {},
    onHit: () => {}, onDeath: () => {}, onManualUpdate: () => {},
    onPauseToggle: () => {}, onItemPickup: () => {},
    onMeleeAttack: () => {}, onMeleeHit: () => {},
    onShieldAbsorb: () => {}, onHungerDamage: () => {},
    onLevelUp: () => {}, onLearningEffect: () => {},
    playBgm: () => {}, stopBgm: () => {},
    onWallJump: () => {}, onSlide: () => {},
  },
}))

/**
 * SideScroller のジャンプ速度分岐（1回/2回/coyote）を検証する。
 *
 * REQ-MOV-08: 真の 2回ジャンプ（空中 & coyote 切れ）は doubleJumpVelocity を使う。
 * 1回ジャンプ・coyote ジャンプは jumpVelocity を使う。
 */

function createScroller(): SideScroller {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  const rules = {
    controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', dash: 'Shift' },
    hazardColors: new Set(),
    safeColors: new Set(),
    features: new Set(['double_jump', 'movement']),
    genre: 'base' as const,
    scrollSpeed: 300,
    bpm: 120,
    gravity: 1600,
    scrollDirection: 'horizontal' as const,
    scrollAxis: 'x' as const,
    environment: 'plain' as const,
    playerMaxHp: 3,
    timescale: 1,
    colorTouchScore: 200,
  }
  return new SideScroller(canvas, rules)
}

describe('SideScroller — 2回ジャンプ速度分岐', () => {
  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())
  })

  // ── UT-11: 1回ジャンプ（地上） ─────────────────────────────
  it('UT-11: 地上でのジャンプ（1回目）は jumpVelocity を使う', () => {
    const scroller = createScroller()
    const p = scroller.player

    // 地上状態でジャンプキーを押下
    p.onGround = true
    p.jumpsLeft = 2
    p.vy = 0
    scroller.input.justPressed.add('Space')

    // _updateHorizontal を実行
    scroller['_updateHorizontal'](1 / 60, 300)

    // vy が jumpVelocity 方向に設定されている（重力で少し減算されるが、
    // doubleJumpVelocity 方向にはならない）
    // jumpVelocity = -720, gravity*dt = ~26.67 → vy ≈ -693.33
    // doubleJumpVelocity = -610, gravity*dt = ~26.67 → vy ≈ -583.33
    expect(p.vy).toBeLessThan(-650) // jumpVelocity 由来（-720 + gravity*dt）
    expect(p.vy).toBeGreaterThan(-750)
  })

  // ── UT-12: 2回ジャンプ（空中・coyote 外） ──────────────────
  it('UT-12: 空中で coyote 切れのジャンプ（2回目）は doubleJumpVelocity を使う', () => {
    const scroller = createScroller()
    const p = scroller.player

    // 空中状態・coyote タイマー切れ・jumpsLeft > 0
    p.onGround = false
    p.jumpsLeft = 1
    p.vy = 0
    ;(scroller as unknown as { coyoteTimer: number }).coyoteTimer = 0

    // ジャンプキーを押下
    scroller.input.justPressed.add('Space')

    // _updateHorizontal を実行
    scroller['_updateHorizontal'](1 / 60, 300)

    // vy が doubleJumpVelocity 方向に設定されている
    // doubleJumpVelocity = -610, gravity*dt = ~26.67 → vy ≈ -583.33
    expect(p.vy).toBeLessThan(-550) // doubleJumpVelocity 由来
    expect(p.vy).toBeGreaterThan(-650)
  })

  // ── UT-13: coyote ジャンプ（地面直離脱） ───────────────────
  it('UT-13: coyote 中のジャンプは jumpVelocity を使う（doubleJumpVelocity ではない）', () => {
    const scroller = createScroller()
    const p = scroller.player

    // 空中だが coyote タイマーが残っている
    p.onGround = false
    p.jumpsLeft = 2
    p.vy = 0
    ;(scroller as unknown as { coyoteTimer: number }).coyoteTimer = 5

    // ジャンプキーを押下
    scroller.input.justPressed.add('Space')

    // _updateHorizontal を実行
    scroller['_updateHorizontal'](1 / 60, 300)

    // jumpVelocity 由来の vy（UT-11 と同じ範囲）
    expect(p.vy).toBeLessThan(-650)
    expect(p.vy).toBeGreaterThan(-750)
  })
})

// ── 追加: doubleJumpVelocity の値が jumpVelocity と異なることを確認 ─
describe('SideScroller — 2回ジャンプ速度の相対検証', () => {
  it('UT-11+UT-12 統合: 2回ジャンプの vy が 1回ジャンプと明確に異なる', () => {
    const dt = 1 / 60

    // UT-11: 1回ジャンプ
    const scroller1 = createScroller()
    scroller1.player.onGround = true
    scroller1.player.jumpsLeft = 2
    scroller1.player.vy = 0
    scroller1.input.justPressed.add('Space')
    scroller1['_updateHorizontal'](dt, 300)
    const vy1 = scroller1.player.vy

    // UT-12: 2回ジャンプ
    const scroller2 = createScroller()
    scroller2.player.onGround = false
    scroller2.player.jumpsLeft = 1
    scroller2.player.vy = 0
    ;(scroller2 as unknown as { coyoteTimer: number }).coyoteTimer = 0
    scroller2.input.justPressed.add('Space')
    scroller2['_updateHorizontal'](dt, 300)
    const vy2 = scroller2.player.vy

    // 2回ジャンプの方が vy が小さい絶対値（弱め）
    // vy1 ≈ -693.33, vy2 ≈ -583.33
    expect(vy1).toBeLessThan(vy2) // vy1 の方がより負（大きな跳躍力）
    // 差は jumpVelocity - doubleJumpVelocity = -720 - (-610) = -110 前後
    const diff = Math.abs(vy1 - vy2)
    expect(diff).toBeGreaterThan(90)
    expect(diff).toBeLessThan(130)
  })
})

// ── 追加: doubleJumpVelocity の値が jumpVelocity と異なることを確認 ─
describe('SideScroller — doubleJumpVelocity の値整合性', () => {
  it('doubleJumpVelocity は jumpVelocity と異なる値である', () => {
    expect(PLAYER_PHYSICS.doubleJumpVelocity).not.toBe(PLAYER_PHYSICS.jumpVelocity)
    // doubleJumpVelocity は -610, jumpVelocity は -720（絶対値が小さい = 弱め）
    expect(Math.abs(PLAYER_PHYSICS.doubleJumpVelocity)).toBeLessThan(
      Math.abs(PLAYER_PHYSICS.jumpVelocity),
    )
  })
})
