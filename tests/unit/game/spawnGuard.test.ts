import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SideScroller } from '../../../src/game/sideScroller'
import type { RuntimeRules } from '../../../src/domain/types'
import * as GameRegistry from '../../../src/engine/GameRegistry'

const mockCtx = {
  save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(),
  beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(),
  closePath: vi.fn(), stroke: vi.fn(), fill: vi.fn(), arcTo: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  ellipse: vi.fn(),
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

function _makeRules(genre = 'bullet_hell'): RuntimeRules {
  return {
    controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', moveUp: 'ArrowUp', moveDown: 'ArrowDown', shoot: 'z' },
    hazardColors: new Set(['#ff3344']), safeColors: new Set(['#33ff66']),
    features: new Set<import('../../../src/domain/types').FeatureId>(['boss_stationary', 'shoot', 'spread_shot', 'hp', 'vertical_scroll']),
    genre, scrollSpeed: 3, bpm: 120, gravity: 1600,
    scrollDirection: 'vertical',
    environment: 'space', playerMaxHp: 3, timescale: 1, scrollAxis: 'y', colorTouchScore: 200,
  }
}

/**
 * spawnGuard.test.ts
 *
 * _spawnHazard の空テーブルガード検証:
 * 1. 空 spawnTable でも例外を投げない
 * 2. 非空テーブルでは従来どおりスポーンする（回帰テスト）
 */

describe('_spawnHazard — 空テーブルガード (#bullet_hell)', () => {
  describe('空 spawnTable', () => {
    it('spawnTable=[] でも _spawnHazard が例外を投げない', () => {
      const rules = _makeRules('bullet_hell')
      const canvas = _makeCanvas(800, 600)
      const scroller = new SideScroller(canvas, rules)

      const ss = scroller as any
      // SideScroller が正しく構築されたか確認
      expect(ss.rules).toBeDefined()
      expect(ss.hazards).toBeDefined()

      // _spawnHazard を呼んで例外がないことを確認
      expect(() => ss._spawnHazard()).not.toThrow()

      // ハザードが追加されていないことを確認
      expect(scroller['hazards'].length).toBe(0)
    })
  })

  describe('非空テーブル（回帰テスト）', () => {
    it('spawnTable に要素があるときはハザードがスポーンする', () => {
      const rules = _makeRules('aerial_stg')
      const canvas = _makeCanvas(800, 600)
      const scroller = new SideScroller(canvas, rules)

      const ss = scroller as any
      const initialHazardCount = scroller['hazards'].length

      // distance を大きくして weight を上げる
      scroller['distance'] = 1000
      scroller['cameraX'] = 0

      ss._spawnHazard()

      // 少なくとも1つのハザードがスポーンしているはず
      expect(scroller['hazards'].length).toBeGreaterThan(initialHazardCount)
    })
  })

  describe('全重みが0のテーブル', () => {
    it('全 weightStart=0, weightEnd=0 のテーブルでも _spawnHazard はハザードを追加しない', () => {
      const rules = _makeRules('bullet_hell')
      const canvas = _makeCanvas(800, 600)
      const scroller = new SideScroller(canvas, rules)

      // getGenre のスパイ: 全重み0の spawnTable を返すプラグインを返す
      const zeroWeightPlugin = {
        palette: { danger: '#ff0000', dangerGlow: '#ff4444', safe: '#00ff00', safeGlow: '#44ff44' },
        spawnTable: [{
          shape: 'rect' as const, placement: 'air' as const,
          weightStart: 0, weightEnd: 0,
          wRange: [20, 30], hRange: [20, 30],
        }],
      }
      const spy = vi.spyOn(GameRegistry, 'getGenre').mockReturnValue(zeroWeightPlugin as any)

      const ss = scroller as any
      const initialHazardCount = scroller['hazards'].length

      ss._spawnHazard()

      // 全重みが0のため、ハザードは追加されない（早期 return）
      expect(scroller['hazards'].length).toBe(initialHazardCount)

      spy.mockRestore()
    })
  })
})
