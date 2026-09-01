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
import { VFX, STEALTH, BOSS, SPECIAL } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'
import { PixelCanvas } from '../render'

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
  private tower: TowerState = { cooldown: SPECIAL.towerFireIntervalSec }
  private boss: BossState = { active: null, lastBossDistance: -Infinity }
  private timeBonus: TimeBonusState = { timer: 0 }

  onInit(): void {
    this.stealth = { idleTimer: 0, hidden: false }
    this.tower = { cooldown: SPECIAL.towerFireIntervalSec }
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
    soundManager.onColorTouch()
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
      // hazards配列から消えた理由（撃破 / 画面外カル）を区別せず撃破扱いにすると、
      // HPを削らず画面外へ流しただけでも撃破スコアが入ってしまう。
      // hp<=0（実際に倒した）場合のみ撃破報酬を与える。
      if (this.boss.active.hp <= 0) {
        this._onBossDefeated(world, this.boss.active)
      }
      this.boss.active = null
    }

    if (r.features.has('time_bonus')) {
      this._updateTimeBonus(world, dt)
    }
  }

  private _updateTimeBonus(world: MutableWorld, dt: number): void {
    this.timeBonus.timer += dt
    if (this.timeBonus.timer < SPECIAL.timeBonusIntervalSec) return
    this.timeBonus.timer -= SPECIAL.timeBonusIntervalSec

    world.addScore(SPECIAL.timeBonusScore)
    soundManager.onTimeBonus()
    const p = world.player
    world.addScorePopup(p.x + p.w / 2, p.y - 30, `TIME +${SPECIAL.timeBonusScore}`, '#66ddff')
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
    soundManager.onBossSpawn()
    world.triggerShake(BOSS.bossSpawnShake)
  }

  private _onBossDefeated(world: MutableWorld, boss: Hazard): void {
    soundManager.onBossDefeated()
    const sx = world.getHazardScreenX(boss)
    const cx = sx + boss.w / 2
    const cy = boss.y + boss.h / 2

    world.addScore(SPECIAL.bossKillScore)
    world.addScoreVarsBossKill()
    world.addScorePopup(cx, cy, `BOSS DEFEATED! +${SPECIAL.bossKillScore}`, '#ff4444')
    world.triggerShake(BOSS.bossDeathShake)

    for (let i = 0; i < BOSS.bossDeathParticles; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin) * 2
      const life  = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
      world.addParticle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, '#ff4444', VFX.hitParticleSizeBase)
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const px = new PixelCanvas(ctx)

    if (world.rules.features.has('stealth_mode') && this.stealth.hidden) {
      // ステルス外套: 既定はディザ（D8）で「透けている」感を出す
      const p = world.player
      const rx = p.w * 1.4, ry = p.h * 0.35
      const cx = p.x + p.w / 2, cy = p.y + p.h
      px.withAlpha(STEALTH.stealthAlpha, () => {
        px.dither(cx - rx, cy - ry, rx * 2, ry * 2, '#88ccff', 'transparent', 0.5)
      })
    }

    if (world.rules.features.has('tower')) {
      const p = world.player
      const towerX = p.x - 26
      const towerY = p.y + p.h - 36
      // tower.json: 本体(14x36)+上部(20x8)を統合したスプライト。
      // 合成バウンディングボックス（towerX-3, towerY-6, 20, 42）へ同じサイズで転送する
      px.sprite('tower', towerX - 3, towerY - 6, 20, 42)
      // リロードバー（幅の計算 20*reload は無変更）
      const reload = 1 - Math.max(0, this.tower.cooldown) / SPECIAL.towerFireIntervalSec
      px.rect(towerX - 3, towerY - 12, 20 * reload, 3, 'rgba(255,255,255,0.6)')
    }

    if (world.rules.features.has('boss') && this.boss.active) {
      const boss = this.boss.active
      const sx = world.getHazardScreenX(boss)
      const ratio = Math.max(0, boss.hp / boss.maxHp)
      px.rect(sx, boss.y - 14, boss.w, 6, 'rgba(0,0,0,0.5)')
      px.rect(sx, boss.y - 14, boss.w * ratio, 6, '#ff4444')
      px.line(sx, boss.y - 14, sx + boss.w, boss.y - 14, '#ffffff', 1)
      px.line(sx, boss.y - 8, sx + boss.w, boss.y - 8, '#ffffff', 1)
      px.line(sx, boss.y - 14, sx, boss.y - 8, '#ffffff', 1)
      px.line(sx + boss.w, boss.y - 14, sx + boss.w, boss.y - 8, '#ffffff', 1)
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
      soundManager.onStealthActivate()
      this.stealth.hidden = true
      p.invincible = Math.max(p.invincible, dt)
      world.addScoreVarsStealthBonus(dt)
      world.addScore(STEALTH.stealthSafeBonus)
    } else if (this.stealth.hidden) {
      // 隠密状態から外れたらフラグをリセット（衝突判定で被弾しないよう）
      this.stealth.hidden = false
    }

    // 衝突判定側（collision loop）で参照するよう世界へ公開
    // #254: update が collision より後のため 1 フレーム遅延は許容（隠密は持続状態）
    world.setStealthHidden(this.stealth.hidden)
  }

  private _updateTower(world: MutableWorld, dt: number): void {
    this.tower.cooldown -= dt
    if (this.tower.cooldown > 0) return
    this.tower.cooldown = SPECIAL.towerFireIntervalSec

    let target: Hazard | null = null
    let targetDist = Infinity
    let targetScreenX = 0
    for (const h of world.hazards) {
      if (h.isSafe) continue
      const screenX = world.getHazardScreenX(h)
      const dist = Math.abs(screenX - world.player.x)
      if (dist <= SPECIAL.towerRangePx && dist < targetDist) {
        target = h
        targetDist = dist
        targetScreenX = screenX
      }
    }
    if (!target) return

    const cx = targetScreenX + target.w / 2
    const cy = target.y + target.h / 2
    world.removeHazardById(target)
    soundManager.onTowerFire()
    world.addScore(SPECIAL.towerKillScore)
    world.addScorePopup(cx, target.y, `+${SPECIAL.towerKillScore}`, '#ffd166')
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
    this.tower = { cooldown: SPECIAL.towerFireIntervalSec }
    this.boss = { active: null, lastBossDistance: -Infinity }
    this.timeBonus = { timer: 0 }
  }

  /** stealth_mode が外れた時に内部状態をクリーンアップ（#254 follow-up） */
  onDisable(): void {
    this.stealth = { idleTimer: 0, hidden: false }
  }
}
