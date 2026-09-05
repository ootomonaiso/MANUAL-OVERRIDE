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
import { PixelCanvas } from '../game/render'

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
    const px = new PixelCanvas(ctx)

    // 遠景のサーキット看板・観客スタンドシルエット（式は無変更）
    px.withAlpha(0.14, () => {
      px.ridge(-60, W + 60, gY, (sx) => {
        const wx = sx - offsetX * 0.06
        return 30 + ((wx * 0.007 | 0) & 0xf) * 8
      }, this.farLayerColor)
    })

    // 遠景のスピードライン（流れる位置の計算式は無変更）
    const t = performance.now() / 1000
    px.withAlpha(0.35, () => {
      for (let i = 0; i < 6; i++) {
        const lineY = gY - 80 - i * 30
        const phase = (t * 0.4 + i * 0.3) % 1
        const lx = W * phase - offsetX * 0.04 % W
        px.rect(lx, lineY, 80, 1, '#ff9922')
      }
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 道路の白線（センターライン）。流れる速度の計算式は無変更
    const dashInterval = 70
    const startX = -(offsetX % dashInterval)
    px.withAlpha(0.55, () => {
      for (let x = startX; x < W; x += dashInterval) {
        px.rect(x, gY - 19, 40, 3, '#ffffcc')
      }
    })

    // 路肩のガードレールシルエット（配置ハッシュは無変更）
    const sector = Math.floor(offsetX / 240)
    px.withAlpha(0.45, () => {
      for (let s = sector - 1; s <= sector + 5; s++) {
        const h = (s * 1663) & 0xffff
        const pxPos = s * 240 - offsetX + (h % 80)
        px.rect(pxPos, gY - 28, 6, 28, '#2a1a10')
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)
    const wheelBounce = Math.abs(Math.sin(runCycle * Math.PI * 4)) * 1.5

    // 影
    px.ellipse(w / 2, h + 3 - wheelBounce, w * 0.42, 4, 'rgba(0,0,0,0.35)')

    px.sprite('player_racecar', 0, -wheelBounce, w, h)
  }
}

export default new RacingPlugin()
