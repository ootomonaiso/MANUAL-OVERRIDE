/**
 * genres/PlatformerPlugin.ts
 * 'platformer' ジャンル（プラットフォームアクション）のプラグイン。
 *
 * 明るい青空と浮かぶ雲。軽快な二段ジャンプとコンボが主軸。
 * プレイヤーはアクロバティックなアクション感を演出。
 */

import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { DarkThemePlugin } from './BasePlugin'

export class PlatformerPlugin extends DarkThemePlugin {
  readonly id: GenreId = 'platformer'

  readonly skyColors: readonly [string, string] = ['#1a88e8', '#4db8ff']
  readonly groundColors: readonly [string, string] = ['#2d7a2d', '#1a5c1a']
  readonly farLayerColor  = '#5da5e8'
  readonly midLayerColor  = '#4a9040'
  readonly starColor: string | undefined = undefined

  readonly palette: GenrePlugin['palette'] = {
    danger: '#e84040', dangerGlow: '#ff6666',
    safe:   '#ffcc00', safeGlow:   '#ffee88',
  }

  readonly parallax = {
    stars: 0,
    far:   0.05,
    mid:   0.2,
  }

  readonly hazardConfig = {
    glowBlur: 10,
    pulseSpeed: 1.2,
    pulseAmplitude: 0.1,
  }

  readonly groundLineAlpha = 0.2
  readonly groundDashAlpha = 0.1

  readonly particleColors: GenrePlugin['particleColors'] = {
    hit:   '#ff4444',
    death: ['#ff4444', '#ff8800', '#ffcc00', '#ffffff'] as readonly string[],
    jump:  'rgba(255,220,60,0.7)',
    land:  'rgba(80,200,60,0.6)',
  }

  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 6, weightEnd: 5, wRange: [28, 52], hRange: [30, 55] },
    { shape: 'rect',   placement: 'air',    weightStart: 4, weightEnd: 6, wRange: [32, 56], hRange: [22, 36], safeChance: 0.3 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 4, wRange: [25, 42], hRange: [30, 45] },
    { shape: 'diamond', placement: 'float', weightStart: 1, weightEnd: 3, wRange: [28, 38], hRange: [28, 38], safeChance: 0.4 },
  ]

  override drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 雲（白いふわふわ）
    ctx.globalAlpha = 0.7
    ctx.fillStyle = '#ffffff'
    const cloudData = [
      { x: 0.1, y: 0.15, r: 55 },
      { x: 0.35, y: 0.08, r: 70 },
      { x: 0.62, y: 0.18, r: 50 },
      { x: 0.82, y: 0.06, r: 65 },
    ]
    const scroll = offsetX * 0.05
    for (const c of cloudData) {
      const cx = ((c.x * W * 1.4 - scroll) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2
      const cy = c.y * gY
      const r = c.r
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2)
      ctx.arc(cx + r * 0.6, cy + r * 0.1, r * 0.55, 0, Math.PI * 2)
      ctx.arc(cx - r * 0.55, cy + r * 0.1, r * 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  override drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 草地の丘（緑系）
    ctx.globalAlpha = 0.55
    ctx.fillStyle = this.midLayerColor
    const sector = Math.floor(offsetX / 350)
    for (let s = sector - 1; s <= sector + 3; s++) {
      const h2 = (s * 2239) & 0xffff
      const bx = s * 350 - offsetX + (h2 % 200)
      const bh = 30 + (h2 >> 4) % 55
      const bw = 40 + (h2 >> 8) % 60
      // 丸い丘
      ctx.beginPath()
      ctx.arc(bx + bw / 2, gY, bw / 2, Math.PI, 0)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  override drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    const t = runCycle * Math.PI * 2
    const legSwing = onGround ? Math.sin(t) * 11 : 0
    const armSwing = onGround ? Math.sin(t + Math.PI) * 14 : 0

    // 影
    ctx.fillStyle = 'rgba(0,80,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.4, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // ボディ（赤いジャンパー）
    ctx.fillStyle = '#cc2222'
    this._roundRect(ctx, 3, h * 0.38, w - 6, h * 0.38, 4)
    ctx.fill()

    // ロゴマーク（単純な☆）
    ctx.fillStyle = '#ffcc00'
    ctx.font = `bold ${Math.floor(h * 0.22)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('★', w * 0.52, h * 0.62)
    ctx.textAlign = 'left'

    // 頭
    ctx.fillStyle = '#f5c080'
    ctx.beginPath()
    ctx.arc(w * 0.55, h * 0.22, h * 0.21, 0, Math.PI * 2)
    ctx.fill()

    // 帽子（赤いキャップ）
    ctx.fillStyle = '#cc2222'
    ctx.beginPath()
    ctx.arc(w * 0.55, h * 0.19, h * 0.18, Math.PI, 0)
    ctx.fill()
    ctx.fillRect(w * 0.3, h * 0.19, w * 0.5, 5)

    // 目（大きめ）
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath(); ctx.arc(w * 0.64, h * 0.22, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'white'
    ctx.beginPath(); ctx.arc(w * 0.655, h * 0.21, 1.2, 0, Math.PI * 2); ctx.fill()

    // 腕
    ctx.strokeStyle = '#f5c080'; ctx.lineWidth = 5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(w * 0.3, h * 0.46); ctx.lineTo(w * 0.1 + armSwing * 0.5, h * 0.68); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.7, h * 0.46); ctx.lineTo(w * 0.9 - armSwing * 0.5, h * 0.68); ctx.stroke()

    // 脚（青いパンツ）
    ctx.lineWidth = 6; ctx.strokeStyle = '#2244cc'
    ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.75); ctx.lineTo(w * 0.28 - legSwing * 0.4, h * 0.98); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(w * 0.60, h * 0.75); ctx.lineTo(w * 0.72 + legSwing * 0.4, h * 0.98); ctx.stroke()
  }
}

export default new PlatformerPlugin()
