/**
 * domain/battle/backdrop.ts
 * 戦闘背景（src/data/rpg/battle-backgrounds/*.json）を描画用のプリミティブへ変換する純粋関数。
 *
 * 出力は「低解像度キャンバスに置く矩形・多角形の座標」であり、実際の描画は
 * BattleBackdrop.vue が 320×180 のキャンバスへ行い、CSS で拡大する
 * （docs/pixelart-rebuild/00-rendering-system.md の PixelArt 方針に合わせ、
 *  滑らかな補間を挟まずドットのまま引き伸ばす）。
 *
 * 稜線・雲・小物の配置は id から導いた擬似乱数で決めるため、同じ背景は毎回同じ形になる
 * （戦闘のたびに地形が揺れると「同じ場所で戦っている」感覚が壊れるため）。
 */

/** 背景キャンバスの解像度。1ドットが画面上で数px角のブロックになる */
export const SCENE_W = 320
export const SCENE_H = 180

export type BackdropLayerShape = 'hills' | 'dunes' | 'spikes' | 'ruins'
export type BackdropPropKind = 'tree' | 'cactus' | 'pillar' | 'bone' | 'crystal' | 'tuft'

export interface BackdropLayerDef {
  shape: BackdropLayerShape
  color: string
  baseline: number
  height: number
  segments?: number
  opacity?: number
}

export interface BackdropPropDef {
  kind: BackdropPropKind
  color: string
  count: number
  size: number
  baseline?: number
  opacity?: number
}

export interface BattleBackgroundDef {
  id: string
  label: string
  sky: { top: string; bottom: string }
  glow?: { color: string; x: number; y: number; r: number }
  clouds?: { color: string; count: number; size?: number }
  ground: { top: string; bottom: string; baseline: number }
  layers: BackdropLayerDef[]
  props?: BackdropPropDef[]
  fog?: { color: string; opacity: number }
  /** キャラクターが立つ手前の床。背景写真とは別の平面として描く */
  floor: { top: string; bottom: string; line: string }
  accent: string
  panel?: string
  bossOnly?: boolean
}

export interface Point {
  x: number
  y: number
}

export interface BackdropPolygon {
  points: Point[]
  color: string
  opacity: number
}

export interface BackdropRect {
  x: number
  y: number
  w: number
  h: number
  color: string
  opacity?: number
}

export interface BackdropProp {
  kind: BackdropPropKind
  x: number
  y: number
  size: number
  color: string
  opacity: number
}

export interface BackdropScene {
  sky: { top: string; bottom: string }
  glow: { color: string; cx: number; cy: number; r: number } | null
  clouds: BackdropRect[]
  layers: BackdropPolygon[]
  ground: { y: number; top: string; bottom: string }
  /** 地面に散らす明暗のドット。単色べた塗りに見えないようにする */
  speckles: BackdropRect[]
  props: BackdropProp[]
  fog: { color: string; opacity: number } | null
}

/** 空のグラデーションを塗り分ける段数。多すぎると帯に見えず、少なすぎると縞になる */
const SKY_BANDS = 12
/** 光源のにじみを表す同心円の枚数 */
const GLOW_RINGS = 5
const SPECKLE_COUNT = 90

/** 文字列 → 32bit シード（背景ごとに固定の地形を得るため） */
function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** ドットの境界をぼかさないため、座標は必ず整数へ落とす */
function snap(v: number): number {
  return Math.round(v)
}

function closedPolygon(points: Point[]): Point[] {
  // 稜線の左右端を画面下まで落として閉じる（塗り潰しに穴が開かないようにする）
  return [...points, { x: SCENE_W, y: SCENE_H }, { x: 0, y: SCENE_H }]
}

function buildLayer(def: BackdropLayerDef, rng: () => number): BackdropPolygon {
  const segments = Math.max(2, def.segments ?? 8)
  const base = def.baseline * SCENE_H
  const amp = def.height * SCENE_H
  const ridge: Point[] = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = t * SCENE_W
    let y: number
    switch (def.shape) {
      case 'dunes':
        // なだらかな砂丘。1周期の正弦に緩い揺らぎを足す
        y = base - amp * (0.35 + 0.45 * Math.sin(t * Math.PI * 1.5 + rng() * 0.3))
        break
      case 'spikes':
        // 尖った岩。偶数点を谷、奇数点を峰にして鋸状にする
        y = base - amp * (i % 2 === 0 ? 0.05 + rng() * 0.2 : 0.7 + rng() * 0.3)
        break
      case 'ruins':
        // 崩れた建造物。段状に高さが変わるので同じ高さを2点続ける
        y = base - amp * (i % 2 === 0 ? rng() : 0)
        break
      case 'hills':
      default:
        y = base - amp * (0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI * 2 + rng())))
        break
    }
    ridge.push({ x: snap(x), y: snap(y) })
  }

  if (def.shape === 'ruins') {
    // 段差を垂直に見せるため、各点の直前に「1つ前の高さのまま横に移動した点」を挟む
    const stepped: Point[] = []
    for (let i = 0; i < ridge.length; i++) {
      if (i > 0) stepped.push({ x: ridge[i].x, y: ridge[i - 1].y })
      stepped.push(ridge[i])
    }
    return { points: closedPolygon(stepped), color: def.color, opacity: def.opacity ?? 1 }
  }

  return { points: closedPolygon(ridge), color: def.color, opacity: def.opacity ?? 1 }
}

/** 雲1つを数個の矩形の塊として組む（円を使うと輪郭がぼけるため） */
function buildCloud(cx: number, cy: number, size: number, color: string, rng: () => number): BackdropRect[] {
  const out: BackdropRect[] = []
  const lumps = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < lumps; i++) {
    const w = size * (0.4 + rng() * 0.6)
    const h = Math.max(2, size * (0.18 + rng() * 0.16))
    const x = cx - size * 0.5 + (i / lumps) * size * 0.9 + (rng() - 0.5) * size * 0.2
    const y = cy - h * 0.5 + (rng() - 0.5) * size * 0.22
    out.push({ x: snap(x), y: snap(y), w: snap(w), h: snap(h), color, opacity: 0.75 + rng() * 0.25 })
  }
  return out
}

function buildProps(def: BackdropPropDef, rng: () => number): BackdropProp[] {
  const out: BackdropProp[] = []
  const baseY = (def.baseline ?? 0.66) * SCENE_H
  const margin = SCENE_W * 0.04
  const span = SCENE_W - margin * 2
  for (let i = 0; i < def.count; i++) {
    // 等間隔に置いてから区画内で揺らす（重なりすぎ・偏りすぎを避ける）
    const slot = (i + 0.5) / def.count
    const jitter = (rng() - 0.5) * (span / def.count) * 0.8
    out.push({
      kind: def.kind,
      x: snap(margin + slot * span + jitter),
      y: snap(baseY + (rng() - 0.5) * 4),
      size: Math.max(2, snap(def.size * SCENE_H * (0.8 + rng() * 0.4))),
      color: def.color,
      opacity: def.opacity ?? 1,
    })
  }
  return out
}

function buildSpeckles(groundY: number, rng: () => number): BackdropRect[] {
  const out: BackdropRect[] = []
  for (let i = 0; i < SPECKLE_COUNT; i++) {
    const y = groundY + rng() * (SCENE_H - groundY)
    // 手前ほど大きく粗いドットにして、奥行きを出す
    const depth = (y - groundY) / Math.max(1, SCENE_H - groundY)
    const w = 1 + Math.floor(depth * 3 + rng() * 2)
    out.push({
      x: snap(rng() * SCENE_W),
      y: snap(y),
      w,
      h: 1 + Math.floor(depth * 1.5),
      color: rng() < 0.5 ? '#ffffff' : '#000000',
      opacity: 0.05 + rng() * 0.09,
    })
  }
  return out
}

export function buildBackdropScene(def: BattleBackgroundDef): BackdropScene {
  const rng = mulberry32(hashSeed(def.id))
  const groundY = snap(def.ground.baseline * SCENE_H)

  const clouds: BackdropRect[] = []
  if (def.clouds) {
    const size = (def.clouds.size ?? 0.16) * SCENE_W
    for (let i = 0; i < def.clouds.count; i++) {
      const cx = ((i + 0.5) / def.clouds.count) * SCENE_W + (rng() - 0.5) * 30
      const cy = SCENE_H * (0.08 + rng() * 0.3)
      clouds.push(...buildCloud(cx, cy, size * (0.7 + rng() * 0.6), def.clouds.color, rng))
    }
  }

  return {
    sky: def.sky,
    glow: def.glow
      ? {
        color: def.glow.color,
        cx: snap(def.glow.x * SCENE_W),
        cy: snap(def.glow.y * SCENE_H),
        r: snap(def.glow.r * SCENE_H),
      }
      : null,
    clouds,
    layers: def.layers.map(l => buildLayer(l, rng)),
    ground: { y: groundY, top: def.ground.top, bottom: def.ground.bottom },
    speckles: buildSpeckles(groundY, rng),
    props: (def.props ?? []).flatMap(p => buildProps(p, rng)),
    fog: def.fog ?? null,
  }
}

/** 空のグラデーションを段階的な帯に割る（無段階の補間はドット絵に合わないため） */
export function skyBands(scene: BackdropScene, groundY: number): BackdropRect[] {
  const out: BackdropRect[] = []
  const bandH = Math.max(1, Math.ceil(groundY / SKY_BANDS))
  for (let i = 0; i < SKY_BANDS; i++) {
    const y = i * bandH
    if (y >= groundY) break
    out.push({
      x: 0, y, w: SCENE_W, h: Math.min(bandH, groundY - y),
      color: mixHex(scene.sky.top, scene.sky.bottom, i / (SKY_BANDS - 1)),
    })
  }
  return out
}

/** 光源のにじみを同心円ではなく同心の「四角い輪」で表す */
export function glowRings(scene: BackdropScene): { cx: number; cy: number; r: number; color: string; opacity: number }[] {
  if (!scene.glow) return []
  const out: { cx: number; cy: number; r: number; color: string; opacity: number }[] = []
  for (let i = GLOW_RINGS; i >= 1; i--) {
    const t = i / GLOW_RINGS
    out.push({
      cx: scene.glow.cx,
      cy: scene.glow.cy,
      r: snap(scene.glow.r * (0.6 + t * 2.2)),
      color: scene.glow.color,
      opacity: 0.5 * (1 - t) ** 1.6 + 0.06,
    })
  }
  return out
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

/** #rrggbb 同士を線形補間する。段数を粗く刻んで使う前提 */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = clamp255(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = clamp255(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = clamp255((pa & 255) * (1 - t) + (pb & 255) * t)
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`
}

/**
 * 何戦目の背景かを決める。ボス戦は bossOnly の背景から、それ以外は bossOnly でない背景から選ぶ。
 * 直前と同じ背景は避ける（連戦で場所が変わらないと進んでいる感じが出ないため）。
 */
export function pickBackgroundId(
  defs: readonly BattleBackgroundDef[],
  isBossBattle: boolean,
  previousId: string | null,
  rng: () => number,
): string | null {
  const pool = defs.filter(d => (d.bossOnly ?? false) === isBossBattle)
  const usable = pool.length > 0 ? pool : defs
  if (usable.length === 0) return null
  const fresh = usable.filter(d => d.id !== previousId)
  const candidates = fresh.length > 0 ? fresh : usable
  return candidates[Math.floor(rng() * candidates.length) % candidates.length].id
}
