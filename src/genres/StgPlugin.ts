/**
 * genres/StgPlugin.ts
 * 'stg' ジャンル（宇宙シューティング）のプラグイン。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'

export class StgPlugin extends GenrePluginBase {
  readonly id = 'stg' as const
  readonly skyColors    = ['#000005', '#05050f'] as const
  readonly groundColors = ['#05050a', '#020205'] as const
  readonly farLayerColor  = '#050520'
  readonly midLayerColor  = '#050520'
  readonly starColor      = '#ffffff'
  readonly palette = {
    danger: '#e17055', dangerGlow: '#fd79a8',
    safe:   '#0984e3', safeGlow:   '#74b9ff',
  }

  // 敵・弾幕っぽい配置（空中多め、ダイヤモンド多め）
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 5,  weightEnd: 4,  wRange: [22, 40], hRange: [30, 55] },
    { shape: 'rect',    placement: 'air',    weightStart: 3,  weightEnd: 5,  wRange: [25, 42], hRange: [25, 42] },
    { shape: 'diamond', placement: 'float',  weightStart: 2,  weightEnd: 5,  wRange: [28, 38], hRange: [28, 38] },
    { shape: 'pillar',  placement: 'air',    weightStart: 0,  weightEnd: 3,  wRange: [15, 22], hRange: [45, 75] },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // ネビュラ光
    ctx.globalAlpha = 0.06
    const nx = (-offsetX * 0.3) % W
    const grad = ctx.createRadialGradient(nx, gY * 0.4, 0, nx, gY * 0.4, 200)
    grad.addColorStop(0, '#4444ff')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, gY)
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 浮遊岩石（宇宙感）
    ctx.globalAlpha = 0.3
    ctx.fillStyle = this.midLayerColor
    const sector = Math.floor(offsetX / 500)
    for (let s = sector - 1; s <= sector + 2; s++) {
      const baseX = s * 500 - offsetX
      for (let i = 0; i < 3; i++) {
        const h = (s * 1301 + i * 47) & 0xffff
        const rx = baseX + (h % 500)
        const ry = gY * 0.2 + ((h >> 4) % Math.floor(gY * 0.5))
        const rw = 30 + (h >> 8) % 60
        const rh = 15 + (h >> 10) % 25
        ctx.fillRect(rx, ry, rw, rh)
      }
    }
    // ネビュラ光
    ctx.globalAlpha = 0.04
    const nx = (-offsetX * 0.3) % W
    const grad = ctx.createRadialGradient(nx, gY * 0.4, 0, nx, gY * 0.4, 220)
    grad.addColorStop(0, '#4444ff')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, gY)
    ctx.globalAlpha = 1
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, _runCycle: number): void {
    // 宇宙船
    ctx.fillStyle = '#88ccff'
    ctx.beginPath()
    ctx.moveTo(w, h / 2)
    ctx.lineTo(w * 0.1, h * 0.1)
    ctx.lineTo(w * 0.1, h * 0.9)
    ctx.closePath()
    ctx.fill()

    // エンジン炎（ランダム揺らぎ）
    const t = performance.now() / 80
    ctx.fillStyle = `hsl(${t % 360}, 100%, 60%)`
    ctx.beginPath()
    ctx.moveTo(w * 0.1, h * 0.35)
    ctx.lineTo(-w * 0.2 - Math.random() * 8, h * 0.5)
    ctx.lineTo(w * 0.1, h * 0.65)
    ctx.closePath()
    ctx.fill()

    // コックピット
    ctx.fillStyle = '#3399ff'
    ctx.beginPath()
    ctx.arc(w * 0.65, h * 0.5, h * 0.15, 0, Math.PI * 2)
    ctx.fill()
  }
}

export default new StgPlugin()
