/**
 * genres/SurvivalPlugin.ts
 * 'survival' ジャンル（サバイバルゲーム）のプラグイン。
 *
 * 荒廃した森林。暗い緑・茶色で生存感を演出。
 * HPアイテムが多め、危険なハザードが多めの構成。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class SurvivalPlugin extends GenrePluginBase {
  readonly id: GenreId = 'survival'

  readonly skyColors    = ['#050e05', '#0a1a08'] as const
  readonly groundColors = ['#0d1a09', '#070f05'] as const
  readonly farLayerColor  = '#0a1a08'
  readonly midLayerColor  = '#081408'
  readonly starColor: string | undefined = undefined

  readonly palette = {
    danger: '#cc4400', dangerGlow: '#ff7722',
    safe:   '#22aa44', safeGlow:   '#66ff88',
  }

  readonly hazardConfig = {
    glowBlur: 8,
    pulseSpeed: 0.9,
    pulseAmplitude: 0.06,
  }

  readonly groundLineAlpha = 0.12
  readonly groundDashAlpha = 0.06

  readonly particleColors = {
    hit:   '#ff6600',
    death: ['#cc3300', '#ff6600', '#884400', '#442200'] as readonly string[],
    jump:  'rgba(80,120,40,0.6)',
    land:  'rgba(60,100,30,0.5)',
  }

  // HPアイテムが多め、障害物はタフ寄り
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 6, wRange: [28, 52], hRange: [38, 65], safeChance: 0.30 },
    { shape: 'pillar', placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [16, 24], hRange: [70, 130], safeChance: 0.20 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 4, wRange: [25, 42], hRange: [35, 55], safeChance: 0.15 },
    { shape: 'rect',   placement: 'air',    weightStart: 0, weightEnd: 2, wRange: [26, 45], hRange: [25, 40], safeChance: 0.25 },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 霧がかかった暗い丘シルエット
    ctx.globalAlpha = 0.18
    ctx.fillStyle = this.farLayerColor
    ctx.beginPath()
    ctx.moveTo(0, gY)
    const step = 30
    for (let sx = -step; sx <= W + step; sx += step) {
      const wx = sx - offsetX
      const mh = Math.sin(wx * 0.004) * 70 + Math.sin(wx * 0.009) * 35 + Math.sin(wx * 0.019) * 18 + 95
      ctx.lineTo(sx, gY - mh)
    }
    ctx.lineTo(W + step, gY)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 枯れ木のシルエット
    ctx.globalAlpha = 0.5
    ctx.fillStyle = this.midLayerColor
    const sector = Math.floor(offsetX / 180)
    for (let s = sector - 1; s <= sector + 5; s++) {
      const h = (s * 1783) & 0xffff
      const tx = s * 180 - offsetX + (h % 100)
      const treeH = 55 + (h >> 4) % 60
      const trunkW = 5 + (h >> 8) % 5
      // 幹
      ctx.fillRect(tx - trunkW / 2, gY - treeH, trunkW, treeH * 0.8)
      // 枝（歪んだ）
      const branchCount = 2 + (h & 0x3)
      ctx.strokeStyle = this.midLayerColor
      ctx.lineWidth = 2.5
      for (let b = 0; b < branchCount; b++) {
        const bh2 = (s * 41 + b * 97) & 0xff
        const branchY = gY - treeH * 0.4 - b * treeH * 0.12
        const bLen = 15 + bh2 % 20
        const bDir = bh2 < 128 ? -1 : 1
        ctx.beginPath()
        ctx.moveTo(tx, branchY)
        ctx.lineTo(tx + bDir * bLen, branchY - bLen * 0.5)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    const t = runCycle * Math.PI * 2
    const legSwing = onGround ? Math.sin(t) * 10 : 0

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.38, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // 体（サバイバー・ダークカラー）
    ctx.fillStyle = '#3a5228'
    this._roundRect(ctx, 3, h * 0.4, w - 6, h * 0.38, 3)
    ctx.fill()

    // リュック
    ctx.fillStyle = '#2a3c1a'
    ctx.fillRect(w * 0.1, h * 0.35, w * 0.22, h * 0.36)

    // 頭
    ctx.fillStyle = '#c4945a'
    ctx.beginPath()
    ctx.arc(w * 0.58, h * 0.22, h * 0.2, 0, Math.PI * 2)
    ctx.fill()

    // ヘルメット
    ctx.fillStyle = '#2a4a18'
    ctx.beginPath()
    ctx.arc(w * 0.58, h * 0.17, h * 0.16, Math.PI, 0)
    ctx.fill()
    ctx.fillRect(w * 0.4, h * 0.17, w * 0.36, 5)

    // 目
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.arc(w * 0.67, h * 0.22, 2.5, 0, Math.PI * 2)
    ctx.fill()

    // 脚
    ctx.lineWidth = 5.5; ctx.strokeStyle = '#2a3c1a'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.76); ctx.lineTo(w * 0.28 - legSwing * 0.4, h * 0.98); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.60, h * 0.76); ctx.lineTo(w * 0.72 + legSwing * 0.4, h * 0.98); ctx.stroke()
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

export default new SurvivalPlugin()
