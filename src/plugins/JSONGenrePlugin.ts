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
  spawnDensity?: import('../domain/types').SpawnDensityConfig
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

/** JSON側で palette / starColor 未指定かつ委譲先も持たない場合の汎用フォールバック色 */
const DEFAULT_STAR_COLOR = '#ffffff'
const DEFAULT_PALETTE = {
  danger:     '#ff6b6b',
  dangerGlow: '#ff9999',
  safe:       '#4ecdc4',
  safeGlow:   '#80e8dd',
} as const

/** theme名またはtemplate名 → 委譲先プラグインID */
const TO_DELEGATE_ID: Record<string, string> = {
  // template名
  runner:  'base',
  space:   'stg',
  aerial:  'aerial_stg',  // 縦スクロールSTG（bullet_hell 等）。verticalBackgroundLayers を持つ
  dungeon: 'rpg',
  rhythm:  'rhythm',
  puzzle:  'puzzle',
  aquatic: 'aquatic',
  // theme名（直接指定された場合）
  plain:   'base',
  stg:     'stg',
  rpg:     'rpg',
  horror:  'base',
  // glitch（壊れたゲーム演出）/ stealth（stealth_action）は専用の描画テンプレートを
  // 持たないため base の地上横スク描画へ委譲する。bgColor は別途適用されるので
  // 背景色でのジャンル差は残る。暗黙の ?? 'base' に頼らず意図を明示する。
  glitch:  'base',
  stealth: 'base',
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
  readonly spawnDensity?: import('../domain/types').SpawnDensityConfig

  // 描画メソッドだけでなく、エンジンが直接参照する視覚チューニング値も委譲先から継承する。
  // これがないと bullet_hell（stg/aerial_stg へ委譲）等で背景レイヤーやパーティクル色が
  // 失われ、TS 実装ジャンルとの見た目品質差が出る。
  readonly parallax?: PluginBase['parallax']
  readonly starConfig?: PluginBase['starConfig']
  readonly hazardConfig?: PluginBase['hazardConfig']
  readonly particleColors?: PluginBase['particleColors']
  readonly groundLineAlpha?: PluginBase['groundLineAlpha']
  readonly groundDashAlpha?: PluginBase['groundDashAlpha']
  readonly verticalBackgroundLayers?: PluginBase['verticalBackgroundLayers']

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
    this.starColor     = def.visual?.starColor     ?? this._delegate.starColor ?? DEFAULT_STAR_COLOR

    this.palette = {
      danger:     def.visual?.palette?.danger     ?? DEFAULT_PALETTE.danger,
      dangerGlow: def.visual?.palette?.dangerGlow ?? DEFAULT_PALETTE.dangerGlow,
      safe:       def.visual?.palette?.safe       ?? DEFAULT_PALETTE.safe,
      safeGlow:   def.visual?.palette?.safeGlow   ?? DEFAULT_PALETTE.safeGlow,
    }

    this.spawnTable = this._delegate.spawnTable
    this.spawnDensity = def.spawnDensity

    // 委譲先の視覚チューニング値を継承（未指定フィールドはエンジン側のデフォルトが効く）
    this.parallax                = this._delegate.parallax
    this.starConfig              = this._delegate.starConfig
    this.hazardConfig            = this._delegate.hazardConfig
    this.particleColors          = this._delegate.particleColors
    this.groundLineAlpha         = this._delegate.groundLineAlpha
    this.groundDashAlpha         = this._delegate.groundDashAlpha
    this.verticalBackgroundLayers = this._delegate.verticalBackgroundLayers
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
