/**
 * game/systems/ExtraMovementFeature.ts
 * 拡張移動フィーチャーを担当。
 *
 * ✅ dash:            短時間の速度バースト + 無敵フレーム + トレイル演出
 * ✅ wall_jump:       空中で画面端（壁扱い）に到達した状態でジャンプすると
 *                     ジャンプ権を1回復活させ、反対方向へ押し出す
 * ✅ vertical_scroll: 縦スクロールモード時、ハザードを左右にドリフトさせ
 *                     弾幕らしい蛇行を演出する
 *
 * ⚠️ slide / gravity_flip は現在どのジャンルからも有効化されないため未実装のまま。
 *    有効化された場合は console.warn で警告を出す。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { PLAYER_PHYSICS } from '../../data/gameBalance'

/** 縦スクロール時のハザードドリフト設定 */
const VERTICAL_DRIFT_FREQ = 1.6   // rad/s
const VERTICAL_DRIFT_AMP  = 90    // px/s（振幅速度）

/** MovementFeature が担当する Feature（これらがどれも active でない場合、基本移動をここで担う） */
const MOVEMENT_FEATURE_HANDLES = ['auto_run', 'slow_precise', 'double_jump', 'long_air'] as const

interface DashState {
  cooldown: number
  timer: number
  dir: 1 | -1
}

export class ExtraMovementFeature implements FeatureSystem {
  readonly handles = ['dash', 'wall_jump', 'vertical_scroll'] as const

  private dash: DashState = { cooldown: 0, timer: 0, dir: 1 }
  private driftTime = 0

  onInit(_world: MutableWorld): void {
    this.dash = { cooldown: 0, timer: 0, dir: 1 }
    this.driftTime = 0
  }

  /** 物理計算前: dash / wall_jump は p.vx / p.jumpsLeft を直接操作する */
  preUpdate(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const r = world.rules
    const p = world.player

    if (r.features.has('dash')) {
      this._updateDash(world, input, dt)
    }

    if (r.features.has('wall_jump') && !p.onGround && p.jumpsLeft <= 0) {
      const W = world.canvas.width
      const atLeftWall  = p.x <= PLAYER_PHYSICS.playerMinX + 0.5
      const atRightWall = p.x >= W * PLAYER_PHYSICS.playerMaxXRatio - 0.5
      if ((atLeftWall || atRightWall) && input.justPressed.has(r.controls.jump)) {
        p.jumpsLeft = 1
        p.vx = (atLeftWall ? 1 : -1) * PLAYER_PHYSICS.wallJumpPushSpeed
        for (let i = 0; i < 5; i++) {
          const angle = (atLeftWall ? 0 : Math.PI) + (Math.random() - 0.5) * 1.2
          const speed = 80 + Math.random() * 80
          world.addParticle(
            p.x + (atLeftWall ? 0 : p.w), p.y + p.h * 0.5,
            Math.cos(angle) * speed, Math.sin(angle) * speed - 40,
            0.35, '#aaddff', 3,
          )
        }
      }
    }

    // MovementFeature 非アクティブ時の基本移動（auto_run 系が1つもないジャンル向け）
    const hasMovementFeature = MOVEMENT_FEATURE_HANDLES.some(f => r.features.has(f))
    if (!hasMovementFeature && r.scrollAxis !== 'y' && this.dash.timer <= 0) {
      const runSpeed = PLAYER_PHYSICS.runSpeed
      p.vx = input.keys.has(r.controls.moveRight) ? runSpeed
           : input.keys.has(r.controls.moveLeft)  ? -runSpeed
           : 0
    }

    const unimplementedFeatures = ['slide', 'gravity_flip'] as const
    for (const feature of unimplementedFeatures) {
      if (r.features.has(feature)) {
        console.warn(`⚠️ ExtraMovementFeature: '${feature}' is not yet implemented`)
      }
    }
  }

  /** 物理計算後: vertical_scroll のハザードドリフト */
  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('vertical_scroll')) return
    if (world.rules.scrollAxis !== 'y') return

    this.driftTime += dt
    const W = world.canvas.width
    for (const h of world.hazards) {
      const drift = Math.sin(this.driftTime * VERTICAL_DRIFT_FREQ + h.y * 0.01) * VERTICAL_DRIFT_AMP * dt
      h.x = Math.max(0, Math.min(W - h.w, h.x + drift))
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('dash') || this.dash.timer <= 0) return

    const p     = world.player
    const alpha = (this.dash.timer / PLAYER_PHYSICS.dashDurationSec) * 0.45
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#ffcc00'
    for (let i = 1; i <= 3; i++) {
      ctx.fillRect(p.x - i * 10, p.y + 6, p.w * 0.8, p.h - 12)
    }
    ctx.restore()
  }

  onManualUpdated(_world: MutableWorld, _versionKey: string): void {
    this.dash = { cooldown: 0, timer: 0, dir: 1 }
    this.driftTime = 0
  }

  private _updateDash(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const p = world.player
    const r = world.rules
    const dashKey = r.controls.dash ?? 'Shift'

    this.dash.cooldown = Math.max(0, this.dash.cooldown - dt)
    this.dash.timer    = Math.max(0, this.dash.timer - dt)

    if (input.justPressed.has(dashKey) && this.dash.cooldown <= 0) {
      this.dash.timer    = PLAYER_PHYSICS.dashDurationSec
      this.dash.cooldown = PLAYER_PHYSICS.dashCooldownSec
      this.dash.dir = (p.vx < 0 ? -1 : 1)
      p.invincible = Math.max(p.invincible, PLAYER_PHYSICS.dashIframesSec)

      for (let i = 0; i < 8; i++) {
        const speed = 60 + Math.random() * 100
        world.addParticle(
          p.x + (this.dash.dir > 0 ? 0 : p.w), p.y + p.h * 0.5,
          -this.dash.dir * speed + (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 60,
          0.3, '#ffffff', 3,
        )
      }
    }

    if (this.dash.timer > 0) {
      p.vx = this.dash.dir * PLAYER_PHYSICS.dashSpeed
      world.addParticle(
        p.x + p.w * 0.5, p.y + p.h * 0.5,
        -this.dash.dir * 30, (Math.random() - 0.5) * 20,
        0.2, 'rgba(255,255,255,0.5)', 4,
      )
    }
  }
}
