/**
 * genres/RpgPlugin.ts
 * 'rpg' ジャンル（森/中世ファンタジー）のプラグイン。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'

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
    // RPG は霧感のある薄い丘
    ctx.globalAlpha = 0.2
    ctx.fillStyle = this.farLayerColor
    ctx.beginPath(); ctx.moveTo(0, gY)
    const step = 40
    for (let sx = -step; sx <= W + step; sx += step) {
      const wx = sx - offsetX
      const mh = Math.sin(wx * 0.005) * 60 + Math.sin(wx * 0.012) * 30 + 80
      ctx.lineTo(sx, gY - mh)
    }
    ctx.lineTo(W + step, gY); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 木のシルエット
    ctx.globalAlpha = 0.55
    ctx.fillStyle = this.midLayerColor
    const sector = Math.floor(offsetX / 200)
    for (let s = sector - 1; s <= sector + 4; s++) {
      const h = (s * 1997) & 0xffff
      const tx = s * 200 - offsetX + (h % 120)
      const treeH = 60 + (h >> 4) % 50
      ctx.fillRect(tx - 4, gY - treeH * 0.4, 8, treeH * 0.4)
      ctx.beginPath()
      ctx.arc(tx, gY - treeH * 0.4 - treeH * 0.3, treeH * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    // 騎士
    ctx.fillStyle = '#7777bb'
    this._roundRect(ctx, 2, h * 0.4, w - 4, h * 0.55, 3)
    ctx.fill()
    ctx.fillStyle = '#9999cc'
    ctx.fillRect(w * 0.2, h * 0.05, w * 0.6, h * 0.35)
    ctx.fillStyle = '#ffdd00'
    ctx.fillRect(w * 0.28, h * 0.18, w * 0.44, 5)
    ctx.strokeStyle = '#e0e0ff'; ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(w * 0.85, h * 0.3)
    ctx.lineTo(w * 0.85, h * 0.85)
    ctx.stroke()
  }

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }
}

export default new RpgPlugin()
