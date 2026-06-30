/**
 * genres/PuzzlePlugin.ts
 * 'puzzle' ジャンル（白背景・グリッド）のプラグイン。
 */

import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { DarkThemePlugin } from './BasePlugin'

export class PuzzlePlugin extends DarkThemePlugin {
  readonly id: GenreId = 'puzzle'
  // puzzle テーマは白系「方眼紙」。背景が紺くならないよう明るい白寄りに統一する
  // （genres.json の bgColor:#f0f0f0 と整合）。
  readonly skyColors: readonly [string, string] = ['#f4f4f8', '#e9e9f2']
  readonly groundColors: readonly [string, string] = ['#e4e4ee', '#d2d2de']
  readonly farLayerColor = '#dcdce8'
  readonly midLayerColor = '#c8c8d6'
  readonly starColor: string | undefined = undefined

  // 方眼紙の罫線設定（細罫: opacity 0.1 / 太罫: 数セルごと）
  private readonly _gridSize = 40
  private readonly _gridAlpha = 0.1
  private readonly _majorEvery = 5
  private readonly _majorAlpha = 0.16
  private readonly _gridColor = '#5a5a78'
  readonly palette: GenrePlugin['palette'] = {
    danger: '#e84393', dangerGlow: '#fd79a8',
    safe:   '#0984e3', safeGlow:   '#74b9ff',
  }
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 8, wRange: [28, 56], hRange: [28, 56] },
    { shape: 'pillar', placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [15, 21], hRange: [60, 120] },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 3, wRange: [35, 56], hRange: [22, 36] },
  ]

  override drawFarLayer(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _gY: number): void {
    // パズルは遠景なし（白背景で視認性を保つ）
  }

  override drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 方眼紙風のグリッド罫線（白背景上に薄く敷く。数セルごとに太罫を入れて作り込む）
    ctx.strokeStyle = this._gridColor
    ctx.lineWidth = 1
    const g = this._gridSize
    const startCol = Math.floor(offsetX / g)
    const startX = -(((offsetX % g) + g) % g)
    let col = startCol
    for (let x = startX; x < W; x += g, col++) {
      ctx.globalAlpha = col % this._majorEvery === 0 ? this._majorAlpha : this._gridAlpha
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gY); ctx.stroke()
    }
    let row = 0
    for (let y = ((gY % g) + g) % g; y < gY; y += g, row++) {
      ctx.globalAlpha = row % this._majorEvery === 0 ? this._majorAlpha : this._gridAlpha
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  override drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    ctx.fillStyle = '#444488'
    ctx.fillRect(4, 0, w - 8, h)
    ctx.fillStyle = '#6666aa'
    ctx.fillRect(8, 4, w - 16, h * 0.4)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(w * 0.5, h * 0.15, 8, 8)
    ctx.fillStyle = '#222'
    ctx.fillRect(w * 0.52, h * 0.17, 4, 4)
  }
}

export default new PuzzlePlugin()
