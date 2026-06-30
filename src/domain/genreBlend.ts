/**
 * genreBlend.ts
 *
 * 説明書パネルの段階的テーマ遷移用色補間ユーティリティ。
 * plain (緑ターミナル) から目標ジャンルテーマへ progress (0〜1) で線形補間し、
 * CSS custom properties として適用できるオブジェクトを返す。
 *
 * App.vue の _computeGenreBlendStyle を独立させたもの。
 * 単体テスト可能であり、将来他のコンポーネントでも再利用可能。
 */

import type { ManualTheme } from '../domain/types'

/** 補間先ジャンルテーマごとの代表色（キーは ManualTheme 限らない） */
export const GENRE_THEME_COLORS_BLEND: Record<
  string,
  { bg: string; color: string; border: string; shadow: string }
> = {
  plain:        { bg: '#0d120d', color: '#b8ffb8', border: '#33aa55', shadow: 'rgba(0,255,65,0.15)' },
  stg:          { bg: '#080818', color: '#a8d8ff', border: '#1a66ff', shadow: 'rgba(26,102,255,0.3)' },
  rpg:          { bg: '#120e00', color: '#d4b870', border: '#8b6100', shadow: 'rgba(196,150,10,0.15)' },
  puzzle:       { bg: '#f8f8fa', color: '#222', border: '#444', shadow: 'rgba(68,68,68,0.15)' },
  rhythm:       { bg: '#0f0020', color: '#ee88ff', border: '#9900ff', shadow: 'rgba(153,0,255,0.5)' },
  horror:       { bg: '#0a0000', color: '#cc8888', border: '#880000', shadow: 'rgba(136,0,0,0.4)' },
  aquatic:      { bg: '#001a2a', color: '#88ccff', border: '#0088bb', shadow: 'rgba(0,136,187,0.2)' },
  runner:       { bg: '#ffffff', color: '#111111', border: '#ff3333', shadow: 'rgba(255,51,51,0.2)' },
  stealth:      { bg: '#050505', color: 'rgba(160,160,160,0.52)', border: 'rgba(60,60,60,0.38)', shadow: 'transparent' },
  racing:       { bg: '#0f0a00', color: '#ffaa44', border: '#ff6600', shadow: 'rgba(255,100,0,0.18)' },
  platformer:   { bg: '#001a4a', color: '#88ddff', border: '#ffcc00', shadow: 'rgba(0,100,200,0.2)' },
  dungeon:      { bg: '#0c0800', color: '#c8a060', border: '#6a3800', shadow: 'rgba(180,80,0,0.18)' },
  hack_slash:   { bg: '#0a0000', color: '#ff9999', border: '#880000', shadow: 'rgba(200,0,0,0.28)' },
  survival:     { bg: '#050a05', color: '#88cc88', border: '#2a4a2a', shadow: 'rgba(60,100,40,0.12)' },
  aerial_stg:   { bg: '#000820', color: '#aaccff', border: '#1a66ff', shadow: 'rgba(26,102,255,0.25)' },
  bullet_hell:  { bg: '#000010', color: '#99aaff', border: '#2244cc', shadow: 'rgba(34,68,204,0.25)' },
  bullet_runner:{ bg: '#0a0018', color: '#bbaaff', border: '#5533ff', shadow: 'rgba(85,51,255,0.2)' },
  arena:        { bg: '#0f0000', color: '#ffaaaa', border: '#880000', shadow: 'rgba(200,0,0,0.35)' },
  tower_def:    { bg: '#0a0f0a', color: '#88aa88', border: '#558855', shadow: 'rgba(85,136,85,0.15)' },
  idle:         { bg: '#f5f5f0', color: '#555', border: '#888', shadow: 'rgba(136,136,136,0.15)' },
  sports:       { bg: '#0a001a', color: '#ddaaff', border: '#cc44ff', shadow: 'rgba(200,68,255,0.2)' },
  base:         { bg: '#0d120d', color: '#b8ffb8', border: '#33aa55', shadow: 'rgba(0,255,65,0.15)' },
  tetris:       { bg: '#0a0a1a', color: '#ff88ff', border: '#8844ff', shadow: 'rgba(136,68,255,0.3)' },
}

/** CSS custom property 名 */
export type BlendProperty = '--blend-bg' | '--blend-color' | '--blend-border' | '--blend-shadow'

/** 補間結果 */
export type BlendStyle = Record<BlendProperty, string>

/** 色文字列を {r,g,b,a} に分解。alpha は 0〜1 */
interface ParsedColor {
  r: number
  g: number
  b: number
  a: number
}

/** hex / rgba() を ParsedColor に分解。失敗時は null */
function _parseColor(hex: string): ParsedColor | null {
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1), 16)
    if (isNaN(n)) return null
    return {
      r: (n >> 16) & 0xff,
      g: (n >> 8) & 0xff,
      b: n & 0xff,
      a: 1,
    }
  }
  const m = hex.match(/rgba?\((\d+\.?\d*)%?,\s*(\d+\.?\d*)%?,\s*(\d+\.?\d*)%?(?:,\s*([\d.]+))?\)/)
  if (!m) return null
  const toNum = (v: string) => (v.endsWith('%') ? parseFloat(v) / 100 * 255 : parseFloat(v))
  return {
    r: toNum(m[1]),
    g: toNum(m[2]),
    b: toNum(m[3]),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  }
}

/** 2 色の hex/rgba を lineargRGB 補間。t=0 で a、t=1 で b をそのまま返す */
function _lerpColor(from: string, to: string, t: number): string {
  if (t <= 0) return from
  if (t >= 1) return to
  const cf = _parseColor(from)
  const ct = _parseColor(to)
  if (!cf || !ct) return to
  const r = Math.round(cf.r + (ct.r - cf.r) * t)
  const g = Math.round(cf.g + (ct.g - cf.g) * t)
  const bl = Math.round(cf.b + (ct.b - cf.b) * t)
  const alpha = cf.a + (ct.a - cf.a) * t
  // alpha が実質的に不透明なら rgb()、それ以外なら rgba()
  return alpha >= ALPHA_OPAQUE_THRESHOLD
    ? `rgb(${r},${g},${bl})`
    : `rgba(${r},${g},${bl},${Number(alpha.toFixed(2))})`
}

/**
 * plain から目標ジャンルテーマへ progress で補間した style を計算。
 *
 * @param targetTheme - 目標ジャンルの theme ID
 * @param progress    - 0〜1 の補間率。0 で plain 完全、1 で target 完全
 * @returns CSS custom properties のオブジェクト。targetTheme が不明な場合は空オブジェクト
 */
export function computeGenreBlendStyle(
  targetTheme: ManualTheme,
  progress: number,
): BlendStyle {
  const target = GENRE_THEME_COLORS_BLEND[targetTheme]
  if (!target) {
    return {
      '--blend-bg': '',
      '--blend-color': '',
      '--blend-border': '',
      '--blend-shadow': '',
    }
  }

  const plain = GENRE_THEME_COLORS_BLEND.plain
  const t = Math.max(0, Math.min(1, progress))

  return {
    '--blend-bg':      _lerpColor(plain.bg, target.bg, t),
    '--blend-color':   _lerpColor(plain.color, target.color, t),
    '--blend-border':  _lerpColor(plain.border, target.border, t),
    '--blend-shadow':  _lerpColor(plain.shadow, target.shadow, t),
  }
}

/** 補間開始 threshold */
export const BLEND_START = 0.05

/** 補間終了 threshold（これ以上は locked genre theme 完全適用） */
export const BLEND_END = 0.99

/** alpha が実質的に不透明とみなされる閾値 */
const ALPHA_OPAQUE_THRESHOLD = 0.999

/**
 * 補間が有効な progress 範囲を判定。
 * BLEND_START 未満では補間不要、BLEND_END 以上では locked genre theme が完全適用される。
 */
export function isBlendActive(progress: number): boolean {
  return progress >= BLEND_START && progress < BLEND_END
}
