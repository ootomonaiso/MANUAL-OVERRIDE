/**
 * genres/ArenaPlugin.ts
 * 'arena' ジャンル（アリーナバトル）のプラグイン。
 *
 * 暗闘技場。松明の橙色と血の赤。
 * 重厚なアーチ・砂地・鎧の戦士。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { BOSS } from '../data/tunables'

export class ArenaPlugin extends GenrePluginBase {
  readonly id: GenreId = 'arena'

  readonly skyColors    = ['#0a0000', '#180000'] as const
  readonly groundColors = ['#1a0a00', '#120600'] as const
  readonly farLayerColor  = '#140200'
  readonly midLayerColor  = '#1c0a00'
  readonly starColor      = '#ff4422'

  readonly palette = {
    danger: '#cc0000', dangerGlow: '#ff4422',
    safe:   '#ffaa00', safeGlow:   '#ffdd66',
  }

  readonly hazardConfig = {
    glowBlur: 14,
    pulseSpeed: 1.4,
    pulseAmplitude: 0.12,
  }

  readonly groundLineAlpha = 0.18
  readonly groundDashAlpha = 0.09

  readonly particleColors = {
    hit:   '#ff2200',
    death: ['#cc0000', '#ff4400', '#880000', '#ff8800'] as readonly string[],
    jump:  'rgba(200,60,0,0.55)',
    land:  'rgba(150,30,0,0.5)',
  }

  // 大型の敵兵・柱・障壁が多め
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 6, wRange: [30, 58], hRange: [42, 70], safeChance: 0.15 },
    { shape: 'pillar', placement: 'ground', weightStart: 4, weightEnd: 6, wRange: [18, 26], hRange: [80, 140], safeChance: 0.10 },
    { shape: 'spike',  placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [28, 46], hRange: [40, 62], safeChance: 0.10 },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 3, wRange: [30, 50], hRange: [28, 44], safeChance: 0.20 },
    // ボス: 道中はほぼ出現せず、距離が伸びるごとに稀に出現する大型の敵
    { shape: 'rect',   placement: 'ground', weightStart: 0, weightEnd: 0.5, wRange: [BOSS.bossWidth, BOSS.bossWidth], hRange: [BOSS.bossHeight, BOSS.bossHeight], safeChance: 0, hpOverride: BOSS.bossHp, isBoss: true },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 闘技場のアーチのシルエット（遠景）
    ctx.globalAlpha = 0.22
    ctx.fillStyle = this.farLayerColor
    const archSpan = 200
    const sector = Math.floor(offsetX * 0.06 / archSpan)
    for (let s = sector - 1; s <= sector + 4; s++) {
      const ax = s * archSpan - offsetX * 0.06 + 30
      const archH = 130
      const archW = archSpan * 0.75
      // 柱
      ctx.fillRect(ax - 4, gY - archH, 8, archH)
      ctx.fillRect(ax + archW - 4, gY - archH, 8, archH)
      // アーチ上部
      ctx.beginPath()
      ctx.arc(ax + archW / 2, gY - archH, archW / 2, Math.PI, 0)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 中景：松明と石柱
    ctx.globalAlpha = 0.55
    ctx.fillStyle = this.midLayerColor
    const sector = Math.floor(offsetX / 180)
    for (let s = sector - 1; s <= sector + 5; s++) {
      const h = (s * 1873) & 0xffff
      const px = s * 180 - offsetX + (h % 80)
      const pillarH = 60 + (h >> 4) % 50
      ctx.fillRect(px - 7, gY - pillarH, 14, pillarH)
    }
    ctx.globalAlpha = 1

    // 松明の炎エフェクト
    const t = performance.now() / 800
    const torchSector = Math.floor(offsetX / 180)
    for (let s = torchSector - 1; s <= torchSector + 5; s++) {
      const h = (s * 1873) & 0xffff
      const px = s * 180 - offsetX + (h % 80)
      const pillarH = 60 + (h >> 4) % 50
      const flicker = 0.5 + Math.sin(t + s) * 0.3
      ctx.globalAlpha = flicker * 0.6
      ctx.fillStyle = '#ff8800'
      ctx.beginPath()
      ctx.arc(px, gY - pillarH - 8, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = flicker * 0.3
      ctx.fillStyle = '#ffdd00'
      ctx.beginPath()
      ctx.arc(px, gY - pillarH - 10, 4, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const legSwing = Math.sin(runCycle * Math.PI * 2) * 9

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.38, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // 鎧の脚
    ctx.lineWidth = 6; ctx.strokeStyle = '#554433'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(w * 0.36, h * 0.75); ctx.lineTo(w * 0.24 - legSwing * 0.4, h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.60, h * 0.75); ctx.lineTo(w * 0.74 + legSwing * 0.4, h); ctx.stroke()

    // 胸鎧（グラディエーター）
    ctx.fillStyle = '#884422'
    this._roundRect(ctx, 4, h * 0.38, w - 8, h * 0.4, 3)
    ctx.fill()

    // 金属バンド
    ctx.strokeStyle = '#cc9933'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(4, h * 0.52)
    ctx.lineTo(w - 4, h * 0.52)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(4, h * 0.64)
    ctx.lineTo(w - 4, h * 0.64)
    ctx.stroke()

    // 頭（ヘルメット）
    ctx.fillStyle = '#774411'
    ctx.beginPath()
    ctx.arc(w * 0.55, h * 0.22, h * 0.19, 0, Math.PI * 2)
    ctx.fill()

    // ヘルメット頂部の飾り羽根（赤）
    ctx.fillStyle = '#cc2200'
    ctx.beginPath()
    ctx.ellipse(w * 0.55, h * 0.04, 4, 12, 0, 0, Math.PI * 2)
    ctx.fill()

    // 盾（左腕）
    ctx.fillStyle = '#663300'
    ctx.strokeStyle = '#cc9933'
    ctx.lineWidth = 2
    this._roundRect(ctx, 0, h * 0.3, w * 0.22, h * 0.38, 3)
    ctx.fill()
    ctx.stroke()

    // 剣（右側に突き出し）
    ctx.strokeStyle = '#dddddd'
    ctx.lineWidth = 3
    ctx.shadowColor = '#aabbff'
    ctx.shadowBlur = 4
    ctx.beginPath()
    ctx.moveTo(w - 2, h * 0.35)
    ctx.lineTo(w + 16, h * 0.22)
    ctx.stroke()
    ctx.shadowBlur = 0
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

export default new ArenaPlugin()
