/**
 * game/systems/ExtraMovementFeature.ts
 * 拡張移動フィーチャー: dash / wall_jump
 *
 * dash    : Shift キー（controls.dash 未設定時）で 0.3 秒間加速バースト（2 秒クールダウン）
 *           MovementFeature が非アクティブなジャンルでは基本的な左右移動も担う。
 * wall_jump: 未実装（壁面検出システムが必要なため将来対応）
 *
 * slide / gravity_flip / vertical_scroll : 使用ジャンルなし → 削除済み
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { PLAYER_PHYSICS } from '../../data/gameBalance'

const DASH_MULTIPLIER = 2.8
const DASH_DURATION   = 0.25  // ダッシュ持続秒数
const DASH_COOLDOWN   = 2.0   // 再使用待機秒数

/** MovementFeature が担当する Feature（これらがどれも active でない場合、基本移動をここで担う） */
const MOVEMENT_FEATURE_HANDLES = ['auto_run', 'slow_precise', 'double_jump', 'long_air'] as const

export class ExtraMovementFeature implements FeatureSystem {
  readonly handles = ['dash', 'wall_jump'] as const

  private dashTimer    = 0
  private dashCooldown = 0
  private wallJumpWarned = false

  onInit(): void {
    this.dashTimer    = 0
    this.dashCooldown = 0
  }

  preUpdate(world: MutableWorld, input: InputSnapshot, dt: number): void {
    // ─── wall_jump: 未実装（一度だけ警告） ─────────────────────────
    if (world.rules.features.has('wall_jump') && !this.wallJumpWarned) {
      this.wallJumpWarned = true
      console.warn('[ExtraMovementFeature] wall_jump は未実装です（壁面検出システムが必要）')
    }

    if (!world.rules.features.has('dash')) return

    // ─── タイマー更新 ───────────────────────────────────────────────
    if (this.dashTimer    > 0) this.dashTimer    -= dt
    if (this.dashCooldown > 0) this.dashCooldown -= dt

    // ─── ダッシュ発動チェック ───────────────────────────────────────
    const dashKey = world.rules.controls.dash ?? 'Shift'
    const canDash = this.dashTimer <= 0 && this.dashCooldown <= 0
    if (canDash && input.justPressed.has(dashKey)) {
      this.dashTimer    = DASH_DURATION
      this.dashCooldown = DASH_COOLDOWN
    }

    const p        = world.player
    const r        = world.rules
    const runSpeed = PLAYER_PHYSICS.runSpeed

    // ─── MovementFeature 非アクティブ時の基本移動 ─────────────────
    // auto_run 系フィーチャーが1つもない横スクロール時のみ担当
    const hasMovementFeature = MOVEMENT_FEATURE_HANDLES.some(f => r.features.has(f))
    if (!hasMovementFeature && r.scrollAxis !== 'y') {
      const movingLeft  = input.keys.has(r.controls.moveLeft)
      const movingRight = input.keys.has(r.controls.moveRight)
      p.vx = movingRight ? runSpeed : movingLeft ? -runSpeed : 0
    }

    // ─── ダッシュ中: vx を倍加 ─────────────────────────────────────
    if (this.dashTimer > 0) {
      if (p.vx > 0) {
        p.vx = runSpeed * DASH_MULTIPLIER
      } else if (p.vx < 0) {
        p.vx = -runSpeed * DASH_MULTIPLIER
      } else {
        p.vx = runSpeed * DASH_MULTIPLIER  // 静止中は右方向にダッシュ
      }
    }
  }

  update(_world: MutableWorld, _input: InputSnapshot, _dt: number): void {
    // 主処理は preUpdate で完結
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('dash') || this.dashTimer <= 0) return

    // ダッシュ中: モーションブラー風の残像
    const p     = world.player
    const alpha = (this.dashTimer / DASH_DURATION) * 0.45
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#ffcc00'
    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(p.x - i * 10, p.y + 6, p.w * 0.8, p.h - 12)
    }
    ctx.restore()
  }

  onManualUpdated(): void {
    this.dashTimer    = 0
    this.dashCooldown = 0
  }
}
