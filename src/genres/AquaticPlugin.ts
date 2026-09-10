/**
 * genres/AquaticPlugin.ts
 * 'aquatic' ジャンル（水中アドベンチャー）のプラグイン。
 *
 * 深海の静寂。暗い青緑・生物発光・珊瑚礁（背景装飾）。
 * ダイバーが重力小さめ・小ジャンプで岩を乗り継ぎながら深海へ潜り続ける
 * 縦エンドレス潜行スタイル（plan/spec-aquatic.md）。地形（岩）・敵・流れゾーンは
 * 全て AquaticFeature が手作りパターン（src/data/patterns/aquatic.json）から生成する。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { GenreId } from '../domain/types'
import type { Hazard } from '../game/entities'
import { PixelCanvas } from '../game/render'

// 岩の描画に使う色。ふわふわ足場は同じ形状で少し明るい色にして見分けられるようにする
const ROCK_COLOR = { base: '#4d453a', shade: '#332d24', highlight: '#665c4c' }
const DRIFT_PLATFORM_COLOR = { base: '#5a6a5a', shade: '#3a4a3a', highlight: '#7a8a78' }

// ダイバーのフィン（バタ足）アニメーションのフレーム数
const SWIM_FRAME_COUNT = 2

// 岩のファセット描画に使う疑似乱数ハッシュ（h.x はハザードの寿命中不変なのでちらつかない）
function _hashOf(seed: number): number {
  return (Math.floor(seed) * 2654435761) >>> 0
}

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

  // 縦スクロールでも遠景（岩山）・中景（珊瑚・海藻）レイヤーを描画する
  readonly verticalBackgroundLayers = true

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

  // 地形・敵・流れゾーンは全て src/data/patterns/aquatic.json の手作りパターンから
  // AquaticFeature が生成する（plan/spec-aquatic.md）。spawnTable による重み付き
  // ランダム生成は使わない。
  readonly spawnTable: readonly SpawnEntry[] = []

  readonly gimmickPalette = {
    platform: { color: ROCK_COLOR.base, glow: '#8899aa' },
    spike:    { color: '#ff2255', glow: '#ff88aa' },
  }

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

  /** 岩・ふわふわ足場だけ独自の岩肌ファセット描画にする。敵・流れゾーンはデフォルト形状描画に任せる */
  override drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, _world: MutableWorld): boolean {
    if (!hazard.isPlatform) return false

    const px = new PixelCanvas(ctx)
    const { w, h } = hazard
    const y = hazard.rect.y
    const seed = _hashOf(hazard.x + hazard.y)
    const { base, shade, highlight } = hazard.driftEnabled ? DRIFT_PLATFORM_COLOR : ROCK_COLOR

    px.rect(sx, y, w, h, base)
    // 岩肌のファセット（ハザードごとに決定論的な位置・サイズで安定表示）
    const facetCount = 3 + (seed % 3)
    for (let i = 0; i < facetCount; i++) {
      const fh = (seed >> (i * 4)) % 0xffff
      const fx = sx + (fh % Math.max(1, w - 12))
      const fy = y + ((fh >> 4) % Math.max(1, h - 12))
      const fw = 8 + (fh >> 8) % 14
      const fcolor = (fh & 1) === 0 ? shade : highlight
      px.tri(fx, fy, fw, fw * 0.8, (fh & 2) === 0 ? 'up' : 'down', fcolor)
    }
    // 縁取り
    px.line(sx, y, sx + w, y, highlight, 1)
    px.line(sx, y + h, sx + w, y + h, shade, 2)
    return true
  }
}

export default new AquaticPlugin()
