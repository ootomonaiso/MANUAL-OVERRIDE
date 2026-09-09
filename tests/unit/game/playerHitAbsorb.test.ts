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

function _makeRules(features: string[], scrollAxis: 'x' | 'y' = 'x'): RuntimeRules {
  return {
    controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
    hazardColors: new Set(['#ff3344']), safeColors: new Set(['#33ff66']),
    features: new Set<import('../../../src/domain/types').FeatureId>(features),
    genre: 'base', scrollSpeed: 3, bpm: 120, gravity: 1600,
    scrollDirection: scrollAxis === 'x' ? 'horizontal' : 'vertical',
    environment: 'ground', playerMaxHp: 3, timescale: 1, scrollAxis, colorTouchScore: 200,
  }
}

/**
 * §2.2 エンジン修正の回帰テスト: onPlayerHit 戻り値による被弾吸収
 *
 * ケースA: features: ['hp', 'item_pickup']、hp=3、1被弾 → dead === false、hp===2
 *          （本設計で初めて成立する挙動）
 * ケースB: features: []、1被弾 → dead === true（従来挙動の維持）
 */

describe('engine: onPlayerHit absorbed flag (#253 fix)', () => {
  describe('ケースA: hp feature あり — 1被弾で生存（被弾吸収）', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules(['hp', 'item_pickup'])
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    function _setupCollision(): void {
      const player = scroller['player'] as Player
      const hazards = scroller['hazards']
      scroller['distance'] = 220
      scroller['cameraX'] = 0
      player.invincible = 0
      // プレイヤー矩形 [140,268,36,52] に重なるハザード
      const h = new Hazard()
      h.x = 140; h.y = 280; h.w = 30; h.h = 30
      h.isSafe = false; h.color = '#ff3344'; h.glowColor = '#ff0000'
      h.shape = 'rect'; h.hp = 1; h.maxHp = 1
      h.direction = 'right'
      hazards.push(h)
    }

    it('1 被弾で死亡しない（dead === false）かつ hp が 1 減る', () => {
      _setupCollision()
      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)
      // hp feature あり → 被弾を吸収 → 死亡しない
      expect(result).toBe(false)
      expect(scroller['dead']).toBe(false)
      expect(scroller['player'].hp).toBe(2)
    })

    it('無敵フレームを 0 にして 3 被弾させると死亡する', () => {
      _setupCollision()
      const ss = scroller as any
      const player = scroller['player'] as Player

      // 1 被弾 → hp=2、無敵付与
      ss._updateHorizontal(1 / 60, 3)
      expect(player.hp).toBe(2)

      // 無敵をクリアして 2 回目の被弾
      player.invincible = 0
      // プレイヤーと重なるハザードを再配置
      const hazards = scroller['hazards']
      const h2 = new Hazard()
      h2.x = 140; h2.y = 280; h2.w = 30; h2.h = 30
      h2.isSafe = false; h2.color = '#ff3344'; h2.glowColor = '#ff0000'
      h2.shape = 'rect'; h2.hp = 1; h2.maxHp = 1
      h2.direction = 'right'
      hazards.push(h2)

      ss._updateHorizontal(1 / 60, 3)
      expect(player.hp).toBe(1)

      // 無敵をクリアして 3 回目の被弾 → 死亡
      player.invincible = 0
      const h3 = new Hazard()
      h3.x = 140; h3.y = 280; h3.w = 30; h3.h = 30
      h3.isSafe = false; h3.color = '#ff3344'; h3.glowColor = '#ff0000'
      h3.shape = 'rect'; h3.hp = 1; h3.maxHp = 1
      h3.direction = 'right'
      hazards.push(h3)

      ss._updateHorizontal(1 / 60, 3)
      expect(scroller['dead']).toBe(true)
    })
  })

  describe('ケースB: features 空 — 1被弾で即死（従来挙動維持）', () => {
    let scroller: SideScroller
    let canvas: HTMLCanvasElement

    beforeEach(() => {
      const rules = _makeRules([])
      canvas = _makeCanvas(800, 400)
      scroller = new SideScroller(canvas, rules)
    })

    it('features 空の 1 被弾で即死（dead === true）', () => {
      const player = scroller['player'] as Player
      const hazards = scroller['hazards']
      scroller['distance'] = 220
      scroller['cameraX'] = 0
      player.invincible = 0

      const h = new Hazard()
      h.x = 140; h.y = 280; h.w = 30; h.h = 30
      h.isSafe = false; h.color = '#ff3344'; h.glowColor = '#ff0000'
      h.shape = 'rect'; h.hp = 1; h.maxHp = 1
      h.direction = 'right'
      hazards.push(h)

      const ss = scroller as any
      const result = ss._updateHorizontal(1 / 60, 3)
      expect(result).toBe(true)
      expect(scroller['dead']).toBe(true)
    })
  })
})
