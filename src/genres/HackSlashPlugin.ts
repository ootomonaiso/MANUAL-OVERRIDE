/**
 * genres/HackSlashPlugin.ts
 * 'hack_slash' ジャンル（ハックアンドスラッシュ）のプラグイン。
 *
 * 血染めの荒廃した戦場。深紅と黒の世界。
 * 剣士がコンボを繋ぎ続ける激しい戦闘スタイル。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class HackSlashPlugin extends GenrePluginBase {
  readonly id: GenreId = 'hack_slash'

  readonly skyColors    = ['#0a0000', '#150000'] as const
  readonly groundColors = ['#1a0000', '#100000'] as const
  readonly farLayerColor  = '#0e0000'
  readonly midLayerColor  = '#1a0200'
  readonly starColor      = '#ff6644'

  readonly palette = {
    danger: '#dd0000', dangerGlow: '#ff4422',
    safe:   '#ffaa00', safeGlow:   '#ffdd66',
  }

  readonly hazardConfig = {
    glowBlur: 16,
    pulseSpeed: 2.0,
    pulseAmplitude: 0.14,
  }

  readonly groundLineAlpha = 0.20
  readonly groundDashAlpha = 0.10

  readonly particleColors = {
    hit:   '#ff1100',
    death: ['#cc0000', '#ff4400', '#880000', '#ff8844'] as readonly string[],
    jump:  'rgba(220,30,0,0.6)',
    land:  'rgba(160,10,0,0.55)',
  }

  // 密度高め・敵ウェーブ感。アイテムドロップあり
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 7, weightEnd: 6, wRange: [24, 46], hRange: [36, 60], safeChance: 0.18 },
    { shape: 'spike',   placement: 'ground', weightStart: 5, weightEnd: 7, wRange: [22, 40], hRange: [35, 58], safeChance: 0.12 },
    { shape: 'diamond', placement: 'float',  weightStart: 3, weightEnd: 5, wRange: [26, 38], hRange: [26, 38], safeChance: 0.45 },
    { shape: 'rect',    placement: 'air',    weightStart: 2, weightEnd: 4, wRange: [28, 48], hRange: [26, 42], safeChance: 0.20 },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 遠景：廃墟の城壁・崩れた塔
    ctx.globalAlpha = 0.18
    ctx.fillStyle = this.farLayerColor
    ctx.beginPath()
    ctx.moveTo(0, gY)
    const step = 50
    for (let sx = -step; sx <= W + step; sx += step) {
      const wx = sx - offsetX * 0.06
      const mh = Math.abs(Math.sin(wx * 0.005)) * 90 +
                 Math.abs(Math.sin(wx * 0.013)) * 40 + 30
      ctx.lineTo(sx, gY - mh)
    }
    ctx.lineTo(W + step, gY)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 血の月（遠景に大きな赤い月）
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#880000'
    ctx.beginPath()
    ctx.arc(W * 0.75, gY * 0.25, 60, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.06
    ctx.fillStyle = '#ff2200'
    ctx.beginPath()
    ctx.arc(W * 0.75, gY * 0.25, 80, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 中景：壊れた柱・廃墟の壁
    ctx.globalAlpha = 0.6
    ctx.fillStyle = '#220000'
    const sector = Math.floor(offsetX / 190)
    for (let s = sector - 1; s <= sector + 5; s++) {
      const h = (s * 1789) & 0xffff
      const px = s * 190 - offsetX + (h % 90)
      const pillarH = 55 + (h >> 4) % 70
      const crumble = (h >> 10) & 0x3  // 0~3の崩れ具合

      ctx.fillRect(px - 8, gY - pillarH, 16, pillarH)

      // 崩れた上部
      if (crumble > 0) {
        ctx.fillStyle = '#1a0000'
        for (let c = 0; c < crumble + 1; c++) {
          const cw = 4 + (h >> (c * 3) & 0x5)
          const cx2 = px - 6 + c * 5
          ctx.fillRect(cx2, gY - pillarH + 4, cw, 8)
        }
        ctx.fillStyle = '#220000'
      }
    }
    ctx.globalAlpha = 1

    // 舞い散る血しぶき状パーティクル（静的）
    const t = performance.now() / 2000
    ctx.globalAlpha = 0.07
    ctx.fillStyle = '#cc0000'
    for (let i = 0; i < 10; i++) {
      const px = ((i * 130 + offsetX * 0.3 + t * 20) % (W + 60)) - 30
      const py = gY - 50 - (i * 37 % 100)
      ctx.beginPath()
      ctx.arc(px, py, 2 + (i % 3), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    const t = performance.now() / 70
    const legSwing = onGround ? Math.sin(runCycle * Math.PI * 2) * 10 : 0
    const swordAngle = onGround
      ? Math.sin(runCycle * Math.PI * 4) * 0.3
      : -0.5

    // 影
    ctx.fillStyle = 'rgba(80,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.38, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // 脚（黒鎧）
    ctx.lineWidth = 6; ctx.strokeStyle = '#220000'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.75); ctx.lineTo(w * 0.26 - legSwing * 0.4, h + 1); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.60, h * 0.75); ctx.lineTo(w * 0.74 + legSwing * 0.4, h + 1); ctx.stroke()

    // 胴体（ダークアーマー）
    ctx.fillStyle = '#1a0000'
    this._roundRect(ctx, 3, h * 0.36, w - 6, h * 0.42, 3)
    ctx.fill()

    // 赤いルーン文様
    ctx.strokeStyle = '#880000'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(w * 0.28, h * 0.45)
    ctx.lineTo(w * 0.5, h * 0.38)
    ctx.lineTo(w * 0.72, h * 0.45)
    ctx.stroke()

    // 頭（ダークヘルム）
    ctx.fillStyle = '#180000'
    ctx.beginPath()
    ctx.arc(w * 0.55, h * 0.2, h * 0.2, 0, Math.PI * 2)
    ctx.fill()

    // 目（赤く光る）
    ctx.fillStyle = '#ff2200'
    ctx.shadowColor = '#ff0000'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(w * 0.62, h * 0.2, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // 大剣（右側・回転アニメ）
    ctx.save()
    ctx.translate(w * 0.85, h * 0.45)
    ctx.rotate(swordAngle)
    // 刀身
    ctx.strokeStyle = '#ccccee'
    ctx.lineWidth = 4
    ctx.shadowColor = '#aabbff'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(24, -28)
    ctx.stroke()
    ctx.shadowBlur = 0
    // 刃の光
    const bladeShimmer = `hsl(${220 + Math.sin(t * 0.05) * 20}, 80%, 75%)`
    ctx.strokeStyle = bladeShimmer
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(1, -2)
    ctx.lineTo(22, -26)
    ctx.stroke()
    ctx.globalAlpha = 1
    // 柄
    ctx.strokeStyle = '#553300'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(-4, 5)
    ctx.lineTo(4, -5)
    ctx.stroke()
    ctx.restore()
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }
}
