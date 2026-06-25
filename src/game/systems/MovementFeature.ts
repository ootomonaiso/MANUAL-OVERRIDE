import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { PLAYER_PHYSICS } from '../../data/gameBalance'
import { PHYSICS, SCORE } from '../../data/tunables'

const VERTICAL_DRIFT_FREQ = 1.6   // rad/s
const VERTICAL_DRIFT_AMP  = 90    // px/s

interface DashState { cooldown: number; timer: number; dir: 1 | -1 }

export class MovementFeature implements FeatureSystem {
  readonly handles = [
    'movement', 'auto_run', 'slow_precise', 'double_jump', 'long_air',
    'dash', 'wall_jump', 'vertical_scroll',
  ] as const

  private dash: DashState = { cooldown: 0, timer: 0, dir: 1 }
  private driftTime = 0

  onInit(world: MutableWorld): void {
    if (world.rules.features.has('double_jump')) {
      world.player.jumpsLeft = Math.max(world.player.jumpsLeft, 2)
    }
    this.dash = { cooldown: 0, timer: 0, dir: 1 }
    this.driftTime = 0
  }

  onManualUpdated(_world: MutableWorld, _versionKey: string): void {
    this.dash = { cooldown: 0, timer: 0, dir: 1 }
    this.driftTime = 0
  }

  preUpdate(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const r = world.rules
    const p = world.player

    // ─── ダッシュ ─────────────────────────────────────────────────
    if (r.features.has('dash')) this._updateDash(world, input, dt)

    // ─── 壁ジャンプ ───────────────────────────────────────────────
    if (r.features.has('wall_jump') && !p.onGround && p.jumpsLeft <= 0) {
      const W = world.canvas.width
      const atLeft  = p.x <= PLAYER_PHYSICS.playerMinX + 0.5
      const atRight = p.x >= W * PLAYER_PHYSICS.playerMaxXRatio - 0.5
      if ((atLeft || atRight) && input.justPressed.has(r.controls.jump)) {
        p.jumpsLeft = 1
        p.vx = (atLeft ? 1 : -1) * PLAYER_PHYSICS.wallJumpPushSpeed
        for (let i = 0; i < 5; i++) {
          const angle = (atLeft ? 0 : Math.PI) + (Math.random() - 0.5) * 1.2
          const speed = 80 + Math.random() * 80
          world.addParticle(
            p.x + (atLeft ? 0 : p.w), p.y + p.h * 0.5,
            Math.cos(angle) * speed, Math.sin(angle) * speed - 40, 0.35, '#aaddff', 3,
          )
        }
      }
    }

    // ─── 速度マッピング ───────────────────────────────────────────
    const runSpeed = r.features.has('slow_precise')
      ? PLAYER_PHYSICS.runSpeed * PHYSICS.slowPreciseRatio
      : PLAYER_PHYSICS.runSpeed

    if (r.scrollAxis === 'y') {
      const moveUp   = r.controls.moveUp   ? input.keys.has(r.controls.moveUp)   : false
      const moveDown = r.controls.moveDown ? input.keys.has(r.controls.moveDown) : false
      p.vx = input.keys.has(r.controls.moveRight) ? runSpeed : input.keys.has(r.controls.moveLeft) ? -runSpeed : 0
      p.vy = moveUp ? -runSpeed : moveDown ? runSpeed : 0
    } else if (this.dash.timer <= 0) {
      // ダッシュ中は _updateDash が vx を設定済み
      const isAutoRun = r.features.has('auto_run')
      p.vx = (isAutoRun || input.keys.has(r.controls.moveRight)) ? runSpeed
           : input.keys.has(r.controls.moveLeft) ? -runSpeed
           : 0
    }

    for (const f of ['slide', 'gravity_flip'] as const) {
      if (r.features.has(f)) console.warn(`⚠️ MovementFeature: '${f}' is not yet implemented`)
    }
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    const r = world.rules

    if (r.features.has('long_air') && !world.player.onGround) {
      world.addScore(SCORE.longAirScoreRate * dt)
    }

    if (r.features.has('vertical_scroll') && r.scrollAxis === 'y') {
      this.driftTime += dt
      const W = world.canvas.width
      for (const h of world.hazards) {
        const drift = Math.sin(this.driftTime * VERTICAL_DRIFT_FREQ + h.y * 0.01) * VERTICAL_DRIFT_AMP * dt
        h.x = Math.max(0, Math.min(W - h.w, h.x + drift))
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('dash') || this.dash.timer <= 0) return

    const p = world.player
    ctx.save()
    ctx.globalAlpha = (this.dash.timer / PLAYER_PHYSICS.dashDurationSec) * 0.45
    ctx.fillStyle = '#ffcc00'
    for (let i = 1; i <= 3; i++) ctx.fillRect(p.x - i * 10, p.y + 6, p.w * 0.8, p.h - 12)
    ctx.restore()
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
          (Math.random() - 0.5) * 60, 0.3, '#ffffff', 3,
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
