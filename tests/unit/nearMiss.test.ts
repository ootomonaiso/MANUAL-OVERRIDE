import { describe, it, expect } from 'vitest'
import { isNearMiss, type Rect } from '../../src/domain/nearMiss'

const GAP = 42

function player(x = 200, y = 300, w = 36, h = 52): Rect {
  return { x, y, w, h }
}

describe('isNearMiss', () => {
  it('重複 → false（被弾なのでニアミスではない）', () => {
    const p = player()
    // プレイヤーと重なる位置
    const h: Rect = { x: 190, y: 310, w: 30, h: 40 }
    expect(isNearMiss(p, h, 'x', GAP)).toBe(false)
  })

  it('横モード: 左通過 + 垂直重なり（隙間0） → true', () => {
    const p = player(200, 300)
    // 左通過: h.x+h.w=130 < 200 ✓
    // 垂直重なり: h.y=280, h.h=60 → h.y+h.h=340. p.y=300, p.y+h.h=352. 重なっている。
    const h: Rect = { x: 100, y: 280, w: 30, h: 60 }
    expect(isNearMiss(p, h, 'x', GAP)).toBe(true) // gap = 0 < 42
  })

  it('横モード: 左通過 + 隙間 30px → true', () => {
    const p = player(200, 300)
    // 左通過: h.x+h.w=130 < 200 ✓
    // gap = 30px: hazard を player のちょうど上に 30px 離す
    // p.y=300, h.y+h.h=270 → h.y=220, h.h=50. gapTop=300-270=30.
    const h: Rect = { x: 100, y: 220, w: 30, h: 50 }
    expect(isNearMiss(p, h, 'x', GAP)).toBe(true) // gap = 30 < 42
  })

  it('横モード: 隙間 60px → false', () => {
    const p = player(200, 300)
    // gap = 60px: p.y=300, h.y+h.h=240 → gapTop=60
    const h: Rect = { x: 100, y: 190, w: 30, h: 50 }
    expect(isNearMiss(p, h, 'x', GAP)).toBe(false) // gap = 60 >= 42
  })

  it('横モード: 未通過 → false', () => {
    const p = player(200, 300)
    // hazard がまだ右側
    const h: Rect = { x: 250, y: 100, w: 30, h: 50 }
    expect(isNearMiss(p, h, 'x', GAP)).toBe(false)
  })

  it('縦モード: 下通過 + 水平重なり（隙間0） → true', () => {
    const p = player(200, 300)
    // 下通過: h.y=360 > p.y+p.h=352 ✓
    // 水平重なり: h.x=180, h.w=40 → h.x+h.w=220. p.x=200, p.x+w=236. 重なっている。
    const h: Rect = { x: 180, y: 360, w: 40, h: 100 }
    expect(isNearMiss(p, h, 'y', GAP)).toBe(true) // gap = 0 < 42
  })

  it('縦モード: 下通過 + 水平隙間 30px → true', () => {
    const p = player(200, 300)
    // 下通過: h.y=360 > p.y+p.h=352 ✓
    // gap = 30px: p right=236, h.x=266 → gapRight=266-236=30
    const h: Rect = { x: 266, y: 360, w: 30, h: 100 }
    expect(isNearMiss(p, h, 'y', GAP)).toBe(true) // gap = 30 < 42
  })

  it('縦モード: 水平隙間 60px → false', () => {
    const p = player(200, 300)
    // gap = 60px: p.x+w=236, h.x=296 → gapRight=60
    const h: Rect = { x: 296, y: 360, w: 30, h: 100 }
    expect(isNearMiss(p, h, 'y', GAP)).toBe(false) // gap = 60 >= 42
  })

  it('縦モード: 未通過（障害物がプレイヤーの上） → false', () => {
    const p = player(200, 300)
    // 未通過: h.y=100 <= p.y+p.h=352
    const h: Rect = { x: 180, y: 100, w: 40, h: 100 }
    expect(isNearMiss(p, h, 'y', GAP)).toBe(false)
  })
})
