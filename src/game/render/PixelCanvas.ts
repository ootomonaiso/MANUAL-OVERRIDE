/**
 * src/game/render/PixelCanvas.ts
 *
 * CanvasRenderingContext2D をラップし、全出力をグリッドスナップした fillRect /
 * drawImage へ正規化する（docs/pixelart-rebuild/00-rendering-system.md 参照）。
 *
 * 座標・寸法はすべて呼び出し側のローカル座標（＝呼び出し時点の ctx 変換行列の
 * 内側）で受け取り、rect() 系プリミティブは内部でデバイス空間へ写してから
 * スナップする（§3）。translate/scale/rotate されたコンテキスト内で呼んでも、
 * 最終的な画面出力は必ずグリッドに整列する。
 */

import { PIXELART } from '../../data/tunables'
import { SpriteRenderer, type SpriteDrawOptions } from './SpriteRenderer'
import { PixelText, type PixelTextOptions } from './PixelText'

export type GradientStop = readonly [number, string]

interface DeviceRect {
  dx: number
  dy: number
  dw: number
  dh: number
}

// ── 位置・寸法のスナップ規則（§3）─────────────────────────────────
// 位置: 最寄りのグリッドへ丸める。寸法: 切り上げ、かつ最低 1 セル。
function _snapPos(v: number, size: number): number {
  return Math.round(v / size) * size
}
function _snapSize(v: number, size: number): number {
  return Math.max(size, Math.ceil(v / size) * size)
}

// ── 色パース（任意の CSS 色文字列 → rgba）とキャッシュ ────────────
// 1x1 canvas に fillStyle を適用し getImageData で読み戻す汎用手法。
// hex / rgb() / rgba() / named color すべてに対応できる。
type Rgba = readonly [number, number, number, number]
const _colorCache = new Map<string, Rgba>()
let _colorProbeCtx: CanvasRenderingContext2D | null = null

function _parseColor(color: string): Rgba {
  const cached = _colorCache.get(color)
  if (cached) return cached
  if (!_colorProbeCtx) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('[PixelCanvas] 色パース用 context を取得できません')
    _colorProbeCtx = ctx
  }
  _colorProbeCtx.clearRect(0, 0, 1, 1)
  _colorProbeCtx.fillStyle = color
  _colorProbeCtx.fillRect(0, 0, 1, 1)
  const d = _colorProbeCtx.getImageData(0, 0, 1, 1).data
  const rgba: Rgba = [d[0], d[1], d[2], d[3] / 255]
  _colorCache.set(color, rgba)
  return rgba
}

function _lighten(color: string, amount: number): string {
  const [r, g, b, a] = _parseColor(color)
  const clamp = (v: number): number => Math.max(0, Math.min(255, v))
  return `rgba(${clamp(r + amount)},${clamp(g + amount)},${clamp(b + amount)},${a})`
}

function _lerpColor(stops: readonly GradientStop[], t: number): string {
  if (stops.length === 0) return 'rgba(0,0,0,0)'
  const sorted = [...stops].sort((a, b) => a[0] - b[0])
  if (t <= sorted[0][0]) return sorted[0][1]
  const last = sorted[sorted.length - 1]
  if (t >= last[0]) return last[1]
  for (let i = 0; i < sorted.length - 1; i++) {
    const [p0, c0] = sorted[i]
    const [p1, c1] = sorted[i + 1]
    if (t >= p0 && t <= p1) {
      const localT = p1 === p0 ? 0 : (t - p0) / (p1 - p0)
      const [r0, g0, b0, a0] = _parseColor(c0)
      const [r1, g1, b1, a1] = _parseColor(c1)
      const r = Math.round(r0 + (r1 - r0) * localT)
      const g = Math.round(g0 + (g1 - g0) * localT)
      const b = Math.round(b0 + (b1 - b0) * localT)
      const a = a0 + (a1 - a0) * localT
      return `rgba(${r},${g},${b},${a})`
    }
  }
  return last[1]
}

// ── 2x2 Bayer 行列によるオーダードディザ ───────────────────────────
// 閾値は 4 段階。PIXELART.ditherRatioSteps（既定 4）と段数が一致する。
const _BAYER_2X2 = [
  [0, 2],
  [3, 1],
]
const _BAYER_LEVELS = 4
function _ditherThreshold(cx: number, cy: number): number {
  const v = _BAYER_2X2[cy % 2][cx % 2]
  return (v + 0.5) / _BAYER_LEVELS
}

// 変換行列が軸平行か・純粋な平行移動かを判定する際の許容誤差
const _EPSILON = 1e-6

export class PixelCanvas {
  private readonly ctx: CanvasRenderingContext2D
  private readonly _sprites = new SpriteRenderer()
  private readonly _text = new PixelText()

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  private get _size(): number {
    return Math.max(1, PIXELART.size)
  }

  /** ローカル座標の矩形を、現在の変換行列でデバイス空間へ写してからスナップする */
  private _toDevice(x: number, y: number, w: number, h: number): DeviceRect {
    const s = this._size
    const m = this.ctx.getTransform()
    const x0 = x, y0 = y, x1 = x + w, y1 = y + h
    const p0x = m.a * x0 + m.c * y0 + m.e
    const p0y = m.b * x0 + m.d * y0 + m.f
    const p1x = m.a * x1 + m.c * y1 + m.e
    const p1y = m.b * x1 + m.d * y1 + m.f
    return {
      dx: _snapPos(Math.min(p0x, p1x), s),
      dy: _snapPos(Math.min(p0y, p1y), s),
      dw: _snapSize(Math.abs(p1x - p0x), s),
      dh: _snapSize(Math.abs(p1y - p0y), s),
    }
  }

  /** デバイス空間の矩形を発行する。全プリミティブの最終出力先 */
  private _deviceRect(dx: number, dy: number, dw: number, dh: number, color: string): void {
    const ctx = this.ctx
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = color
    ctx.fillRect(dx, dy, dw, dh)
    ctx.restore()
  }

  /** グリッドスナップ矩形 */
  rect(x: number, y: number, w: number, h: number, color: string): void {
    if (w <= 0 || h <= 0) return
    const { dx, dy, dw, dh } = this._toDevice(x, y, w, h)
    this._deviceRect(dx, dy, dw, dh, color)
  }

  /**
   * 同一セルへの二重描画を避ける矩形（§11.3）。
   * 経路上にブロックを並べる line / arcBlocks 用。半透明で描いたとき、
   * 重なったセルだけ二重合成されて明点になるのを防ぐ。
   * 判定はデバイス空間のスナップ後の座標で行う（ローカル座標だと拡大縮小時に取りこぼす）。
   */
  private _rectOnce(x: number, y: number, w: number, h: number, color: string, seen: Set<string>): void {
    if (w <= 0 || h <= 0) return
    const { dx, dy, dw, dh } = this._toDevice(x, y, w, h)
    const key = `${dx},${dy}`
    if (seen.has(key)) return
    seen.add(key)
    this._deviceRect(dx, dy, dw, dh, color)
  }

  /** 直径（実px）をセル数へ量子化する。最低 1 セル */
  private _diaCells(diameter: number): number {
    return Math.max(1, Math.round(diameter / this._size))
  }

  /**
   * 半幅（セル単位の実数）を、全体の直径と偶奇を揃えたセル数の幅へ丸める（§11.2）。
   *
   * 偶奇を揃えないと行が半セルずれた位置に中央寄せされ、_snapPos の四捨五入で
   * 左右非対称になる。揃えておけば (直径 - 幅) が必ず偶数になり、
   * 行の左端がセル境界に乗る。
   */
  private static _widthCells(halfWidthCells: number, oddDiameter: boolean): number {
    return oddDiameter
      ? 2 * Math.round(halfWidthCells - 0.5) + 1
      : 2 * Math.round(halfWidthCells)
  }

  /**
   * 円系プリミティブ共通の行生成（§11.2）。
   *
   * 行は必ず「ちょうど 1 セル高」、幅は「セルの整数倍」で発行する。
   * 端数を持たせると _snapPos（四捨五入）と _snapSize（切り上げ・最低1セル）が
   * 行ごとに別々に効き、左右非対称・図形の膨張・半径変化時の組み替えが起きる。
   *
   * 半径ではなく**直径**を量子化する。半径を量子化すると直径が必ず偶数セルになり、
   * 1 セル径の小さな円（泡・灯りなど）が 2 セルに膨らむため。
   */
  private _cellRows(
    cx: number, cy: number,
    diaXCells: number, diaYCells: number,
    rowFrom: number, rowTo: number,
    color: string,
  ): void {
    const s = this._size
    const rx = diaXCells / 2
    const ry = diaYCells / 2
    const x0 = cx - rx * s
    const y0 = cy - ry * s
    const oddX = diaXCells % 2 === 1
    for (let i = rowFrom; i <= rowTo; i++) {
      const norm = (i + 0.5 - ry) / ry
      const halfW = rx * Math.sqrt(Math.max(0, 1 - norm * norm))
      const wCells = PixelCanvas._widthCells(halfW, oddX)
      if (wCells <= 0) continue
      this.rect(x0 + ((diaXCells - wCells) / 2) * s, y0 + i * s, wCells * s, s, color)
    }
  }

  /** セル整数演算によるブロック円（arc の代替）。仕様は §11.2 */
  circle(cx: number, cy: number, r: number, color: string): void {
    if (r <= 0) return
    const dia = this._diaCells(r * 2)
    this._cellRows(cx, cy, dia, dia, 0, dia - 1, color)
  }

  /** ブロック半円（アーチの頂部や丘の稜線に使う）。dir は膨らむ向き */
  halfCircle(cx: number, cy: number, r: number, dir: 'up' | 'down', color: string): void {
    if (r <= 0) return
    const dia = this._diaCells(r * 2)
    const from = dir === 'up' ? 0 : Math.floor(dia / 2)
    const to = dir === 'up' ? Math.ceil(dia / 2) - 1 : dia - 1
    this._cellRows(cx, cy, dia, dia, from, to, color)
  }

  /** セル整数演算によるブロック楕円（ellipse の代替）。仕様は §11.2 */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    if (rx <= 0 || ry <= 0) return
    const diaX = this._diaCells(rx * 2)
    const diaY = this._diaCells(ry * 2)
    this._cellRows(cx, cy, diaX, diaY, 0, diaY - 1, color)
  }

  /** 階段状の三角形（spike の代替）。dir は頂点が向く方向 */
  tri(x: number, y: number, w: number, h: number, dir: 'up' | 'down' | 'left' | 'right', color: string): void {
    if (w <= 0 || h <= 0) return
    const s = this._size
    if (dir === 'up' || dir === 'down') {
      const rows = Math.max(2, Math.round(h / s))
      const rowH = h / rows
      for (let i = 0; i < rows; i++) {
        const frac = (i + 1) / rows
        const t = dir === 'up' ? frac : 1 - frac
        const rowW = w * t
        this.rect(x + (w - rowW) / 2, y + i * rowH, rowW, rowH, color)
      }
    } else {
      const cols = Math.max(2, Math.round(w / s))
      const colW = w / cols
      for (let i = 0; i < cols; i++) {
        const frac = (i + 1) / cols
        const t = dir === 'left' ? frac : 1 - frac
        const colH = h * t
        this.rect(x + i * colW, y + (h - colH) / 2, colW, colH, color)
      }
    }
  }

  /**
   * 経路を 1 セル間隔でサンプリングするブロック線（stroke の代替）。thickness はセル数。
   * 重複セルは描画しない（§11.3）。
   */
  line(x0: number, y0: number, x1: number, y1: number, color: string, thickness: number): void {
    const s = this._size
    const t = Math.max(1, thickness) * s
    const dx = x1 - x0
    const dy = y1 - y0
    const dist = Math.hypot(dx, dy)
    if (dist === 0) {
      this.rect(x0 - t / 2, y0 - t / 2, t, t, color)
      return
    }
    const steps = Math.max(1, Math.round(dist / s))
    const seen = new Set<string>()
    for (let i = 0; i <= steps; i++) {
      const px = x0 + (dx * i) / steps
      const py = y0 + (dy * i) / steps
      this._rectOnce(px - t / 2, py - t / 2, t, t, color, seen)
    }
  }

  /**
   * N 段の色帯グラデーション（createLinearGradient の代替）。
   * stops は addColorStop と同じ [位置(0..1), 色] の配列。2色固定ではなく
   * 可変長で受け取ることで、既存の3ストップ以上のグラデーションも移植できる。
   */
  bandGradient(
    x: number, y: number, w: number, h: number,
    stops: readonly GradientStop[],
    axis: 'v' | 'h',
    steps: number,
  ): void {
    const n = Math.max(1, Math.round(steps))
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const color = _lerpColor(stops, t)
      if (axis === 'v') {
        const bandH = h / n
        this.rect(x, y + i * bandH, w, bandH, color)
      } else {
        const bandW = w / n
        this.rect(x + i * bandW, y, bandW, h, color)
      }
    }
  }

  /** 放射グラデーションの帯版（createRadialGradient の代替）。同心リングとして描く */
  bandRadial(cx: number, cy: number, r0: number, r1: number, stops: readonly GradientStop[], steps: number): void {
    const n = Math.max(1, Math.round(steps))
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      const rInner = r0 + (r1 - r0) * t0
      const rOuter = r0 + (r1 - r0) * t1
      const color = _lerpColor(stops, (t0 + t1) / 2)
      this._annulus(cx, cy, rInner, rOuter, color)
    }
  }

  /**
   * 同心リング 1 段。円系と同じくセル整数演算で行を生成する（§11.2）。
   * 隣接するリングは境界の半径が一致し同じ量子化結果になるため、隙間は生じない。
   */
  private _annulus(cx: number, cy: number, rInner: number, rOuter: number, color: string): void {
    if (rOuter <= 0) return
    const s = this._size
    const diaOuter = this._diaCells(rOuter * 2)
    const diaInner = rInner > 0 ? this._diaCells(rInner * 2) : 0
    const ro = diaOuter / 2
    const ri = diaInner / 2
    const x0 = cx - ro * s
    const y0 = cy - ro * s
    const oddOuter = diaOuter % 2 === 1
    for (let i = 0; i < diaOuter; i++) {
      const yc = i + 0.5 - ro
      const outerHalf = ro * Math.sqrt(Math.max(0, 1 - (yc / ro) * (yc / ro)))
      const wOuter = PixelCanvas._widthCells(outerHalf, oddOuter)
      if (wOuter <= 0) continue
      const left = x0 + ((diaOuter - wOuter) / 2) * s
      const y = y0 + i * s
      if (ri <= 0 || Math.abs(yc) >= ri) {
        this.rect(left, y, wOuter * s, s, color)
        continue
      }
      const innerHalf = ri * Math.sqrt(Math.max(0, 1 - (yc / ri) * (yc / ri)))
      // 外側と偶奇を揃えることで帯幅が整数セルになり、左右の帯が対称になる
      const wInner = PixelCanvas._widthCells(innerHalf, oddOuter)
      const bandCells = (wOuter - wInner) / 2
      if (bandCells <= 0) continue
      this.rect(left, y, bandCells * s, s, color)
      this.rect(left + (wOuter - bandCells) * s, y, bandCells * s, s, color)
    }
  }

  /** 高さ関数をグリッド列でサンプリングした階段シルエット（山・丘・ビル群の代替） */
  ridge(x0: number, x1: number, baseY: number, heightAt: (worldX: number) => number, color: string): void {
    const s = this._size
    for (let x = x0; x <= x1; x += s) {
      const h = heightAt(x)
      if (h <= 0) continue
      this.rect(x, baseY - h, s, h, color)
    }
  }

  /**
   * ブロックハロー（shadowBlur の代替）。draw を外側へ expand しながら
   * PIXELART.haloAlphaFalloff で減衰させて steps 回重ねる。
   * draw(expand, color) は expand 分だけ拡張した図形を color で描くこと。
   */
  halo(draw: (expand: number, color: string) => void, color: string, steps: number): void {
    const n = Math.max(0, Math.round(steps))
    for (let i = n; i >= 1; i--) {
      const alpha = Math.pow(PIXELART.haloAlphaFalloff, i)
      const expand = i * this._size
      this.withAlpha(alpha, () => draw(expand, color))
    }
  }

  /**
   * アルファを PIXELART.alphaSteps 段に量子化して適用するスコープ。
   *
   * **現在の globalAlpha に乗算する**（上書きではない）。これにより
   * `withAlpha(fade, () => px.halo(...))` のような入れ子が直感どおり合成される。
   */
  withAlpha(alpha: number, body: () => void): void {
    const steps = Math.max(2, PIXELART.alphaSteps)
    const q = Math.round(Math.max(0, Math.min(1, alpha)) * steps) / steps
    const prev = this.ctx.globalAlpha
    this.ctx.globalAlpha = prev * q
    try {
      body()
    } finally {
      this.ctx.globalAlpha = prev
    }
  }

  /** 立体ブロック（ベース色 + 上/左の明色1セル + 下/右の暗色1セル） */
  block(x: number, y: number, w: number, h: number, base: string): void {
    const s = this._size
    this.rect(x, y, w, h, base)
    const shade = PIXELART.blockShadeAmount
    const light = _lighten(base, shade)
    const dark = _lighten(base, -shade)
    this.rect(x, y, w, s, light)
    this.rect(x, y, s, h, light)
    this.rect(x, y + h - s, w, s, dark)
    this.rect(x + w - s, y, s, h, dark)
  }

  /** 2色の市松ディザ（半透明の代替表現）。ratio は 0(全て colorA)〜1(全て colorB) */
  dither(x: number, y: number, w: number, h: number, colorA: string, colorB: string, ratio: number): void {
    const s = this._size
    const steps = Math.max(1, PIXELART.ditherRatioSteps)
    const q = Math.round(Math.max(0, Math.min(1, ratio)) * steps) / steps
    const cols = Math.max(1, Math.round(w / s))
    const rows = Math.max(1, Math.round(h / s))
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const useB = q > _ditherThreshold(rx, ry)
        this.rect(x + rx * s, y + ry * s, s, s, useB ? colorB : colorA)
      }
    }
  }

  /** 四隅を cut セル分だけ欠けさせた矩形（角丸の代替） */
  roundedRect(x: number, y: number, w: number, h: number, color: string, cut: number): void {
    const c = Math.max(0, cut) * this._size
    if (c <= 0 || c * 2 >= Math.min(w, h)) {
      this.rect(x, y, w, h, color)
      return
    }
    this.rect(x, y + c, w, h - 2 * c, color)
    this.rect(x + c, y, w - 2 * c, c, color)
    this.rect(x + c, y + h - c, w - 2 * c, c, color)
  }

  /**
   * 円弧上にブロックを並べる（arc + stroke の代替）。thickness はセル数。
   * 重複セルは描画しない（§11.3）。全周を描くと始点と終点が重なるため、
   * 半透明で描いたときに弧の一部だけ二重合成されて明点になるのを防ぐ。
   */
  arcBlocks(cx: number, cy: number, r: number, startAngle: number, endAngle: number, color: string, thickness: number): void {
    const s = this._size
    const t = Math.max(1, thickness) * s
    const arcLen = Math.abs(endAngle - startAngle) * r
    const steps = Math.max(1, Math.round(arcLen / s))
    const seen = new Set<string>()
    for (let i = 0; i <= steps; i++) {
      const a = startAngle + (endAngle - startAngle) * (i / steps)
      const px = cx + r * Math.cos(a)
      const py = cy + r * Math.sin(a)
      this._rectOnce(px - t / 2, py - t / 2, t, t, color, seen)
    }
  }

  /**
   * 焼き込み済みスプライトを転送する。dw / dh には呼び出し側の既存の w / h を
   * そのまま渡すこと（当たり判定と見た目のサイズを一致させるため）。
   * 戻り値は描画できたか。
   */
  sprite(id: string, dx: number, dy: number, dw: number, dh: number, opts?: SpriteDrawOptions): boolean {
    const ctx = this.ctx
    const s = this._size
    const m = ctx.getTransform()

    // 軸平行（無回転・軸に沿った反転のみ）かどうか。
    // 回転がある場合に外接矩形へ軸平行転送すると、寸法だけ入れ替わって
    // スプライト画素が回らない（縦スクロール時に自機の向きが変わらない不具合になる）。
    const isAxisAligned = Math.abs(m.b) < _EPSILON && Math.abs(m.c) < _EPSILON

    ctx.save()
    let ok: boolean
    if (isAxisAligned) {
      // 従来経路: 外接矩形へそのまま転送する（位置・寸法とも最も精度が高い）
      const { dx: ddx, dy: ddy, dw: ddw, dh: ddh } = this._toDevice(dx, dy, dw, dh)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ok = this._sprites.draw(ctx, id, ddx, ddy, ddw, ddh, opts)
    } else {
      // 回転経路: スプライト画素も同じ角度で回す。
      // 中心をデバイス空間でスナップし、スプライト自身の軸に沿った寸法を量子化してから
      // 回転を掛け直すことで、回転後の出力もグリッドに乗る。
      const cxLocal = dx + dw / 2
      const cyLocal = dy + dh / 2
      const pcx = m.a * cxLocal + m.c * cyLocal + m.e
      const pcy = m.b * cxLocal + m.d * cyLocal + m.f
      const scaleX = Math.hypot(m.a, m.b)
      const scaleY = Math.hypot(m.c, m.d)
      const sw = _snapSize(Math.abs(dw) * scaleX, s)
      const sh = _snapSize(Math.abs(dh) * scaleY, s)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.translate(_snapPos(pcx, s), _snapPos(pcy, s))
      ctx.rotate(Math.atan2(m.b, m.a))
      ok = this._sprites.draw(ctx, id, -sw / 2, -sh / 2, sw, sh, opts)
    }
    ctx.restore()
    return ok
  }

  /**
   * ドット化した文字列を描く。
   *
   * 現在の変換が「純粋な平行移動」（画面シェイクなど）の場合は、転送位置を
   * デバイス空間でスナップしてから描く（§3 のスナップ規則）。シェイク量は小数を
   * 含みうるため、これを行わないと文字だけがグリッドから外れる。
   * 拡大縮小・回転が掛かっている場合は文字サイズが変わってしまうため、
   * 変換をそのまま活かして従来どおり描く。
   */
  text(str: string, x: number, y: number, opts: PixelTextOptions): void {
    const ctx = this.ctx
    const m = ctx.getTransform()
    const isPureTranslate =
      Math.abs(m.a - 1) < _EPSILON && Math.abs(m.d - 1) < _EPSILON &&
      Math.abs(m.b) < _EPSILON && Math.abs(m.c) < _EPSILON
    if (!isPureTranslate) {
      this._text.draw(ctx, str, x, y, opts)
      return
    }
    const s = this._size
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    this._text.draw(ctx, str, _snapPos(x + m.e, s), _snapPos(y + m.f, s), opts)
    ctx.restore()
  }
}
