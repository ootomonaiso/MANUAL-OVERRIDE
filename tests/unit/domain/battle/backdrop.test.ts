import { describe, it, expect } from 'vitest'
import { buildBackdropScene, pickBackgroundId, SCENE_W, SCENE_H, type BattleBackgroundDef } from '../../../../src/domain/battle/backdrop'
import { BATTLE_BACKGROUNDS, findBattleBackground } from '../../../../src/data/rpg/battleBackgrounds'

function defOf(id: string): BattleBackgroundDef {
  const found = findBattleBackground(id)
  if (!found) throw new Error(`背景 "${id}" が見つかりません`)
  return found
}

describe('battleBackgrounds: ロード', () => {
  it('背景が読み込まれ、通常戦用とボス戦用の両方がある', () => {
    expect(BATTLE_BACKGROUNDS.length).toBeGreaterThanOrEqual(3)
    expect(BATTLE_BACKGROUNDS.filter(b => !b.bossOnly).length).toBeGreaterThanOrEqual(2)
    expect(BATTLE_BACKGROUNDS.some(b => b.bossOnly)).toBe(true)
  })

  it('どの背景も空・地面・アクセント色を持つ', () => {
    for (const bg of BATTLE_BACKGROUNDS) {
      expect(bg.sky.top, bg.id).toMatch(/^#[0-9a-f]{6}$/i)
      expect(bg.ground.top, bg.id).toMatch(/^#[0-9a-f]{6}$/i)
      expect(bg.accent, bg.id).toMatch(/^#[0-9a-f]{6}$/i)
      expect(bg.label.length, bg.id).toBeGreaterThan(0)
    }
  })

  it('存在しないIDや null を渡すと null を返す', () => {
    expect(findBattleBackground(null)).toBeNull()
    expect(findBattleBackground('bg_does_not_exist')).toBeNull()
  })
})

describe('buildBackdropScene', () => {
  it('稜線・地面・小物を描画可能な形に変換する', () => {
    const scene = buildBackdropScene(defOf('bg_grassland'))
    expect(scene.layers.length).toBeGreaterThan(0)
    for (const layer of scene.layers) {
      expect(layer.points.length).toBeGreaterThan(2)
      // 稜線は必ず画面下端まで閉じる（塗り潰しに穴が開かないこと）
      const last = layer.points[layer.points.length - 1]
      const beforeLast = layer.points[layer.points.length - 2]
      expect(beforeLast).toEqual({ x: SCENE_W, y: SCENE_H })
      expect(last).toEqual({ x: 0, y: SCENE_H })
      for (const pt of layer.points) {
        // ドットの境界がぼけないよう、座標は整数へ落としてある
        expect(Number.isInteger(pt.x)).toBe(true)
        expect(Number.isInteger(pt.y)).toBe(true)
      }
    }
    expect(scene.ground.y).toBeGreaterThan(0)
    expect(scene.ground.y).toBeLessThan(SCENE_H)
    expect(scene.props.length).toBeGreaterThan(0)
  })

  it('小物の数は定義した count の合計になる', () => {
    const def = defOf('bg_desert')
    const expected = (def.props ?? []).reduce((sum, p) => sum + p.count, 0)
    expect(buildBackdropScene(def).props).toHaveLength(expected)
  })

  it('同じ背景は毎回同じ地形になる（戦うたびに形が変わらない）', () => {
    const a = buildBackdropScene(defOf('bg_wasteland'))
    const b = buildBackdropScene(defOf('bg_wasteland'))
    expect(a).toEqual(b)
  })

  it('背景が違えば地形も違う', () => {
    const a = buildBackdropScene(defOf('bg_wasteland'))
    const b = buildBackdropScene(defOf('bg_ruins'))
    expect(a.layers[0].points).not.toEqual(b.layers[0].points)
  })

  it('空・雲・地面のドットが揃う', () => {
    const scene = buildBackdropScene(defOf('bg_grassland'))
    expect(scene.clouds.length).toBeGreaterThan(0)
    expect(scene.speckles.length).toBeGreaterThan(0)
    for (const s of scene.speckles) {
      expect(s.y).toBeGreaterThanOrEqual(scene.ground.y)
    }
  })

  it('小物は画面幅の内側に置かれる', () => {
    for (const bg of BATTLE_BACKGROUNDS) {
      for (const p of buildBackdropScene(bg).props) {
        expect(p.x, bg.id).toBeGreaterThanOrEqual(0)
        expect(p.x, bg.id).toBeLessThanOrEqual(SCENE_W)
      }
    }
  })
})

describe('pickBackgroundId', () => {
  const defs = BATTLE_BACKGROUNDS

  it('ボス戦では bossOnly の背景が選ばれる', () => {
    const id = pickBackgroundId(defs, true, null, () => 0.5)
    expect(findBattleBackground(id)?.bossOnly).toBe(true)
  })

  it('通常戦では bossOnly の背景は選ばれない', () => {
    for (let i = 0; i < 20; i++) {
      const id = pickBackgroundId(defs, false, null, () => i / 20)
      expect(findBattleBackground(id)?.bossOnly ?? false).toBe(false)
    }
  })

  it('直前と同じ背景は避ける', () => {
    const first = pickBackgroundId(defs, false, null, () => 0) as string
    for (let i = 0; i < 20; i++) {
      expect(pickBackgroundId(defs, false, first, () => i / 20)).not.toBe(first)
    }
  })

  it('候補が1つしかないときは同じ背景を返す（避けられないので）', () => {
    const only = [defs[0]]
    expect(pickBackgroundId(only, only[0].bossOnly ?? false, only[0].id, () => 0.9)).toBe(only[0].id)
  })

  it('候補が空なら null', () => {
    expect(pickBackgroundId([], false, null, () => 0.5)).toBeNull()
  })
})
