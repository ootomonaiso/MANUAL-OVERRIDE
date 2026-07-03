/**
 * genres/StgPlugin.ts
 * 'stg' ジャンル（宇宙シューティング）のプラグイン。
 *
 * 敵は単純な図形ではなく、エイリアン戦闘機（diamond）と装甲砲艦（rect）として
 * 描き分ける。画面前景には走査線・ビネット・コックピットHUD枠・流れる光条などの
 * SF 装飾を重ねて密度を上げる。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { Hazard } from '../game/entities'

export class StgPlugin extends GenrePluginBase {
  readonly id = 'stg' as const
  readonly skyColors    = ['#000005', '#05050f'] as const
  readonly groundColors = ['#05050a', '#020205'] as const
  readonly farLayerColor  = '#050520'
  readonly midLayerColor  = '#050520'
  readonly starColor      = '#ffffff'
  readonly palette = {
    danger: '#e17055', dangerGlow: '#fd79a8',
    safe:   '#0984e3', safeGlow:   '#74b9ff',
  }

  // SF らしいヒット・死亡エフェクト色
  readonly particleColors = {
    hit:   '#88ffff',
    death: ['#88ffff', '#4488ff', '#ffffff', '#aa66ff'] as readonly string[],
    jump:  'rgba(120,200,255,0.6)',
    land:  'rgba(80,140,255,0.5)',
  }

  // 上下左右に動ける宇宙戦の敵配置。地面を持たず空中・浮遊で構成し、
  // 距離後半ほど密度が増す（weightStart 低め → weightEnd 高め）。
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'diamond', placement: 'float', weightStart: 3, weightEnd: 6, wRange: [26, 40], hRange: [26, 40], floatAmpRange: [60, 130] },
    { shape: 'rect',    placement: 'air',   weightStart: 2, weightEnd: 5, wRange: [24, 42], hRange: [24, 40] },
    { shape: 'diamond', placement: 'float', weightStart: 1, weightEnd: 5, wRange: [20, 30], hRange: [20, 30], floatAmpRange: [90, 170], pulseSpeed: 3.0 },
    { shape: 'rect',    placement: 'float', weightStart: 0, weightEnd: 4, wRange: [18, 30], hRange: [18, 30], floatAmpRange: [40, 110] },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 遠方の恒星（巨大なグロー）。セクター移動でゆっくり横切る
    const sunX = ((-offsetX * 0.08) % (W * 2.2) + W * 2.2) % (W * 2.2) - W * 0.4
    const sunY = gY * 0.26
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 200)
    sunGrad.addColorStop(0, 'rgba(180,210,255,0.55)')
    sunGrad.addColorStop(0.25, 'rgba(90,130,255,0.20)')
    sunGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = sunGrad
    ctx.fillRect(0, 0, W, gY)
    ctx.fillStyle = 'rgba(230,240,255,0.85)'
    ctx.beginPath()
    ctx.arc(sunX, sunY, 12, 0, Math.PI * 2)
    ctx.fill()

    // 遠景の星雲（複数色をゆっくり流す）
    const nebulae: readonly [number, string][] = [
      [0.30, '#3344ff'],
      [0.62, '#aa33cc'],
    ]
    for (const [phase, color] of nebulae) {
      ctx.globalAlpha = 0.07
      const nx = (((-offsetX * 0.15 + phase * W * 3) % (W * 1.5)) + W * 1.5) % (W * 1.5) - W * 0.25
      const grad = ctx.createRadialGradient(nx, gY * 0.4, 0, nx, gY * 0.4, 240)
      grad.addColorStop(0, color)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, gY)
    }
    ctx.globalAlpha = 1

    // 明るい瞬く星（決定的配置 + 時間で明滅）
    const t = performance.now() / 1000
    const sector = Math.floor(offsetX / 360)
    for (let s = sector - 1; s <= sector + 2; s++) {
      for (let i = 0; i < 4; i++) {
        const hsh = ((s * 73856093) ^ (i * 19349663)) >>> 0
        const bx = s * 360 - offsetX * 0.12 + (hsh % 360)
        const by = (hsh >>> 9) % Math.floor(gY * 0.7)
        if (bx < 0 || bx > W) continue
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + (hsh % 100)))
        ctx.globalAlpha = twinkle * 0.9
        ctx.fillStyle = '#cfe6ff'
        ctx.beginPath()
        ctx.arc(bx, by, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 遠くを横切る惑星（セクターごとに決定的に配置）
    const sector = Math.floor(offsetX / 900)
    for (let s = sector - 1; s <= sector + 2; s++) {
      const h = (s * 2654435761) >>> 0
      const px = s * 900 - offsetX * 0.5 + (h % 400)
      const py = gY * 0.18 + ((h >>> 6) % Math.floor(gY * 0.45))
      const pr = 28 + (h >>> 12) % 46
      if (px < -pr * 2 || px > W + pr * 2) continue
      const hue = (h >>> 18) % 360
      const grad = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.2, px, py, pr)
      grad.addColorStop(0, `hsla(${hue}, 60%, 55%, 0.5)`)
      grad.addColorStop(1, `hsla(${hue}, 70%, 18%, 0.5)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(px, py, pr, 0, Math.PI * 2)
      ctx.fill()
      // リング（一部の惑星のみ）
      if ((h & 3) === 0) {
        ctx.strokeStyle = `hsla(${hue}, 50%, 70%, 0.3)`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(px, py, pr * 1.6, pr * 0.4, -0.4, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    // 近めの星雲光
    ctx.globalAlpha = 0.05
    const nx = (-offsetX * 0.3) % W
    const grad = ctx.createRadialGradient(nx, gY * 0.55, 0, nx, gY * 0.55, 220)
    grad.addColorStop(0, '#5566ff')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, gY * 0.55 - 220, W, 440)
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    const cy = h / 2

    // エンジン炎（ランダム揺らぎ・上下2基）
    const flame = w * 0.25 + Math.random() * w * 0.25
    for (const ny of [h * 0.32, h * 0.68]) {
      const fg = ctx.createLinearGradient(w * 0.05, ny, -flame, ny)
      fg.addColorStop(0, '#ffffff')
      fg.addColorStop(0.4, '#66ddff')
      fg.addColorStop(1, 'transparent')
      ctx.fillStyle = fg
      ctx.beginPath()
      ctx.moveTo(w * 0.05, ny - h * 0.06)
      ctx.lineTo(-flame, ny)
      ctx.lineTo(w * 0.05, ny + h * 0.06)
      ctx.closePath()
      ctx.fill()
    }

    // 後部ウィング
    ctx.fillStyle = '#3a6ea5'
    ctx.beginPath()
    ctx.moveTo(w * 0.05, cy)
    ctx.lineTo(w * 0.35, h * 0.02)
    ctx.lineTo(w * 0.5, cy)
    ctx.lineTo(w * 0.35, h * 0.98)
    ctx.closePath()
    ctx.fill()

    // 機体本体（前方に尖った楔形）
    const body = ctx.createLinearGradient(0, h * 0.1, 0, h * 0.9)
    body.addColorStop(0, '#cfeaff')
    body.addColorStop(0.5, '#88ccff')
    body.addColorStop(1, '#4a90c8')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(w, cy)
    ctx.lineTo(w * 0.45, h * 0.2)
    ctx.lineTo(w * 0.1, h * 0.42)
    ctx.lineTo(w * 0.1, h * 0.58)
    ctx.lineTo(w * 0.45, h * 0.8)
    ctx.closePath()
    ctx.fill()

    // 機体ハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w * 0.95, cy)
    ctx.lineTo(w * 0.3, cy)
    ctx.stroke()

    // コックピット（発光）
    ctx.shadowColor = '#aef0ff'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#eaffff'
    ctx.beginPath()
    ctx.arc(w * 0.62, cy, h * 0.13, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#2a7fd0'
    ctx.beginPath()
    ctx.arc(w * 0.64, cy, h * 0.07, 0, Math.PI * 2)
    ctx.fill()
  }

  // ─── 敵描画（デフォルト図形を上書きしてメカニカルな見た目にする） ─────
  drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, sx: number, world: MutableWorld): boolean {
    const floatY = h.floatAmp > 0 ? Math.sin(h.pulse) * h.floatAmp : 0
    const x = sx
    const y = h.y + floatY
    const pulse = Math.sin(h.pulse * 3) * 0.5 + 0.5  // 0〜1
    const t = performance.now() / 1000

    ctx.save()
    if (h.shape === 'diamond') {
      this._drawInterceptor(ctx, x, y, h.w, h.h, h.color, h.glowColor, pulse, t)
    } else {
      this._drawGunship(ctx, x, y, h.w, h.h, h.color, h.glowColor, pulse, t)
    }
    ctx.restore()

    // enemy_hp 有効時はセグメント式HPバーを描く
    if (world.rules.features.has('enemy_hp') && h.maxHp > 1) {
      this._drawHpBar(ctx, x, y - 9, h.w, h.hp, h.maxHp)
    }
    return true
  }

  // diamond → エイリアン戦闘機（左を向いて突進してくる）
  private _drawInterceptor(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, hgt: number,
    color: string, glow: string, pulse: number, t: number,
  ): void {
    const cx = x + w / 2
    const cy = y + hgt / 2
    const dark  = this._shade(color, -55)
    const light = this._shade(color, 65)

    // 後方エンジン炎（右側＝進行方向の逆）
    const ef = (0.6 + Math.abs(Math.sin(t * 18)) * 0.4)
    const fg = ctx.createLinearGradient(x + w, cy, x + w + w * 0.5 * ef, cy)
    fg.addColorStop(0, '#ffffff')
    fg.addColorStop(0.4, glow)
    fg.addColorStop(1, 'transparent')
    ctx.fillStyle = fg
    ctx.beginPath()
    ctx.moveTo(x + w * 0.82, cy - hgt * 0.14)
    ctx.lineTo(x + w + w * 0.5 * ef, cy)
    ctx.lineTo(x + w * 0.82, cy + hgt * 0.14)
    ctx.closePath()
    ctx.fill()

    // 上下に張り出した湾曲ウィング
    ctx.fillStyle = dark
    for (const dir of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(cx + w * 0.10, cy + dir * hgt * 0.10)
      ctx.quadraticCurveTo(x + w * 0.30, cy + dir * hgt * 0.62, x + w * 0.86, cy + dir * hgt * 0.50)
      ctx.lineTo(x + w * 0.70, cy + dir * hgt * 0.16)
      ctx.closePath()
      ctx.fill()
    }

    // 機体本体（左に尖った六角形）
    const body = ctx.createLinearGradient(0, y, 0, y + hgt)
    body.addColorStop(0, light)
    body.addColorStop(0.5, color)
    body.addColorStop(1, dark)
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(x, cy)                       // 機首（左）
    ctx.lineTo(x + w * 0.34, y + hgt * 0.22)
    ctx.lineTo(x + w * 0.84, y + hgt * 0.34)
    ctx.lineTo(x + w * 0.84, y + hgt * 0.66)
    ctx.lineTo(x + w * 0.34, y + hgt * 0.78)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = light
    ctx.lineWidth = 1
    ctx.stroke()

    // 装甲のパネルライン
    ctx.strokeStyle = this._shade(color, -25)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + w * 0.20, cy)
    ctx.lineTo(x + w * 0.80, cy)
    ctx.stroke()

    // 中央の発光コア（脈動する単眼）
    const r = hgt * (0.14 + pulse * 0.05)
    ctx.shadowColor = glow
    ctx.shadowBlur = 12
    const core = ctx.createRadialGradient(cx + w * 0.18, cy, 0, cx + w * 0.18, cy, r)
    core.addColorStop(0, '#ffffff')
    core.addColorStop(0.5, glow)
    core.addColorStop(1, this._shade(color, -40))
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(cx + w * 0.18, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // rect → 装甲砲艦（左前方に主砲、後方にスラスター）
  private _drawGunship(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, hgt: number,
    color: string, glow: string, pulse: number, t: number,
  ): void {
    const cy = y + hgt / 2
    const dark  = this._shade(color, -55)
    const light = this._shade(color, 60)

    // 後方スラスター炎
    const ef = 0.5 + Math.abs(Math.sin(t * 22)) * 0.5
    const fg = ctx.createLinearGradient(x + w, cy, x + w + w * 0.4 * ef, cy)
    fg.addColorStop(0, '#ffffff')
    fg.addColorStop(0.45, glow)
    fg.addColorStop(1, 'transparent')
    ctx.fillStyle = fg
    for (const ny of [y + hgt * 0.3, y + hgt * 0.7]) {
      ctx.beginPath()
      ctx.moveTo(x + w * 0.96, ny - hgt * 0.08)
      ctx.lineTo(x + w + w * 0.4 * ef, ny)
      ctx.lineTo(x + w * 0.96, ny + hgt * 0.08)
      ctx.closePath()
      ctx.fill()
    }

    // 前方の主砲バレル（左へ突き出す）
    ctx.fillStyle = dark
    this._roundRect(ctx, x - w * 0.18, cy - hgt * 0.1, w * 0.3, hgt * 0.2, 2)
    ctx.fill()
    ctx.fillStyle = glow
    ctx.fillRect(x - w * 0.18, cy - hgt * 0.03, w * 0.06, hgt * 0.06)  // 砲口の発光

    // 装甲ボディ（角丸 + 縦グラデ）
    const body = ctx.createLinearGradient(0, y, 0, y + hgt)
    body.addColorStop(0, light)
    body.addColorStop(0.5, color)
    body.addColorStop(1, dark)
    ctx.fillStyle = body
    this._roundRect(ctx, x + w * 0.08, y + hgt * 0.06, w * 0.82, hgt * 0.88, 4)
    ctx.fill()
    ctx.strokeStyle = light
    ctx.lineWidth = 1
    ctx.stroke()

    // パネルライン（横方向）
    ctx.strokeStyle = this._shade(color, -30)
    ctx.lineWidth = 1
    for (const fy of [0.36, 0.64]) {
      ctx.beginPath()
      ctx.moveTo(x + w * 0.12, y + hgt * fy)
      ctx.lineTo(x + w * 0.86, y + hgt * fy)
      ctx.stroke()
    }

    // 上面のセンサーライト（明滅）
    for (let i = 0; i < 3; i++) {
      const lx = x + w * (0.30 + i * 0.20)
      const blink = (Math.sin(t * 6 + i * 1.7) + 1) * 0.5
      ctx.globalAlpha = 0.4 + blink * 0.6
      ctx.fillStyle = i === 1 ? '#ffffff' : glow
      ctx.beginPath()
      ctx.arc(lx, y + hgt * 0.18, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // 中央の発光センサーアイ（脈動）
    const r = hgt * (0.12 + pulse * 0.04)
    ctx.shadowColor = glow
    ctx.shadowBlur = 10
    const core = ctx.createRadialGradient(x + w * 0.45, cy, 0, x + w * 0.45, cy, r)
    core.addColorStop(0, '#ffffff')
    core.addColorStop(0.55, glow)
    core.addColorStop(1, dark)
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(x + w * 0.45, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // セグメント式の小型HPバー
  private _drawHpBar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, hp: number, maxHp: number,
  ): void {
    const segGap = 1
    const segW = (w - segGap * (maxHp - 1)) / maxHp
    for (let i = 0; i < maxHp; i++) {
      const sxi = x + i * (segW + segGap)
      const filled = i < hp
      ctx.fillStyle = filled
        ? (hp / maxHp > 0.4 ? '#7CFC8A' : '#ff7043')
        : 'rgba(255,255,255,0.15)'
      ctx.fillRect(sxi, y, segW, 3)
    }
  }

  // ─── 前景装飾（コックピットHUD・走査線・ビネット・流れる光条） ─────────
  drawForeground(ctx: CanvasRenderingContext2D, offsetX: number, W: number, H: number, _gY: number): void {
    ctx.save()

    // 高速で流れる前景の光条（手前のスペースダスト）
    const sector = Math.floor(offsetX / 220)
    ctx.lineWidth = 2
    for (let s = sector - 1; s <= sector + 2; s++) {
      for (let i = 0; i < 2; i++) {
        const hsh = ((s * 40503) ^ (i * 12289)) >>> 0
        const lx = s * 220 - offsetX * 1.4 + (hsh % 220)
        if (lx < -40 || lx > W) continue
        const ly = (hsh >>> 8) % H
        const len = 22 + (hsh >>> 4) % 30
        ctx.strokeStyle = 'rgba(150,210,255,0.16)'
        ctx.beginPath()
        ctx.moveTo(lx, ly)
        ctx.lineTo(lx + len, ly)
        ctx.stroke()
      }
    }

    // 走査線（CRT 風の薄い横縞）
    ctx.fillStyle = 'rgba(0,0,0,0.05)'
    for (let yy = 0; yy < H; yy += 3) {
      ctx.fillRect(0, yy, W, 1)
    }

    // ビネット（画面四隅を暗く落とす）
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, W * 0.72)
    vig.addColorStop(0, 'transparent')
    vig.addColorStop(1, 'rgba(0,0,12,0.55)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, W, H)

    // コックピットHUD：四隅のブラケットと上端の目盛り
    ctx.strokeStyle = 'rgba(120,230,255,0.5)'
    ctx.lineWidth = 2
    const m = 14, b = 22
    const corners: readonly [number, number, number, number][] = [
      [m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1],
    ]
    for (const [cxp, cyp, dx, dy] of corners) {
      ctx.beginPath()
      ctx.moveTo(cxp + dx * b, cyp)
      ctx.lineTo(cxp, cyp)
      ctx.lineTo(cxp, cyp + dy * b)
      ctx.stroke()
    }
    // 上端のスキャナー目盛り
    ctx.strokeStyle = 'rgba(120,230,255,0.25)'
    ctx.lineWidth = 1
    for (let tx = W * 0.18; tx < W * 0.82; tx += 26) {
      const tall = (Math.round(tx) % 78 === 0)
      ctx.beginPath()
      ctx.moveTo(tx, m)
      ctx.lineTo(tx, m + (tall ? 8 : 4))
      ctx.stroke()
    }

    ctx.restore()
  }

  // hex 色を amount だけ増減した rgb 文字列を返す（非 hex はそのまま返す）
  private _shade(hex: string, amount: number): string {
    if (!hex.startsWith('#') || hex.length < 7) return hex
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
    const cl = (v: number): number => Math.max(0, Math.min(255, v + amount))
    return `rgb(${cl(r)},${cl(g)},${cl(b)})`
  }
}

export default new StgPlugin()
