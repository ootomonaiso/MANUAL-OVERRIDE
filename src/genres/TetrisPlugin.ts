/**
 * genres/TetrisPlugin.ts
 * 'tetris' ジャンルの視覚テーマプラグイン。
 *
 * 暗い背景にグリッドライン、テトリス特有のブロックカラーパレット。
 * 遠景・中景は描画せず、プレイヤーはブロック風キャラクターとして描画する。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { TETRIS_COLORS } from '../game/systems/tetris-colors'
import { PixelCanvas } from '../game/render'

export class TetrisPlugin extends GenrePluginBase {
  readonly id: GenreId = 'tetris'
  readonly skyColors: readonly [string, string] = ['#0a0a0a', '#111111']
  readonly groundColors: readonly [string, string] = ['#0d0d0d', '#080808']
  readonly farLayerColor = '#0a0a0a'
  readonly midLayerColor = '#0a0a0a'
  readonly starColor: string | undefined = undefined
  readonly palette: GenrePlugin['palette'] = {
    danger: '#e74c3c', dangerGlow: '#ff6b6b',
    safe:   '#3498db', safeGlow:   '#74b9ff',
  }
  readonly spawnTable: readonly SpawnEntry[] = [
    // テトリスモードではハザードは使用しないが、
    // フォールバック用に空に近いテーブルを定義する
    { shape: 'rect', placement: 'ground', weightStart: 0, weightEnd: 0, wRange: [0, 0], hRange: [0, 0] },
  ]

  // テトリスブロックカラー（7種類）
  // 共有定数 TETRIS_COLORS を参照（DRY 違反防止）
  readonly tetrisColors = TETRIS_COLORS

  override drawFarLayer(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _gY: number): void {
    // 遠景なし（テトリスは暗い背景）。意図的な空実装のまま維持する
  }

  override drawMidLayer(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _gY: number): void {
    // 中景なし（テトリスはグリッドを描画）。意図的な空実装のまま維持する
  }

  override drawPlayer(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    _onGround: boolean,
    _runCycle: number,
  ): void {
    // Tテトリミノ風のキャラクター（パープルブロック）。
    // TetrisFeature.ts の盤面ブロックと同じ立体ブロック表現（px.block）に揃える
    const px = new PixelCanvas(ctx)
    const blockSize = w / 3
    const cy = h * 0.3

    // 上段: 3ブロック横並び
    px.block(0, cy, w, blockSize, '#a000f0')
    // 下段: 中央ブロック
    px.block(blockSize, cy + blockSize, blockSize, blockSize, '#c040ff')

    // 目
    px.rect(w * 0.3, cy + blockSize * 0.2, blockSize * 0.3, blockSize * 0.3, '#ffffff')
    px.rect(w * 0.7, cy + blockSize * 0.2, blockSize * 0.3, blockSize * 0.3, '#ffffff')
    px.rect(w * 0.35, cy + blockSize * 0.25, blockSize * 0.2, blockSize * 0.2, '#220033')
    px.rect(w * 0.75, cy + blockSize * 0.25, blockSize * 0.2, blockSize * 0.2, '#220033')
  }
}

export default new TetrisPlugin()
