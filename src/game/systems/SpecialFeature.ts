/**
 * game/systems/SpecialFeature.ts
 * 特殊系フィーチャー: color_touch / stealth_mode / time_bonus / tower / boss
 *
 * ✅ color_touch:   安全色ハザード接触時のスコア・消滅・パーティクル
 * ✅ stealth_mode:  静止し続けると「隠れ」状態になり、無敵 + ステルスボーナスを得る
 * ✅ tower:         一定間隔で最も近いハザードを自動撃破するタワーを描画・動作させる
 * ✅ boss:          isBossスポーンを強化HP化し、HPバー描画・撃破時のスコア/演出を行う
 * ✅ time_bonus:    一定時間ごとにスコアを加算する
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { Hazard } from '../entities'
import { VFX, STEALTH, BOSS } from '../../data/tunables'

const TOWER_FIRE_INTERVAL_SEC = 1.2
const TOWER_RANGE_PX = 260
const TOWER_KILL_SCORE = 80

const BOSS_KILL_SCORE = 500

const TIME_BONUS_INTERVAL_SEC = 5
const TIME_BONUS_SCORE = 50

interface StealthState {
  idleTimer: number
  hidden: boolean
}

interface TowerState {
  cooldown: number
}

interface BossState {
  active: Hazard | null
  lastBossDistance: number
}

interface TimeBonusState {
  timer: number
}

export class SpecialFeature implements FeatureSystem {
  readonly handles = ['stealth_mode', 'time_bonus', 'color_touch', 'tower', 'boss'] as const

  private stealth: StealthState = { idleTimer: 0, hidden: false }
  private tower: TowerState = { cooldown: TOWER_FIRE_INTERVAL_SEC }
  private boss: BossState = { active: null, lastBossDistance: -Infinity }
  private timeBonus: TimeBonusState = { timer: 0 }

  onInit(): void {
    this.stealth = { idleTimer: 0, hidden: false }
    this.tower = { cooldown: TOWER_FIRE_INTERVAL_SEC }
    this.boss = { active: null, lastBossDistance: -Infinity }
    this.timeBonus = { timer: 0 }
  }

  onSafeHazardTouch(world: MutableWorld, hazard: Hazard, screenX: number): void {
    if (!world.rules.features.has('color_touch')) return
    const gain = world.rules.colorTouchScore
    world.addScore(gain)
    world.removeHazardById(hazard)
    world.addScorePopup(screenX + hazard.w / 2, hazard.y, `TOUCH! +${gain}`, '#00ffcc')
    world.addScoreVarsColorTouch()
    const cx = screenX + hazard.w / 2
    const cy = hazard.y + hazard.h / 2
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin)
      const life  = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
      world.addParticle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, '#00ffcc', VFX.hitParticleSizeBase)
    }
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    const r = world.rules

    if (r.features.has('stealth_mode')) {
      this._updateStealth(world, dt)
    }

    if (r.features.has('tower')) {
      this._updateTower(world, dt)
    }

    if (r.features.has('boss') && this.boss.active && !world.hazards.includes(this.boss.active)) {
      this._onBossDefeated(world, this.boss.active)
      this.boss.active = null
    }

    if (r.features.has('time_bonus')) {
      this._updateTimeBonus(world, dt)
    }
  }

  private _updateTimeBonus(world: MutableWorld, dt: number): void {
    this.timeBonus.timer += dt
    if (this.timeBonus.timer < TIME_BONUS_INTERVAL_SEC) return
    this.timeBonus.timer -= TIME_BONUS_INTERVAL_SEC

    world.addScore(TIME_BONUS_SCORE)
    const p = world.player
    world.addScorePopup(p.x + p.w / 2, p.y - 30, `TIME +${TIME_BONUS_SCORE}`, '#66ddff')
  }

  onBossSpawn(world: MutableWorld): void {
    if (!world.rules.features.has('boss')) return
    const spawned = world.hazards[world.hazards.length - 1]
    if (!spawned) return

    const tooSoon = world.distance - this.boss.lastBossDistance < BOSS.bossRespawnDist
    if (this.boss.active || tooSoon) {
      world.removeHazardById(spawned)
      return
    }

    spawned.hp += BOSS.arenaHpBonus
    spawned.maxHp = spawned.hp
    this.boss.active = spawned
    this.boss.lastBossDistance = world.distance
    world.triggerShake(BOSS.bossSpawnShake)
  }

  private _onBossDefeated(world: MutableWorld, boss: Hazard): void {
    const sx = world.getHazardScreenX(boss)
    const cx = sx + boss.w / 2
    const cy = boss.y + boss.h / 2

    world.addScore(BOSS_KILL_SCORE)
    world.addScoreVarsBossKill()
    world.addScorePopup(cx, cy, `BOSS DEFEATED! +${BOSS_KILL_SCORE}`, '#ff4444')
    world.triggerShake(BOSS.bossDeathShake)

    for (let i = 0; i < BOSS.bossDeathParticles; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin) * 2
      const life  = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
      world.addParticle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, '#ff4444', VFX.hitParticleSizeBase)
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (world.rules.features.has('stealth_mode') && this.stealth.hidden) {
      const p = world.player
      ctx.save()
      ctx.globalAlpha = STEALTH.stealthAlpha
      ctx.fillStyle = '#88ccff'
      ctx.beginPath()
      ctx.ellipse(p.x + p.w / 2, p.y + p.h, p.w * 1.4, p.h * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    if (world.rules.features.has('tower')) {
      const p = world.player
      const towerX = p.x - 26
      const towerY = p.y + p.h - 36
      ctx.save()
      ctx.fillStyle = '#7a8a99'
      ctx.fillRect(towerX, towerY, 14, 36)
      ctx.fillStyle = '#cfe8ff'
      ctx.fillRect(towerX - 3, towerY - 6, 20, 8)
      const reload = 1 - Math.max(0, this.tower.cooldown) / TOWER_FIRE_INTERVAL_SEC
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillRect(towerX - 3, towerY - 12, 20 * reload, 3)
      ctx.restore()
    }

    if (world.rules.features.has('boss') && this.boss.active) {
      const boss = this.boss.active
      const sx = world.getHazardScreenX(boss)
      const ratio = Math.max(0, boss.hp / boss.maxHp)
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(sx, boss.y - 14, boss.w, 6)
      ctx.fillStyle = '#ff4444'
      ctx.fillRect(sx, boss.y - 14, boss.w * ratio, 6)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.strokeRect(sx, boss.y - 14, boss.w, 6)
      ctx.restore()
    }
  }

  private _updateStealth(world: MutableWorld, dt: number): void {
    const p = world.player
    const isIdle = p.onGround && Math.abs(p.vx) < 1

    if (isIdle) {
      this.stealth.idleTimer += dt
    } else {
      this.stealth.idleTimer = 0
      this.stealth.hidden = false
    }

    if (this.stealth.idleTimer >= STEALTH.stealthDurationSec) {
      this.stealth.hidden = true
      p.invincible = Math.max(p.invincible, dt)
      world.addScoreVarsStealthBonus(dt)
      world.addScore(STEALTH.stealthSafeBonus)
    }
  }

  private _updateTower(world: MutableWorld, dt: number): void {
    this.tower.cooldown -= dt
    if (this.tower.cooldown > 0) return
    this.tower.cooldown = TOWER_FIRE_INTERVAL_SEC

    let target: Hazard | null = null
    let targetDist = Infinity
    let targetScreenX = 0
    for (const h of world.hazards) {
      if (h.isSafe) continue
      const screenX = world.getHazardScreenX(h)
      const dist = Math.abs(screenX - world.player.x)
      if (dist <= TOWER_RANGE_PX && dist < targetDist) {
        target = h
        targetDist = dist
        targetScreenX = screenX
      }
    }
    if (!target) return

    const cx = targetScreenX + target.w / 2
    const cy = target.y + target.h / 2
    world.removeHazardById(target)
    world.addScore(TOWER_KILL_SCORE)
    world.addScorePopup(cx, target.y, `+${TOWER_KILL_SCORE}`, '#ffd166')
    world.setKills(world.gameStats.kills + 1)
    world.setCombo(world.gameStats.combo + 1)

    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin)
      const life  = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
      world.addParticle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, '#ffd166', VFX.hitParticleSizeBase)
    }
  }

  onManualUpdated(): void {
    this.stealth = { idleTimer: 0, hidden: false }
    this.tower = { cooldown: TOWER_FIRE_INTERVAL_SEC }
    this.boss = { active: null, lastBossDistance: -Infinity }
    this.timeBonus = { timer: 0 }
  }
}
