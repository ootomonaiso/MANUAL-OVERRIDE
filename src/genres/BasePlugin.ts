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
    // 山シルエット（sin 波合成）
    ctx.globalAlpha = 0.35
    ctx.fillStyle = this.farLayerColor
    ctx.beginPath()
    ctx.moveTo(0, gY)
    const step = 40
    for (let sx = -step; sx <= W + step; sx += step) {
      const wx = sx - offsetX
      const mh = Math.sin(wx * 0.006) * 90 + Math.sin(wx * 0.0119) * 45 + Math.sin(wx * 0.0241) * 25 + 110
      ctx.lineTo(sx, gY - mh)
    }
    ctx.lineTo(W + step, gY)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 建物シルエット（デフォルト）
    ctx.globalAlpha = 0.55
    ctx.fillStyle = this.midLayerColor
    const sector = Math.floor(offsetX / 300)
    for (let s = sector - 1; s <= sector + 3; s++) {
      const h = (s * 2053) & 0xffff
      const bx = s * 300 - offsetX + (h % 150)
      const bh = 40 + (h >> 4) % 80
      const bw = 25 + (h >> 8) % 35
      ctx.fillRect(bx, gY - bh, bw, bh)
    }
    ctx.globalAlpha = 1
  }

  drawPlayer(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    onGround: boolean,
    runCycle: number,
  ): void {
    const t = runCycle * Math.PI * 2
    const legSwing = onGround ? Math.sin(t) * 10 : 0

    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(w / 2, h + 2, w * 0.4, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#e8e8f8'
    this._roundRect(ctx, 4, h * 0.38, w - 8, h * 0.38, 4)
    ctx.fill()

    ctx.fillStyle = '#f0f0ff'
    ctx.beginPath()
    ctx.arc(w * 0.55, h * 0.22, h * 0.22, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#222244'
    ctx.beginPath()
    ctx.arc(w * 0.64, h * 0.20, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(w * 0.65, h * 0.19, 1.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#cccce0'; ctx.lineWidth = 5; ctx.lineCap = 'round'
    const armSwing = onGround ? Math.sin(t + Math.PI) * 14 : 0
    ctx.beginPath()
    ctx.moveTo(w * 0.3, h * 0.45)
    ctx.lineTo(w * 0.1 + armSwing * 0.5, h * 0.65 + Math.abs(armSwing) * 0.2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(w * 0.7, h * 0.45)
    ctx.lineTo(w * 0.9 - armSwing * 0.5, h * 0.65 + Math.abs(armSwing) * 0.2)
    ctx.stroke()

    ctx.lineWidth = 6; ctx.strokeStyle = '#aaaacc'
    ctx.beginPath()
    ctx.moveTo(w * 0.38, h * 0.75)
    ctx.lineTo(w * 0.28 - legSwing * 0.4, h * 0.98)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(w * 0.60, h * 0.75)
    ctx.lineTo(w * 0.72 + legSwing * 0.4, h * 0.98)
    ctx.stroke()
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
