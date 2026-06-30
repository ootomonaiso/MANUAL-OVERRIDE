import { describe, it, expect } from 'vitest'
import { rectsOverlap, Player, Hazard, Bullet, Item } from '../../../src/game/entities'

describe('rectsOverlap', () => {
  it('完全に重なった矩形は true を返す', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 50, y: 50, w: 100, h: 100 }
    expect(rectsOverlap(a, b)).toBe(true)
  })

  it('隣接する矩形は false を返す（grace は矩形Aを縮小するため）', () => {
    // grace は矩形Aの衝突ボックスを縮小するため、厳密な判定になる
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 100, y: 0, w: 100, h: 100 }
    expect(rectsOverlap(a, b)).toBe(false)
  })

  it('離れている矩形は false を返す', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 200, y: 0, w: 100, h: 100 }
    expect(rectsOverlap(a, b)).toBe(false)
  })

  it('grace パラメータで矩形Aの衝突ボックスが縮小される', () => {
    // grace は矩形Aの衝突ボックスを shrink するため、
    // 重なりにくくなる（プレイヤーを有利にする設計）
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 90, y: 0, w: 100, h: 100 }
    expect(rectsOverlap(a, b, 0)).toBe(true)  // grace=0 で判定
    // grace=4 で ag.x=4, ag.w=92, ag.x+ag.w=96 > b.x=90 → true
    expect(rectsOverlap(a, b, 4)).toBe(true)
    // grace=20 で ag.x=20, ag.w=60, ag.x+ag.w=80 < b.x=90 → false
    expect(rectsOverlap(a, b, 20)).toBe(false)
  })

  it('grace は矩形の半分より大きくならない', () => {
    // 小さな矩形 (w=10, h=10) の場合、grace は floor(10/2) = 5 にクランプされる
    // grace=5 → ag={x:5, y:5, w:0, h:0} → ag.x+ag.w=5 < b.x=8 → false
    const a = { x: 0, y: 0, w: 10, h: 10 }
    const b = { x: 8, y: 0, w: 10, h: 10 }
    expect(rectsOverlap(a, b, 100)).toBe(false) // grace=5 で shrink されて false
    // 完全に重なれば true
    expect(rectsOverlap(a, { x: 0, y: 0, w: 10, h: 10 }, 100)).toBe(true)
  })

  it('Y 方向のみの重なりを判定する', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    const b = { x: 20, y: 150, w: 100, h: 100 }
    expect(rectsOverlap(a, b)).toBe(false)
  })

  it('片方の矩形が他方に完全に含まれる場合', () => {
    const a = { x: 0, y: 0, w: 200, h: 200 }
    const b = { x: 50, y: 50, w: 50, h: 50 }
    expect(rectsOverlap(a, b)).toBe(true)
  })
})

describe('Player', () => {
  it('正しく初期化される', () => {
    const p = new Player(100, 500)
    expect(p.x).toBe(100)
    expect(p.y).toBe(500 - 52) // groundY - h
    expect(p.w).toBe(36)
    expect(p.h).toBe(52)
    expect(p.onGround).toBe(false)
    expect(p.hp).toBe(3)
    expect(p.maxHp).toBe(3)
  })

  it('rect プロパティが正しい矩形を返す', () => {
    const p = new Player(100, 500)
    expect(p.rect).toEqual({ x: 100, y: 448, w: 36, h: 52 })
  })

  it('デフォルトの物理状態が正しい', () => {
    const p = new Player(0, 0)
    expect(p.vy).toBe(0)
    expect(p.vx).toBe(0)
    expect(p.invincible).toBe(0)
    expect(p.exp).toBe(0)
    expect(p.airTime).toBe(0)
    expect(p.runFrame).toBe(0)
    expect(p.landSquash).toBe(0)
  })
})

describe('Hazard', () => {
  it('正しく初期化される', () => {
    const h = new Hazard(100, 200, 30, 40, 'red', '#ff0000')
    expect(h.x).toBe(100)
    expect(h.y).toBe(200)
    expect(h.w).toBe(30)
    expect(h.h).toBe(40)
    expect(h.color).toBe('red')
    expect(h.glowColor).toBe('#ff0000')
    expect(h.shape).toBe('rect')
    expect(h.hp).toBe(1)
    expect(h.isSafe).toBe(false)
  })

  it('オプションパラメータで初期化できる', () => {
    const h = new Hazard(0, 0, 50, 50, 'blue', '#00f', 'spike', 3, true, 10)
    expect(h.shape).toBe('spike')
    expect(h.hp).toBe(3)
    expect(h.maxHp).toBe(3)
    expect(h.isSafe).toBe(true)
    expect(h.floatAmp).toBe(10)
  })

  it('floatAmp=0 のとき rect は y をそのまま返す', () => {
    const h = new Hazard(0, 100, 30, 40, 'red', '#f')
    h.pulse = Math.PI / 2 // sin = 1
    expect(h.rect.y).toBe(100) // floatAmp=0 なので浮遊しない
  })

  it('floatAmp>0 のとき rect は pulse に応じて y が変化する', () => {
    const h = new Hazard(0, 100, 30, 40, 'red', '#f', 'rect', 1, false, 10)
    h.pulse = Math.PI / 2 // sin = 1
    expect(h.rect.y).toBeCloseTo(110) // 100 + 1 * 10
  })
})

describe('Bullet', () => {
  it('正しく初期化される', () => {
    const b = new Bullet(100, 200, 300, 0)
    expect(b.x).toBe(100)
    expect(b.y).toBe(200)
    expect(b.vx).toBe(300)
    expect(b.vy).toBe(0)
    expect(b.w).toBe(14)
    expect(b.h).toBe(5)
    expect(b.alive).toBe(true)
    expect(b.trail).toEqual([])
  })

  it('rect プロパティが正しい矩形を返す', () => {
    const b = new Bullet(100, 200, 300, 0)
    expect(b.rect).toEqual({ x: 100, y: 200, w: 14, h: 5 })
  })
})

describe('Item', () => {
  it('正しく初期化される', () => {
    const item = new Item(100, 200, 'exp')
    expect(item.x).toBe(100)
    expect(item.y).toBe(200)
    expect(item.type).toBe('exp')
    expect(item.w).toBe(22)
    expect(item.h).toBe(22)
    expect(item.alive).toBe(true)
  })

  it('hp タイプのアイテムを作成できる', () => {
    const item = new Item(0, 0, 'hp')
    expect(item.type).toBe('hp')
  })

  it('pulse がランダムな位相で初期化される', () => {
    const item1 = new Item(0, 0, 'exp')
    const item2 = new Item(0, 0, 'exp')
    // 完全に一致する確率は極めて低い
    expect(item1.pulse).not.toBe(item2.pulse)
  })

  it('rect プロパティが正しい矩形を返す', () => {
    const item = new Item(100, 200, 'exp')
    expect(item.rect).toEqual({ x: 100, y: 200, w: 22, h: 22 })
  })
})
