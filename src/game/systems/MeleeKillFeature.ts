/**
 * game/systems/MeleeKillFeature.ts
 * rpg / dungeon / hack_slash 固有の近接攻撃フィーチャー。
 *
 * melee_kill — Zキーでプレイヤー前後の矩形範囲内のハザードを一撃破壊。
 * enemy_hp 未有効でも即破壊（rpg/dungeon は HP 概念なし）。
 *
 * コンボシステム:
 * - 2秒以内の連続ヒットでコンボ増加
 * - コンボ 5 の倍数でクリティカル（即破壊 + 追加スコア + シェイク）
 * - コントラで world.setCombo() に同期
 * - 各ヒットで 50 * combo のボーナススコア
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
  combo: number
  comboTimer: number
}

const MELEE_KILL_HAZARD_POPUP_COLOR = '#ff8844'

// コンボ
const COMBO_WINDOW = 2.0
const CRIT_COMBO_INTERVAL = 5
const CRIT_BONUS_SCORE = 200
const COMBO_BASE_SCORE_MULTIPLIER = 50

// HUD
const COMBO_HUD_X = 20
const COMBO_HUD_Y = 60

// 色
const COLOR_COMBO_LOW = '#ffffff'
const COLOR_COMBO_MID = '#ffcc00'
const COLOR_COMBO_HIGH = '#ff4444'
const COLOR_CRITICAL = '#ff0000'

export class MeleeKillFeature implements FeatureSystem {
  readonly handles = ['melee_kill'] as const

  private state: MeleeKillState = { cooldown: 0, active: 0, combo: 0, comboTimer: 0 }

  onInit(): void {
    this.state = { cooldown: 0, active: 0, combo: 0, comboTimer: 0 }
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
    this._renderComboHud(ctx, world)
  }

  // ─── 内部: タイマー更新 ──────────────────────────────────────────
  private _tickTimers(dt: number): void {
    this.state.cooldown -= dt
    this.state.active -= dt
    this.state.comboTimer -= dt
    if (this.state.comboTimer <= 0) {
      this.state.combo = 0
    }
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

      // ─── コンボ更新 ──────────────────────────────────────────
      this.state.combo++
      this.state.comboTimer = COMBO_WINDOW
      world.setCombo(this.state.combo)

      // kills +1
      world.setKills(world.gameStats.kills + 1)

      // ─── クリティカル判定 ────────────────────────────────────
      const isCritical = this.state.combo % CRIT_COMBO_INTERVAL === 0
      if (isCritical) {
        world.triggerShake(0.5)
        world.addScorePopup(cx, cy - 24, `CRITICAL! +${CRIT_BONUS_SCORE}`, COLOR_CRITICAL)
        world.addScore(CRIT_BONUS_SCORE)
      }

      // ─── コンボボーナススコア ────────────────────────────────
      const comboBonus = COMBO_BASE_SCORE_MULTIPLIER * this.state.combo
      world.addScore(comboBonus)
      world.addScorePopup(cx, cy - 16, `+${comboBonus}`, MELEE_KILL_HAZARD_POPUP_COLOR)

      // ジャンルプラグインの onHazardDestroyed フック
      const plugin = getGenre(world.rules.genre)
      plugin.onHazardDestroyed?.(world, h)

      // スコアポップ（クリティカル以外）
      if (!isCritical) {
        world.triggerShake(VFX.hitShakeIntensity * 0.3)
      }
    }
  }

  // ─── 内部: コンボ HUD ────────────────────────────────────────────

  private _renderComboHud(ctx: CanvasRenderingContext2D, _world: MutableWorld): void {
    if (this.state.combo <= 1) return

    let color: string
    if (this.state.combo >= 10) {
      color = COLOR_COMBO_HIGH
    } else if (this.state.combo >= 5) {
      color = COLOR_COMBO_MID
    } else {
      color = COLOR_COMBO_LOW
    }

    ctx.save()
    ctx.fillStyle = color
    ctx.font = 'bold 24px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${this.state.combo} COMBO`, COMBO_HUD_X, COMBO_HUD_Y)
    ctx.restore()
  }
}
