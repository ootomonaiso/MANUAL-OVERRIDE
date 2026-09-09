/**
 * game/systems/PlatformerFeature.ts
 * 縦スクロールプラットフォームアクションのフィーチャー。
 *
 * 一方通行プラットフォーム（safe ハザード）への上から着地、
 * 二段ジャンプ、溶岩上昇による即死、プラットフォームの水平漂動を処理する。
 *
 * 物理計算の流れ:
 * - preUpdate で vx（水平移動）と vy（重力積分 + ジャンプ）を設定
 * - MovementFeature は縦モードで毎フレーム p.vy を上書きするため、
 *   platformer 有効時には p.vy 設定をスキップする（MovementFeature 側の実装依存）
 *   これにより p.vy が PlatformerFeature によって独占され、
 *   通常の重力積分（p.vy += g*dt の累積）が成立する。
 *
 * 着地判定は「sweped（本フレームに頂上を掃引）」と「banded（バンド内着地）」の
 * 2 方式を併用。高速落下でも 24px バンドを飛び越えて着地できる。
 *
 * 着地後はプラットフォームに固定される（carry-while-standing）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { PLATFORMER } from '../../data/tunables'
import { PLAYER_PHYSICS } from '../../data/gameBalance'
import { soundManager } from '../../plugins/SoundManager'
import { PixelCanvas } from '../render'
import type { Player, Hazard } from '../entities'

// 溶岩表面の明線太さ（px）。PixelCanvas.rect は 4px グリッドへスナップするため
// ファイルトップ定数として宣言し、balance 値ではない実装固有値であることを明示する。
const LAVA_SURFACE_LINE_PX = 4

// 溶岩表面の熱ハaze 高さ比率（lavaHeight の 1/5）。表面の上方へ薄いグローを描く。
const LAVA_GLOW_HEIGHT_RATIO = 1 / 5

// 溶岩表面下の熱帯高さ比率（lavaHeight の 0.35）。表面直下の明るい帯。
const LAVA_HEAT_HEIGHT_RATIO = 0.35

// プラットフォームに固定される際の許容バンド幅（px）。
// 両側 [top − band, top + band] で判定する。
// 実エンジンでは hazard が update より前に h.y += speed*dt で下降するため、
// 着地後にはプレイヤー底辺がプラットフォーム頂上より上に位置する。
// 基準速度 300px/s, 60fps で 1 フレームの相対位移は ≈4.6px、最大速度 450px/s で ≈7.1px。
// band=16px はすべての速度で収まる余裕を持つ。
const STANDING_CARRY_BAND_PX = 16

// 漂動 sin 位相のハザード Y 座標依存係数。漂動速度に位置依存の位相偏移を加える。
const DRIFT_PHASE_PER_PX = 0.01

// ジャンプ回数の最大値（double_jump feature 有効時 2、無効時 1）。
function _maxJumps(r: import('../../domain/types').RuntimeRules): number {
  return r.features.has('double_jump') ? 2 : 1
}

export class PlatformerFeature implements FeatureSystem {
  readonly handles = ['platformer'] as const

  // ─── 状態 ────────────────────────────────────────────────────────────
  /** 溶岩表面の画面 Y からの相対オフセット（px）。0 = 画面下端、負 = 画面内。resize 安全 */
  private lavaSurfaceGap = 0
  /** 前フレームのプレイヤー底辺 Y（着地 swept 判定用） */
  private prevBottom = 0
  /** 漂動 sin 位相の累積（秒） */
  private driftTime = 0
  /** 溶岩死の一回性ガード */
  private lavaDeathFired = false
  /** onManualUpdated 初回 = 全初期化 */
  private firstInit = true
  /** 新ゲーム検出用: 各 SideScroller が Player を新規生成するため、同一性で区別できる */
  private lastPlayer: Player | null = null
  /** 現在プレイヤーが固定されているプラットフォーム（standing carry 用） */
  private standingOn: Hazard | null = null

  // ─── ライフサイクル ──────────────────────────────────────────────────

  /**
   * ゲーム開始時に 1 回呼ばれる（エンジンからは onManualUpdated 経由）。
   * 溶岩を画面下端より下（オフスクリーン）に初期化し、漂動タイマーをリセットする。
   *
   * 縦モードには床がないため、プレイヤーは落下して画面下端（底辺 y=H）で
   * クランプされ静止する。溶岩を画面下端より lavaStartOffset だけ下から上昇
   * させ始めることで、最初のプラットフォーム（出現 + 画面降下で約 3 秒）に
   * 到達するまでの猶予時間を確保する（猶予 = lavaStartOffset / lavaRiseRate 秒）。
   *
   * 溶岩位置は画面下端からの相対オフセット（lavaSurfaceGap）で管理し、
   * リサイズ時にも正確に追従する。
   */
  onInit(world: MutableWorld): void {
    this.lavaSurfaceGap = PLATFORMER.lavaStartOffset
    this.prevBottom = world.player.y + world.player.h
    this.driftTime = 0
    this.lavaDeathFired = false
    this.standingOn = null
    world.player.vy = 0
    this.lastPlayer = world.player
  }

  /**
   * 説明書バージョン更新時に呼ばれる（updateRules 経由）。
   * firstInit が true のとき、または player インスタンスが異なる（新ゲーム）ときは
   * 全初期化を行う。同一ゲーム中の更新では溶岩位置を保持し続ける（#179 型バグ回避）。
   */
  onManualUpdated(world: MutableWorld, _versionKey: string): void {
    const isFresh = this.lastPlayer !== world.player
    if (this.firstInit || isFresh) {
      this.onInit(world)
      this.firstInit = false
    }
    // 同一 player かつ非初回のときは何もしない（溶岩位置をリセットしない）
    // リセットすると実行中に溶岩が画面下へ巻き戻る（#179 型バグ）
  }

  /**
   * ジャンルが非アクティブ化されたときに呼ばれる。
   * 全状態を初期値へ戻し、次回の onManualUpdated で再初期化されるようにする。
   */
  onDisable(_world: MutableWorld): void {
    this.lavaSurfaceGap = 0
    this.prevBottom = 0
    this.driftTime = 0
    this.lavaDeathFired = false
    this.firstInit = true
    this.lastPlayer = null
    this.standingOn = null
  }

  // ─── preUpdate（物理計算前）────────────────────────────────────────────

  preUpdate(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const r = world.rules
    const p = world.player

    if (!r.features.has('platformer')) return

    // 水平移動: platformer 固有の高速（フルウィンドウ幅でプラットフォームへ到達するため）
    p.vx = input.keys.has(r.controls.moveRight)
      ? PLATFORMER.runSpeed
      : input.keys.has(r.controls.moveLeft)
        ? -PLATFORMER.runSpeed
        : 0

    // 純重力: 前フレームから蓄積した p.vy を積分（MovementFeature は platformer 有効時に
    // p.vy を設定しないため、これが唯一の速度ソース。端末速度でクランプ）
    p.vy = Math.min(p.vy + PLATFORMER.gravity * dt, PLATFORMER.maxFallSpeed)

    // ジャンプ: 接地時またはジャンプ回数残があるとき
    if (input.justPressed.has(r.controls.jump) && (p.onGround || p.jumpsLeft > 0)) {
      if (p.onGround) {
        p.jumpsLeft = _maxJumps(r)
      }
      p.vy = PLAYER_PHYSICS.jumpVelocity
      p.jumpsLeft -= 1
      p.onGround = false
      // 着地固定を解除
      this.standingOn = null
      soundManager.onJump()
      // 統計にジャンプを記録（横スクロールのジャンプ統計と統一）
      world.addJump()
    }
  }

  // ─── update（物理計算後）──────────────────────────────────────────────

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    const r = world.rules
    const p = world.player

    if (!r.features.has('platformer')) return

    const W = world.canvas.width
    const H = world.canvas.height

    // 1. 着地固定: 前フレームに固定していたプラットフォームの上に乗っているか確認
    if (this.standingOn) {
      const sx = world.getHazardScreenX(this.standingOn)
      const stillOverlapping = p.x < sx + this.standingOn.w && p.x + p.w > sx
      // 両側バンド: [top − band, top + band]
      const stillWithinBand = p.y + p.h >= this.standingOn.rect.y - STANDING_CARRY_BAND_PX
        && p.y + p.h <= this.standingOn.rect.y + STANDING_CARRY_BAND_PX
      if (stillOverlapping && stillWithinBand) {
        // 固定状態を維持: プラットフォームと一緒に下降
        p.y = this.standingOn.rect.y - p.h
        p.vy = 0
        p.onGround = true
      } else {
        // 固定状態解除（ジャンプした / 水平移動で外れた）
        this.standingOn = null
      }
    }

    // 2. 一方通行プラットフォーム着地（safe ハザードのみ）
    for (const h of world.hazards) {
      if (!h.isSafe) continue
      const sx = world.getHazardScreenX(h)
      // 水平重なり
      if (!(p.x < sx + h.w && p.x + p.w > sx)) continue
      // 上昇中（p.vy < 0）は下から通過するため着地しない
      if (p.vy < 0) continue
      const top = h.rect.y
      const bottom = p.y + p.h
      // swept: 本フレームに頂上を上から下へ掃引
      const swept = this.prevBottom <= top && bottom >= top
      // banded: 頂上〜 +threshold バンド内
      const banded = bottom >= top && bottom <= top + PLATFORMER.platformLandingThreshold
      if (swept || banded) {
        p.y = top - p.h
        p.vy = 0
        p.onGround = true
        p.jumpsLeft = _maxJumps(r)
        // 着地後、プラットフォームに固定
        this.standingOn = h
      }
    }

    // 3. 溶岩上昇（画面下端からの相対オフセットを減少）
    this.lavaSurfaceGap -= PLATFORMER.lavaRiseRate * dt

    // 4. 溶岩衝突（即死）: 溶岩表面がプレイヤー底辺に到達
    const lavaScreenY = H + this.lavaSurfaceGap
    if (!this.lavaDeathFired && p.y + p.h >= lavaScreenY) {
      this.lavaDeathFired = true
      world.modifyPlayerHp(-world.player.maxHp)
    }

    // 5. 漂動（safe ハザードのみ）
    //    vertical_scroll feature は有効にしない（MovementFeature 側の全ハザードドリフト
    //    と二重加算になるため）
    this.driftTime += dt
    for (const h of world.hazards) {
      if (!h.isSafe) continue
      const drift = Math.sin(
        this.driftTime * PLATFORMER.movingPlatformDriftFreq + h.y * DRIFT_PHASE_PER_PX,
      ) * PLATFORMER.movingPlatformDriftAmp * dt
      h.x = Math.max(0, Math.min(W - h.w, h.x + drift))
    }

    // 6. 前フレームのプレイヤー底辺を記録（次フレームの着地 swept 判定用）
    this.prevBottom = p.y + p.h
  }

  // ─── render（溶岩描画）────────────────────────────────────────────────

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('platformer')) return

    const W = world.canvas.width
    const H = world.canvas.height
    // 溶岩表面の画面 Y（相対オフセットから計算）
    const topY = H + this.lavaSurfaceGap
    if (topY >= H) return

    const px = new PixelCanvas(ctx)
    const glowH = PLATFORMER.lavaHeight * LAVA_GLOW_HEIGHT_RATIO    // 表面 12px 上の熱ハaze
    const heatH = PLATFORMER.lavaHeight * LAVA_HEAT_HEIGHT_RATIO    // 表面下の明るい帯 21px

    // 表面上の熱ハaze（薄い要素は withAlpha ではなく rgba 直接）
    px.rect(0, topY - glowH, W, glowH, 'rgba(255,170,0,0.22)')
    // 本体
    px.rect(0, topY, W, H - topY, PLATFORMER.lavaColor)
    // 表面下の熱帯
    px.rect(0, topY + LAVA_SURFACE_LINE_PX, W, heatH, 'rgba(255,170,0,0.3)')
    // 表面の明線
    px.rect(0, topY, W, LAVA_SURFACE_LINE_PX, PLATFORMER.lavaGlowColor)
  }

  // ─── テスト用 getter ──────────────────────────────────────────────────

  /** 溶岩表面の画面下端からの相対オフセット（px）。負 = 画面内、0 = 画面下端、正 = 画面外 */
  getLavaSurfaceGap(): number {
    return this.lavaSurfaceGap
  }
}
