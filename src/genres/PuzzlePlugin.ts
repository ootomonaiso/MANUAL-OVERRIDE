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
  readonly skyColors: readonly [string, string] = ['#e8e8f0', '#d0d0e0']
  readonly groundColors: readonly [string, string] = ['#d8d8e8', '#c0c0d0']
  readonly farLayerColor = '#c0c0d0'
  readonly midLayerColor = '#b0b0c0'
  readonly starColor: string | undefined = undefined
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
    // グリッドライン（方眼紙風）
    ctx.globalAlpha = 0.1
    ctx.strokeStyle = '#888888'; ctx.lineWidth = 1
    const gridSize = 60
    const startX = -(offsetX % gridSize)
    for (let x = startX; x < W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gY); ctx.stroke()
    }
    for (let y = gY % gridSize; y < gY; y += gridSize) {
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
