/**
 * genres/AerialStgPlugin.ts
 * 'aerial_stg' ジャンル（縦スクロールシューティング）のプラグイン。
 *
 * 雲の上の空・高高度の大気圏内。上空から見下ろした雲海が上から下へ流れる背景。
 * プレイヤーは高高度を飛ぶ戦闘機で、上から迫る敵機・爆撃機・ミサイルを撃ち落とす。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { Hazard } from '../game/entities'
import type { GenreId } from '../domain/types'

export class AerialStgPlugin extends GenrePluginBase {
  readonly id: GenreId = 'aerial_stg'

  readonly skyColors    = ['#050a18', '#0d1f3c'] as const
  readonly groundColors = ['#091520', '#091520'] as const
  readonly farLayerColor  = '#0a1830'
  readonly midLayerColor  = '#0c1424'
  readonly starColor      = '#dfe8ff'

  readonly palette = {
    danger: '#ff4b4b', dangerGlow: '#ff8a6a',
    safe:   '#3fa0ff', safeGlow:   '#9fd0ff',
  }

  // engine が drawFarLayer/drawMidLayer に distance*parallax を offsetX として渡す。
  // far=遠景雲の Y スクロール量(=distance)、mid=中景雲(=distance×1.5 で遠景より速い)。
  readonly parallax = {
    stars: 0.02,
    far:   1.0,
    mid:   1.5,
  }

  readonly starConfig = {
    density: 18,
    sizeRange: [1, 2] as [number, number],
    alphaRange: [0.3, 0.7] as [number, number],
  }

  readonly hazardConfig = {
    glowBlur: 14,
    pulseSpeed: 2.0,
    pulseAmplitude: 0.1,
  }

  readonly particleColors = {
    hit:   '#ffb08a',
    death: ['#ff5a3c', '#ff9a3c', '#ffd23c', '#ffffff'] as readonly string[],
    jump:  'rgba(120,200,255,0.6)',
    land:  'rgba(80,150,220,0.5)',
  }

  // 縦モードでも遠景・中景レイヤー（空・雲）を描画する
  readonly verticalBackgroundLayers = true

  // ─── 描画カラー（ハードコード回避のため readonly に集約） ──────────
  private readonly jetColors = {
    bodyLight: '#c0c8d0', bodyDark: '#8090a0', edge: '#dfe6ee',
    canopy: '#1b2436', canopyGlow: '#3a5fa0',
    flameCore: '#bfe6ff', flameMid: '#ff9a3c', flameTip: 'rgba(255,180,80,0.5)',
  }
  private readonly enemyColors  = { fill: '#5a1414', edge: '#ff7a7a', canopy: '#2a0a0a' }
  private readonly bomberColors = { body: '#3a2a2e', bodyEdge: '#7a4a4a', engine: '#ff7a3c' }
  private readonly missileColors = { body: '#b0b8c0', head: '#ff5a5a', flame: '#ffce6a' }

  // 遠景: 空グラデーション（深い夜空→明るい青）
  private readonly farSkyGrad = {
    top: '#0a1628',
    bot: '#1a4a7a',
  }

  // 遠景雲（薄く・小さく・Math.sin 決定的擬似ランダム配置）
  private readonly farCloudCfg = {
    count:      7,
    tileH:      320,
    minR:       5,
    rangeR:     12,
    alphaBase:  0.08,
    alphaRange: 0.10,
    colors: ['rgba(220,235,250,', 'rgba(200,218,240,'] as readonly string[],
  }

  // 中景雲塊（ctx.arc の組み合わせ、全画面に散らばる）
  private readonly midCloudCfg = {
    count:      5,
    tileH:      240,
    minR:       20,
    rangeR:     36,
    alphaBase:  0.16,
    alphaRange: 0.18,
    colors: ['rgba(240,248,255,', 'rgba(160,185,210,'] as readonly string[],
  }

  private readonly hudColors = {
    bracket:  'rgba(0,255,136,0.65)',
    vignette: 'rgba(0,0,0,0.55)',
  }

  private readonly hpBar = {
    segGap: 2, height: 4, offsetY: 10, threshold: 0.4,
    high: '#5ad65a', low: '#d65a5a', bg: 'rgba(0,0,0,0.5)',
  }

  // 縦モード: 全ハザードが画面上端からスポーン。placement は無視される。
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'diamond', placement: 'air', weightStart: 2, weightEnd: 6, wRange: [24, 34], hRange: [26, 38], safeChance: 0 },
    { shape: 'rect',    placement: 'air', weightStart: 1, weightEnd: 4, wRange: [40, 60], hRange: [24, 36], safeChance: 0 },
    { shape: 'pillar',  placement: 'air', weightStart: 1, weightEnd: 5, wRange: [12, 18], hRange: [40, 64], safeChance: 0 },
  ]

  // ════════════════════════════════════════════════════════════════
  // 背景（高高度の空・雲海）
  // ════════════════════════════════════════════════════════════════

  // 遠景: 空グラデーション + 遠景雲（薄く・小さく）。上から下へ流れる。
  // engine が渡す offsetX = distance * parallax.far を Y スクロール量として使う。
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const scrollY = offsetX   // Y 方向スクロール量（distance × parallax.far）
    const H  = gY
    const sg = this.farSkyGrad
    const c  = this.farCloudCfg

    // 空グラデーション: 上部 #0a1628（深い夜空）→ 下部 #1a4a7a（明るい青）
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, sg.top)
    grad.addColorStop(1, sg.bot)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // 遠景の雲: タイル分割して Y スクロール、Math.sin ベース決定的配置
    const sector = Math.floor(scrollY / c.tileH)
    const rows   = Math.ceil(H / c.tileH) + 2
    for (let s = sector + 1; s >= sector - rows; s--) {
      const baseY = scrollY - s * c.tileH
      for (let i = 0; i < c.count; i++) {
        const seed = s * 83.7 + i * 29.3
        const cx   = this._rand(seed)             * W
        const cy   = baseY + this._rand(seed + 1) * c.tileH
        if (cy + c.minR + c.rangeR < 0 || cy - c.minR - c.rangeR > H) continue
        const r  = c.minR + this._rand(seed + 2) * c.rangeR
        const a  = c.alphaBase + this._rand(seed + 3) * c.alphaRange
        const ci = Math.floor(this._rand(seed + 4) * c.colors.length)
        ctx.fillStyle = `${c.colors[ci]}${a.toFixed(2)})`
        this._drawCloud(ctx, cx, cy, r)
      }
    }
  }

  // 中景: 雲塊（ctx.arc の組み合わせ）を全画面に散らばらせる。
  // engine が渡す offsetX = distance * parallax.mid を Y スクロール量として使う（遠景より速い）。
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const scrollY = offsetX   // distance × 1.5（遠景より速い Y スクロール）
    const H       = gY
    const c       = this.midCloudCfg
    const sector  = Math.floor(scrollY / c.tileH)
    const rows    = Math.ceil(H / c.tileH) + 2

    for (let s = sector + 1; s >= sector - rows; s--) {
      const baseY = scrollY - s * c.tileH
      for (let i = 0; i < c.count; i++) {
        const seed = s * 61.3 + i * 19.7
        const cx   = this._rand(seed)             * W
        const cy   = baseY + this._rand(seed + 1) * c.tileH
        if (cy + c.minR + c.rangeR < 0 || cy - c.minR - c.rangeR > H) continue
        const r  = c.minR + this._rand(seed + 2) * c.rangeR
        const a  = c.alphaBase + this._rand(seed + 3) * c.alphaRange
        const ci = Math.floor(this._rand(seed + 4) * c.colors.length)
        ctx.fillStyle = `${c.colors[ci]}${a.toFixed(2)})`
        this._drawCloud(ctx, cx, cy, r)
      }
    }
  }

  // 前景: ビネット + 四隅 HUD ブラケット（横スクロール前提の演出は廃止）。
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const hc = this.hudColors
    ctx.strokeStyle = hc.bracket
    ctx.lineWidth = 2
    const m = 18, len = 26
    const corners = [
      [m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1],
    ] as const
    for (const [px, py, dx, dy] of corners) {
      ctx.beginPath()
      ctx.moveTo(px, py + dy * len)
      ctx.lineTo(px, py)
      ctx.lineTo(px + dx * len, py)
      ctx.stroke()
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, hc.vignette)
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)
  }

  // 雲の塊（arc の組み合わせ）
  private _drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    const lobes = [[-r, 0.2 * r, 0.7], [0, -0.2 * r, 1.0], [r, 0.15 * r, 0.75], [r * 1.8, 0.3 * r, 0.5]] as const
    for (const [dx, dy, rr] of lobes) {
      ctx.beginPath()
      ctx.arc(cx + dx, cy + dy, r * rr, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Math.sin ベースの決定的擬似乱数（0..1）
  private _rand(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }

  // ════════════════════════════════════════════════════════════════
  // プレイヤー（近代戦闘機・俯瞰視点・上向き）
  // ════════════════════════════════════════════════════════════════

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    const cx = w / 2
    const jc = this.jetColors

    // 後方エンジン炎（機体より先に描いて背面へ）
    const jitter = Math.random() * 4
    ctx.fillStyle = jc.flameTip
    ctx.beginPath()
    ctx.moveTo(w * 0.38, h * 0.82); ctx.lineTo(cx, h + 22 + jitter * 2); ctx.lineTo(w * 0.62, h * 0.82)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = jc.flameMid
    ctx.beginPath()
    ctx.moveTo(w * 0.42, h * 0.82); ctx.lineTo(cx, h + 12 + jitter); ctx.lineTo(w * 0.58, h * 0.82)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = jc.flameCore
    ctx.beginPath()
    ctx.moveTo(w * 0.46, h * 0.82); ctx.lineTo(cx, h + 6 + jitter); ctx.lineTo(w * 0.54, h * 0.82)
    ctx.closePath(); ctx.fill()

    // 機体グラデーション（中央が明るい金属光沢）
    const bodyGrad = ctx.createLinearGradient(0, 0, w, 0)
    bodyGrad.addColorStop(0, jc.bodyDark)
    bodyGrad.addColorStop(0.5, jc.bodyLight)
    bodyGrad.addColorStop(1, jc.bodyDark)

    // 主翼（後退翼）
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.30)
    ctx.lineTo(w * 0.02, h * 0.72)
    ctx.lineTo(w * 0.20, h * 0.74)
    ctx.lineTo(cx, h * 0.64)
    ctx.lineTo(w * 0.80, h * 0.74)
    ctx.lineTo(w * 0.98, h * 0.72)
    ctx.closePath(); ctx.fill()

    // 尾翼
    ctx.fillStyle = jc.bodyDark
    ctx.beginPath()
    ctx.moveTo(cx, h * 0.72)
    ctx.lineTo(w * 0.30, h * 0.96)
    ctx.lineTo(w * 0.42, h * 0.96)
    ctx.lineTo(cx, h * 0.80)
    ctx.lineTo(w * 0.58, h * 0.96)
    ctx.lineTo(w * 0.70, h * 0.96)
    ctx.closePath(); ctx.fill()

    // 機体（機首は上）
    ctx.fillStyle = bodyGrad
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(w * 0.40, h * 0.45)
    ctx.lineTo(w * 0.42, h * 0.92)
    ctx.lineTo(w * 0.58, h * 0.92)
    ctx.lineTo(w * 0.60, h * 0.45)
    ctx.closePath(); ctx.fill()

    // 機体エッジハイライト
    ctx.strokeStyle = jc.edge
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, 0); ctx.lineTo(w * 0.40, h * 0.45)
    ctx.moveTo(cx, 0); ctx.lineTo(w * 0.60, h * 0.45)
    ctx.stroke()

    // キャノピー
    ctx.fillStyle = jc.canopy
    ctx.beginPath()
    ctx.ellipse(cx, h * 0.30, w * 0.10, h * 0.13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = jc.canopyGlow
    ctx.beginPath()
    ctx.ellipse(cx, h * 0.27, w * 0.05, h * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  // ════════════════════════════════════════════════════════════════
  // ハザード（敵機・爆撃機・ミサイル）
  // ════════════════════════════════════════════════════════════════

  drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, world: MutableWorld): boolean {
    const x  = sx
    const y  = hazard.y
    const w  = hazard.w
    const hh = hazard.h

    ctx.save()
    ctx.shadowColor = hazard.glowColor
    ctx.shadowBlur  = this.hazardConfig.glowBlur

    switch (hazard.shape) {
      case 'rect':   this._drawBomber(ctx, x, y, w, hh, hazard.color); break
      case 'pillar': this._drawMissile(ctx, x, y, w, hh, hazard.color); break
      default:       this._drawEnemyFighter(ctx, x, y, w, hh, hazard.color)
    }

    ctx.shadowBlur = 0
    if (world.rules.features.has('enemy_hp') && hazard.maxHp > 1) {
      this._drawHpBar(ctx, x, y, w, hazard.hp, hazard.maxHp)
    }
    ctx.restore()
    return true
  }

  // diamond → 敵戦闘機（機首が下・赤みがかったシルエット）
  private _drawEnemyFighter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    const cx   = x + w / 2
    const ec   = this.enemyColors
    const grad = ctx.createLinearGradient(x, y, x + w, y)
    grad.addColorStop(0, ec.fill)
    grad.addColorStop(0.5, color)
    grad.addColorStop(1, ec.fill)

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(cx, y + h * 0.70)
    ctx.lineTo(x + w * 0.02, y + h * 0.28)
    ctx.lineTo(x + w * 0.20, y + h * 0.26)
    ctx.lineTo(cx, y + h * 0.36)
    ctx.lineTo(x + w * 0.80, y + h * 0.26)
    ctx.lineTo(x + w * 0.98, y + h * 0.28)
    ctx.closePath(); ctx.fill()

    ctx.beginPath()
    ctx.moveTo(cx, y + h)
    ctx.lineTo(x + w * 0.40, y + h * 0.55)
    ctx.lineTo(x + w * 0.42, y + h * 0.08)
    ctx.lineTo(x + w * 0.58, y + h * 0.08)
    ctx.lineTo(x + w * 0.60, y + h * 0.55)
    ctx.closePath(); ctx.fill()

    ctx.fillStyle = ec.canopy
    ctx.beginPath()
    ctx.ellipse(cx, y + h * 0.62, w * 0.09, h * 0.11, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // rect → 爆撃機（横長・重装甲・複数エンジン）
  private _drawBomber(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    const bc = this.bomberColors
    const cx = x + w / 2

    ctx.fillStyle = bc.body
    this._roundRect(ctx, x, y + h * 0.40, w, h * 0.22, 3)
    ctx.fill()

    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, bc.bodyEdge)
    grad.addColorStop(1, bc.body)
    ctx.fillStyle = grad
    this._roundRect(ctx, x + w * 0.06, y + h * 0.30, w * 0.88, h * 0.45, Math.min(6, h * 0.2))
    ctx.fill()

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(cx, y + h)
    ctx.lineTo(cx - w * 0.10, y + h * 0.72)
    ctx.lineTo(cx + w * 0.10, y + h * 0.72)
    ctx.closePath(); ctx.fill()

    ctx.fillStyle = bc.engine
    for (const fx of [0.22, 0.40, 0.60, 0.78]) {
      ctx.beginPath()
      ctx.arc(x + w * fx, y + h * 0.62, Math.max(2, w * 0.03), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // pillar → ミサイル（細長い円筒・後方に炎）
  private _drawMissile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    const mc = this.missileColors
    const cx = x + w / 2

    const jitter = Math.random() * 5
    ctx.fillStyle = mc.flame
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.moveTo(x + w * 0.30, y); ctx.lineTo(cx, y - 12 - jitter); ctx.lineTo(x + w * 0.70, y)
    ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1

    const grad = ctx.createLinearGradient(x, y, x + w, y)
    grad.addColorStop(0, color)
    grad.addColorStop(0.5, mc.body)
    grad.addColorStop(1, color)
    ctx.fillStyle = grad
    ctx.fillRect(x + w * 0.20, y + h * 0.12, w * 0.60, h * 0.72)

    ctx.fillStyle = mc.body
    ctx.beginPath()
    ctx.moveTo(x + w * 0.20, y + h * 0.20); ctx.lineTo(x, y + h * 0.05); ctx.lineTo(x + w * 0.20, y + h * 0.05); ctx.closePath()
    ctx.moveTo(x + w * 0.80, y + h * 0.20); ctx.lineTo(x + w, y + h * 0.05); ctx.lineTo(x + w * 0.80, y + h * 0.05); ctx.closePath()
    ctx.fill()

    ctx.fillStyle = mc.head
    ctx.beginPath()
    ctx.moveTo(cx, y + h); ctx.lineTo(x + w * 0.20, y + h * 0.84); ctx.lineTo(x + w * 0.80, y + h * 0.84)
    ctx.closePath(); ctx.fill()
  }

  // enemy_hp 用セグメント式 HP バー
  private _drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, maxHp: number): void {
    const b    = this.hpBar
    const segW = (w - b.segGap * (maxHp - 1)) / maxHp
    const barY = y - b.offsetY
    const color = hp / maxHp > b.threshold ? b.high : b.low
    for (let i = 0; i < maxHp; i++) {
      const segX = x + i * (segW + b.segGap)
      ctx.fillStyle = b.bg
      ctx.fillRect(segX, barY, segW, b.height)
      if (i < hp) {
        ctx.fillStyle = color
        ctx.fillRect(segX, barY, segW, b.height)
      }
    }
  }
}

export default new AerialStgPlugin()
