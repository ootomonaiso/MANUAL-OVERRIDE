/**
 * src/game/render/PixelText.ts
 *
 * 文字列を縮小オフスクリーンへ描き、ニアレストネイバーで拡大転送することで
 * ドット絵風の文字を作る（docs/pixelart-rebuild/00-rendering-system.md §6）。
 * ドット絵フォントはバンドルせず、既存の font 指定をそのまま利用する。
 */

import { PIXELART } from '../../data/tunables'

export interface PixelTextOptions {
  /** 既存の ctx.font 文字列をそのまま渡す */
  font: string
  fill: string
  /** 縁取り。指定時は stroke → fill の順に描く（既存の strokeText/fillText と同じ順序） */
  stroke?: { color: string; width: number }
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /** 量子化して適用するアルファ */
  alpha?: number
}

interface CachedText {
  canvas: HTMLCanvasElement
  width: number
  height: number
  ascent: number
}

const _cache = new Map<string, CachedText>()
let _probeCtx: CanvasRenderingContext2D | null = null

function _probe(): CanvasRenderingContext2D {
  if (!_probeCtx) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('[PixelText] 2D context を取得できません')
    _probeCtx = ctx
  }
  return _probeCtx
}

function _cacheKey(str: string, opts: PixelTextOptions): string {
  const strokeKey = opts.stroke ? `${opts.stroke.color}:${opts.stroke.width}` : ''
  return `${str}|${opts.font}|${opts.fill}|${strokeKey}`
}

function _scaleFontSize(font: string, factor: number): string {
  return font.replace(/(\d+(?:\.\d+)?)px/, (_m, n: string) => {
    const scaled = Math.max(1, Math.round(parseFloat(n) * factor))
    return `${scaled}px`
  })
}

function _bake(str: string, opts: PixelTextOptions): CachedText {
  const scale = Math.max(1, PIXELART.textScale)

  const measureCtx = _probe()
  measureCtx.font = opts.font
  const metrics = measureCtx.measureText(str)
  const width = Math.max(1, Math.ceil(metrics.width) + (opts.stroke?.width ?? 0) * 2)
  const ascent = Math.max(1, Math.ceil(metrics.actualBoundingBoxAscent || width * 0.8))
  const descent = Math.max(0, Math.ceil(metrics.actualBoundingBoxDescent || width * 0.2))
  const height = Math.max(1, ascent + descent)

  const smallW = Math.max(1, Math.ceil(width / scale))
  const smallH = Math.max(1, Math.ceil(height / scale))
  const off = document.createElement('canvas')
  off.width = smallW
  off.height = smallH
  const octx = off.getContext('2d')
  if (!octx) throw new Error('[PixelText] オフスクリーン context を取得できません')

  octx.font = _scaleFontSize(opts.font, 1 / scale)
  octx.textAlign = 'left'
  octx.textBaseline = 'alphabetic'
  const smallAscent = ascent / scale

  if (opts.stroke) {
    octx.strokeStyle = opts.stroke.color
    octx.lineWidth = Math.max(1, opts.stroke.width / scale)
    octx.strokeText(str, 0, smallAscent)
  }
  octx.fillStyle = opts.fill
  octx.fillText(str, 0, smallAscent)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const cctx = canvas.getContext('2d')
  if (!cctx) throw new Error('[PixelText] 出力 context を取得できません')
  cctx.imageSmoothingEnabled = false
  cctx.drawImage(off, 0, 0, smallW, smallH, 0, 0, width, height)

  return { canvas, width, height, ascent }
}

export class PixelText {
  draw(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, opts: PixelTextOptions): void {
    if (!str) return

    const key = _cacheKey(str, opts)
    let entry = _cache.get(key)
    if (!entry) {
      entry = _bake(str, opts)
      if (_cache.size >= Math.max(1, PIXELART.textCacheMax)) {
        const oldest = _cache.keys().next().value
        if (oldest !== undefined) _cache.delete(oldest)
      }
      _cache.set(key, entry)
    }

    const align = opts.align ?? 'left'
    const baseline = opts.baseline ?? 'alphabetic'

    let dx = x
    if (align === 'center') dx = x - entry.width / 2
    else if (align === 'right') dx = x - entry.width

    let dy = y - entry.ascent
    if (baseline === 'middle') dy = y - entry.height / 2
    else if (baseline === 'top') dy = y

    const prevAlpha = ctx.globalAlpha
    const prevSmoothing = ctx.imageSmoothingEnabled
    if (opts.alpha !== undefined) {
      const steps = Math.max(2, PIXELART.alphaSteps)
      ctx.globalAlpha = Math.round(Math.max(0, Math.min(1, opts.alpha)) * steps) / steps
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(entry.canvas, dx, dy)
    ctx.globalAlpha = prevAlpha
    ctx.imageSmoothingEnabled = prevSmoothing
  }
}
