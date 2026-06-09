/**
 * game/systems/SpecialFeature.ts
 * 特殊系フィーチャー: color_touch / stealth_mode / time_bonus
 *
 * ✅ color_touch  : 安全色ハザード接触時のスコア・消滅・パーティクル
 * ✅ stealth_mode : shoot キーで 3 秒間無敵 + ステルスボーナス加算（8 秒クールダウン）
 * ✅ time_bonus   : 生存秒数に応じて 5 秒ごとにボーナススコア付与
 *
 * tower / boss: 複雑なエンティティシステムが必要なため handles から除外済み。
 *              genres.json で enableFeatures に含まれていても何もしない（静かに無視）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { Hazard } from '../entities'
import { VFX } from '../../data/tunables'

const STEALTH_DURATION  = 3.0   // 無敵持続秒数
const STEALTH_COOLDOWN  = 8.0   // 再使用待機秒数
const STEALTH_INVINCIBLE_VAL = 999 // player.invincible にセットする値（sideScroller が毎フレーム減算）

const TIME_BONUS_INTERVAL = 5.0  // ボーナス付与間隔（秒）
const TIME_BONUS_BASE     = 80   // 基本ボーナス量
const TIME_BONUS_RATE     = 0.5  // 生存秒数ごとの追加ボーナス（survivedSec * rate）

export class SpecialFeature implements FeatureSystem {
  readonly handles = ['stealth_mode', 'time_bonus', 'color_touch'] as const

  // ─── stealth_mode 状態 ────────────────────────────────────────────
  private stealthActive   = 0  // 発動中の残り時間
  private stealthCooldown = 0

  // ─── time_bonus 状態 ─────────────────────────────────────────────
  private timeBonusTimer = 0

  onInit(): void {
    this.stealthActive   = 0
    this.stealthCooldown = 0
    this.timeBonusTimer  = 0
  }

  /** color_touch: 安全色ハザード接触時のスコア・消滅・エフェクト */
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

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    this._updateStealth(world, input, dt)
    this._updateTimeBonus(world, dt)
  }

  private _updateStealth(world: MutableWorld, input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('stealth_mode')) return

    if (this.stealthActive   > 0) this.stealthActive   -= dt
    if (this.stealthCooldown > 0) this.stealthCooldown -= dt

    const shootKey = (world.rules.controls.shoot ?? 'z').toLowerCase()
    const canActivate = this.stealthActive <= 0 && this.stealthCooldown <= 0

    if (canActivate && input.justPressed.has(shootKey)) {
      // 無敵タイマーをセット（sideScroller が毎フレーム -= dt するため大きな値を入れる）
      world.player.invincible = STEALTH_INVINCIBLE_VAL
      this.stealthActive   = STEALTH_DURATION
      this.stealthCooldown = STEALTH_COOLDOWN

      const p = world.player
      world.addScorePopup(p.x + p.w / 2, p.y - 28, 'STEALTH!', '#cc88ff')
      world.triggerShake(4)
    }

    // ステルス中: ステルスボーナスを毎フレーム加算（ScoreVars 用）
    if (this.stealthActive > 0) {
      world.addScoreVarsStealthBonus(dt)
    }
  }

  private _updateTimeBonus(world: MutableWorld, dt: number): void {
    if (!world.rules.features.has('time_bonus')) return

    this.timeBonusTimer += dt
    if (this.timeBonusTimer >= TIME_BONUS_INTERVAL) {
      this.timeBonusTimer -= TIME_BONUS_INTERVAL
      const bonus = Math.round(TIME_BONUS_BASE + world.survivedSec * TIME_BONUS_RATE)
      world.addScore(bonus)
      const p = world.player
      world.addScorePopup(p.x + p.w / 2, p.y - 20, `TIME +${bonus}`, '#ffdd44')
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('stealth_mode') || this.stealthActive <= 0) return

    // ステルス中: プレイヤーに半透明の紫オーラを重ねる
    const p     = world.player
    const t     = this.stealthActive / STEALTH_DURATION
    ctx.save()
    ctx.globalAlpha = t * 0.35
    ctx.fillStyle   = '#cc88ff'
    ctx.beginPath()
    ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  onManualUpdated(): void {
    this.stealthActive   = 0
    this.stealthCooldown = 0
    this.timeBonusTimer  = 0
  }
}
