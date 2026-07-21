/**
 * genres/RhythmPlugin.ts
 * 'rhythm' ジャンル（サイバーパンク / ビート）のプラグイン。
 */

import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { DarkThemePlugin } from './BasePlugin'

export class RhythmPlugin extends DarkThemePlugin {
  readonly id: GenreId = 'rhythm'
  readonly skyColors: readonly [string, string] = ['#0a0015', '#150028']
  readonly groundColors: readonly [string, string] = ['#1a0030', '#0d0018']
  readonly farLayerColor = '#1a0040'
  readonly midLayerColor = '#120030'
  readonly starColor: string | undefined = '#cc88ff'
  readonly palette: GenrePlugin['palette'] = {
    danger: '#e84393', dangerGlow: '#fd79a8',
    safe:   '#6c5ce7', safeGlow:   '#a29bfe',
  }
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 6,  weightEnd: 5,  wRange: [22, 42], hRange: [30, 55] },
    { shape: 'diamond', placement: 'float',  weightStart: 3,  weightEnd: 6,  wRange: [28, 42], hRange: [28, 42] },
    { shape: 'spike',   placement: 'ground', weightStart: 1,  weightEnd: 4,  wRange: [22, 36], hRange: [35, 55] },
    { shape: 'rect',    placement: 'air',    weightStart: 0,  weightEnd: 3,  wRange: [25, 42], hRange: [22, 36] },
  ]

  override drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 縦ラインの光（ビート感）
    ctx.globalAlpha = 0.08
    ctx.fillStyle = '#cc44ff'
    const spacing = 120
    const start = -(offsetX % spacing)
    for (let x = start; x < W; x += spacing) {
      ctx.fillRect(x, 0, 2, gY)
    }
    ctx.globalAlpha = 1
    // 建物シルエット（親クラス呼び出し）
    super.drawMidLayer(ctx, offsetX, W, gY)
  }
}

export default new RhythmPlugin()
