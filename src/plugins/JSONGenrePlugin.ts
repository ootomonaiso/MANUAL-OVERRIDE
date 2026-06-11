import type { GenrePlugin as PluginBase } from '../engine/GenrePlugin'
import type { MutableWorld } from '../engine/types'
import type { GenreId } from '../domain/types'
import type { GenrePlugin } from './PluginManager'
import { getGenre } from '../engine/GameRegistry'

export class JSONGenrePlugin implements PluginBase {
  readonly id: GenreId
  readonly skyColors: readonly [string, string]
  readonly groundColors: readonly [string, string]
  readonly farLayerColor: string
  readonly midLayerColor: string
  readonly palette: { danger: string; dangerGlow: string; safe: string; safeGlow: string }
  readonly spawnTable: readonly any[]
  readonly starColor: string

  private _template: 'runner' | 'space' | 'dungeon' | 'rhythm' | 'puzzle'
  private _delegate: PluginBase | null = null

  constructor(jsonDef: GenrePlugin) {
    this.id = jsonDef.id as GenreId
    this._template = jsonDef.visual.template

    const skyColors = jsonDef.visual.skyColors || ['#87ceeb', '#e0f6ff']
    const groundColor = jsonDef.visual.groundColor || '#90ee90'

    this.skyColors = [skyColors[0], skyColors[1] || skyColors[0]] as readonly [string, string]
    this.groundColors = [groundColor, groundColor] as readonly [string, string]
    this.farLayerColor = jsonDef.visual.farLayerColor || '#ffffff'
    this.midLayerColor = jsonDef.visual.midLayerColor || '#cccccc'
    this.starColor = '#ffffff'
    this.palette = {
      danger: '#ff6b6b',
      dangerGlow: '#ff9999',
      safe: '#4ecdc4',
      safeGlow: '#80e8dd',
    }
    this.spawnTable = this._getDelegate().spawnTable
  }

  private _getDelegate(): PluginBase {
    if (this._delegate) return this._delegate

    const templateMap: Record<string, string> = {
      runner: 'base',
      space: 'stg',
      dungeon: 'rpg',
      rhythm: 'rhythm',
      puzzle: 'puzzle',
    }
    const genreId = (templateMap[this._template] || 'base') as GenreId
    this._delegate = getGenre(genreId)

    return this._delegate
  }

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    this._getDelegate().drawFarLayer(ctx, offsetX, W, gY)
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    this._getDelegate().drawMidLayer(ctx, offsetX, W, gY)
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    this._getDelegate().drawPlayer(ctx, w, h, onGround, runCycle)
  }

  drawHazard(ctx: CanvasRenderingContext2D, hazard: any, sx: number, world: MutableWorld): boolean {
    const delegate = this._getDelegate()
    return delegate.drawHazard?.(ctx, hazard, sx, world) ?? false
  }

  drawForeground(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _H: number, _gY: number): void {
    // Optional, no-op by default
  }

  drawGenreHUD(_ctx: CanvasRenderingContext2D, _world: MutableWorld, _W: number, _H: number): void {
    // Optional, no-op by default
  }

  onPlayerJump(_world: MutableWorld): void {
    // Optional, no-op by default
  }

  onPlayerLand(_world: MutableWorld): void {
    // Optional, no-op by default
  }

  onHazardDestroyed(_world: MutableWorld, _hazard: any): void {
    // Optional, no-op by default
  }
}
