import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { PLAYER_PHYSICS } from '../../data/gameBalance'
import { PHYSICS, SCORE, EXTRA_MOVEMENT } from '../../data/tunables'

const SLIDE_DURATION_SEC = 0.6
const SLIDE_COOLDOWN_SEC = 0.4
const SLIDE_HEIGHT_RATIO = 0.5

interface DashState { cooldown: number; timer: number; dir: 1 | -1 }
interface SlideState { timer: number; cooldown: number; active: boolean }

export class MovementFeature implements FeatureSystem {
  readonly handles = [
    'movement', 'auto_run', 'slow_precise', 'double_jump', 'long_air',
    'dash', 'wall_jump', 'vertical_scroll', 'slide', 'gravity_flip',
  ] as const

  private dash: DashState = { cooldown: 0, timer: 0, dir: 1 }
  private slide: SlideState = { timer: 0, cooldown: 0, active: false }
  private driftTime = 0

  onInit(world: MutableWorld): void {
    if (world.rules.features.has('double_jump')) {
      world.player.jumpsLeft = Math.max(world.player.jumpsLeft, 2)
    }
    this.dash = { cooldown: 0, timer: 0, dir: 1 }
    this.slide = { timer: 0, cooldown: 0, active: false }
    this.driftTime = 0
  }

  onManualUpdated(world: MutableWorld, _versionKey: string): void {
    this.dash = { cooldown: 0, timer: 0, dir: 1 }
    // スライド中ならヒットボックスを復元
    if (this.slide.active) {
      world.player.h = PLAYER_PHYSICS.height
    }
    this.slide = { timer: 0, cooldown: 0, active: false }
    this.driftTime = 0
  }

  preUpdate(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const r = world.rules
    const p = world.player

    // ─── スライド ─────────────────────────────────────────────────
    if (r.features.has('slide')) this._updateSlide(world, input, dt)

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
        for (let i = 0; i < EXTRA_MOVEMENT.wallJumpParticleCount; i++) {
          const angle = (atLeft ? 0 : Math.PI) + (Math.random() - 0.5) * EXTRA_MOVEMENT.wallJumpParticleAngleSpread
          const speed = EXTRA_MOVEMENT.wallJumpParticleSpeedMin + Math.random() * EXTRA_MOVEMENT.wallJumpParticleSpeedRange
          world.addParticle(
            p.x + (atLeft ? 0 : p.w), p.y + p.h * 0.5,
            Math.cos(angle) * speed, Math.sin(angle) * speed + EXTRA_MOVEMENT.wallJumpParticleVyBoost,
            EXTRA_MOVEMENT.wallJumpParticleLife, EXTRA_MOVEMENT.wallJumpParticleColor, EXTRA_MOVEMENT.wallJumpParticleSize,
          )
        }
      }
    }

    // ─── 重力反転 ─────────────────────────────────────────────────
    if (r.features.has('gravity_flip')) {
      // gravity_flip は予約済み Feature（将来の実装予定）
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
    } else if (this.dash.timer <= 0 && !this.slide.active) {
      // ダッシュ中は _updateDash が vx を設定済み、スライド中は速度維持
      const isAutoRun = r.features.has('auto_run')
      p.vx = (isAutoRun || input.keys.has(r.controls.moveRight)) ? runSpeed
           : input.keys.has(r.controls.moveLeft) ? -runSpeed
           : 0
    }
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    const r = world.rules

    if (r.features.has('long_air') && !world.player.onGround) {
      world.addScore(SCORE.longAirScoreRate * dt)
    }

    // ─── スライド更新 ───────────────────────────────────────────
    if (r.features.has('slide') && this.slide.active) {
      this.slide.timer -= dt
      if (this.slide.timer <= 0) {
        this.slide.active = false
        this.slide.cooldown = SLIDE_COOLDOWN_SEC
        // ヒットボックスを元のサイズに戻す
        world.player.h = PLAYER_PHYSICS.height
      }
    } else if (r.features.has('slide')) {
      this.slide.cooldown = Math.max(0, this.slide.cooldown - dt)
    }

    if (r.features.has('vertical_scroll') && r.scrollAxis === 'y') {
      this.driftTime += dt
      const W = world.canvas.width
      for (const h of world.hazards) {
        const drift = Math.sin(this.driftTime * EXTRA_MOVEMENT.verticalDriftFreq + h.y * 0.01) * EXTRA_MOVEMENT.verticalDriftAmp * dt
        h.x = Math.max(0, Math.min(W - h.w, h.x + drift))
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const r = world.rules
    const p = world.player

    // ─── ダッシュ軌跡 ──────────────────────────────────────────
    if (r.features.has('dash') && this.dash.timer > 0) {
      ctx.save()
      ctx.globalAlpha = (this.dash.timer / PLAYER_PHYSICS.dashDurationSec) * EXTRA_MOVEMENT.dashTrailAlphaMax
      ctx.fillStyle = EXTRA_MOVEMENT.dashTrailParticleColor
      for (let i = 1; i <= 3; i++) ctx.fillRect(p.x - i * 10, p.y + 6, p.w * 0.8, p.h - 12)
      ctx.restore()
    }

    // ─── スライド中は簡易エフェクト ────────────────────────────
    if (r.features.has('slide') && this.slide.active) {
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.fillStyle = '#cc9966'
      ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2)
      ctx.restore()
    }
  }

  private _updateSlide(world: MutableWorld, input: InputSnapshot, _dt: number): void {
    const p = world.player
    const downKey = world.rules.controls.moveDown ?? 'ArrowDown'

    // 地面にいる & 下キー押下 & クールダウン中でない → スライド開始
    if (p.onGround && input.keys.has(downKey) && this.slide.cooldown <= 0 && !this.slide.active) {
      this.slide.active = true
      this.slide.timer = SLIDE_DURATION_SEC
      // ヒットボックスを縮小（背の低い障害物をくぐれるように）
      p.h = Math.max(8, PLAYER_PHYSICS.height * SLIDE_HEIGHT_RATIO)
      // スライド開始パーティクル
      for (let i = 0; i < 4; i++) {
        world.addParticle(
          p.x + Math.random() * p.w, p.y + p.h,
          (Math.random() - 0.5) * 60, Math.random() * 40 + 10,
          0.3, '#cc9966', 3,
        )
      }
    }

    // スライド中に下キーを離した → 早期終了
    if (this.slide.active && !input.keys.has(downKey)) {
      this.slide.active = false
      this.slide.cooldown = SLIDE_COOLDOWN_SEC
      p.h = PLAYER_PHYSICS.height
    }
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
      for (let i = 0; i < EXTRA_MOVEMENT.dashParticleCount; i++) {
        const speed = EXTRA_MOVEMENT.dashParticleSpeedMin + Math.random() * EXTRA_MOVEMENT.dashParticleSpeedRange
        world.addParticle(
          p.x + (this.dash.dir > 0 ? 0 : p.w), p.y + p.h * 0.5,
          -this.dash.dir * speed + (Math.random() - 0.5) * EXTRA_MOVEMENT.dashParticleSpreadX,
          (Math.random() - 0.5) * EXTRA_MOVEMENT.dashParticleSpreadY,
          EXTRA_MOVEMENT.dashParticleLife, EXTRA_MOVEMENT.dashParticleColor, EXTRA_MOVEMENT.dashParticleSize,
        )
      }
    }

    if (this.dash.timer > 0) {
      p.vx = this.dash.dir * PLAYER_PHYSICS.dashSpeed
      world.addParticle(
        p.x + p.w * 0.5, p.y + p.h * 0.5,
        -this.dash.dir * EXTRA_MOVEMENT.dashTrailParticleVy, (Math.random() - 0.5) * EXTRA_MOVEMENT.dashTrailParticleSpreadY,
        EXTRA_MOVEMENT.dashTrailParticleLife, EXTRA_MOVEMENT.dashTrailParticleColor, EXTRA_MOVEMENT.dashTrailParticleSize,
      )
    }
  }
}
