/**
 * plugins/JSONGenrePlugin.ts
 *
 * JSONだけで定義されたジャンル（TSプラグインなし）のCanvas描画を担当。
 * themeフィールドまたはvisual.templateから描画スタイルを自動決定し、
 * 色などはvisualフィールドでカスタマイズできる。
 *
 * 利用される2つの経路:
 *   1. src/genres/index.ts からの自動フォールバック（TSプラグインが存在しないJSON定義ジャンル）
 *   2. PluginManager経由のユーザーインストールプラグイン
 */

import type { GenrePlugin as PluginBase } from '../engine/GenrePlugin'
import type { MutableWorld, SpawnEntry } from '../engine/types'
import type { Hazard } from '../game/entities'
import type { GenreId } from '../domain/types'
import { getGenre } from '../engine/GameRegistry'

/** JSONGenrePlugin が受け取る入力インターフェース */
export interface GenreJsonDef {
  id: string
  /** ManualUIのテーマ。visual.templateが未指定のときのフォールバックに使う */
  theme?: string
  visual?: {
    /** 描画を委譲するテンプレート名。省略時はthemeから自動決定。
     *  'runner'=地上横スク / 'space'=宇宙STG / 'dungeon'=RPG暗洞窟
     *  'rhythm'=ネオン音楽 / 'puzzle'=明るいパズル / 'aquatic'=水中 */
    template?: string
    /** 空のグラデーション色 [上, 下]。省略時はテンプレートの色を使用 */
    skyColors?: string[]
    /** 地面の色。省略時はテンプレートの色を使用 */
    groundColor?: string
    farLayerColor?: string
    midLayerColor?: string
    starColor?: string
    /** 危険・安全オブジェクトの色 */
    palette?: {
      danger?: string
      dangerGlow?: string
      safe?: string
      safeGlow?: string
    }
  }
}

/** theme名またはtemplate名 → 委譲先プラグインID */
const TO_DELEGATE_ID: Record<string, string> = {
  // template名
  runner:  'base',
  space:   'stg',
  dungeon: 'rpg',
  rhythm:  'rhythm',
  puzzle:  'puzzle',
  aquatic: 'aquatic',
  // theme名（直接指定された場合）
  plain:   'base',
  stg:     'stg',
  rpg:     'rpg',
  horror:  'base',
}

export class JSONGenrePlugin implements PluginBase {
  readonly id: GenreId
  readonly skyColors: readonly [string, string]
  readonly groundColors: readonly [string, string]
  readonly farLayerColor: string
  readonly midLayerColor: string
  readonly starColor: string
  readonly palette: { danger: string; dangerGlow: string; safe: string; safeGlow: string }
  readonly spawnTable: readonly SpawnEntry[]

  private readonly _delegate: PluginBase

  constructor(def: GenreJsonDef) {
    this.id = def.id as GenreId

    // テンプレート決定: visual.template > theme > 'runner'
    const templateKey = def.visual?.template ?? def.theme ?? 'runner'
    const delegateId  = (TO_DELEGATE_ID[templateKey] ?? 'base') as GenreId
    this._delegate    = getGenre(delegateId)

    // 色: JSON指定があればそれを使い、なければデリゲートから継承
    const rawSky = def.visual?.skyColors
    this.skyColors =
      rawSky && rawSky.length >= 2 ? [rawSky[0], rawSky[1]] as [string, string]
      : rawSky?.length === 1       ? [rawSky[0], rawSky[0]] as [string, string]
      :                              this._delegate.skyColors as [string, string]

    const gc = def.visual?.groundColor
    this.groundColors = gc
      ? [gc, gc] as [string, string]
      : this._delegate.groundColors as [string, string]

    this.farLayerColor = def.visual?.farLayerColor ?? this._delegate.farLayerColor
    this.midLayerColor = def.visual?.midLayerColor ?? this._delegate.midLayerColor
    this.starColor     = def.visual?.starColor     ?? this._delegate.starColor ?? '#ffffff'

    this.palette = {
      danger:     def.visual?.palette?.danger     ?? '#ff6b6b',
      dangerGlow: def.visual?.palette?.dangerGlow ?? '#ff9999',
      safe:       def.visual?.palette?.safe       ?? '#4ecdc4',
      safeGlow:   def.visual?.palette?.safeGlow   ?? '#80e8dd',
    }

    this.spawnTable = this._delegate.spawnTable
  }

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    this._delegate.drawFarLayer(ctx, offsetX, W, gY)
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    this._delegate.drawMidLayer(ctx, offsetX, W, gY)
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    this._delegate.drawPlayer(ctx, w, h, onGround, runCycle)
  }

  drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, world: MutableWorld): boolean {
    return this._delegate.drawHazard?.(ctx, hazard, sx, world) ?? false
  }

  drawForeground(_ctx: CanvasRenderingContext2D, _offsetX: number, _W: number, _H: number, _gY: number): void {}
  drawGenreHUD(_ctx: CanvasRenderingContext2D, _world: MutableWorld, _W: number, _H: number): void {}
  onPlayerJump(_world: MutableWorld): void {}
  onPlayerLand(_world: MutableWorld): void {}
  onHazardDestroyed(_world: MutableWorld, _hazard: Hazard): void {}
}
