import { describe, it, expect } from 'vitest'
import {
  buildBackdropScene, pickBackgroundId, skyBands, glowRings, mixHex,
  SCENE_W, SCENE_H, type BattleBackgroundDef, type BackdropScene,
} from '../../../../src/domain/battle/backdrop'
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

// ─────────────────────────────────────────────────────────────
// 描画プリミティブ（skyBands / glowRings / mixHex）
// docs/refactoring/02-domain.md §2-3 で components 層へ移設予定のため、
// 移設で壊れても気づけるように現行の出力を固定しておく特性テスト。
// ─────────────────────────────────────────────────────────────

/** backdrop.ts のモジュール private 定数。JSON 化対象外（§4 low）なのでここに写して固定する */
const SKY_BANDS = 12
const GLOW_RINGS = 5
/** glowRings の不透明度の下限（外周ほど薄くなるが 0 にはしない） */
const GLOW_MIN_OPACITY = 0.06

function sceneWith(over: Partial<BattleBackgroundDef> = {}): BackdropScene {
  return buildBackdropScene({
    id: 'bg_unit_test',
    label: 'テスト背景',
    sky: { top: '#000000', bottom: '#ffffff' },
    ground: { top: '#333333', bottom: '#111111', baseline: 0.6 },
    layers: [],
    floor: { top: '#444444', bottom: '#222222', line: '#666666' },
    accent: '#ff0000',
    ...over,
  })
}

describe('skyBands', () => {
  const scene = sceneWith()
  const GROUND_Y = SKY_BANDS * 10

  it('groundY を SKY_BANDS 段の帯に割る', () => {
    const bands = skyBands(scene, GROUND_Y)
    expect(bands).toHaveLength(SKY_BANDS)
    for (const b of bands) {
      expect(b.x).toBe(0)
      expect(b.w).toBe(SCENE_W)
    }
  })

  it('帯は隙間も重なりもなく groundY までを覆う', () => {
    const bands = skyBands(scene, GROUND_Y)
    let y = 0
    for (const b of bands) {
      expect(b.y).toBe(y)
      y += b.h
    }
    expect(y).toBe(GROUND_Y)
  })

  it('先頭の帯は sky.top、末尾の帯は sky.bottom の色になる', () => {
    const bands = skyBands(scene, GROUND_Y)
    expect(bands[0].color).toBe(scene.sky.top)
    expect(bands[bands.length - 1].color).toBe(scene.sky.bottom)
  })

  it('段数より groundY が小さいときは高さ1の帯が groundY ぶんだけ並ぶ', () => {
    const shallow = 5
    const bands = skyBands(scene, shallow)
    expect(bands).toHaveLength(shallow)
    expect(bands.every(b => b.h === 1)).toBe(true)
  })

  it('groundY が 0 なら帯は1つも出ない', () => {
    expect(skyBands(scene, 0)).toEqual([])
  })

  it('端数が出る groundY でも最後の帯が groundY を越えない', () => {
    const odd = SKY_BANDS * 3 + 1
    const bands = skyBands(scene, odd)
    const last = bands[bands.length - 1]
    expect(last.y + last.h).toBeLessThanOrEqual(odd)
  })
})

describe('glowRings', () => {
  const glowScene = sceneWith({ glow: { color: '#ffddaa', x: 0.3, y: 0.2, r: 0.15 } })

  it('glow が無い背景では空配列', () => {
    expect(glowRings(sceneWith())).toEqual([])
  })

  it('GLOW_RINGS 枚を外側から内側の順に返す', () => {
    const rings = glowRings(glowScene)
    expect(rings).toHaveLength(GLOW_RINGS)
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i].r).toBeLessThan(rings[i - 1].r)
      expect(rings[i].opacity).toBeGreaterThan(rings[i - 1].opacity)
    }
  })

  it('中心と色は scene.glow をそのまま使う', () => {
    for (const ring of glowRings(glowScene)) {
      expect(ring.cx).toBe(glowScene.glow?.cx)
      expect(ring.cy).toBe(glowScene.glow?.cy)
      expect(ring.color).toBe('#ffddaa')
    }
  })

  it('最外周の不透明度は下限に張り付き、内側ほど濃くなる', () => {
    const rings = glowRings(glowScene)
    expect(rings[0].opacity).toBeCloseTo(GLOW_MIN_OPACITY, 6)
    expect(rings[rings.length - 1].opacity).toBeGreaterThan(GLOW_MIN_OPACITY)
    expect(rings[rings.length - 1].opacity).toBeLessThan(1)
  })

  it('半径は整数へ丸められている（ドットの境界がぼけないように）', () => {
    for (const ring of glowRings(glowScene)) expect(Number.isInteger(ring.r)).toBe(true)
  })
})

describe('mixHex', () => {
  it('t=0 は左、t=1 は右の色をそのまま返す', () => {
    expect(mixHex('#123456', '#abcdef', 0)).toBe('#123456')
    expect(mixHex('#123456', '#abcdef', 1)).toBe('#abcdef')
  })

  it('中間は各チャンネルを線形補間して四捨五入する', () => {
    // 127.5 は Math.round で 128（0x80）へ上がる
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080')
  })

  it('上位チャンネルが 0 でも6桁に0埋めされる（padStart）', () => {
    expect(mixHex('#000000', '#000000', 0.5)).toBe('#000000')
    expect(mixHex('#000000', '#000010', 1)).toBe('#000010')
    expect(mixHex('#000000', '#0000ff', 0.5)).toBe('#000080')
  })

  it('範囲外の t は 0〜255 にクランプされる', () => {
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', -1)).toBe('#000000')
  })

  it('大文字の16進も解釈し、出力は常に小文字', () => {
    expect(mixHex('#FF00AA', '#FF00AA', 0.5)).toBe('#ff00aa')
  })
})
