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
import { PixelCanvas } from '../game/render'
import { PIXELART } from '../data/tunables'

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const EXPLORER_RUN_FRAME_COUNT = 2

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
    const px = new PixelCanvas(ctx)

    // 天井ブロック
    px.withAlpha(0.25, () => px.rect(0, 0, W, gY * 0.18, this.farLayerColor))

    // 壁のブロック目地（横線）
    px.withAlpha(0.1, () => {
      for (let gy = 0; gy < gY * 0.18; gy += 14) {
        px.line(0, gy, W, gy, '#1a1000', 1)
      }
    })

    // 決定論的ハッシュによる3段階の明度差でタイルの質感を出す（新規のドット絵らしさ）
    const sector = Math.floor(offsetX / 40)
    for (let s = sector - 1; s <= sector + Math.ceil(W / 40) + 1; s++) {
      const h = (s * 977) & 0xff
      const shade = h % 3
      const tint = shade === 0 ? 'rgba(255,240,220,0.05)' : shade === 1 ? 'rgba(0,0,0,0.05)' : 'transparent'
      px.rect(s * 40 - offsetX, 0, 40, gY * 0.18, tint)
    }
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 石壁の柱・アーチ（配置ハッシュは無変更）
    const sector = Math.floor(offsetX / 200)
    px.withAlpha(0.65, () => {
      for (let s = sector - 1; s <= sector + 4; s++) {
        const h = (s * 2017) & 0xffff
        const pxPos = s * 200 - offsetX + (h % 100)
        const pillarH = 70 + (h >> 4) % 40
        px.rect(pxPos - 9, gY - pillarH, 18, pillarH, '#1a1200')
        // 柱頭装飾（角丸を除去し段差で表現）
        px.rect(pxPos - 12, gY - pillarH, 24, 8, '#1a1200')
      }
    })

    // 松明の光（壁に固定）。炎の揺らぎの駆動式は無変更
    const t = performance.now() / 700
    for (let s = sector - 1; s <= sector + 4; s++) {
      const h = (s * 2017) & 0xffff
      const pxPos = s * 200 - offsetX + (h % 100)
      const pillarH = 70 + (h >> 4) % 40
      const flicker = 0.6 + Math.sin(t * 1.3 + s * 2.1) * 0.25

      // 照らす半円（ディザによる2〜3段の同心半円で表現）
      px.withAlpha(flicker * 0.5, () => {
        px.dither(pxPos - 70, gY - pillarH + 2 - 35, 140, 70, '#ff8800', 'transparent', 0.4)
      })

      // 炎本体（2フレームの明滅。駆動式はそのまま、色を切り替えるだけ）
      const frame = Math.floor(t * 1.3 + s * 2.1) % 2 === 0
      px.withAlpha(flicker * 0.85, () => px.circle(pxPos, gY - pillarH - 2, 5, '#ff6600'))
      px.withAlpha(flicker * 0.6, () => px.circle(pxPos, gY - pillarH - 4, frame ? 3 : 2, '#ffcc00'))
    }

    // 石畳（地面パターン）
    const tileW = 40
    const startX = -(offsetX % tileW)
    px.withAlpha(0.12, () => {
      for (let tx = startX; tx <= W; tx += tileW) {
        px.line(tx, gY - 2, tx, gY, '#332200', 1)
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.36, 4, 'rgba(0,0,0,0.4)')

    const frame = Math.floor(runCycle * EXPLORER_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b'
    px.sprite('player_explorer', 0, 0, w, h, { frame })

    // ランタンの明かり（バウンディングボックスを超えて広がるため px.halo で別描画）
    const lanternFlicker = 0.6 + Math.sin(performance.now() / 400) * 0.2
    px.halo((expand, c) => px.circle(5, h * 0.48 + 7, 12 + expand, c), '#ffaa00', PIXELART.haloSteps)
    px.withAlpha(lanternFlicker * 0.5, () => px.circle(5, h * 0.48 + 7, 12, '#ffaa00'))
  }
}

export default new DungeonPlugin()
