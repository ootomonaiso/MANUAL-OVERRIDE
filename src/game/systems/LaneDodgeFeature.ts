/**
 * game/systems/LaneDodgeFeature.ts
 *
 * 3レーン制で障害物を回避する「疾走感」ランナー。
 * - 3レーン制: 画面を上下3レーンに分割
 * - レーン切替: ArrowUp/ArrowDown で隣接レーンに移動（0.15秒でスムーズに移動）
 * - レーンロック: 左右キー無効化（vx = 0 に固定）
 * - コヨーテタイム: 切替中のキャンセル（0.1秒以内の再入力で即座に新しい切替へ）
 * - 速度加速: 10秒ごとに scrollSpeed を +10px/s（最大 +100px/s）
 * - 衝突判定: 同じレーン + X座標が重なったら死亡
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

// レーン数
const LANE_COUNT = 3
// レーン切替のスムーズ移動時間（秒）
const LANE_SWITCH_DURATION = 0.15
// コヨーテタイム: 切替中のキャンセル許容窓（秒）
const COYOTE_TIME = 0.1
// 速度加速: 間隔（秒）
const SPEED_ACCEL_INTERVAL = 10
// 速度加速: 1回あたりの増加量（px/s）
const SPEED_ACCEL_AMOUNT = 10
// 速度加速: 最大追加量（px/s）
const MAX_SPEED_BONUS = 100

// レーンインデックス（0=上, 1=中, 2=下）
type LaneIndex = 0 | 1 | 2

export class LaneDodgeFeature implements FeatureSystem {
  readonly handles = ['lane_dodge'] as const

  private currentLane: LaneIndex = 1 // 中央レーンから開始
  private targetLane: LaneIndex = 1
  private laneSwitchTimer = 0
  private laneSwitchStartY = 0
  private laneSwitchEndY = 0

  // 速度加速
  private _speedAccelTimer = 0
  private _speedBonus = 0

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    this._laneLock(world)
    this._handleLaneSwitchInput(world, input)
    this._updateLaneAnimation(world, dt)
    // 切替中は currentLane が旧レーンのままなので、_enforceLaneBounds だと
    // 旧レーンの帯にクランプされて空中浮遊するバグを回避するためスキップ
    if (this.laneSwitchTimer <= 0) {
      this._enforceLaneBounds(world)
    }
    this._adjustScrollSpeed(world, dt)
  }

  render(_ctx: CanvasRenderingContext2D, _world: MutableWorld): void {
    // レーン表示は不要（背景の白線で代用）
  }

  onManualUpdated(): void {
    this.currentLane = 1
    this.targetLane = 1
    this.laneSwitchTimer = 0
    this._speedAccelTimer = 0
    this._speedBonus = 0
  }

  // ─── 内部 ────────────────────────────────────────────────────────

  /** レーンロック: 左右移動を無効化 */
  private _laneLock(world: MutableWorld): void {
    world.player.vx = 0
  }

  private _handleLaneSwitchInput(world: MutableWorld, input: InputSnapshot): void {
    const H = world.canvas.height
    const laneHeight = H / LANE_COUNT

    // コヨーテタイム: 切替中のキャンセル
    // laneSwitchTimer > 0 かつ残り時間が COYOTE_TIME 以内のとき、
    // 再度キーを押すと即座にキャンセルして新しい切替を開始
    if (this.laneSwitchTimer > 0 && this.laneSwitchTimer < COYOTE_TIME) {
      // 既存の切替をキャンセル
      this.laneSwitchTimer = 0
      // currentLane を targetLane に即座に合わせる
      this.currentLane = this.targetLane
      // 現在の Y を新しい切替の開始位置として記録
      this.laneSwitchStartY = world.player.y
    }

    // ArrowUp: 上のレーンへ（currentLane > 0 のとき）
    if (input.justPressed.has('ArrowUp') && this.currentLane > 0) {
      this._startLaneSwitch(this.currentLane - 1 as LaneIndex, world.player.y, H, laneHeight)
    }
    // ArrowDown: 下のレーンへ（currentLane < 2 のとき）
    if (input.justPressed.has('ArrowDown') && this.currentLane < 2) {
      this._startLaneSwitch(this.currentLane + 1 as LaneIndex, world.player.y, H, laneHeight)
    }
  }

  private _startLaneSwitch(target: LaneIndex, currentY: number, canvasH: number, laneHeight: number): void {
    this.targetLane = target
    this.laneSwitchTimer = LANE_SWITCH_DURATION
    this.laneSwitchStartY = currentY
    this.laneSwitchEndY = this._laneCenterY(target, canvasH, laneHeight)
  }

  private _laneCenterY(lane: LaneIndex, canvasH: number, laneHeight: number): number {
    return lane * laneHeight + laneHeight / 2 - 36 / 2 // player.h = 36 (def)
  }

  private _updateLaneAnimation(world: MutableWorld, dt: number): void {
    if (this.laneSwitchTimer <= 0) return

    this.laneSwitchTimer -= dt
    if (this.laneSwitchTimer <= 0) {
      this.laneSwitchTimer = 0
      this.currentLane = this.targetLane
      // アニメーション完了時にプレイヤーをターゲットレーンにTeleport
      const H = world.canvas.height
      const laneHeight = H / LANE_COUNT
      world.player.y = this._laneCenterY(this.currentLane, H, laneHeight)
    } else {
      // スムーズ移動（線形補間）
      const t = 1 - this.laneSwitchTimer / LANE_SWITCH_DURATION
      world.player.y = this.laneSwitchStartY + (this.laneSwitchEndY - this.laneSwitchStartY) * t
    }
  }

  private _enforceLaneBounds(world: MutableWorld): void {
    const player = world.player
    const H = world.canvas.height
    const laneHeight = H / LANE_COUNT
    const laneTop = this.currentLane * laneHeight
    const laneBottom = (this.currentLane + 1) * laneHeight
    player.y = Math.max(laneTop, Math.min(laneBottom - player.h, player.y))
  }

  private _adjustScrollSpeed(world: MutableWorld, dt: number): void {
    this._speedAccelTimer += dt
    if (this._speedAccelTimer >= SPEED_ACCEL_INTERVAL && this._speedBonus < MAX_SPEED_BONUS) {
      this._speedAccelTimer -= SPEED_ACCEL_INTERVAL
      const increment = Math.min(SPEED_ACCEL_AMOUNT, MAX_SPEED_BONUS - this._speedBonus)
      this._speedBonus += increment
      world.rules.scrollSpeed += increment
    }
  }
}
