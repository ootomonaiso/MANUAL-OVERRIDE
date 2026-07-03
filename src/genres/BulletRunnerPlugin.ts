/**
 * genres/BulletRunnerPlugin.ts
 * 'bullet_runner' ジャンル（弾幕ランナー）のプラグイン。
 *
 * ネオンで輝くサイバーシティの夜。自動走行 + 射撃。
 * 高速感・スタイリッシュ・カラフルなビジュアル。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class BulletRunnerPlugin extends GenrePluginBase {
  readonly id: GenreId = 'bullet_runner'

  readonly skyColors    = ['#060010', '#100025'] as const
  readonly groundColors = ['#120030', '#0a001a'] as const
  readonly farLayerColor  = '#110022'
  readonly midLayerColor  = '#0e001c'
  readonly starColor      = '#ff88ff'

  readonly palette = {
    danger: '#ff2266', dangerGlow: '#ff66aa',
    safe:   '#00ffcc', safeGlow:   '#66ffee',
  }

  readonly starConfig = {
    density: 14,
    sizeRange: [1, 2] as [number, number],
    alphaRange: [0.3, 0.7] as [number, number],
  }

  readonly parallax = {
    stars: 0.025,
    far:   0.1,
    mid:   0.3,
  }

  readonly hazardConfig = {
    glowBlur: 18,
    pulseSpeed: 2.5,
    pulseAmplitude: 0.15,
  }

  readonly groundLineAlpha = 0.3
  readonly groundDashAlpha = 0.15

  readonly particleColors = {
    hit:   '#ff44aa',
    death: ['#ff0066', '#ff4400', '#ffff00', '#cc00ff'] as readonly string[],
    jump:  'rgba(200,0,255,0.6)',
    land:  'rgba(0,255,180,0.5)',
  }

  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 5, weightEnd: 4, wRange: [22, 40], hRange: [30, 55] },
    { shape: 'rect',    placement: 'air',    weightStart: 3, weightEnd: 5, wRange: [25, 42], hRange: [25, 42], safeChance: 0.2 },
    { shape: 'diamond', placement: 'float',  weightStart: 2, weightEnd: 5, wRange: [26, 36], hRange: [26, 36] },
    { shape: 'spike',   placement: 'ground', weightStart: 1, weightEnd: 4, wRange: [22, 36], hRange: [35, 55] },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // ネオン都市の遠景シルエット
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#080015'
    const sector = Math.floor(offsetX / 500)
    ctx.beginPath(); ctx.moveTo(0, gY)
    for (let sx = 0; sx <= W; sx += 2) {
      const wx = sx - offsetX * 0.08
      const bh = (Math.sin(wx * 0.008) * 0.5 + 0.5) * 120 + 60 +
                 (Math.sin(wx * 0.02 + 1) * 0.5 + 0.5) * 40
      ctx.lineTo(sx, gY - bh)
    }
    ctx.lineTo(W, gY); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1

    // ネオン縦ライン（ビル窓）
    ctx.globalAlpha = 0.06
    for (let s = sector - 1; s <= sector + 3; s++) {
      const h2 = (s * 2011) & 0xffff
      const bx = s * 500 - offsetX * 0.08 + (h2 % 300)
      const colors = ['#ff0088', '#0088ff', '#00ffcc', '#ff8800']
      ctx.fillStyle = colors[h2 % colors.length]
      ctx.fillRect(bx, gY * 0.35, 2, gY * 0.5)
    }
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 近景ビル（ネオン看板付き）
    ctx.globalAlpha = 0.7
    ctx.fillStyle = '#0a0018'
    const sector = Math.floor(offsetX / 300)
    for (let s = sector - 1; s <= sector + 3; s++) {
      const h2 = (s * 1447) & 0xffff
      const bx = s * 300 - offsetX + (h2 % 150)
      const bh = 60 + (h2 >> 4) % 100
      const bw = 28 + (h2 >> 8) % 40
      ctx.fillRect(bx, gY - bh, bw, bh)

      // ネオン看板の光
      ctx.globalAlpha = 0.3
      const neonColors = ['#ff0088', '#00ccff', '#ff6600']
      ctx.fillStyle = neonColors[(s + h2) % neonColors.length]
      ctx.fillRect(bx + 2, gY - bh + 8, bw - 4, 6)
      ctx.globalAlpha = 0.7
    }
    ctx.globalAlpha = 1

    // 流れる横ネオンライン（地面近く）
    const t = performance.now() / 1000
    const lineAlpha = 0.12 + Math.sin(t * 3) * 0.04
    ctx.globalAlpha = lineAlpha
    ctx.strokeStyle = '#cc00ff'
    ctx.lineWidth = 1.5
    ctx.setLineDash([30, 20])
    ctx.beginPath()
    ctx.moveTo(-offsetX * 0.5 % 300 - 100, gY - 40)
    ctx.lineTo(W + 100, gY - 40)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const t = performance.now() / 80
    const legSwing = Math.sin(runCycle * Math.PI * 2) * 9

    // 影
    ctx.fillStyle = 'rgba(200,0,200,0.15)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.4, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // ボディ（サイバースーツ）
    ctx.fillStyle = '#1a0040'
    this._roundRect(ctx, 2, h * 0.36, w - 4, h * 0.4, 4)
    ctx.fill()

    // ネオンアーマーライン
    ctx.strokeStyle = '#ff00cc'
    ctx.lineWidth = 1.5
    ctx.shadowColor = '#ff00cc'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(4, h * 0.42)
    ctx.lineTo(w * 0.45, h * 0.38)
    ctx.lineTo(w - 4, h * 0.42)
    ctx.stroke()
    ctx.shadowBlur = 0

    // 頭（ヘルメット）
    ctx.fillStyle = '#0a0020'
    ctx.beginPath()
    ctx.arc(w * 0.55, h * 0.2, h * 0.21, 0, Math.PI * 2)
    ctx.fill()

    // バイザー（光るシールド）
    const shimmer = `hsl(${(t * 2 + 180) % 360}, 100%, 65%)`
    ctx.fillStyle = shimmer
    ctx.globalAlpha = 0.8
    ctx.beginPath()
    ctx.arc(w * 0.6, h * 0.19, h * 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // 脚
    ctx.lineWidth = 5.5; ctx.strokeStyle = '#2a0050'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.74); ctx.lineTo(w * 0.28 - legSwing * 0.4, h * 0.98); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.60, h * 0.74); ctx.lineTo(w * 0.72 + legSwing * 0.4, h * 0.98); ctx.stroke()

    // 脚のネオン
    ctx.strokeStyle = '#8800ff'
    ctx.lineWidth = 1.5
    ctx.shadowColor = '#8800ff'; ctx.shadowBlur = 6
    ctx.beginPath(); ctx.moveTo(w * 0.28 - legSwing * 0.4, h * 0.98 - 2); ctx.lineTo(w * 0.28 - legSwing * 0.4 + 10, h * 0.98 - 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.72 + legSwing * 0.4 - 10, h * 0.98 - 2); ctx.lineTo(w * 0.72 + legSwing * 0.4, h * 0.98 - 2); ctx.stroke()
    ctx.shadowBlur = 0
  }
}

export default new BulletRunnerPlugin()
