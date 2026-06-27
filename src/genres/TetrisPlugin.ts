/**
 * genres/TetrisPlugin.ts
 * 'tetris' ジャンル（テトリス）のビジュアルプラグイン。
 * 暗い背景にテトリスグリッドが配置される。
 */

import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { DarkThemePlugin } from './BasePlugin'

export class TetrisPlugin extends DarkThemePlugin {
  readonly id: GenreId = 'tetris'
  readonly skyColors: readonly [string, string] = ['#0a0a14', '#0d0d1a']
  readonly groundColors: readonly [string, string] = ['#111122', '#0a0a18']
  readonly farLayerColor = '#0f0f20'
  readonly midLayerColor = '#0c0c1a'
  readonly starColor: string | undefined = undefined
  readonly palette: GenrePlugin['palette'] = {
    danger: '#ff4444', dangerGlow: '#ff8888',
    safe:   '#44ff88', safeGlow:   '#88ffcc',
  }
  /** テトリスでは横スクロールのハザードは使用しないが、テーブルは必須 */
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect', placement: 'ground', weightStart: 0, weightEnd: 0, wRange: [30, 50], hRange: [30, 50] },
  ]

  override drawFarLayer(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _gY: number): void {
    // テトリスは遠景なし（暗い背景でテトリスボードを際立たせる）
  }

  override drawMidLayer(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _gY: number): void {
    // テトリスは中景なし
  }

  override drawPlayer(
    _ctx: CanvasRenderingContext2D,
    _w: number, _h: number,
    _onGround: boolean,
    _runCycle: number,
  ): void {
    // TetrisFeature.render がボードとHUDをすべて描画するため、プレイヤー描画は不要
  }
}

export default new TetrisPlugin()
