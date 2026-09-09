/**
 * bullet_runner ジャンルプラグインのユニットテスト。
 *
 * drawGenreHUD（敵HPバー）は CanvasRenderingContext2D のモックを注入し、
 * 発行された fillRect の座標・寸法・色を直接検証する
 * （tests/unit/game/render/PixelCanvas.test.ts と同じ手法）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { BulletRunnerPlugin } from '../../../src/genres/BulletRunnerPlugin'
import { Hazard } from '../../../src/game/entities'
import type { MutableWorld } from '../../../src/engine/types'

// ─── モック ─────────────────────────────────────────────────────────────

interface Emitted {
  x: number; y: number; w: number; h: number; color: string
}

/** fillRect の発行内容を記録する最小の 2D コンテキストモック */
function createMockCtx(): { ctx: CanvasRenderingContext2D; emitted: Emitted[] } {
  const emitted: Emitted[] = []
  const ctx = {
    fillStyle: '',
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    fillRect(x: number, y: number, w: number, h: number) {
      emitted.push({ x, y, w, h, color: String(ctx.fillStyle) })
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, emitted }
}

function createMockWorld(overrides: { scrollAxis?: 'x' | 'y'; cameraX?: number } = {}): MutableWorld {
  const hazards: Hazard[] = []
  const scrollAxis = overrides.scrollAxis ?? 'x'
  const cameraX = overrides.cameraX ?? 0
  return {
    hazards,
    cameraX,
    rules: {
      features: new Set(['auto_run', 'shoot', 'enemy_hp']),
      controls: { shoot: 'z' },
      genre: 'bullet_runner',
      hazardColors: new Set(),
      safeColors: new Set(),
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: scrollAxis === 'y' ? 'vertical' : 'horizontal',
      environment: 'forest',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis,
      colorTouchScore: 200,
    },
    getHazardScreenX: (h: Hazard) => (scrollAxis === 'x' ? h.x - cameraX : h.x),
  } as unknown as MutableWorld
}

/** 指定 hp/maxHp の敵を生成（コンストラクタは hp = maxHp で初期化するため hp を上書きする） */
function makeEnemy(x: number, y: number, w: number, hp: number, maxHp: number): Hazard {
  const h = new Hazard(x, y, w, 40, '#ff2266', '#ff66aa', 'rect', maxHp, false, 0, 'right')
  h.hp = hp
  return h
}

// ─── テスト ─────────────────────────────────────────────────────────────

describe('BulletRunnerPlugin', () => {
  let plugin: BulletRunnerPlugin

  beforeEach(() => {
    plugin = new BulletRunnerPlugin()
  })

  describe('静的プロパティ', () => {
    it('id は bullet_runner', () => {
      expect(plugin.id).toBe('bullet_runner')
    })

    it('drawsOwnHpBar が true（エンジン汎用バー抑制）', () => {
      expect(plugin.drawsOwnHpBar).toBe(true)
    })

    it('palette はネオンサイバーカラー', () => {
      expect(plugin.palette.danger).toBe('#ff2266')
      expect(plugin.palette.dangerGlow).toBe('#ff66aa')
      expect(plugin.palette.safe).toBe('#00ffcc')
      expect(plugin.palette.safeGlow).toBe('#66ffee')
    })

    it('spawnTable は 4エントリで rect×2 / diamond / spike', () => {
      expect(plugin.spawnTable).toHaveLength(4)
      expect(plugin.spawnTable.map((e) => e.shape)).toEqual(['rect', 'rect', 'diamond', 'spike'])
      expect(plugin.spawnTable.map((e) => e.placement)).toEqual(['ground', 'air', 'float', 'ground'])
    })
  })

  describe('drawGenreHUD（敵HPバー）', () => {
    it('ハザードが空なら何も描画しない', () => {
      const world = createMockWorld()
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(0)
    })

    it('maxHp > 1 の敵に背景矩形と比率フィル矩形を発行する', () => {
      const world = createMockWorld({ cameraX: 0 })
      world.hazards.push(makeEnemy(100, 196, 32, 2, 4))
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)

      expect(emitted).toHaveLength(2)
      // 背景: 全幅・半透明黒。y = 196 - 8 = 188（4pxグリッド上）
      expect(emitted[0]).toEqual({ x: 100, y: 188, w: 32, h: 4, color: 'rgba(0,0,0,0.6)' })
      // フィル: 幅 = ceil(32 × 2/4) = 16
      expect(emitted[1].x).toBe(100)
      expect(emitted[1].y).toBe(188)
      expect(emitted[1].w).toBe(16)
      expect(emitted[1].h).toBe(4)
    })

    it('比率 > 0.6 は緑', () => {
      const world = createMockWorld()
      world.hazards.push(makeEnemy(100, 196, 32, 3, 4)) // 0.75
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(2)
      expect(emitted[1].w).toBe(24)
      expect(emitted[1].color).toBe('#44ff44')
    })

    it('比率 0.3〜0.6 は黄', () => {
      const world = createMockWorld()
      world.hazards.push(makeEnemy(100, 196, 32, 2, 4)) // 0.5
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted[1].w).toBe(16)
      expect(emitted[1].color).toBe('#ffff44')
    })

    it('比率 < 0.3 は赤', () => {
      const world = createMockWorld()
      world.hazards.push(makeEnemy(100, 196, 32, 1, 4)) // 0.25
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted[1].w).toBe(8)
      expect(emitted[1].color).toBe('#ff4444')
    })

    it('閾値境界: 0.6 ちょうどは黄（>0.6 なので緑にはならない）', () => {
      const world = createMockWorld()
      world.hazards.push(makeEnemy(100, 196, 40, 6, 10)) // ちょうど 0.6
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      const fills = emitted.filter((e) => e.color !== 'rgba(0,0,0,0.6)')
      expect(fills).toHaveLength(1)
      expect(fills[0].color).toBe('#ffff44')
    })

    it('閾値境界: 0.3 ちょうどは黄（仕様 "<30%" は厳密に小さい場合のみ赤）', () => {
      const world = createMockWorld()
      world.hazards.push(makeEnemy(100, 196, 40, 3, 10)) // ちょうど 0.3
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      const fills = emitted.filter((e) => e.color !== 'rgba(0,0,0,0.6)')
      expect(fills).toHaveLength(1)
      expect(fills[0].color).toBe('#ffff44')
    })

    it('maxHp <= 1 のハザードは描画しない', () => {
      const world = createMockWorld()
      world.hazards.push(new Hazard(100, 196, 32, 40, '#ff2266', '#ff66aa', 'rect', 1, false, 0, 'right'))
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(0)
    })

    it('横モードで画面外のハザードはスキップする', () => {
      const world = createMockWorld({ cameraX: 1000 })
      world.hazards.push(makeEnemy(100, 196, 32, 2, 4)) // sx = 100 - 1000 = -900
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(0)
    })

    it('縦モードでは cameraX を無視して h.x をそのまま使う', () => {
      const world = createMockWorld({ scrollAxis: 'y', cameraX: 500 })
      world.hazards.push(makeEnemy(200, 196, 32, 2, 4)) // sx = 200（cameraX 500 を引かない）
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(2)
      expect(emitted[0].x).toBe(200)
    })

    it('縦モードで Y 方向画面外のハザードはスキップする', () => {
      const world = createMockWorld({ scrollAxis: 'y' })
      world.hazards.push(makeEnemy(200, 900, 32, 2, 4)) // y = 900 > 600 + 100
      world.hazards.push(makeEnemy(300, -300, 32, 2, 4)) // y = -300 < -200
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(0)
    })

    it('浮遊ハザードは rect.y（振幅反映後）を基準にバーを置く', () => {
      const world = createMockWorld()
      const h = makeEnemy(100, 196, 32, 2, 4)
      h.floatAmp = 12
      h.pulse = Math.PI / 2 // sin = 1 → rect.y = 196 + 12 = 208
      world.hazards.push(h)
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(2)
      expect(emitted[0].y).toBe(200) // 208 - 8 = 200
    })

    it('hp=0 は背景矩形のみ（fill 幅 0 → PixelCanvas 早期リターン）', () => {
      const world = createMockWorld()
      world.hazards.push(makeEnemy(100, 196, 32, 0, 3))
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      // 背景矩形は発行されるが fill 矩形（幅 0）は発行されない
      const bgRects = emitted.filter((e) => e.color === 'rgba(0,0,0,0.6)')
      const fillRects = emitted.filter((e) => e.color !== 'rgba(0,0,0,0.6)')
      expect(bgRects).toHaveLength(1)
      expect(fillRects).toHaveLength(0)
    })

    it('横モードで右端の画面外ハザードはスキップする', () => {
      const world = createMockWorld({ cameraX: 0 })
      // x: 3000 → screen x = 3000 > 800 + 50 で cull される
      world.hazards.push(makeEnemy(3000, 196, 32, 2, 4))
      const { ctx, emitted } = createMockCtx()
      plugin.drawGenreHUD(ctx, world, 800, 600)
      expect(emitted).toHaveLength(0)
    })
  })
})
