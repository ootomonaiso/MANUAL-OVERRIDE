/**
 * genres/DungeonPlugin.ts
 * 'dungeon' ジャンル（ダンジョン探索）のプラグイン。
 *
 * 石造りの地下迷宮。松明のオレンジと黒の闇。
 * RPGに似るが、より閉塞感・探索感を強調。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class DungeonPlugin extends GenrePluginBase {
  readonly id: GenreId = 'dungeon'

  readonly skyColors    = ['#060500', '#0e0900'] as const
  readonly groundColors = ['#120c00', '#0a0800'] as const
  readonly farLayerColor  = '#0a0700'
  readonly midLayerColor  = '#150e02'
  readonly starColor: string | undefined = undefined

  readonly palette = {
    danger: '#bb5500', dangerGlow: '#ff8800',
    safe:   '#ddcc44', safeGlow:   '#ffee88',
  }

  readonly hazardConfig = {
    glowBlur: 10,
    pulseSpeed: 0.8,
    pulseAmplitude: 0.07,
  }

  readonly groundLineAlpha = 0.10
  readonly groundDashAlpha = 0.05

  readonly particleColors = {
    hit:   '#ff8800',
    death: ['#cc5500', '#ff9900', '#884400', '#ffcc00'] as readonly string[],
    jump:  'rgba(150,90,10,0.55)',
    land:  'rgba(100,60,5,0.5)',
  }

  // 石板・落とし穴・宝箱・罠が混在
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 6, wRange: [26, 50], hRange: [36, 62], safeChance: 0.25 },
    { shape: 'pillar', placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [16, 24], hRange: [65, 120], safeChance: 0.15 },
    { shape: 'spike',  placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [24, 42], hRange: [36, 58], safeChance: 0.10 },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 3, wRange: [28, 46], hRange: [24, 40], safeChance: 0.30 },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 遠景：石造りの壁と天井（暗闇の奥行き）
    ctx.globalAlpha = 0.25
    ctx.fillStyle = this.farLayerColor

    // 天井ブロック
    ctx.fillRect(0, 0, W, gY * 0.18)

    // 壁のブロック目地（横線）
    ctx.strokeStyle = '#1a1000'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.1
    for (let gy = 0; gy < gY * 0.18; gy += 14) {
      ctx.beginPath()
      ctx.moveTo(0, gy)
      ctx.lineTo(W, gy)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 石壁の柱・アーチ
    ctx.globalAlpha = 0.65
    ctx.fillStyle = '#1a1200'
    const sector = Math.floor(offsetX / 200)
    for (let s = sector - 1; s <= sector + 4; s++) {
      const h = (s * 2017) & 0xffff
      const px = s * 200 - offsetX + (h % 100)
      const pillarH = 70 + (h >> 4) % 40
      // 石柱
      ctx.fillRect(px - 9, gY - pillarH, 18, pillarH)
      // 柱頭装飾
      ctx.fillRect(px - 12, gY - pillarH, 24, 8)
    }
    ctx.globalAlpha = 1

    // 松明の光（壁に固定）
    const t = performance.now() / 700
    const torchSector = Math.floor(offsetX / 200)
    for (let s = torchSector - 1; s <= torchSector + 4; s++) {
      const h = (s * 2017) & 0xffff
      const px = s * 200 - offsetX + (h % 100)
      const pillarH = 70 + (h >> 4) % 40

      const flicker = 0.6 + Math.sin(t * 1.3 + s * 2.1) * 0.25

      // 照らす半円（地面方向）
      ctx.globalAlpha = flicker * 0.08
      const grad = ctx.createRadialGradient(px, gY - pillarH + 2, 0, px, gY - pillarH + 2, 70)
      grad.addColorStop(0, '#ff8800')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(px, gY - pillarH + 2, 70, 0, Math.PI * 2)
      ctx.fill()

      // 炎本体
      ctx.globalAlpha = flicker * 0.85
      ctx.fillStyle = '#ff6600'
      ctx.beginPath()
      ctx.arc(px, gY - pillarH - 2, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = flicker * 0.6
      ctx.fillStyle = '#ffcc00'
      ctx.beginPath()
      ctx.arc(px, gY - pillarH - 4, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // 石畳（地面パターン）
    ctx.globalAlpha = 0.12
    ctx.strokeStyle = '#332200'
    ctx.lineWidth = 1
    const tileW = 40
    const startX = -(offsetX % tileW)
    for (let tx = startX; tx <= W; tx += tileW) {
      ctx.beginPath()
      ctx.moveTo(tx, gY - 2)
      ctx.lineTo(tx, gY)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const legSwing = Math.sin(runCycle * Math.PI * 2) * 8

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.36, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // ローブ（ダンジョン探索者）
    ctx.fillStyle = '#3a2200'
    this._roundRect(ctx, 4, h * 0.38, w - 8, h * 0.56, 4)
    ctx.fill()

    // ローブのフード線
    ctx.strokeStyle = '#5a3800'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(w * 0.3, h * 0.38)
    ctx.lineTo(w * 0.5, h * 0.5)
    ctx.lineTo(w * 0.72, h * 0.38)
    ctx.stroke()

    // 頭（フード）
    ctx.fillStyle = '#2a1800'
    ctx.beginPath()
    ctx.arc(w * 0.55, h * 0.22, h * 0.2, 0, Math.PI * 2)
    ctx.fill()

    // 目（光るアイ）
    const eyeGlow = `rgba(255,200,50,0.9)`
    ctx.fillStyle = eyeGlow
    ctx.shadowColor = '#ffcc00'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(w * 0.62, h * 0.21, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // ランタン（左手に持つ）
    ctx.fillStyle = '#554400'
    ctx.fillRect(w * 0.0, h * 0.48, 10, 14)
    const lanternFlicker = 0.6 + Math.sin(performance.now() / 400) * 0.2
    ctx.globalAlpha = lanternFlicker * 0.5
    ctx.fillStyle = '#ffaa00'
    ctx.beginPath()
    ctx.arc(5, h * 0.48 + 7, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // 脚
    ctx.lineWidth = 5.5; ctx.strokeStyle = '#2a1800'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.9); ctx.lineTo(w * 0.28 - legSwing * 0.35, h + 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.62, h * 0.9); ctx.lineTo(w * 0.72 + legSwing * 0.35, h + 2); ctx.stroke()
  }
}

export default new DungeonPlugin()
