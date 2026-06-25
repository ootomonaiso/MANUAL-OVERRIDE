/**
 * genres/AquaticPlugin.ts
 * 'aquatic' ジャンル（水中アドベンチャー）のプラグイン。
 *
 * 深海の静寂。暗い青緑・生物発光・珊瑚礁。
 * ダイバーが深淵へ潜る探索スタイル。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class AquaticPlugin extends GenrePluginBase {
  readonly id: GenreId = 'aquatic'

  readonly skyColors    = ['#000a1a', '#001428'] as const
  readonly groundColors = ['#001430', '#000a20'] as const
  readonly farLayerColor  = '#001025'
  readonly midLayerColor  = '#001830'
  readonly starColor      = '#44ffdd'

  readonly palette = {
    danger: '#ff3366', dangerGlow: '#ff88aa',
    safe:   '#00ffcc', safeGlow:   '#66ffee',
  }

  readonly hazardConfig = {
    glowBlur: 10,
    pulseSpeed: 0.7,
    pulseAmplitude: 0.08,
  }

  readonly groundLineAlpha = 0.15
  readonly groundDashAlpha = 0.08

  readonly particleColors = {
    hit:   '#00ffdd',
    death: ['#0066ff', '#00ccaa', '#004488', '#00ffcc'] as readonly string[],
    jump:  'rgba(0,200,180,0.55)',
    land:  'rgba(0,120,160,0.45)',
  }

  // 珊瑚・岩礁・海流障害物。アイテム（宝）が浮いている
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 6, weightEnd: 5, wRange: [22, 42], hRange: [30, 55], safeChance: 0.30 },
    { shape: 'pillar',  placement: 'ground', weightStart: 3, weightEnd: 4, wRange: [14, 22], hRange: [55, 110], safeChance: 0.20 },
    { shape: 'spike',   placement: 'ground', weightStart: 2, weightEnd: 3, wRange: [20, 36], hRange: [28, 48], safeChance: 0.15 },
    { shape: 'diamond', placement: 'float',  weightStart: 2, weightEnd: 5, wRange: [24, 36], hRange: [24, 36], safeChance: 0.60 },
    { shape: 'rect',    placement: 'air',    weightStart: 1, weightEnd: 2, wRange: [22, 38], hRange: [20, 34], safeChance: 0.35 },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 遠景：深海底の岩山シルエット
    ctx.globalAlpha = 0.2
    ctx.fillStyle = this.farLayerColor
    ctx.beginPath()
    ctx.moveTo(0, gY)
    const step = 35
    for (let sx = -step; sx <= W + step; sx += step) {
      const wx = sx - offsetX * 0.05
      const mh = Math.sin(wx * 0.006) * 65 + Math.sin(wx * 0.014) * 30 + Math.sin(wx * 0.025) * 15 + 80
      ctx.lineTo(sx, gY - mh)
    }
    ctx.lineTo(W + step, gY)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // 光の柱（水面からの光）
    const t = performance.now() / 2000
    ctx.globalAlpha = 0.05
    ctx.fillStyle = '#88ddff'
    for (let i = 0; i < 5; i++) {
      const lx = ((i * W * 0.22 - offsetX * 0.02 + t * 60) % (W + 80)) - 40
      const beamW = 20 + i * 8
      ctx.beginPath()
      ctx.moveTo(lx - beamW / 2, 0)
      ctx.lineTo(lx + beamW / 2, 0)
      ctx.lineTo(lx + beamW, gY)
      ctx.lineTo(lx - beamW, gY)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 中景：珊瑚と海藻
    ctx.globalAlpha = 0.6
    const sector = Math.floor(offsetX / 160)
    for (let s = sector - 1; s <= sector + 5; s++) {
      const h = (s * 1531) & 0xffff
      const cx = s * 160 - offsetX + (h % 90)
      const coralH = 35 + (h >> 4) % 50
      const coralType = h & 0x3

      if (coralType === 0) {
        // ブランチ珊瑚（枝分かれ）
        ctx.strokeStyle = '#00664a'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cx, gY)
        ctx.lineTo(cx, gY - coralH)
        ctx.stroke()
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx, gY - coralH * 0.5)
        ctx.lineTo(cx - 12, gY - coralH * 0.8)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx, gY - coralH * 0.6)
        ctx.lineTo(cx + 10, gY - coralH * 0.85)
        ctx.stroke()
      } else if (coralType === 1) {
        // 海藻（くねくね）
        ctx.strokeStyle = '#004d33'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(cx, gY)
        for (let y = 0; y <= coralH; y += 8) {
          const wave = Math.sin(y * 0.3 + s) * 8
          ctx.lineTo(cx + wave, gY - y)
        }
        ctx.stroke()
      } else {
        // ファン珊瑚（扇形）
        ctx.fillStyle = '#003d55'
        ctx.fillRect(cx - 2, gY - coralH, 4, coralH)
        ctx.strokeStyle = '#005577'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(cx, gY - coralH, coralH * 0.35, Math.PI * 1.1, 0, false)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // 泡（上に流れる）
    const t = performance.now() / 1000
    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#66ccff'
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 120 + offsetX * 0.15) % W + W) % W
      const by = gY - 30 - ((t * (30 + i * 5) + i * 80) % (gY - 20))
      const br = 2 + (i % 3)
      ctx.beginPath()
      ctx.arc(bx, by, br, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const t = performance.now() / 80
    const swim = Math.sin(runCycle * Math.PI * 2) * 4

    // 影
    ctx.fillStyle = 'rgba(0,30,60,0.3)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.38, 3, 0, 0, Math.PI * 2)
    ctx.fill()

    // ダイバースーツ（青）
    ctx.fillStyle = '#0044aa'
    this._roundRect(ctx, 3, h * 0.36, w - 6, h * 0.44, 4)
    ctx.fill()

    // タンク（酸素ボンベ）
    ctx.fillStyle = '#226699'
    ctx.fillRect(w * 0.08, h * 0.34, w * 0.2, h * 0.38)

    // 頭（マスク）
    ctx.fillStyle = '#003377'
    ctx.beginPath()
    ctx.arc(w * 0.58, h * 0.2, h * 0.2, 0, Math.PI * 2)
    ctx.fill()

    // マスクガラス（透明感）
    ctx.fillStyle = '#88ccff'
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.arc(w * 0.62, h * 0.19, h * 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // フィン（足ひれ）
    ctx.fillStyle = '#0055cc'
    ctx.beginPath()
    ctx.moveTo(w * 0.32, h + swim)
    ctx.lineTo(w * 0.08, h + 10 + swim)
    ctx.lineTo(w * 0.26, h - 5 + swim)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(w * 0.62, h + swim)
    ctx.lineTo(w * 0.86, h + 10 + swim)
    ctx.lineTo(w * 0.68, h - 5 + swim)
    ctx.closePath()
    ctx.fill()

    // 気泡
    const bubbleAlpha = 0.5 + Math.sin(t * 0.05) * 0.2
    ctx.globalAlpha = bubbleAlpha
    ctx.fillStyle = '#aaddff'
    ctx.beginPath()
    ctx.arc(w * 0.78, h * 0.08, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(w * 0.85, h * 0.01, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

export default new AquaticPlugin()
