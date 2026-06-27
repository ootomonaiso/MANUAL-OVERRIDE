/**
 * genres/RacingPlugin.ts
 * 'racing' ジャンル（レーシングゲーム）のプラグイン。
 *
 * 深夜のサーキット。アスファルトとネオンの高速感。
 * スピード線・コーンバリケード・車のシルエット。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class RacingPlugin extends GenrePluginBase {
  readonly id: GenreId = 'racing'

  readonly skyColors    = ['#08060a', '#100c14'] as const
  readonly groundColors = ['#1a1410', '#0f0a08'] as const
  readonly farLayerColor  = '#0e0a0c'
  readonly midLayerColor  = '#180e0a'
  readonly starColor      = '#ffee88'

  readonly palette = {
    danger: '#ff8800', dangerGlow: '#ffcc44',
    safe:   '#44ddff', safeGlow:   '#88eeff',
  }

  readonly hazardConfig = {
    glowBlur: 12,
    pulseSpeed: 1.8,
    pulseAmplitude: 0.1,
  }

  readonly groundLineAlpha = 0.35
  readonly groundDashAlpha = 0.18

  readonly particleColors = {
    hit:   '#ff9900',
    death: ['#ff6600', '#ffcc00', '#ff3300', '#cc4400'] as readonly string[],
    jump:  'rgba(255,160,0,0.5)',
    land:  'rgba(200,100,0,0.45)',
  }

  // 交通コーン・バリア・速度注意標識
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 7, weightEnd: 5, wRange: [18, 36], hRange: [32, 55], safeChance: 0.20 },
    { shape: 'pillar', placement: 'ground', weightStart: 4, weightEnd: 6, wRange: [12, 20], hRange: [50, 90], safeChance: 0.15 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 4, wRange: [20, 35], hRange: [28, 48], safeChance: 0.10 },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 3, wRange: [24, 40], hRange: [22, 36], safeChance: 0.25 },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 遠景のサーキット看板・観客スタンドシルエット
    ctx.globalAlpha = 0.14
    ctx.fillStyle = this.farLayerColor
    ctx.beginPath()
    ctx.moveTo(0, gY)
    const step = 60
    for (let sx = -step; sx <= W + step; sx += step) {
      const wx = sx - offsetX * 0.06
      const bh = 30 + ((wx * 0.007 | 0) & 0xf) * 8
      ctx.lineTo(sx, gY - bh)
    }
    ctx.lineTo(W + step, gY)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 遠景のスピードライン（遠くに流れる光の帯）
    const t = performance.now() / 1000
    ctx.globalAlpha = 0.07
    ctx.strokeStyle = '#ff9922'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      const lineY = gY - 80 - i * 30
      const phase = (t * 0.4 + i * 0.3) % 1
      const lx = W * phase - offsetX * 0.04 % W
      ctx.beginPath()
      ctx.moveTo(lx, lineY)
      ctx.lineTo(lx + 80, lineY)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 道路の白線（センターライン）
    ctx.globalAlpha = 0.55
    ctx.strokeStyle = '#ffffcc'
    ctx.lineWidth = 3
    ctx.setLineDash([40, 30])
    ctx.lineDashOffset = -(offsetX % 70)
    ctx.beginPath()
    ctx.moveTo(0, gY - 18)
    ctx.lineTo(W, gY - 18)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // 路肩のガードレールシルエット
    ctx.globalAlpha = 0.45
    ctx.fillStyle = '#2a1a10'
    const sector = Math.floor(offsetX / 240)
    for (let s = sector - 1; s <= sector + 5; s++) {
      const h = (s * 1663) & 0xffff
      const px = s * 240 - offsetX + (h % 80)
      // ポールのみ（小さな矩形）
      ctx.fillRect(px, gY - 28, 6, 28)
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const t = performance.now() / 60
    const wheelBounce = Math.abs(Math.sin(runCycle * Math.PI * 4)) * 1.5

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 3 - wheelBounce, w * 0.42, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // 車体（スポーツカー）
    ctx.fillStyle = '#cc4400'
    this._roundRect(ctx, 4, h * 0.45, w - 8, h * 0.38, 5)
    ctx.fill()

    // ルーフ
    ctx.fillStyle = '#aa3300'
    this._roundRect(ctx, w * 0.22, h * 0.22, w * 0.56, h * 0.26, 4)
    ctx.fill()

    // フロントガラス
    ctx.fillStyle = '#88ccff'
    ctx.globalAlpha = 0.75
    this._roundRect(ctx, w * 0.45, h * 0.24, w * 0.28, h * 0.2, 3)
    ctx.fill()
    ctx.globalAlpha = 1

    // ヘッドライト（発光）
    const hlGlow = `hsl(50, 100%, ${65 + Math.sin(t) * 5}%)`
    ctx.fillStyle = hlGlow
    ctx.shadowColor = '#ffee44'
    ctx.shadowBlur = 10
    ctx.fillRect(w - 7, h * 0.5, 6, 10)
    ctx.shadowBlur = 0

    // ホイール
    const wheelY = h * 0.83 - wheelBounce
    ctx.fillStyle = '#222222'
    ctx.beginPath(); ctx.arc(w * 0.25, wheelY, h * 0.13, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(w * 0.75, wheelY, h * 0.13, 0, Math.PI * 2); ctx.fill()

    // ホイールハブ
    ctx.fillStyle = '#aaaaaa'
    ctx.beginPath(); ctx.arc(w * 0.25, wheelY, h * 0.06, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(w * 0.75, wheelY, h * 0.06, 0, Math.PI * 2); ctx.fill()
  }
}

export default new RacingPlugin()
