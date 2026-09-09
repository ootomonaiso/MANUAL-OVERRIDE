/**
 * genres/BulletRunnerPlugin.ts
 * 'bullet_runner' ジャンル（弾幕ランナー）のプラグイン。
 *
 * ネオンで輝くサイバーシティの夜。自動走行 + 射撃。
 * 高速感・スタイリッシュ・カラフルなビジュアル。
 * drawGenreHUD — 敵の頭上のHPバー（緑/黄/赤3色）
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { PIXELART } from '../data/tunables'

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const RUNNER_RUN_FRAME_COUNT = 2

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

  // 自前 HP バー（drawGenreHUD）を描くため、エンジン汎用バーの二重描画を抑制する
  readonly drawsOwnHpBar = true

  // 敵HPバー（drawGenreHUD）。縦モードの cull 範囲は sideScroller のハザード cull と揃える。
  // 水平方向のマージン（±50）は最大ハザード幅（42）以上であるため、本体が見える領域では必ずバーも描画される。
  private readonly enemyHpBar = {
    height: 4,
    offsetY: 8,
    cullMargin: 50,
    vertMarginTop: 200,
    vertMarginBottom: 100,
    ratioGreen: 0.6,
    ratioYellow: 0.3,
    bg: 'rgba(0,0,0,0.6)',
    green: '#44ff44',
    yellow: '#ffff44',
    red: '#ff4444',
  }

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // ネオン都市の遠景シルエット（式は無変更、階段状のシルエットへ）
    px.withAlpha(0.18, () => {
      px.ridge(0, W, gY, (sx) => {
        const wx = sx - offsetX * 0.08
        return (Math.sin(wx * 0.008) * 0.5 + 0.5) * 120 + 60 +
               (Math.sin(wx * 0.02 + 1) * 0.5 + 0.5) * 40
      }, '#080015')
    })

    // ネオン縦ライン（ビル窓）。配置ハッシュは無変更
    const sector = Math.floor(offsetX / 500)
    const colors = ['#ff0088', '#0088ff', '#00ffcc', '#ff8800']
    px.withAlpha(0.5, () => {
      for (let s = sector - 1; s <= sector + 3; s++) {
        const h2 = (s * 2011) & 0xffff
        const bx = s * 500 - offsetX * 0.08 + (h2 % 300)
        px.rect(bx, gY * 0.35, 2, gY * 0.5, colors[h2 % colors.length])
      }
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 近景ビル（ネオン看板付き）。配置ハッシュは無変更
    const sector = Math.floor(offsetX / 300)
    const neonColors = ['#ff0088', '#00ccff', '#ff6600']
    px.withAlpha(0.7, () => {
      for (let s = sector - 1; s <= sector + 3; s++) {
        const h2 = (s * 1447) & 0xffff
        const bx = s * 300 - offsetX + (h2 % 150)
        const bh = 60 + (h2 >> 4) % 100
        const bw = 28 + (h2 >> 8) % 40
        px.rect(bx, gY - bh, bw, bh, '#0a0018')

        // ネオン看板の光（shadowBlur → px.halo）
        const signColor = neonColors[(s + h2) % neonColors.length]
        px.halo((expand, c) => px.rect(bx + 2 - expand, gY - bh + 8 - expand, bw - 4 + expand * 2, 6 + expand * 2, c),
          signColor, PIXELART.haloSteps)
        px.rect(bx + 2, gY - bh + 8, bw - 4, 6, signColor)
      }
    })

    // 流れる横ネオンライン（地面近く）。流れる速度・位置の式は無変更
    const t = performance.now() / 1000
    const lineAlpha = 0.12 + Math.sin(t * 3) * 0.04
    const dashStart = -offsetX * 0.5 % 300 - 100
    px.withAlpha(lineAlpha * 3, () => {
      for (let x = dashStart; x < W + 100; x += 50) {
        px.rect(x, gY - 41, 30, 1.5, '#cc00ff')
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(200,0,200,0.15)')

    const frame = Math.floor(runCycle * RUNNER_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b'
    px.sprite('player_cyber_runner', 0, 0, w, h, { frame })
  }

  // ─── ジャンル固有HUD: 敵HPバー ─────────────────────────────────────────
  drawGenreHUD(ctx: CanvasRenderingContext2D, world: MutableWorld, W: number, H: number): void {
    const px = new PixelCanvas(ctx)
    const bar = this.enemyHpBar
    for (const h of world.hazards) {
      if (h.maxHp <= 1) continue
      const sx = world.getHazardScreenX(h)
      if (sx < -bar.cullMargin || sx > W + bar.cullMargin) continue
      // 縦モードでは h.y がそのまま画面Y（cameraX=0）なので Y 方向もチェックする
      if (world.rules.scrollAxis === 'y' && (h.rect.y < -bar.vertMarginTop || h.rect.y > H + bar.vertMarginBottom)) continue

      const ratio = h.hp / h.maxHp
      const barY = h.rect.y - bar.offsetY
      // 仕様: >60% 緑 / 30〜60% 黄 / <30% 赤（0.3 ちょうどは黄側）
      const color = ratio > bar.ratioGreen ? bar.green : ratio >= bar.ratioYellow ? bar.yellow : bar.red
      px.rect(sx, barY, h.w, bar.height, bar.bg)
      px.rect(sx, barY, h.w * ratio, bar.height, color)
    }
  }
}

export default new BulletRunnerPlugin()
