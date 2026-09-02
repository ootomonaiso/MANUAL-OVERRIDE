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
import { PixelCanvas } from '../game/render'

// ダイバーのフィン（バタ足）アニメーションのフレーム数
const SWIM_FRAME_COUNT = 2

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
    const px = new PixelCanvas(ctx)

    // 遠景：深海底の岩山シルエット（式は無変更、サンプリングを px.ridge に）
    px.withAlpha(0.2, () => {
      px.ridge(-35, W + 35, gY, (sx) => {
        const wx = sx - offsetX * 0.05
        return Math.sin(wx * 0.006) * 65 + Math.sin(wx * 0.014) * 30 + Math.sin(wx * 0.025) * 15 + 80
      }, this.farLayerColor)
    })

    // 光の柱（水面からの光）。斜めの帯を階段状のブロックで表現する
    const t = performance.now() / 2000
    px.withAlpha(0.4, () => {
      for (let i = 0; i < 5; i++) {
        const lx = ((i * W * 0.22 - offsetX * 0.02 + t * 60) % (W + 80)) - 40
        const beamW = 20 + i * 8
        px.dither(lx - beamW, 0, beamW * 2, gY, '#88ddff', 'transparent', 0.5)
      }
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 中景：珊瑚と海藻（配置ハッシュ・波形の式は無変更）
    const sector = Math.floor(offsetX / 160)
    px.withAlpha(0.6, () => {
      for (let s = sector - 1; s <= sector + 5; s++) {
        const h = (s * 1531) & 0xffff
        const cx = s * 160 - offsetX + (h % 90)
        const coralH = 35 + (h >> 4) % 50
        const coralType = h & 0x3

        if (coralType === 0) {
          // ブランチ珊瑚（枝分かれ）
          px.line(cx, gY, cx, gY - coralH, '#00664a', 1)
          px.line(cx, gY - coralH * 0.5, cx - 12, gY - coralH * 0.8, '#00664a', 1)
          px.line(cx, gY - coralH * 0.6, cx + 10, gY - coralH * 0.85, '#00664a', 1)
        } else if (coralType === 1) {
          // 海藻（くねくね）。Math.sin による x オフセットはそのまま使い、
          // 各セグメントを px.line で繋ぐ（スナップによりカクカクした揺れになるのは意図通り）
          let prevX = cx, prevY = gY
          for (let y = 8; y <= coralH; y += 8) {
            const wave = Math.sin(y * 0.3 + s) * 8
            const nx = cx + wave, ny = gY - y
            px.line(prevX, prevY, nx, ny, '#004d33', 1)
            prevX = nx; prevY = ny
          }
        } else {
          // ファン珊瑚（扇形）。弧のストロークを px.arcBlocks に置換
          px.rect(cx - 2, gY - coralH, 4, coralH, '#003d55')
          px.arcBlocks(cx, gY - coralH, coralH * 0.35, Math.PI * 1.1, Math.PI * 2, '#005577', 1)
        }
      }
    })

    // 泡（上に流れる）
    const t = performance.now() / 1000
    px.withAlpha(0.25, () => {
      for (let i = 0; i < 8; i++) {
        const bx = ((i * 120 + offsetX * 0.15) % W + W) % W
        const by = gY - 30 - ((t * (30 + i * 5) + i * 80) % (gY - 20))
        const br = 2 + (i % 3)
        px.circle(bx, by, br, '#66ccff')
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now() / 80

    // 影
    px.ellipse(w / 2, h + 2, w * 0.38, 3, 'rgba(0,30,60,0.3)')

    // フィンのバタ足は onGround を問わず常時アニメーションする（元コードの挙動を踏襲）
    const frame = Math.floor(runCycle * SWIM_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b'
    px.sprite('player_diver', 0, 0, w, h, { frame })

    // 気泡（スプライト外に残す。位置がスプライトの箱の外＝頭上にはみ出すため）
    const bubbleAlpha = 0.5 + Math.sin(t * 0.05) * 0.2
    px.withAlpha(bubbleAlpha, () => {
      px.circle(w * 0.78, h * 0.08, 3, '#aaddff')
      px.circle(w * 0.85, h * 0.01, 2, '#aaddff')
    })
  }
}

export default new AquaticPlugin()
