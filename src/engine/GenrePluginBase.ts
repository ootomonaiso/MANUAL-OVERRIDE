/**
 * engine/GenrePluginBase.ts
 *
 * すべてのジャンルプラグインが継承できる抽象基底クラス。
 * オプショナルフックに no-op のデフォルト実装を提供することで、
 * サブクラスが必要なフックだけをオーバーライドできる。
 *
 * 使い方:
 *   class MyPlugin extends GenrePluginBase { ... }
 *
 * DarkThemePlugin は drawFarLayer / drawMidLayer / drawPlayer の
 * デフォルト描画も提供する上位クラス（GenrePluginBase を継承）。
 */

import type { GenrePlugin } from './GenrePlugin'
import type { MutableWorld, SpawnEntry } from './types'
import type { GenreId } from '../domain/types'
import type { Hazard } from '../game/entities'

export abstract class GenrePluginBase implements GenrePlugin {
  // ─── 必須フィールド（サブクラスで具体値を提供） ───────────────────
  abstract readonly id: GenreId
  abstract readonly skyColors: readonly [string, string]
  abstract readonly groundColors: readonly [string, string]
  abstract readonly farLayerColor: string
  abstract readonly midLayerColor: string
  abstract readonly starColor: string | undefined
  abstract readonly palette: GenrePlugin['palette']
  abstract readonly spawnTable: readonly SpawnEntry[]

  // ─── オプション: spawnDensity (省略可) ────────────────────
  readonly spawnDensity?: import('../domain/types').SpawnDensityConfig

  // ─── 必須描画フック（サブクラスで実装） ──────────────────────────
  abstract drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void
  abstract drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void
  abstract drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void

  // ─── 共通描画ユーティリティ ──────────────────────────────────────
  protected _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

  // ─── オプショナルフック（no-op デフォルト）───────────────────────
  onGenreLocked(_world: MutableWorld): void { }
  onUpdate(_world: MutableWorld, _dt: number): void { }
  drawHazard(
    _ctx: CanvasRenderingContext2D,
    _hazard: Hazard,
    _sx: number,
    _world: MutableWorld,
  ): boolean { return false }
  drawForeground(
    _ctx: CanvasRenderingContext2D,
    _offsetX: number,
    _W: number,
    _H: number,
    _gY: number,
  ): void { }
  drawGenreHUD(
    _ctx: CanvasRenderingContext2D,
    _world: MutableWorld,
    _W: number,
    _H: number,
  ): void { }
  onPlayerJump(_world: MutableWorld): void { }
  onPlayerLand(_world: MutableWorld): void { }
  onHazardDestroyed(_world: MutableWorld, _hazard: Hazard): void { }
  onManualUpdated(_world: MutableWorld, _versionKey: string): void { }
}
