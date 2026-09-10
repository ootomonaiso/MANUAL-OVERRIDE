/**
 * genres/BasePlugin.ts
 * 'base' および 'runner' の視覚テーマを担当するジャンルプラグイン。
 *
 * DarkThemePlugin は継承可能な共通描画ロジックを持つ abstract クラス。
 * フィールドは全て abstract とし、各サブクラスが具体値を提供する。
 * これにより TypeScript のリテラル型の継承問題を回避する。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { GenreId } from '../domain/types'
import type { Hazard } from '../game/entities'
import { PixelCanvas } from '../game/render'
import { PIXELART } from '../data/tunables'
import { drawGimmickHazard } from './shared/gimmickRender'

// 山シルエット（drawFarLayer）の描画範囲マージン。スクロール時の端の途切れを防ぐ
// （旧実装の sin サンプリング step=40 と同じ余白をセル単位で踏襲）
const FAR_LAYER_MARGIN_CELLS = 10

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の 2 枚）
const RUN_FRAME_COUNT = 2

export abstract class DarkThemePlugin extends GenrePluginBase {
  abstract readonly id: GenreId
  abstract readonly skyColors: readonly [string, string]
  abstract readonly groundColors: readonly [string, string]
  abstract readonly farLayerColor: string
  abstract readonly midLayerColor: string
  abstract readonly starColor: string | undefined
  abstract readonly palette: import('../engine/GenrePlugin').GenrePlugin['palette']
  abstract readonly spawnTable: readonly SpawnEntry[]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 山シルエット（sin 波合成）。式そのものは変更せず、サンプリングを
    // セル単位の階段状シルエット（px.ridge）に置き換える
    const px = new PixelCanvas(ctx)
    const margin = FAR_LAYER_MARGIN_CELLS * Math.max(1, PIXELART.size)
    px.withAlpha(0.35, () => {
      px.ridge(-margin, W + margin, gY, (sx) => {
        const wx = sx - offsetX
        return Math.sin(wx * 0.006) * 90 + Math.sin(wx * 0.0119) * 45 + Math.sin(wx * 0.0241) * 25 + 110
      }, this.farLayerColor)
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 建物シルエット（デフォルト）。ハッシュ・セクタ・視差の計算は変更しない
    const px = new PixelCanvas(ctx)
    // 窓の灯りは新しい色を追加せず、既存の starColor（星の色）を流用する
    const windowColor = this.starColor ?? this.midLayerColor
    px.withAlpha(0.55, () => {
      const sector = Math.floor(offsetX / 300)
      for (let s = sector - 1; s <= sector + 3; s++) {
        const h = (s * 2053) & 0xffff
        const bx = s * 300 - offsetX + (h % 150)
        const bh = 40 + (h >> 4) % 80
        const bw = 25 + (h >> 8) % 35
        px.rect(bx, gY - bh, bw, bh, this.midLayerColor)

        // 窓の点（1〜2セル、ハッシュから決定論的に配置してちらつきを防ぐ）
        const winSize = PIXELART.size * (1 + (h & 1))
        const winMarginW = Math.max(1, bw - PIXELART.size * 2)
        const winMarginH = Math.max(1, bh - PIXELART.size * 3)
        const winX = bx + PIXELART.size + ((h >> 4) % winMarginW)
        const winY = (gY - bh) + PIXELART.size + ((h >> 8) % winMarginH)
        px.rect(winX, winY, PIXELART.size, winSize, windowColor)
      }
    })
  }

  drawPlayer(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    onGround: boolean,
    runCycle: number,
  ): void {
    const px = new PixelCanvas(ctx)

    // 影（スプライトには含めず、translate/scale された座標系にそのまま残す）
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,0,0,0.25)')

    // 既存の引数（onGround / runCycle）だけでフレームを決める。新しい状態は追加しない
    const frame = onGround
      ? (Math.floor(runCycle * RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
      : 'jump'
    px.sprite('player_base', 0, 0, w, h, { frame })
  }

  /** デフォルトのビネット・スキャンライン前景 */
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number, _world?: MutableWorld): void {
    // 画面四隅のビネット（没入感向上）。段階リングに量子化する
    const px = new PixelCanvas(ctx)
    px.bandRadial(
      W / 2, H / 2, Math.min(W, H) * 0.4, Math.max(W, H) * 0.75,
      [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']],
      PIXELART.gradientSteps,
    )
  }
}

// ──────────────────────────────────────────────────────────────────────
// BasePlugin — 'base' ジャンル（ゲーム開始直後・収束前のデフォルト）
// ──────────────────────────────────────────────────────────────────────
export class BasePlugin extends DarkThemePlugin {
  readonly id: GenreId = 'base'
  readonly skyColors: readonly [string, string] = ['#0f0f23', '#1a1a3e']
  readonly groundColors: readonly [string, string] = ['#1e1e40', '#12122a']
  readonly farLayerColor = '#1a1a4a'
  readonly midLayerColor = '#151540'
  readonly starColor: string | undefined = '#ffffff'
  readonly palette = {
    danger: '#e74c3c', dangerGlow: '#ff6b6b',
    safe:   '#3498db', safeGlow:   '#74b9ff',
  }
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 10, weightEnd: 6,  wRange: [25, 45], hRange: [30, 55] },
    { shape: 'spike',   placement: 'ground', weightStart: 0,  weightEnd: 3,  wRange: [22, 40], hRange: [35, 55] },
    { shape: 'pillar',  placement: 'ground', weightStart: 0,  weightEnd: 2,  wRange: [14, 22], hRange: [60, 120] },
    { shape: 'diamond', placement: 'float',  weightStart: 0,  weightEnd: 2,  wRange: [30, 38], hRange: [30, 38] },
  ]
}

// ──────────────────────────────────────────────────────────────────────
// RunnerPlugin — 'runner' ジャンル（昼の都市。奥にビル街）
// ──────────────────────────────────────────────────────────────────────
export class RunnerPlugin extends DarkThemePlugin {
  readonly id: GenreId = 'runner'
  readonly skyColors: readonly [string, string] = ['#4fa8e6', '#bfe6ff']
  readonly groundColors: readonly [string, string] = ['#6b6b70', '#4a4a50']
  readonly farLayerColor = '#8fb4d6'
  readonly midLayerColor = '#5f7a94'
  // 昼間のため星なし。DarkThemePlugin.drawMidLayer の窓灯りは starColor を流用する実装
  // だが、undefined 時は midLayerColor にフォールバックし窓が浮かず自然に馴染む
  readonly starColor: string | undefined = undefined
  readonly palette = {
    danger: '#e74c3c', dangerGlow: '#ff6b6b',
    safe:   '#00b894', safeGlow:   '#55efc4',
  }

  // runner はパターン方式（PatternRunnerFeature）で自前スポーンするため、
  // spawnTable による重み付きランダム生成は使わない（plan/spec-pattern-system.md）。
  readonly spawnTable: readonly SpawnEntry[] = []

  // パターン系ギミックの配色。穴（黒く抉れた描画、色指定不要）以外を要素ごとに完全分離する
  // （足場=土色、バネ=金、トゲ=紅。旧実装の diamond 敵色との衝突を避ける）
  readonly gimmickPalette = {
    platform: { color: '#8a6a45', glow: '#5a4128' },
    spring:   { color: '#ffdd44', glow: '#ff9900' },
    spike:    { color: '#e63946', glow: '#ff8899' },
  }

  // 遠景の太陽・雲（豪華な昼の空を演出する）
  private readonly sunConfig = { x: 0.82, yRatio: 0.16, r: 46, color: '#fff2c0', haloColor: '#ffe27a' }
  private readonly farCloudCfg = {
    count: 5, tileW: 340, minR: 16, rangeR: 20, alphaBase: 0.55, alphaRange: 0.25, color: '#ffffff',
  }

  // 中景の建物バリエーション（窓明かり・屋上構造物付き）
  private readonly windowColors = ['#fff6d0', '#ffe9a8'] as const
  private readonly roofAccentColor = '#3a4a5a'

  override drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, world: MutableWorld): boolean {
    return drawGimmickHazard(ctx, hazard, sx, world.canvas.height)
  }

  // 遠景: 山並みの代わりに、太陽と流れる雲を配置した豪華な昼空にする
  override drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)
    const sun = this.sunConfig
    const sunX = W * sun.x
    const sunY = gY * sun.yRatio

    px.halo((expand, c) => px.circle(sunX, sunY, sun.r + expand, c), sun.haloColor, PIXELART.haloSteps)
    px.circle(sunX, sunY, sun.r, sun.color)

    const c = this.farCloudCfg
    const sector = Math.floor(offsetX / c.tileW)
    for (let s = sector - 1; s <= sector + Math.ceil(W / c.tileW) + 1; s++) {
      const h2 = (s * 3671) & 0xffff
      const cx = s * c.tileW - offsetX + (h2 % c.tileW)
      const cy = gY * 0.1 + (h2 >> 4) % (gY * 0.28)
      const r = c.minR + this._rand(s) * c.rangeR
      const a = c.alphaBase + this._rand(s + 1) * c.alphaRange
      px.withAlpha(a, () => this._drawCloud(px, cx, cy, r, c.color))
    }
  }

  // 中景: 奥のビル群 + 手前寄りのビル群の2層を、どちらも背景（地面・プレイヤー・ギミックより
  // 後ろ）として描く。drawForeground はプレイヤーより手前に描かれるフックのため誤用しない。
  override drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    this._drawBuildingRow(ctx, offsetX, W, gY, {
      spacing: 130, jitter: 80, minH: 50, hRange: 110, minW: 34, wRange: 40,
      alpha: 0.6, color: this.midLayerColor, windowAlpha: 0.65,
    })
    // 手前寄りの層: スクロール速度を上げて視差を強調しつつ、地面・プレイヤーより後ろに留める
    this._drawBuildingRow(ctx, offsetX * 1.4, W, gY, {
      spacing: 170, jitter: 90, minH: 40, hRange: 90, minW: 30, wRange: 36,
      alpha: 0.85, color: '#2a3a4a', windowAlpha: 0.4, seedOffset: 4177,
    })
  }

  private _drawBuildingRow(
    ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number,
    cfg: {
      spacing: number; jitter: number; minH: number; hRange: number; minW: number; wRange: number
      alpha: number; color: string; windowAlpha: number; seedOffset?: number
    },
  ): void {
    const px = new PixelCanvas(ctx)
    const seed = cfg.seedOffset ?? 2053
    const sector = Math.floor(offsetX / cfg.spacing)
    for (let s = sector - 1; s <= sector + Math.ceil(W / cfg.spacing) + 3; s++) {
      const h = (s * seed) & 0xffff
      const bx = s * cfg.spacing - offsetX + (h % cfg.jitter)
      const bh = cfg.minH + (h >> 4) % cfg.hRange
      const bw = cfg.minW + (h >> 8) % cfg.wRange
      const by = gY - bh

      px.withAlpha(cfg.alpha, () => px.rect(bx, by, bw, bh, cfg.color))

      // 屋上構造物（塔・貯水タンク風のシルエット。バリエーションはハッシュで決定的に分岐）
      if (h % 3 === 0) {
        px.withAlpha(0.55, () => px.rect(bx + bw * 0.35, by - 14, bw * 0.3, 14, this.roofAccentColor))
      } else if (h % 3 === 1) {
        px.withAlpha(0.55, () => px.circle(bx + bw * 0.5, by - 8, bw * 0.18, this.roofAccentColor))
      }

      // 窓明かり（複数列・複数行、ハッシュ配置で密度を上げる）
      const winColor = this.windowColors[h % this.windowColors.length]
      const cols = Math.max(1, Math.floor(bw / 10))
      const rows = Math.max(1, Math.floor(bh / 14))
      px.withAlpha(cfg.windowAlpha, () => {
        for (let cx = 0; cx < cols; cx++) {
          for (let ry = 0; ry < rows; ry++) {
            const wh = (h * 131 + cx * 17 + ry * 29) & 0xff
            if (wh % 3 === 0) continue  // 一部の窓は消灯にして密度に濃淡をつける
            px.rect(bx + 4 + cx * 10, by + 6 + ry * 14, 4, 6, winColor)
          }
        }
      })
    }
  }

  // Math.sin ベースの決定的擬似乱数（0..1）
  private _rand(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }

  // 雲（ブロック円の組み合わせ）
  private _drawCloud(px: PixelCanvas, cx: number, cy: number, r: number, color: string): void {
    const lobes = [[-r, 0.2 * r, 0.7], [0, -0.2 * r, 1.0], [r, 0.15 * r, 0.75], [r * 1.7, 0.28 * r, 0.5]] as const
    for (const [dx, dy, rr] of lobes) {
      px.circle(cx + dx, cy + dy, r * rr, color)
    }
  }
}

export default [new BasePlugin(), new RunnerPlugin()]
