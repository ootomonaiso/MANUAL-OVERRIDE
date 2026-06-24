import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { Bullet, Hazard, rectsOverlap } from '../entities'
import { SHOOT, HAZARD_VFX } from '../../data/tunables'
import { getGenre, getActiveSystems } from '../../engine/GameRegistry'
import { soundManager } from '../../plugins/SoundManager'

interface ShootState {
  bullets: Bullet[]
  kills: number
  combo: number
  comboTimer: number
  shotCooldown: number
}

export class ShootFeature implements FeatureSystem {
  readonly handles = ['shoot', 'three_way', 'charge_shot', 'spread_shot', 'enemy_hp', 'bomb'] as const

  private state: ShootState = this._fresh()

  private _fresh(): ShootState {
    return { bullets: [], kills: 0, combo: 0, comboTimer: 0, shotCooldown: 0 }
  }

  onInit(): void { this.state = this._fresh() }
  onManualUpdated(): void { this.state = this._fresh() }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const p = world.player
    const r = world.rules
    const isVertical = r.scrollAxis === 'y'
    const shootKey = r.controls.shoot?.toLowerCase() ?? 'z'
    const shootJust = input.justPressed.has(shootKey)
    const W = world.canvas.width
    const s = this.state

    s.shotCooldown -= dt
    s.comboTimer   -= dt
    if (s.comboTimer <= 0) s.combo = 0

    // ─── 発射 ────────────────────────────────────────────────────
    let shotFired = false
    if (shootJust && s.shotCooldown <= 0 && r.features.has('shoot')) {
      s.shotCooldown = SHOOT.shotCooldown
      shotFired = true
      const spd = SHOOT.bulletSpeed

      if (isVertical) {
        const bx = p.x + SHOOT.bulletWidth / 2
        const by = p.y - SHOOT.bulletHeight
        if (r.features.has('three_way')) {
          s.bullets.push(
            new Bullet(bx, by, 0, -spd),
            new Bullet(bx, by, -spd * SHOOT.threeWayYRatio, -spd * SHOOT.threeWaySpeedRatio),
            new Bullet(bx, by,  spd * SHOOT.threeWayYRatio, -spd * SHOOT.threeWaySpeedRatio),
          )
        } else {
          s.bullets.push(new Bullet(bx, by, 0, -spd))
        }
      } else {
        const playerWorldX = p.x + world.cameraX
        const bx = playerWorldX + SHOOT.bulletWidth
        const by = p.y + p.h / 2 - SHOOT.bulletHeight / 2
        if (r.features.has('three_way')) {
          s.bullets.push(
            new Bullet(bx, by, spd, 0),
            new Bullet(bx, by, spd * SHOOT.threeWaySpeedRatio, -spd * SHOOT.threeWayYRatio),
            new Bullet(bx, by, spd * SHOOT.threeWaySpeedRatio,  spd * SHOOT.threeWayYRatio),
          )
        } else {
          s.bullets.push(new Bullet(bx, by, spd, 0))
        }
      }
    }

    // ─── 弾移動・カリング ────────────────────────────────────────
    const viewportLeft  = isVertical ? -100 : world.cameraX - 100
    const viewportRight = isVertical ? W + 100 : world.cameraX + W + 100
    for (const b of s.bullets) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (isVertical ? b.y < -100 : (b.x > viewportRight || b.x < viewportLeft)) b.alive = false
    }

    // ─── 弾 × 障害物 衝突 ────────────────────────────────────────
    let scoreGain = 0
    for (const b of s.bullets) {
      if (!b.alive) continue
      for (const h of world.hazards) {
        if (h.isSafe || !rectsOverlap(b.rect, h.rect, 0)) continue
        b.alive = false
        if (r.features.has('enemy_hp')) {
          h.hp--
          if (h.hp <= 0) { s.kills++; s.combo++; s.comboTimer = SHOOT.comboResetTime; scoreGain += SHOOT.baseScorePerKill * s.combo }
        } else {
          h.hp = 0; s.kills++; s.combo++; s.comboTimer = SHOOT.comboResetTime; scoreGain += SHOOT.baseScorePerKill * s.combo
        }
        break
      }
    }

    // ─── 撃破 hazard と死弾を除去 ────────────────────────────────
    const destroyedHazards: Hazard[] = []
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      if (world.hazards[i].hp <= 0) { destroyedHazards.push(world.hazards[i]); world.hazards.splice(i, 1) }
    }
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      if (!s.bullets[i].alive) s.bullets.splice(i, 1)
    }

    if (shotFired) soundManager.onShoot()

    if (scoreGain > 0) {
      world.addScore(scoreGain)
      const popupX = isVertical ? p.x + p.w / 2 : p.x + p.w + 4
      world.addScorePopup(popupX, p.y - 20, `+${scoreGain}`, '#ffdd00')
    }

    if (destroyedHazards.length > 0) {
      const plugin = getGenre(world.rules.genre)
      for (const h of destroyedHazards) { plugin.onHazardDestroyed?.(world, h); world.addScoreVarsHit() }
    }

    const oldCombo = world.gameStats.combo
    world.setKills(s.kills)
    world.setCombo(s.combo)
    if (oldCombo !== s.combo) {
      for (const sys of getActiveSystems(world.rules.features)) sys.onComboChange?.(world, s.combo)
    }

    ;(world.bullets as typeof s.bullets).length = 0
    ;(world.bullets as typeof s.bullets).push(...s.bullets)
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (world.bullets.length === 0) return
    const isVertical = world.rules.scrollAxis === 'y'

    ctx.save()
    ctx.shadowColor = '#ffff88'
    ctx.shadowBlur = HAZARD_VFX.glowBlur * 0.6
    for (const b of world.bullets) {
      const sx = isVertical ? b.x : b.x - world.cameraX
      ctx.fillStyle = '#ffff00'
      ctx.fillRect(sx - 4, b.y - 2, 8, 4)
    }
    ctx.restore()
  }
}
