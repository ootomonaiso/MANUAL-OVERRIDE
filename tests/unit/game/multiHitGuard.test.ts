import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SideScroller } from '../../../src/game/sideScroller'
import { Player, Hazard } from '../../../src/game/entities'
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
 * Issue #253: 同一フレームでの多重被弾を防ぐテスト。
 *
 * _updateHorizontal / _updateVertical の衝突ループ内で
 * _onPlayerHit 後に break するよう修正し、同一フレームで
 * 複数ハザードが重なっても collisions が 1 回のみになることを検証。
 *
 * _onPlayerHit は _die を呼ぶため、死亡時は result=true になる。
 * 重要なのは collisions が 1 回のみ増加すること。
 */

describe('hazard collision: no multi-hit in same frame (#253)', () => {
  describe('横モード — 衝突ループの break 動作検証', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('x')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    function _setupOverlappingHazards(count: number): void {
      const player = scroller['player'] as Player
      const hazards = scroller['hazards']
      // distance=220 → cameraX=0。プレイヤー矩形 [140,268,36,52] 内に配置
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

    it('2 つの危険ハザードがプレイヤーと重なっても collisions は 1 回のみ', () => {
      _setupOverlappingHazards(2)
      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)
      // 1 被弾で死亡するため true（_onPlayerHit → _die）
      expect(result).toBe(true)
      expect(scroller['stats'].collisions).toBe(1)
    })

    it('3 つの危険ハザードが重なっても collisions は 1 回のみ', () => {
      _setupOverlappingHazards(3)
      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)
      expect(result).toBe(true)
      expect(scroller['stats'].collisions).toBe(1)
    })

    it('危険ハザードがないときは collisions は 0', () => {
      scroller['distance'] = 220
      scroller['cameraX'] = 0
      const player = scroller['player'] as Player
      player.invincible = 0
      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)
      expect(result).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })

    it('無敵中は collisions は 0', () => {
      _setupOverlappingHazards(2)
      const player = scroller['player'] as Player
      player.invincible = 0.5
      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)
      expect(result).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })

    it('安全ハザードが重なっていても collisions は 0（break 対象外）', () => {
      const player = scroller['player'] as Player
      const hazards = scroller['hazards']
      scroller['distance'] = 220
      scroller['cameraX'] = 0
      player.invincible = 0
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

  describe('縦モード — 衝突ループの break 動作検証', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules('y')
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    function _setupOverlappingHazards(count: number): void {
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

    it('2 つの危険ハザードがプレイヤーと重なっても collisions は 1 回のみ', () => {
      _setupOverlappingHazards(2)
      const ss = scroller as any
      const result = ss._updateVertical(1 / 60, 3)
      expect(result).toBe(true)
      expect(scroller['stats'].collisions).toBe(1)
    })

    it('3 つの危険ハザードが重なっても collisions は 1 回のみ', () => {
      _setupOverlappingHazards(3)
      const ss = scroller as any
      const result = ss._updateVertical(1 / 60, 3)
      expect(result).toBe(true)
      expect(scroller['stats'].collisions).toBe(1)
    })

    it('危険ハザードがないときは collisions は 0', () => {
      scroller['cameraX'] = 0
      const player = scroller['player'] as Player
      player.invincible = 0
      const ss = scroller as any
      const result = ss._updateVertical(1 / 60, 3)
      expect(result).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })

    it('無敵中は collisions は 0', () => {
      _setupOverlappingHazards(2)
      const player = scroller['player'] as Player
      player.invincible = 0.5
      const ss = scroller as any
      const result = ss._updateVertical(1 / 60, 3)
      expect(result).toBe(false)
      expect(scroller['stats'].collisions).toBe(0)
    })
  })
})
