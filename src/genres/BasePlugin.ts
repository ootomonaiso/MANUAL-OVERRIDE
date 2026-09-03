/**
 * genres/BasePlugin.ts
 * 'base' および 'runner' の視覚テーマを担当するジャンルプラグイン。
 *
 * DarkThemePlugin は継承可能な共通描画ロジックを持つ abstract クラス。
 * フィールドは全て abstract とし、各サブクラスが具体値を提供する。
 * これにより TypeScript のリテラル型の継承問題を回避する。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import type { PlayerAnimState } from '../engine/GenrePlugin'
import { PixelCanvas } from '../game/render'
import { PIXELART } from '../data/tunables'
import { selectPlayerFrame } from './playerBaseAnim'

// 山シルエット（drawFarLayer）の描画範囲マージン。スクロール時の端の途切れを防ぐ
// （旧実装の sin サンプリング step=40 と同じ余白をセル単位で踏襲）
const FAR_LAYER_MARGIN_CELLS = 10

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
    animState?: PlayerAnimState,
  ): void {
    const px = new PixelCanvas(ctx)

    // 影（スプライトには含めず、translate/scale された座標系にそのまま残す）
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,0,0,0.25)')

    const s: PlayerAnimState = animState ?? {
      vx: 0, vy: 0, onGround, runCycle, facing: 1,
    }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.sprite('player_base', 0, 0, w, h, { frame, flipX })
  }

  /** デフォルトのビネット・スキャンライン前景 */
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
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
// RunnerPlugin — 'runner' ジャンル
// ──────────────────────────────────────────────────────────────────────
export class RunnerPlugin extends DarkThemePlugin {
  readonly id: GenreId = 'runner'
  readonly skyColors: readonly [string, string] = ['#0d0d1e', '#1e1e3e']
  readonly groundColors: readonly [string, string] = ['#1a1a3a', '#0e0e22']
  readonly farLayerColor = '#1a1a4a'
  readonly midLayerColor = '#15153a'
  readonly starColor: string | undefined = '#ffffff'
  readonly palette = {
    danger: '#e74c3c', dangerGlow: '#ff6b6b',
    safe:   '#00cec9', safeGlow:   '#55efc4',
  }
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 8,  weightEnd: 5,  wRange: [22, 40], hRange: [30, 55] },
    { shape: 'rect',    placement: 'air',    weightStart: 2,  weightEnd: 4,  wRange: [28, 48], hRange: [25, 40] },
    { shape: 'spike',   placement: 'ground', weightStart: 1,  weightEnd: 5,  wRange: [22, 40], hRange: [40, 65] },
    { shape: 'pillar',  placement: 'ground', weightStart: 0,  weightEnd: 3,  wRange: [14, 18], hRange: [70, 130] },
  ]
}

export default [new BasePlugin(), new RunnerPlugin()]
