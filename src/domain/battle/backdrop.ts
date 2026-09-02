/**
 * domain/battle/backdrop.ts
 * 戦闘背景（src/data/battle-backgrounds/*.json）を SVG 描画用のプリミティブへ変換する純粋関数。
 *
 * 稜線・小物の配置は id から導いた擬似乱数で決めるため、同じ背景は毎回同じ形になる
 * （戦闘のたびに地形が揺れると「同じ場所で戦っている」感覚が壊れるため）。
 */

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
  ground: { top: string; bottom: string; baseline: number }
  layers: BackdropLayerDef[]
  props?: BackdropPropDef[]
  fog?: { color: string; opacity: number }
  accent: string
  panel?: string
  bossOnly?: boolean
}

export interface BackdropPolygon {
  points: string
  color: string
  opacity: number
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
  layers: BackdropPolygon[]
  ground: { y: number; top: string; bottom: string }
  props: BackdropProp[]
  fog: { color: string; opacity: number } | null
}

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

function toPoints(xs: readonly number[], ys: readonly number[]): string {
  const parts: string[] = []
  for (let i = 0; i < xs.length; i++) parts.push(`${xs[i].toFixed(1)},${ys[i].toFixed(1)}`)
  // 稜線の左右端を画面下まで落として閉じる
  parts.push(`${SCENE_W},${SCENE_H}`, `0,${SCENE_H}`)
  return parts.join(' ')
}

function buildLayer(def: BackdropLayerDef, rng: () => number): BackdropPolygon {
  const segments = Math.max(2, def.segments ?? 8)
  const base = def.baseline * SCENE_H
  const amp = def.height * SCENE_H
  const xs: number[] = []
  const ys: number[] = []

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
    xs.push(x)
    ys.push(y)
  }

  if (def.shape === 'ruins') {
    // 段差を垂直に見せるため、各点の直前に「1つ前の高さのまま横に移動した点」を挟む
    const stepXs: number[] = []
    const stepYs: number[] = []
    for (let i = 0; i < xs.length; i++) {
      if (i > 0) { stepXs.push(xs[i]); stepYs.push(ys[i - 1]) }
      stepXs.push(xs[i]); stepYs.push(ys[i])
    }
    return { points: toPoints(stepXs, stepYs), color: def.color, opacity: def.opacity ?? 1 }
  }

  return { points: toPoints(xs, ys), color: def.color, opacity: def.opacity ?? 1 }
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
      x: margin + slot * span + jitter,
      y: baseY + (rng() - 0.5) * 4,
      size: def.size * SCENE_H * (0.8 + rng() * 0.4),
      color: def.color,
      opacity: def.opacity ?? 1,
    })
  }
  return out
}

export function buildBackdropScene(def: BattleBackgroundDef): BackdropScene {
  const rng = mulberry32(hashSeed(def.id))
  return {
    sky: def.sky,
    glow: def.glow
      ? { color: def.glow.color, cx: def.glow.x * SCENE_W, cy: def.glow.y * SCENE_H, r: def.glow.r * SCENE_H }
      : null,
    layers: def.layers.map(l => buildLayer(l, rng)),
    ground: { y: def.ground.baseline * SCENE_H, top: def.ground.top, bottom: def.ground.bottom },
    props: (def.props ?? []).flatMap(p => buildProps(p, rng)),
    fog: def.fog ?? null,
  }
}

/**
 * 何戦目の背景かを決める。ボス戦は bossOnly の背景から、それ以外は bossOnly でない背景から選ぶ。
 * 直前の戦闘と同じ背景は避ける（連戦で場所が変わらないと進んでいる感じが出ないため）。
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
