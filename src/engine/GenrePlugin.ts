/**
 * engine/GenrePlugin.ts
 *
 * ジャンルプラグインのインターフェース。
 * 「見た目・スポーン・ジャンル固有のアップデート」を1クラスに集約する。
 *
 * 新しいジャンルを追加するには:
 * 1. このインターフェースを実装したクラスを src/genres/ に作る
 * 2. GameRegistry.registerGenre() で登録する
 *    → src/genres/index.ts に1行追加するだけ
 */

import type { GenreId } from '../domain/types'
import type { MutableWorld, SpawnEntry } from './types'

export interface GenrePlugin {
  readonly id: GenreId

  // ─── 視覚テーマ（必須） ───────────────────────────────────────────
  /** 空のグラデーション [上端色, 下端色] */
  readonly skyColors: readonly [string, string]
  /** 地面のグラデーション [上端色, 下端色] */
  readonly groundColors: readonly [string, string]
  /** 遠景（山・シルエット）の塗り色 */
  readonly farLayerColor: string
  /** 中景（木・建物・岩）の塗り色 */
  readonly midLayerColor: string
  /** 星フィールドの色（undefined なら星を描かない） */
  readonly starColor?: string
  /** ハザードパレット */
  readonly palette: {
    danger: string; dangerGlow: string
    safe: string;   safeGlow: string
  }

  // ─── ハザードスポーンテーブル ─────────────────────────────────────
  /**
   * 出現するハザードのテーブル。
   * sideScroller はこのテーブルを参照して距離に応じた重みで選択する。
   */
  readonly spawnTable: readonly SpawnEntry[]

  // ─── 視覚チューニング（省略可） ──────────────────────────────────

  /**
   * 背景の視差スクロール係数。省略時は CAMERA.parallax* を使用。
   * 小さいほど遠景がゆっくり動く。
   */
  readonly parallax?: {
    stars?: number  // デフォルト 0.02
    far?:   number  // デフォルト 0.08
    mid?:   number  // デフォルト 0.25
  }

  /**
   * 星フィールドのカスタマイズ。starColor が undefined なら無効。
   */
  readonly starConfig?: {
    /** セクターあたりの星数（デフォルト 18） */
    density?: number
    /** [min, max] px（デフォルト [1, 2]） */
    sizeRange?: [number, number]
    /** [min, max] 透明度（デフォルト [0.3, 0.75]） */
    alphaRange?: [number, number]
  }

  /**
   * ハザードの演出カスタマイズ。省略時は HAZARD_VFX の値を使用。
   */
  readonly hazardConfig?: {
    /** shadowBlur の値（デフォルト 12、0 でグロー無効） */
    glowBlur?: number
    /** パルス角速度 rad/s（デフォルト 1.5） */
    pulseSpeed?: number
    /** パルス振幅 0〜1（デフォルト 0.08） */
    pulseAmplitude?: number
  }

  /**
   * プレイヤー描画のスケール係数（デフォルト 1.0）。
   * 1.5 にするとプレイヤーが1.5倍大きく描画される。
   */
  readonly playerScale?: number

  /**
   * このジャンル固有のパーティクル色上書き。
   * 省略したキーは tunables.ts の VFX デフォルト色を使用。
   */
  readonly particleColors?: {
    jump?:  string
    land?:  string
    hit?:   string
    death?: readonly string[]
  }

  /**
   * 地面ラインの透明度（デフォルト BACKGROUND.groundLineAlpha = 0.08）。
   */
  readonly groundLineAlpha?: number

  /**
   * 地面ダッシュ模様の透明度（デフォルト BACKGROUND.dashAlpha = 0.04）。
   * 0 にすると非表示。
   */
  readonly groundDashAlpha?: number

  /**
   * スクロール速度ボーナス px/s。
   * RuntimeRules.scrollSpeed の最終計算に加算される（省略時 0）。
   * tempo パラメータとは別に、ジャンル固有の速度補正をかけたい時に使う。
   */
  readonly scrollSpeedBonus?: number

  /**
   * 縦スクロールモードでも drawFarLayer / drawMidLayer を呼ぶか（省略時 false）。
   * 縦モードはデフォルトで空グラデーション＋星のみを描き遠景・中景を省略するが、
   * このフラグを true にしたジャンルだけ遠景・中景レイヤーを描画する。
   */
  readonly verticalBackgroundLayers?: boolean

  // ─── 描画フック（必須） ───────────────────────────────────────────
  /**
   * 遠景（山稜・宇宙岩礁など）を描く。
   * sideScroller が _drawBackground 内から呼ぶ。
   */
  drawFarLayer(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    W: number,
    gY: number,
  ): void

  /**
   * 中景（木・建物・岩など）を描く。
   * sideScroller が _drawBackground 内から呼ぶ。
   */
  drawMidLayer(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    W: number,
    gY: number,
  ): void

  /**
   * プレイヤーを描く（ジャンル別外見）。
   * translate 済みの座標系（左上隅が原点）で描くこと。
   * playerScale が適用された後の座標系で呼ばれる。
   * @param w プレイヤーの幅
   * @param h プレイヤーの高さ
   * @param onGround 接地フラグ
   * @param runCycle ランニングアニメ位相 (0〜1 の繰り返し)
   */
  drawPlayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    onGround: boolean,
    runCycle: number,
  ): void

  // ─── オプショナルフック ───────────────────────────────────────────
  /**
   * ジャンル確定直後に1回だけ呼ばれる（初期化・演出用）。
   * 省略可。
   */
  onGenreLocked?(world: MutableWorld): void

  /**
   * 毎フレーム呼ばれるジャンル固有の更新処理。
   * 通常は Feature System で実装するが、ジャンル全体に適用したい
   * 処理（例: BGM テンポ変更など）はここに書く。
   * 省略可。
   */
  onUpdate?(world: MutableWorld, dt: number): void

  /**
   * ハザードを描画する直前に呼ばれるフック。
   * 独自のハザード描画ロジックを差し込める。
   * true を返すとデフォルトのハザード描画をスキップする。
   * 省略可。
   */
  drawHazard?(
    ctx: CanvasRenderingContext2D,
    hazard: import('../game/entities').Hazard,
    sx: number,
    world: MutableWorld,
  ): boolean | void

  /**
   * 地面より手前に追加の前景レイヤーを描くフック。
   * パーティクルより前、プレイヤーより後に描画される。
   * 省略可。
   */
  drawForeground?(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    W: number,
    H: number,
    gY: number,
  ): void

  /**
   * ジャンル固有 HUD を描画する（Canvas オーバーレイ）。
   * Feature System の render() とは別に、ジャンル全体のステータス表示に使う。
   * 例: ボスのHP バー、タワー残数、隠密ゲージなど。
   * 省略可。
   */
  drawGenreHUD?(
    ctx: CanvasRenderingContext2D,
    world: MutableWorld,
    W: number,
    H: number,
  ): void

  /**
   * プレイヤーがジャンプした瞬間に呼ばれる。
   * ジャンプエフェクトや音響キューの追加に使う。
   * 省略可。
   */
  onPlayerJump?(world: MutableWorld): void

  /**
   * プレイヤーが着地した瞬間に呼ばれる。
   * 着地エフェクト、ダウンビート演出などに使う。
   * 省略可。
   */
  onPlayerLand?(world: MutableWorld): void

  /**
   * ハザードが破壊（撃破）された時に呼ばれる。
   * 撃破演出、ドロップアイテム生成などに使う。
   * 省略可。
   */
  onHazardDestroyed?(
    world: MutableWorld,
    hazard: import('../game/entities').Hazard,
  ): void

  /**
   * 説明書バージョンが更新された時に1回呼ばれる。
   * 環境変化、BGMテンポ更新などの演出開始に使う。
   * 省略可。
   */
  onManualUpdated?(world: MutableWorld, versionKey: string): void
}
