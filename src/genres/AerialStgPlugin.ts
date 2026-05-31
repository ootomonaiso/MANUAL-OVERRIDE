/**
 * genres/AerialStgPlugin.ts
 * 'aerial_stg' ジャンル（縦スクロールシューティング）のプラグイン。
 *
 * 暗い宇宙空間。上から降ってくる敵を縦方向に撃ち落とす。
 * プレイヤーは小型戦闘機。星雲と星フィールドが流れる。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class AerialStgPlugin extends GenrePluginBase {
  readonly id: GenreId = 'aerial_stg'

  readonly skyColors    = ['#000008', '#000418'] as const
  readonly groundColors = ['#000408', '#000208'] as const
  readonly farLayerColor  = '#050520'
  readonly midLayerColor  = '#050520'
  readonly starColor      = '#ffffff'

  readonly palette = {
    danger: '#ff3333', dangerGlow: '#ff6666',
    safe:   '#00aaff', safeGlow:   '#66ccff',
  }

  readonly starConfig = {
    density: 28,
    sizeRange: [1, 3] as [number, number],
    alphaRange: [0.4, 0.9] as [number, number],
  }

  readonly parallax = {
    stars: 0.03,
    far:   0.06,
    mid:   0.15,
  }

  readonly hazardConfig = {
    glowBlur: 16,
    pulseSpeed: 2.0,
    pulseAmplitude: 0.12,
  }

  readonly particleColors = {
    hit:   '#ff6688',
    death: ['#ff2244', '#ff8800', '#ffff00', '#ffffff'] as readonly string[],
    jump:  'rgba(0,180,255,0.6)',
    land:  'rgba(0,100,200,0.5)',
  }

  // 縦モード: 全てのハザードが画面上端からスポーン。placement は無視される。
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 6, weightEnd: 4, wRange: [24, 40], hRange: [22, 40], safeChance: 0.25 },
    { shape: 'diamond', placement: 'float',  weightStart: 3, weightEnd: 6, wRange: [26, 36], hRange: [26, 36], safeChance: 0.2 },
    { shape: 'pillar',  placement: 'air',    weightStart: 1, weightEnd: 4, wRange: [13, 19], hRange: [42, 68], safeChance: 0.15 },
    { shape: 'spike',   placement: 'ground', weightStart: 0, weightEnd: 3, wRange: [22, 35], hRange: [30, 48], safeChance: 0.15 },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 星雲（複数の放射グラデーション）
    const nebulae = [
      { cx: 0.2, cy: 0.3, r: 180, color: '#1a0044' },
      { cx: 0.7, cy: 0.6, r: 220, color: '#002244' },
      { cx: 0.5, cy: 0.15, r: 150, color: '#220033' },
    ]
    const scroll = offsetX * 0.04
    for (const nb of nebulae) {
      const nx = (nb.cx * W - scroll) % W
      const ny = nb.cy * gY
      ctx.globalAlpha = 0.12
      const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nb.r)
      grad.addColorStop(0, nb.color)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, gY)
    }
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 浮遊する小惑星群
    ctx.globalAlpha = 0.22
    ctx.fillStyle = '#0a0a1a'
    const sector = Math.floor(offsetX / 400)
    for (let s = sector - 1; s <= sector + 2; s++) {
      const base = s * 400 - offsetX
      for (let i = 0; i < 4; i++) {
        const h = (s * 1637 + i * 53) & 0xffff
        const ax = base + (h % 380)
        const ay = gY * 0.1 + ((h >> 4) % Math.floor(gY * 0.75))
        const aw = 20 + (h >> 8) % 45
        const ah = 10 + (h >> 10) % 22
        ctx.beginPath()
        ctx.ellipse(ax, ay, aw / 2, ah / 2, (h & 0xff) * 0.04, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // 遠方ネビュラ光（青紫）
    ctx.globalAlpha = 0.06
    const nx = (W * 0.5 - offsetX * 0.08) % W
    const grad = ctx.createRadialGradient(nx, gY * 0.3, 0, nx, gY * 0.3, 300)
    grad.addColorStop(0, '#4466ff')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, gY)
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    const t = performance.now() / 60
    // 機体（小型三角戦闘機・上向き）
    ctx.fillStyle = '#aaddff'
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)               // 機首（上）
    ctx.lineTo(w * 0.05, h * 0.85)    // 左後方
    ctx.lineTo(w * 0.3, h * 0.65)     // 左内側
    ctx.lineTo(w / 2, h * 0.75)       // 後方中央
    ctx.lineTo(w * 0.7, h * 0.65)     // 右内側
    ctx.lineTo(w * 0.95, h * 0.85)    // 右後方
    ctx.closePath()
    ctx.fill()

    // コックピット（円）
    ctx.fillStyle = '#66bbff'
    ctx.beginPath()
    ctx.arc(w / 2, h * 0.3, h * 0.14, 0, Math.PI * 2)
    ctx.fill()

    // エンジン炎（下から噴出・揺らぎ）
    const flame1 = `hsl(${(t * 3) % 60}, 100%, 65%)`
    const flame2 = `hsl(${(t * 5 + 30) % 60 + 15}, 100%, 55%)`
    const jitter = Math.random() * 5
    ctx.fillStyle = flame1
    ctx.beginPath()
    ctx.moveTo(w * 0.3, h * 0.68)
    ctx.lineTo(w * 0.4, h + 10 + jitter)
    ctx.lineTo(w * 0.6, h + 10 + jitter)
    ctx.lineTo(w * 0.7, h * 0.68)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 0.6
    ctx.fillStyle = flame2
    ctx.beginPath()
    ctx.moveTo(w * 0.4, h * 0.7)
    ctx.lineTo(w / 2, h + 20 + jitter * 2)
    ctx.lineTo(w * 0.6, h * 0.7)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // ウィングエッジ（ハイライト）
    ctx.strokeStyle = '#88ccff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(w * 0.05, h * 0.85)
    ctx.lineTo(w / 2, 0)
    ctx.lineTo(w * 0.95, h * 0.85)
    ctx.stroke()
  }
}
