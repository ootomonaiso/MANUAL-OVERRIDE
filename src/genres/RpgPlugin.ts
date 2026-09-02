/**
 * genres/RpgPlugin.ts
 * 'rpg' ジャンル（森/中世ファンタジー）のプラグイン。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import { PixelCanvas } from '../game/render'

export class RpgPlugin extends GenrePluginBase {
  readonly id = 'rpg' as const
  readonly skyColors    = ['#0a1a05', '#12280a'] as const
  readonly groundColors = ['#0f2008', '#071005'] as const
  readonly farLayerColor  = '#0a2010'
  readonly midLayerColor  = '#081a08'
  readonly starColor      = undefined   // 星なし（森なので）
  readonly palette = {
    danger: '#6c5ce7', dangerGlow: '#a29bfe',
    safe:   '#00b894', safeGlow:   '#55efc4',
  }

  // 収集系: アイテムと障害物が混在するバランス重視の出現
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 8,  weightEnd: 6,  wRange: [25, 45], hRange: [30, 55] },
    { shape: 'pillar',  placement: 'ground', weightStart: 2,  weightEnd: 4,  wRange: [15, 22], hRange: [55, 105] },
    { shape: 'spike',   placement: 'ground', weightStart: 1,  weightEnd: 3,  wRange: [22, 38], hRange: [30, 50] },
    { shape: 'rect',    placement: 'air',    weightStart: 0,  weightEnd: 2,  wRange: [28, 45], hRange: [22, 38] },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // RPG は霧感のある薄い丘。式は無変更、サンプリングを px.ridge に
    const px = new PixelCanvas(ctx)
    px.withAlpha(0.2, () => {
      px.ridge(-40, W + 40, gY, (sx) => {
        const wx = sx - offsetX
        return Math.sin(wx * 0.005) * 60 + Math.sin(wx * 0.012) * 30 + 80
      }, this.farLayerColor)
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 木のシルエット → tree_round スプライトをサイズ違いで使い回す。配置ハッシュは無変更
    const px = new PixelCanvas(ctx)
    const sector = Math.floor(offsetX / 200)
    px.withAlpha(0.55, () => {
      for (let s = sector - 1; s <= sector + 4; s++) {
        const h = (s * 1997) & 0xffff
        const tx = s * 200 - offsetX + (h % 120)
        const treeH = 60 + (h >> 4) % 50
        const treeW = treeH * (18 / 20) // tree_round.json のアスペクト比（18x20）を維持
        px.sprite('tree_round', tx - treeW / 2, gY - treeH, treeW, treeH)
      }
    })
  }

  // Q7（ユーザー回答済み）によりアニメーションは追加しない。静止1フレームのまま
  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    const px = new PixelCanvas(ctx)
    px.sprite('player_knight', 0, 0, w, h)
  }
}

export default new RpgPlugin()
