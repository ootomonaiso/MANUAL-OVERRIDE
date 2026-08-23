/**
 * src/game/render/SpriteRenderer.ts
 *
 * src/data/sprites/*.json のピクセル配列をオフスクリーンcanvasへ焼き込み、
 * drawImage で転送する。PixelCanvas.sprite() から利用される
 * （docs/pixelart-rebuild/00-rendering-system.md §5 の確定仕様）。
 *
 * 異常系（未定義ID・未定義フレーム・未解決の動的色スロット）は例外を投げず、
 * 「描かずに false を返す（開発時のみ console.warn を1回）」で統一する。
 * ゲームループを止めないことを最優先する。
 */

import { SPRITES, type SpriteDef } from '../../data/sprites'
import { PIXELART } from '../../data/tunables'

/** 動的色スロットの解決値。パレットの "@main" 等のキー → 実際の色。 */
export type SpriteSlots = Readonly<Record<string, string>>

export interface SpriteDrawOptions {
  /** frames のキー。省略時は 'idle' */
  frame?: string
  /** 動的色スロットの解決値。パレットに @ キーがある場合に使う */
  slots?: SpriteSlots
  /** 左右反転 */
  flipX?: boolean
}

interface BakedSprite {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

const _cache = new Map<string, BakedSprite>()
const _warnedMissingId = new Set<string>()

function _slotsHash(slots?: SpriteSlots): string {
  if (!slots) return ''
  return Object.keys(slots).sort().map(k => `${k}=${slots[k]}`).join(',')
}

function _resolveColor(raw: string, slots: SpriteSlots | undefined): string | null {
  if (!raw.startsWith('@')) return raw
  const v = slots?.[raw.slice(1)]
  return v ?? null
}

function _pickFrame(def: SpriteDef, frame: string): readonly string[] | null {
  if (def.frames[frame]) return def.frames[frame]
  if (def.frames.idle) return def.frames.idle
  const first = Object.keys(def.frames)[0]
  return first ? def.frames[first] : null
}

function _bake(def: SpriteDef, frame: string, slots: SpriteSlots | undefined, flipX: boolean): BakedSprite | null {
  const rows = _pickFrame(def, frame)
  if (!rows) return null

  const canvas = document.createElement('canvas')
  canvas.width = def.w
  canvas.height = def.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  for (let ry = 0; ry < rows.length && ry < def.h; ry++) {
    const row = rows[ry]
    for (let rx = 0; rx < row.length && rx < def.w; rx++) {
      const ch = row[rx]
      if (ch === '.') continue
      const raw = def.palette[ch]
      if (raw === undefined) continue
      const color = _resolveColor(raw, slots)
      if (color === null) continue // 未解決の動的色スロット → 透明として扱う
      ctx.fillStyle = color
      const cx = flipX ? def.w - 1 - rx : rx
      ctx.fillRect(cx, ry, 1, 1)
    }
  }
  return { canvas, w: def.w, h: def.h }
}

export class SpriteRenderer {
  /**
   * 焼き込み済みスプライトを ctx へ転送する。
   * dw / dh には呼び出し側の既存の w / h をそのまま渡すこと
   * （当たり判定と見た目のサイズを一致させるため）。
   * 戻り値は描画できたか。false の場合は何も描かれていない。
   */
  draw(
    ctx: CanvasRenderingContext2D,
    id: string,
    dx: number, dy: number, dw: number, dh: number,
    opts?: SpriteDrawOptions,
  ): boolean {
    const def = SPRITES[id]
    if (!def) {
      if (import.meta.env.DEV && !_warnedMissingId.has(id)) {
        _warnedMissingId.add(id)
        console.warn(`[SpriteRenderer] 未定義のスプライト id: "${id}"`)
      }
      return false
    }

    const frame = opts?.frame ?? 'idle'
    const flipX = opts?.flipX ?? false
    const key = `${id}|${frame}|${flipX ? 'f' : ''}|${_slotsHash(opts?.slots)}`

    let baked = _cache.get(key)
    if (!baked) {
      const built = _bake(def, frame, opts?.slots, flipX)
      if (!built) return false
      if (_cache.size >= Math.max(1, PIXELART.spriteCacheMax)) {
        const oldest = _cache.keys().next().value
        if (oldest !== undefined) _cache.delete(oldest)
      }
      _cache.set(key, built)
      baked = built
    }

    const prevSmoothing = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(baked.canvas, dx, dy, dw, dh)
    ctx.imageSmoothingEnabled = prevSmoothing
    return true
  }
}
