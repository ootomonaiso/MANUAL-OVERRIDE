/**
 * genres/PlatformerPlugin.ts
 * 'platformer' ジャンル（プラットフォームアクション）のプラグイン。
 *
 * 砦の最下層から無限に登り続ける縦スクロールクライミング。石造りの足場・
 * 移動足場・コンベア・バネを飛び継ぎ、画面下端から迫る溶岩から逃げる。
 */

import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { GenreId } from '../domain/types'
import type { Hazard } from '../game/entities'
import { PixelCanvas } from '../game/render'
import { GIMMICKS } from '../data/tunables'

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const PLATFORMER_RUN_FRAME_COUNT = 2

export class PlatformerPlugin implements GenrePlugin {
  readonly id: GenreId = 'platformer'

  readonly skyColors: readonly [string, string] = ['#100a08', '#241a14']
  readonly groundColors: readonly [string, string] = ['#241a14', '#100a08']
  readonly farLayerColor  = '#2e2118'
  readonly midLayerColor  = '#3a2a1e'
  readonly starColor: string | undefined = undefined

  // 縦スクロールでも遠景（要塞の壁）・中景（松明）レイヤーを描画する
  readonly verticalBackgroundLayers = true

  readonly palette: GenrePlugin['palette'] = {
    danger: '#ff5522', dangerGlow: '#ffaa44',
    safe:   '#c9a876', safeGlow:   '#ffdd99',
  }

  readonly parallax = {
    stars: 0,
    far:   0.08,
    mid:   0.2,
  }

  readonly hazardConfig = {
    glowBlur: 8,
    pulseSpeed: 1.0,
    pulseAmplitude: 0.06,
  }

  readonly groundLineAlpha = 0.2
  readonly groundDashAlpha = 0.1

  readonly particleColors: GenrePlugin['particleColors'] = {
    hit:   '#ff8844',
    death: ['#ff5522', '#ffaa44', '#ffee88', '#ffffff'] as readonly string[],
    jump:  'rgba(255,220,150,0.6)',
    land:  'rgba(180,140,90,0.55)',
  }

  // 足場（isPlatform）・移動足場（driftEnabled）・コンベア（conveyorVx）・バネ（isSpring）。
  // すべて direction:'left'（下から出現し上へ流れる = climb で使う方向）、safeChance:1、
  // isGimmick:true（弾は無いが将来の混在ジャンルに備えて明示）。
  readonly spawnTable: readonly SpawnEntry[] = [
    {
      shape: 'rect', placement: 'ground', weightStart: 8, weightEnd: 6,
      wRange: [110, 180], hRange: [18, 18], direction: 'left', safeChance: 1,
      isPlatform: true, isGimmick: true,
      colorOverride: '#6b5744', safeColorOverride: '#4a3c2e',
    },
    {
      shape: 'rect', placement: 'ground', weightStart: 2, weightEnd: 4,
      wRange: [90, 140], hRange: [18, 18], direction: 'left', safeChance: 1,
      isPlatform: true, isGimmick: true, driftEnabled: true,
      colorOverride: '#5a6b57', safeColorOverride: '#3c4a3a',
    },
    {
      shape: 'rect', placement: 'ground', weightStart: 1, weightEnd: 3,
      wRange: [100, 150], hRange: [18, 18], direction: 'left', safeChance: 1,
      isPlatform: true, isGimmick: true, conveyorVx: GIMMICKS.conveyorDefaultSpeed,
      colorOverride: '#5a5a70', safeColorOverride: '#3c3c50',
    },
    {
      shape: 'rect', placement: 'ground', weightStart: 1, weightEnd: 3,
      wRange: [100, 150], hRange: [18, 18], direction: 'left', safeChance: 1,
      isPlatform: true, isGimmick: true, conveyorVx: -GIMMICKS.conveyorDefaultSpeed,
      colorOverride: '#5a5a70', safeColorOverride: '#3c3c50',
    },
    {
      shape: 'diamond', placement: 'ground', weightStart: 1, weightEnd: 2,
      wRange: [34, 34], hRange: [16, 16], direction: 'left', safeChance: 1,
      isSpring: true, isGimmick: true,
      colorOverride: '#ff8844', safeColorOverride: '#cc5522',
    },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 遠景: 要塞の石壁シルエット（階段状のブロックパターン）
    px.withAlpha(0.4, () => {
      const blockW = 60
      const sector = Math.floor(offsetX / blockW)
      for (let s = sector - 1; s <= sector + Math.ceil(W / blockW) + 1; s++) {
        const h2 = (s * 2477) & 0xffff
        const bx = s * blockW - offsetX
        const bh = 40 + (h2 % 60)
        px.rect(bx, gY - bh, blockW - 4, bh, this.farLayerColor)
      }
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 中景: 松明（一定間隔・揺らめく炎）
    const sector = Math.floor(offsetX / 220)
    const t = performance.now() / 300
    px.withAlpha(0.85, () => {
      for (let s = sector - 1; s <= sector + Math.ceil(W / 220) + 1; s++) {
        const h2 = (s * 3121) & 0xffff
        const bx = s * 220 - offsetX + (h2 % 100)
        const by = gY - 60 - (h2 >> 4) % (gY - 120)
        const flicker = 0.7 + Math.sin(t + s) * 0.3
        px.rect(bx, by, 6, 20, '#3a2a1e')
        px.withAlpha(flicker, () => {
          px.halo((expand, c) => px.rect(bx - 3 - expand, by - 12 - expand, 12 + expand * 2, 14 + expand * 2, c),
            '#ff9944', 3)
          px.rect(bx - 3, by - 12, 12, 14, '#ffcc66')
        })
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,0,0,0.3)')

    const frame = onGround
      ? (Math.floor(runCycle * PLATFORMER_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
      : 'jump'
    px.sprite('player_platformer', 0, 0, w, h, { frame })
  }

  /** 足場・移動足場・コンベア・バネを石材の見た目で描く */
  drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, _world: MutableWorld): boolean | void {
    if (!hazard.isPlatform && !hazard.isSpring) return false

    const px = new PixelCanvas(ctx)
    const { w, h } = hazard
    const y = hazard.rect.y

    if (hazard.isSpring) {
      px.rect(sx, y, w, h, '#4a3020')
      px.rect(sx + w * 0.15, y - 6, w * 0.7, 8, hazard.color)
      px.line(sx + w * 0.15, y - 6, sx + w * 0.85, y - 6, '#ffcc99', 1)
      return true
    }

    // 石畳の足場本体
    px.rect(sx, y, w, h, hazard.color)
    px.line(sx, y, sx + w, y, '#ffffff33', 1)
    const brickW = 24
    for (let bx = 0; bx < w; bx += brickW) {
      px.line(sx + bx, y, sx + bx, y + h, '#00000033', 1)
    }

    if (hazard.conveyorVx !== 0) {
      // コンベア: 進行方向を示す矢印を流す
      const dir = hazard.conveyorVx > 0 ? 1 : -1
      const t = (performance.now() / 200) % brickW
      px.withAlpha(0.8, () => {
        for (let bx = -brickW; bx < w + brickW; bx += brickW) {
          const ax = sx + bx + (dir > 0 ? t : brickW - t)
          px.tri(ax, y + h / 2 - 4, 8, 8, dir > 0 ? 'right' : 'left', '#ffee88')
        }
      })
    } else if (hazard.driftEnabled) {
      // 移動足場: 縁を強調して区別する
      px.line(sx, y, sx, y + h, '#ffffff55', 2)
      px.line(sx + w, y, sx + w, y + h, '#ffffff55', 2)
    }
    return true
  }

  /** 画面下端に迫る溶岩帯（climb フィーチャーの死亡判定と対応する高さ） */
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number): void {
    const px = new PixelCanvas(ctx)
    const lavaH = GIMMICKS.lavaBandHeightPx
    const y0 = H - lavaH
    const t = performance.now() / 400

    px.bandGradient(0, y0, W, lavaH, [[0, '#ff8822'], [0.4, '#ff4400'], [1, '#7a0e00']], 'v', 6)
    px.withAlpha(0.6 + Math.sin(t) * 0.15, () => {
      const waveW = 40
      for (let x = -waveW; x < W + waveW; x += waveW) {
        const wobble = Math.sin(t * 2 + x * 0.05) * 6
        px.rect(x, y0 + wobble, waveW - 4, 6, '#ffcc66')
      }
    })
  }
}

export default new PlatformerPlugin()
