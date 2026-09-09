import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SideScroller } from '../../../src/game/sideScroller'
import { Player, Hazard } from '../../../src/game/entities'
import type { RuntimeRules } from '../../../src/domain/types'
import { PLAYER_PHYSICS } from '../../../src/data/gameBalance'

const mockCtx = {
  save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(),
  beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(),
  closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), arcTo: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  setTransform: vi.fn(), resetTransform: vi.fn(), translate: vi.fn(),
  scale: vi.fn(), rotate: vi.fn(), transform: vi.fn(),
  isContextLost: vi.fn(() => false), drawImage: vi.fn(), putImageData: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
  scrollPathIntoView: vi.fn(), canvas: {} as HTMLCanvasElement,
} as unknown as CanvasRenderingContext2D

function _makeCanvas(w = 800, h = 400): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D | null)
  return canvas
}

function _makeRules(scrollAxis: 'x' | 'y' = 'x'): RuntimeRules {
  return {
    controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
    hazardColors: new Set(['#ff3344']), safeColors: new Set(['#33ff66']),
    features: new Set<import('../../../src/domain/types').FeatureId>(),
    genre: 'base', scrollSpeed: 3, bpm: 120, gravity: 1600,
    scrollDirection: scrollAxis === 'x' ? 'horizontal' : 'vertical',
    environment: 'ground', playerMaxHp: 3, timescale: 1, scrollAxis, colorTouchScore: 200,
  }
}

/**
 * Spring（バネ）ハザードのユニットテスト。
 *
 * バネは落下中のプレイヤーを弾き上げる安全ハザード。
 * 被弾経路（_onPlayerHit）を通らず、stats.collisions に影響しない。
 */

// SideScroller の private メンバにアクセスするための型付きキャスト
interface ScrollerInternals {
  player: Player
  hazards: Hazard[]
  stats: { collisions: number; jumps: number }
  dead: boolean
  _updateHorizontal(dt: number, speed: number): boolean
  _updateVertical(dt: number, speed: number): boolean
}
const asInt = (s: SideScroller): ScrollerInternals => s as unknown as ScrollerInternals

describe('Spring hazard (バネハザード)', () => {
  describe('横モード — 落下中のプレイヤーを弾く', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('x')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    it('バネが落下中のプレイヤーを弾く', () => {
      const internals = asInt(scroller)
      const player = internals.player
      const hazards = internals.hazards

      // distance=220 → cameraX=0。プレイヤー [140,250,36,52]
      scroller['distance'] = 220
      scroller['cameraX'] = 0
      player.y = 250
      player.vy = 100
      player.invincible = 0

      // バネをプレイヤーと重なる位置に配置: x=140, y=296 (地上24px), w=32, h=24
      const spring = new Hazard(140, 296, 32, 24, '#00cec9', '#55efc4', 'spring', 1, true, 0, 'right')
      hazards.push(spring)

      internals._updateHorizontal(1 / 60, 3)

      expect(player.vy).toBe(PLAYER_PHYSICS.springBounceVelocity)
      expect(player.onGround).toBe(false)
      expect(internals.stats.jumps).toBe(0)
    })
  })

  describe('横モード — バネはダメージを与えない', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('x')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    it('バネがプレイヤーにダメージを与えない', () => {
      const internals = asInt(scroller)
      const player = internals.player
      const hazards = internals.hazards

      scroller['distance'] = 220
      scroller['cameraX'] = 0
      player.y = 268 // 接地状態
      player.vy = 0
      player.invincible = 0

      const spring = new Hazard(140, 296, 32, 24, '#00cec9', '#55efc4', 'spring', 1, true, 0, 'right')
      hazards.push(spring)

      internals._updateHorizontal(1 / 60, 3)

      expect(internals.stats.collisions).toBe(0)
      expect(internals.dead).toBe(false)
      expect(player.hp).toBe(3)
    })
  })

  describe('跳ね速度の比較', () => {
    it('バネの跳ね速度は通常ジャンプより高い', () => {
      expect(PLAYER_PHYSICS.springBounceVelocity).toBeLessThan(PLAYER_PHYSICS.jumpVelocity)
    })
  })

  describe('横モード — 上昇中の再発動ガード', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('x')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    it('上昇中のプレイヤーは再発動しない', () => {
      const internals = asInt(scroller)
      const player = internals.player
      const hazards = internals.hazards

      scroller['distance'] = 220
      scroller['cameraX'] = 0
      // player.y=266 → プレイヤー [140,266,36,52] はバネ [296..320] と重なる（player.y+player.h=318 ≥ 296）
      player.y = 266
      player.vy = PLAYER_PHYSICS.springBounceVelocity // -950（上昇中）
      player.invincible = 0

      const spring = new Hazard(140, 296, 32, 24, '#00cec9', '#55efc4', 'spring', 1, true, 0, 'right')
      hazards.push(spring)

      internals._updateHorizontal(1 / 60, 3)

      // vy は重力で減衰（≈-923.3）しており springBounceVelocity と等しくない
      // 上昇中（vy < 0）のためバネは再発動しない
      expect(player.vy).not.toBe(PLAYER_PHYSICS.springBounceVelocity)
      expect(player.vy).toBeLessThan(0)
    })
  })

  describe('無敵時間中', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('x')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    it('無敵時間中はバネが弾かない', () => {
      const internals = asInt(scroller)
      const player = internals.player
      const hazards = internals.hazards

      scroller['distance'] = 220
      scroller['cameraX'] = 0
      // player.y=266 → プレイヤー [140,266,36,52] はバネ [296..320] と重なる
      player.y = 266
      player.vy = 100 // 落下中
      player.invincible = 0.5

      const spring = new Hazard(140, 296, 32, 24, '#00cec9', '#55efc4', 'spring', 1, true, 0, 'right')
      hazards.push(spring)

      internals._updateHorizontal(1 / 60, 3)

      // 無敵中はバネも発動しない → springBounceVelocity にならない
      expect(player.vy).not.toBe(PLAYER_PHYSICS.springBounceVelocity)
    })
  })

  describe('beat_hazard 反転時', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('x')
      rules.features.add('beat_hazard')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    it('beat_hazard 反転時にバネは被弾せず弾く', () => {
      const internals = asInt(scroller)
      const player = internals.player
      const hazards = internals.hazards

      scroller['distance'] = 220
      scroller['cameraX'] = 0
      // player.y=266 → プレイヤー [140,266,36,52] はバネ [296..320] と重なる
      player.y = 266
      player.vy = 100 // 落下中
      player.invincible = 0

      // 反転状態を直接セット
      ;(scroller as unknown as { _gameStats: { beatHazardInverted: boolean } })._gameStats.beatHazardInverted = true

      const spring = new Hazard(140, 296, 32, 24, '#00cec9', '#55efc4', 'spring', 1, true, 0, 'right')
      hazards.push(spring)

      internals._updateHorizontal(1 / 60, 3)

      // バネは形状駆動なので反転しても弾く
      expect(player.vy).toBe(PLAYER_PHYSICS.springBounceVelocity)
      // 被弾経路を通らないため collisions は 0
      expect(internals.stats.collisions).toBe(0)
    })
  })

  describe('縦モード — バネが弾く', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('y')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    it('縦モードでもバネが弾く', () => {
      const internals = asInt(scroller)
      const player = internals.player
      const hazards = internals.hazards

      scroller['cameraX'] = 0
      player.y = 250
      player.vy = 100
      player.invincible = 0

      // 縦モード: hazard.x = screenX。プレイヤー [140,250,36,52] と重なる位置に配置
      const spring = new Hazard(140, 296, 32, 24, '#00cec9', '#55efc4', 'spring', 1, true, 0, 'right')
      hazards.push(spring)

      internals._updateVertical(1 / 60, 3)

      expect(player.vy).toBe(PLAYER_PHYSICS.springBounceVelocity)
    })
  })
})
