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
import { PixelCanvas } from '../game/render'

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const PLATFORMER_RUN_FRAME_COUNT = 2

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
    const px = new PixelCanvas(ctx)

    // 雲（白いふわふわ）→ cloud_fluffy スプライトをサイズ違いで使い回す。
    // 配置の計算式は無変更
    const cloudData = [
      { x: 0.1, y: 0.15, r: 55 },
      { x: 0.35, y: 0.08, r: 70 },
      { x: 0.62, y: 0.18, r: 50 },
      { x: 0.82, y: 0.06, r: 65 },
    ]
    const scroll = offsetX * 0.05
    px.withAlpha(0.9, () => {
      for (const c of cloudData) {
        const cx = ((c.x * W * 1.4 - scroll) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2
        const cy = c.y * gY
        const w = c.r * 2.3, h = c.r * 1.3
        px.sprite('cloud_fluffy', cx - w / 2, cy - h / 2, w, h)
      }
    })
  }

  override drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 草地の丘（丸い丘 → ブロック半円）。配置・サイズの計算式は無変更
    const sector = Math.floor(offsetX / 350)
    px.withAlpha(0.55, () => {
      for (let s = sector - 1; s <= sector + 3; s++) {
        const h2 = (s * 2239) & 0xffff
        const bx = s * 350 - offsetX + (h2 % 200)
        const bw = 40 + (h2 >> 8) % 60
        const hillR = bw / 2
        px.halfCircle(bx + hillR, gY, hillR, 'up', this.midLayerColor)
        // 丘の頂点に明色ハイライトを添えて立体感を出す
        px.rect(bx + hillR - hillR * 0.15, gY - hillR, hillR * 0.3, hillR * 0.12, 'rgba(255,255,255,0.35)')
      }
    })
  }

  override drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,80,0,0.25)')

    const frame = onGround
      ? (Math.floor(runCycle * PLATFORMER_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
      : 'jump'
    px.sprite('player_platformer', 0, 0, w, h, { frame })
  }
}

export default new PlatformerPlugin()
