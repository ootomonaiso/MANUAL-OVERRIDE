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
    this._tickTimers(dt)
    this._fireBullets(world, input)
    this._moveBullets(world, dt)

    const { scoreGain, destroyedHazards } = this._resolveBulletHazardCollisions(world)

    this._cleanupDeadObjects(world)
    this._applyScoreAndEvents(world, scoreGain, destroyedHazards)
    this._syncWorldStats(world)
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (world.bullets.length === 0) return
    const isVertical = world.rules.scrollAxis === 'y'

    ctx.save()
    ctx.shadowColor = '#ffff88'
    ctx.shadowBlur = HAZARD_VFX.glowBlur * 0.6
    ctx.fillStyle = '#ffff00'
    for (const b of world.bullets) {
      const sx = isVertical ? b.x : b.x - world.cameraX
      if (isVertical) {
        ctx.fillRect(sx - 2, b.y - 4, 4, 8)
      } else {
        ctx.fillRect(sx - 4, b.y - 2, 8, 4)
      }
    }
    ctx.restore()
  }

  // ─── 内部: タイマー管理 ──────────────────────────────────────────
  private _tickTimers(dt: number): void {
    this.state.shotCooldown -= dt
    this.state.comboTimer   -= dt
    if (this.state.comboTimer <= 0) this.state.combo = 0
  }

  // ─── 内部: 弾の発射 ──────────────────────────────────────────────
  private _fireBullets(world: MutableWorld, input: InputSnapshot): void {
    const { rules } = world
    const shootKey = rules.controls.shoot?.toLowerCase() ?? 'z'

    if (!input.justPressed.has(shootKey)) return
    if (this.state.shotCooldown > 0) return
    if (!rules.features.has('shoot')) return

    this.state.shotCooldown = SHOOT.shotCooldown
    soundManager.onShoot()

    if (rules.scrollAxis === 'y') {
      this._spawnVerticalBullets(world)
    } else {
      this._spawnHorizontalBullets(world)
    }
  }

  private _spawnVerticalBullets(world: MutableWorld): void {
    const { player: p, rules } = world
    const bx = p.x + p.w / 2
    const by = p.y - SHOOT.bulletHeight
    const spd = SHOOT.bulletSpeed

    if (rules.features.has('three_way') || rules.features.has('spread_shot')) {
      this.state.bullets.push(
        new Bullet(bx, by, 0, -spd),
        new Bullet(bx, by, -spd * SHOOT.threeWayYRatio, -spd * SHOOT.threeWaySpeedRatio),
        new Bullet(bx, by,  spd * SHOOT.threeWayYRatio, -spd * SHOOT.threeWaySpeedRatio),
      )
    } else {
      this.state.bullets.push(new Bullet(bx, by, 0, -spd))
    }
  }

  private _spawnHorizontalBullets(world: MutableWorld): void {
    const { player: p, cameraX, rules } = world
    const bx = p.x + cameraX + SHOOT.bulletWidth
    const by = p.y + p.h / 2 - SHOOT.bulletHeight / 2
    const spd = SHOOT.bulletSpeed

    if (rules.features.has('three_way')) {
      this.state.bullets.push(
        new Bullet(bx, by, spd, 0),
        new Bullet(bx, by, spd * SHOOT.threeWaySpeedRatio, -spd * SHOOT.threeWayYRatio),
        new Bullet(bx, by, spd * SHOOT.threeWaySpeedRatio,  spd * SHOOT.threeWayYRatio),
      )
    } else {
      this.state.bullets.push(new Bullet(bx, by, spd, 0))
    }
  }

  // ─── 内部: 弾の移動とビューポート外カリング ────────────────────────
  private _moveBullets(world: MutableWorld, dt: number): void {
    const isVertical = world.rules.scrollAxis === 'y'
    const W = world.canvas.width
    const viewLeft  = isVertical ? -100 : world.cameraX - 100
    const viewRight = isVertical ? W + 100 : world.cameraX + W + 100

    for (const b of this.state.bullets) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (isVertical
        ? (b.y < -100 || b.x < viewLeft || b.x > viewRight)
        : (b.x > viewRight || b.x < viewLeft)) {
        b.alive = false
      }
    }
  }

  // ─── 内部: 弾 × 障害物 衝突判定 ────────────────────────────────
  private _resolveBulletHazardCollisions(world: MutableWorld): {
    scoreGain: number
    destroyedHazards: Hazard[]
  } {
    const s = this.state
    const hasEnemyHp = world.rules.features.has('enemy_hp')
    let scoreGain = 0

    for (const b of s.bullets) {
      if (!b.alive) continue
      for (const h of world.hazards) {
        if (h.isSafe || !rectsOverlap(b.rect, h.rect, 0)) continue
        b.alive = false
        if (hasEnemyHp) {
          h.hp--
          if (h.hp <= 0) {
            s.kills++; s.combo++; s.comboTimer = SHOOT.comboResetTime
            scoreGain += SHOOT.baseScorePerKill * s.combo
          }
        } else {
          h.hp = 0
          s.kills++; s.combo++; s.comboTimer = SHOOT.comboResetTime
          scoreGain += SHOOT.baseScorePerKill * s.combo
        }
        break  // 1弾1ヒット（貫通なし）
      }
    }

    const destroyedHazards = world.hazards.filter(h => h.hp <= 0)
    return { scoreGain, destroyedHazards }
  }

  // ─── 内部: 消滅オブジェクトの除去 ───────────────────────────────
  private _cleanupDeadObjects(world: MutableWorld): void {
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      if (world.hazards[i].hp <= 0) world.hazards.splice(i, 1)
    }
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      if (!this.state.bullets[i].alive) this.state.bullets.splice(i, 1)
    }
  }

  // ─── 内部: スコア・イベント・ワールド同期 ──────────────────────
  private _applyScoreAndEvents(world: MutableWorld, scoreGain: number, destroyedHazards: Hazard[]): void {
    const { player: p } = world
    const isVertical = world.rules.scrollAxis === 'y'

    if (scoreGain > 0) {
      world.addScore(scoreGain)
      const popX = isVertical ? p.x + p.w / 2 : p.x + p.w + 4
      world.addScorePopup(popX, p.y - 20, `+${scoreGain}`, '#ffdd00')
    }

    if (destroyedHazards.length > 0) {
      const plugin = getGenre(world.rules.genre)
      for (const h of destroyedHazards) {
        plugin.onHazardDestroyed?.(world, h)
        world.addScoreVarsHit()
      }
    }
  }

  private _syncWorldStats(world: MutableWorld): void {
    const s = this.state
    const prevCombo = world.gameStats.combo

    world.setKills(s.kills)
    world.setCombo(s.combo)

    if (prevCombo !== s.combo) {
      for (const sys of getActiveSystems(world.rules.features)) {
        sys.onComboChange?.(world, s.combo)
      }
    }

    // FeatureSystem が world.bullets を読む場合に同期
    ;(world.bullets as Bullet[]).length = 0
    ;(world.bullets as Bullet[]).push(...s.bullets)
  }
}
