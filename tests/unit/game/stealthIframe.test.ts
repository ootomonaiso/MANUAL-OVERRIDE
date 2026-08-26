import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SideScroller } from '../../../src/game/sideScroller'
import { Player, Hazard } from '../../../src/game/entities'
import { SpecialFeature } from '../../../src/game/systems/SpecialFeature'
import type { RuntimeRules } from '../../../src/domain/types'

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

/** stealth_mode 有効の RuntimeRules */
function _makeStealthRules(): RuntimeRules {
  return {
    controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
    hazardColors: new Set(['#ff3344']), safeColors: new Set(['#33ff66']),
    features: new Set<import('../../../src/domain/types').FeatureId>(['stealth_mode']),
    genre: 'base', scrollSpeed: 3, bpm: 120, gravity: 1600,
    scrollDirection: 'horizontal',
    environment: 'ground', playerMaxHp: 3, timescale: 1, scrollAxis: 'x', colorTouchScore: 200,
  }
}

/**
 * Issue #254: 隠密中の被弾回避テスト。
 *
 * stealthHidden=true のとき危険ハザードが重なっても被弾しないこと、
 * stealthHidden=false のときは従来どおり被弾することを検証。
 *
 * 注意: 衝突判定が Feature update より前のため、stealthHidden は
 *       前フレームの値を参照する。テストでは SideScroller.stealthHidden
 *       を直接操作して状態を再現する。
 */

describe('stealth iframe: hidden 中は被弾しない (#254)', () => {
  describe('横モード', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement
    let rules: RuntimeRules
    let feature: SpecialFeature

    beforeEach(() => {
      rules = _makeStealthRules()
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
      feature = new SpecialFeature()
      feature.onInit()
    })

    function _setupHazards(count: number): void {
      const player = scroller['player'] as Player
      const hazards = scroller['hazards']
      // distance=220 → cameraX=0。プレイヤー矩形 [140,268,36,52] 内
      scroller['distance'] = 220
      scroller['cameraX'] = 0
      player.invincible = 0

      for (let i = 0; i < count; i++) {
        const h = new Hazard()
        h.x = 140 + i * 3; h.y = 280; h.w = 30; h.h = 30
        h.isSafe = false; h.color = '#ff3344'; h.glowColor = '#ff0000'
        h.shape = 'rect'; h.hp = 1; h.maxHp = 1
        h.direction = 'right'
        hazards.push(h)
      }
    }

    it('隠密中（stealthHidden=true）は危険ハザードから被弾しない', () => {
      _setupHazards(2)
      // 隠密状態をシミュレート（前フレームの feature update で true に設定された）
      scroller['stealthHidden'] = true

      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)

      // 被弾しないので死亡しない
      expect(result).toBe(false)
      expect(scroller['dead']).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })

    it('隠密中でないとき（stealthHidden=false）は被弾する', () => {
      _setupHazards(2)
      scroller['stealthHidden'] = false

      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)

      // 被弾して死亡
      expect(result).toBe(true)
      expect(scroller['dead']).toBe(true)
      expect(scroller['stats'].collisions).toBe(1)
    })

    it('隠密中に3つのハザードが重なっても被弾しない', () => {
      _setupHazards(3)
      scroller['stealthHidden'] = true

      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)

      expect(result).toBe(false)
      expect(scroller['dead']).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })

    it('安全ハザードは隠密関係なく onSafeHazardTouch が呼ばれる', () => {
      const player = scroller['player'] as Player
      const hazards = scroller['hazards']
      scroller['distance'] = 220
      scroller['cameraX'] = 0
      player.invincible = 0
      scroller['stealthHidden'] = true // 隠密中

      for (let i = 0; i < 2; i++) {
        const h = new Hazard()
        h.x = 140 + i * 3; h.y = 280; h.w = 30; h.h = 30
        h.isSafe = true; h.color = '#33ff66'; h.glowColor = '#00ff66'
        h.shape = 'rect'; h.hp = 1; h.maxHp = 1
        h.direction = 'right'
        hazards.push(h)
      }

      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)

      expect(result).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })
  })

  describe('縦モード', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement
    let rules: RuntimeRules
    let feature: SpecialFeature

    beforeEach(() => {
      rules = _makeStealthRules()
      rules.scrollAxis = 'y' as const
      rules.scrollDirection = 'vertical'
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
      feature = new SpecialFeature()
      feature.onInit()
    })

    function _setupHazards(count: number): void {
      const player = scroller['player'] as Player
      const hazards = scroller['hazards']
      scroller['cameraX'] = 0
      player.invincible = 0

      for (let i = 0; i < count; i++) {
        const h = new Hazard()
        h.x = 150; h.y = 268 + i * 3; h.w = 30; h.h = 30
        h.isSafe = false; h.color = '#ff3344'; h.glowColor = '#ff0000'
        h.shape = 'rect'; h.hp = 1; h.maxHp = 1
        h.direction = 'right'
        hazards.push(h)
      }
    }

    it('隠密中（stealthHidden=true）は危険ハザードから被弾しない', () => {
      _setupHazards(2)
      scroller['stealthHidden'] = true

      const ss = scroller as any
      const result = ss._updateVertical(1 / 60, 3)

      expect(result).toBe(false)
      expect(scroller['dead']).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })

    it('隠密中でないとき（stealthHidden=false）は被弾する', () => {
      _setupHazards(2)
      scroller['stealthHidden'] = false

      const ss = scroller as any
      const result = ss._updateVertical(1 / 60, 3)

      expect(result).toBe(true)
      expect(scroller['dead']).toBe(true)
      expect(scroller['stats'].collisions).toBe(1)
    })
  })

  describe('SpecialFeature → SideScroller 連携', () => {
    it('SpecialFeature.update 後、 SideScroller.stealthHidden が true になる', () => {
      const rules = _makeStealthRules()
      const canvas = _makeCanvas(800, 400)
      const scroller = new SideScroller(canvas, rules)
      const feature = new SpecialFeature()
      feature.onInit()

      // チュートリアル等の initial update で world を通じて setStealthHidden を呼ぶ
      const world = (scroller as any)._buildWorld()
      const input = { keys: new Set(), justPressed: new Set(), justReleased: new Set() }

      // 隠密状態をシミュレート: idleTimer を超過させて hidden=true にする
      // プレイヤーが onGround で vx=0 のとき isIdle=true になる
      scroller['player'].onGround = true
      scroller['player'].vx = 0
      ;(feature as any).stealth.idleTimer = 999
      feature.update(world, input, 1 / 60)

      // SideScroller の stealthHidden が true になっている
      expect(scroller['stealthHidden']).toBe(true)
    })

    it('SpecialFeature.update 後、移動すると stealthHidden が false になる', () => {
      const rules = _makeStealthRules()
      const canvas = _makeCanvas(800, 400)
      const scroller = new SideScroller(canvas, rules)
      const feature = new SpecialFeature()
      feature.onInit()

      const world = (scroller as any)._buildWorld()
      const input = { keys: new Set(), justPressed: new Set(), justReleased: new Set() }

      // まず隠密状態にする
      scroller['player'].onGround = true
      scroller['player'].vx = 0
      ;(feature as any).stealth.idleTimer = 999
      feature.update(world, input, 1 / 60)
      expect(scroller['stealthHidden']).toBe(true)

      // 次に移動させると（vx > 1）、隠密が解除される
      scroller['player'].vx = 100
      const world2 = (scroller as any)._buildWorld()
      ;(feature as any).stealth.idleTimer = 0
      ;(feature as any).stealth.hidden = true
      feature.update(world2, input, 1 / 60)

      expect(scroller['stealthHidden']).toBe(false)
    })
  })
})
