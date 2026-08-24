/**
 * game/systems/MeleeKillFeature.ts
 * rpg / dungeon 固有の近接攻撃フィーチャー。
 *
 * melee_kill — Zキーでプレイヤー前後の矩形範囲内のハザードを一撃破壊。
 * enemy_hp 未有効でも即破壊（rpg/dungeon は HP 概念なし）。
 *
 * 既存の SURVIVAL.melee* パラメータを流用し、同様の矩形計算・パーティクル・スイング演出を行う。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap } from '../entities'
import { SURVIVAL, VFX } from '../../data/tunables'
import { getGenre } from '../../engine/GameRegistry'
import { soundManager } from '../../plugins/SoundManager'
import { buildMeleeRect, drawMeleeSwing } from './meleeShared'

interface MeleeKillState {
  cooldown: number
  active: number
}

const MELEE_KILL_HAZARD_POPUP_COLOR = '#ff8844'

export class MeleeKillFeature implements FeatureSystem {
  readonly handles = ['melee_kill'] as const

  private state: MeleeKillState = { cooldown: 0, active: 0 }

  onInit(): void {
    this.state = { cooldown: 0, active: 0 }
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    this._tickTimers(dt)
    this._handleInput(world, input)
    this._resolveCollisions(world)
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    drawMeleeSwing(
      ctx,
      world.player.x,
      world.player.y,
      world.player.w,
      world.player.h,
      this.state.active,
      SURVIVAL.meleeCooldown,
    )
  }

  // ─── 内部: タイマー更新 ──────────────────────────────────────────
  private _tickTimers(dt: number): void {
    this.state.cooldown -= dt
    this.state.active -= dt
  }

  // ─── 内部: 入力受付 ──────────────────────────────────────────────
  private _handleInput(world: MutableWorld, input: InputSnapshot): void {
    const shootKey = world.rules.controls.shoot?.toLowerCase() ?? 'z'
    if (!input.justPressed.has(shootKey)) return
    if (this.state.cooldown > 0) return

    this.state.cooldown = SURVIVAL.meleeCooldown
    this.state.active = SURVIVAL.meleeCooldown * SURVIVAL.meleeActiveRatio
    soundManager.onMeleeAttack()
  }

  // ─── 内部: 攻撃矩形 × ハザード 衝突判定 ─────────────────────────
  private _resolveCollisions(world: MutableWorld): void {
    if (this.state.active <= 0) return

    const p = world.player
    const meleeRect = buildMeleeRect(p.x, p.y, p.w, p.h)

    // 逆順イテレーション + 即除去: 破壊したハザードを即 splice することで、
    // 同一フレーム内で同一ハザードに複数回攻撃判定が乗るのを防ぐ。
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      const h = world.hazards[i]
      if (h.isSafe) continue

      // ハザードをスクリーン系に変換して meleeRect（スクリーン系）と比較
      const hScreenX = world.getHazardScreenX(h)
      const hScreenRect = { ...h.rect, x: hScreenX }
      if (!rectsOverlap(meleeRect, hScreenRect, SURVIVAL.meleeCollisionGrace)) continue

      // 一撃破壊（rpg/dungeon は enemy_hp 未有効なので hp 非依存で即破壊）
      world.removeHazardById(h)
      soundManager.onMeleeHit()

      // パーティクル（スクリーン座標で生成）
      const cx = hScreenX + h.w / 2
      const cy = h.y + h.h / 2
      for (let j = 0; j < SURVIVAL.meleeHitParticleCount; j++) {
        const angle = Math.random() * Math.PI * 2
        const speed = SURVIVAL.meleeHitParticleSpeedMin + Math.random() * (SURVIVAL.meleeHitParticleSpeedMax - SURVIVAL.meleeHitParticleSpeedMin)
        world.addParticle(
          cx, cy,
          Math.cos(angle) * speed, Math.sin(angle) * speed,
          SURVIVAL.meleeHitParticleLife, SURVIVAL.meleeHitParticleColor, SURVIVAL.meleeHitParticleSize,
        )
      }

      // kills +1
      world.setKills(world.gameStats.kills + 1)

      // ジャンルプラグインの onHazardDestroyed フック
      const plugin = getGenre(world.rules.genre)
      plugin.onHazardDestroyed?.(world, h)

      // スコアポップ
      world.addScorePopup(cx, cy - 16, 'SLASH!', MELEE_KILL_HAZARD_POPUP_COLOR)
      world.triggerShake(VFX.hitShakeIntensity * 0.3)
    }
  }
}
