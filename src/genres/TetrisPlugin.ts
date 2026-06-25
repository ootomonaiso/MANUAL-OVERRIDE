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
  // TetrisFeature.ts で TETROMINOS[].color として直接使用される
  readonly tetrisColors = {
    I: '#00f0f0', // シアン
    O: '#f0f000', // イエロー
    T: '#a000f0', // パープル
    S: '#00f000', // グリーン
    Z: '#f00000', // レッド
    J: '#0000f0', // ブルー
    L: '#f0a000', // オレンジ
  }

  override drawFarLayer(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _gY: number): void {
    // 遠景なし（テトリスは暗い背景）
  }

  override drawMidLayer(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _gY: number): void {
    // 中景なし（テトリスはグリッドを描画）
  }

  override drawPlayer(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    _onGround: boolean,
    _runCycle: number,
  ): void {
    // Tテトリミノ風のキャラクター（パープルブロック）
    const blockSize = w / 3
    const cy = h * 0.3

    // 上段: 3ブロック横並び
    ctx.fillStyle = '#a000f0'
    ctx.fillRect(0, cy, w, blockSize)

    // 下段: 中央ブロック
    ctx.fillStyle = '#c040ff'
    ctx.fillRect(blockSize, cy + blockSize, blockSize, blockSize)

    // ハイライト
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(1, cy + 1, w - 2, blockSize - 2)
    ctx.fillRect(blockSize + 1, cy + blockSize + 1, blockSize - 2, blockSize - 2)

    // 目
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(w * 0.3, cy + blockSize * 0.2, blockSize * 0.3, blockSize * 0.3)
    ctx.fillRect(w * 0.7, cy + blockSize * 0.2, blockSize * 0.3, blockSize * 0.3)
    ctx.fillStyle = '#220033'
    ctx.fillRect(w * 0.35, cy + blockSize * 0.25, blockSize * 0.2, blockSize * 0.2)
    ctx.fillRect(w * 0.75, cy + blockSize * 0.25, blockSize * 0.2, blockSize * 0.2)
  }
}
