/**
 * game/systems/SurvivalFeature.ts
 * サバイバルゲーム固有のフィーチャー。
 *
 * survival_hunger — 時間経過でhunger減衰、臨界域でHPダメージ
 * survival_melee  — Zキーで近接攻撃（左右両方向）
 * survival_level  — 敵撃破でXP獲得、レベルアップでHP回復・武器強化
 *
 * 注: food/weaponアイテムの収集判定もこのFeatureで処理する。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap, Hazard } from '../entities'
import { SURVIVAL, VFX } from '../../data/tunables'
import { getActiveSystems, getGenre } from '../../engine/GameRegistry'
import { soundManager } from '../../plugins/SoundManager'
import { buildMeleeRect, drawMeleeSwing } from './meleeShared'

interface SurvivalState {
  meleeCooldown: number
  meleeActive: number   // 攻撃判定残り時間
  lastHungerDamage: number
  xp: number
  nextLevelXp: number
}

export class SurvivalFeature implements FeatureSystem {
  readonly handles = ['survival_hunger', 'survival_melee', 'survival_level'] as const

  private state: SurvivalState = this._fresh()

  private _fresh(): SurvivalState {
    return {
      meleeCooldown: 0,
      meleeActive: 0,
      lastHungerDamage: 0,
      xp: 0,
      nextLevelXp: SURVIVAL.xpPerLevel,
    }
  }

  onInit(world: MutableWorld): void {
    this.state = this._fresh()
    this._resetPlayer(world)
  }

  onManualUpdated(): void {
    // 説明書更新（ジャンル確定後も続くカード選択）では一時的な攻撃タイマーのみ
    // 初期化する。kills/xp/level/weaponDamage を初期化すると次の撃破時に
    // world へ巻き戻った kills が書き込まれ、最終スコアが下がる（#179）。
    this.state.meleeCooldown = 0
    this.state.meleeActive = 0
    this.state.lastHungerDamage = 0
  }

  onDisable(world: MutableWorld): void {
    this.state = this._fresh()
    this._resetPlayer(world)
  }

  private _resetPlayer(world: MutableWorld): void {
    const p = world.player
    p.hunger = SURVIVAL.maxHunger
    p.level = 1
    p.weaponDamage = SURVIVAL.meleeDamage
    p.currentLevelXp = 0
    p.nextLevelXp = SURVIVAL.xpPerLevel
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    this._updateMeleeTimers(dt)
    this._updateHunger(world, dt)
    this._handleMeleeAttack(world, input)
    this._resolveMeleeCollisions(world)
    this._processItemPickups(world)
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    drawMeleeSwing(
      ctx,
      world.player.x,
      world.player.y,
      world.player.w,
      world.player.h,
      this.state.meleeActive,
      SURVIVAL.meleeCooldown,
    )
  }

  // ─── 内部: タイマー更新 ──────────────────────────────────────────
  private _updateMeleeTimers(dt: number): void {
    this.state.meleeCooldown -= dt
    this.state.meleeActive -= dt
  }

  // ─── 内部: hunger減衰とHPダメージ ────────────────────────────────
  private _updateHunger(world: MutableWorld, dt: number): void {
    if (!world.rules.features.has('survival_hunger')) return
    const p = world.player

    // 時間経過でhunger減衰
    p.hunger -= SURVIVAL.hungerDecayRate * dt
    if (p.hunger < 0) p.hunger = 0

    // 臨界域以下で定期的なHPダメージ
    // dtが大きい場合（タブ切り替え復帰時等）に複数回発火する可能性があるため、
    // 1フレームで最大1回に制限する
    if (p.hunger <= SURVIVAL.hungerCriticalThreshold) {
      this.state.lastHungerDamage += dt
      if (this.state.lastHungerDamage >= SURVIVAL.hungerDamageInterval) {
        this.state.lastHungerDamage = 0
        world.modifyPlayerHp(-SURVIVAL.hungerDamageAmount)
        soundManager.onHungerDamage()
        world.triggerShake(VFX.hitShakeIntensity * 0.5)
        world.addScorePopup(p.x + p.w / 2, p.y - 10, 'starving...', SURVIVAL.hudHungerColorLow)
      }
    } else {
      this.state.lastHungerDamage = 0
    }
  }

  // ─── 内部: 近接攻撃入力 ────────────────────────────────────────
  private _handleMeleeAttack(world: MutableWorld, input: InputSnapshot): void {
    if (!world.rules.features.has('survival_melee')) return
    const shootKey = world.rules.controls.shoot?.toLowerCase() ?? 'z'

    if (!input.justPressed.has(shootKey)) return
    if (this.state.meleeCooldown > 0) return

    this.state.meleeCooldown = SURVIVAL.meleeCooldown
    this.state.meleeActive = SURVIVAL.meleeCooldown * SURVIVAL.meleeActiveRatio
    soundManager.onMeleeAttack()
  }

  // ─── 内部: 近接攻撃 × 障害物 衝突判定 ─────────────────────────
  private _resolveMeleeCollisions(world: MutableWorld): void {
    if (this.state.meleeActive <= 0) return
    if (!world.rules.features.has('survival_melee')) return

    const p = world.player
    const damage = p.weaponDamage
    const meleeRect = buildMeleeRect(p.x, p.y, p.w, p.h)

    // 逆順イテレーション: ハザード除去（splice）時にインデックスがずれて次要素をスキップするのを防止
    for (let i = world.hazards.length - 1; i >= 0; i--) {
      const h = world.hazards[i]
      if (h.isSafe || h.hp <= 0) continue

      // ハザードをスクリーン系に変換して meleeRect（スクリーン系）と比較
      const hScreenX = world.getHazardScreenX(h)
      const hScreenRect = { ...h.rect, x: hScreenX }
      if (!rectsOverlap(meleeRect, hScreenRect, SURVIVAL.meleeCollisionGrace)) continue

      h.hp -= damage
      soundManager.onMeleeHit()
      // 攻撃パーティクル
      for (let j = 0; j < SURVIVAL.meleeHitParticleCount; j++) {
        const angle = Math.random() * Math.PI * 2
        const speed = SURVIVAL.meleeHitParticleSpeedMin + Math.random() * (SURVIVAL.meleeHitParticleSpeedMax - SURVIVAL.meleeHitParticleSpeedMin)
        world.addParticle(
          hScreenX + h.w / 2, h.y + h.h / 2,
          Math.cos(angle) * speed, Math.sin(angle) * speed,
          SURVIVAL.meleeHitParticleLife, SURVIVAL.meleeHitParticleColor, SURVIVAL.meleeHitParticleSize,
        )
      }

      if (h.hp <= 0) {
        this._onEnemyKilled(world, h)
        // 即座に除去: 撃破したハザードが残存しない + 1フレーム内の多重ダメージを自然に防止
        world.removeHazardById(h)
      }
    }
  }

  // ─── 内部: 敵撃破時の処理 ────────────────────────────────────────
  // 撃破時処理（onHazardDestroyed / 除去 / kills カウント）は survival_level の有無に関わらず実行
  // XP/レベルアップロジックは survival_level 有効時のみ実行
  private _onEnemyKilled(world: MutableWorld, h: Hazard): void {
    const p = world.player

    // 撃破スコアポップ
    const cx = h.x + h.w / 2 - world.cameraX
    const cy = h.y
    world.addScorePopup(cx, cy, 'KILL!', SURVIVAL.killPopupColor)

    // 撃破パーティクル
    for (let i = 0; i < SURVIVAL.killParticleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = SURVIVAL.killParticleSpeedMin + Math.random() * (SURVIVAL.killParticleSpeedMax - SURVIVAL.killParticleSpeedMin)
      world.addParticle(
        cx, cy,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        SURVIVAL.killParticleLife, SURVIVAL.killParticleColors[Math.floor(Math.random() * SURVIVAL.killParticleColors.length)],
        SURVIVAL.killParticleSize,
      )
    }
    world.triggerShake(VFX.hitShakeIntensity * SURVIVAL.killShakeIntensity)

    // kills カウント（survival の scoreFormula: kills * 50 のために必要）
    world.setKills(world.gameStats.kills + 1)

    // ジャンルプラグインの onHazardDestroyed を発火（food/weapon ドロップ等）
    const genre = getGenre(world.rules.genre)
    genre.onHazardDestroyed?.(world, h)

    // survival_level 有効時のみ XP/レベルアップ処理
    if (world.rules.features.has('survival_level')) {
      p.exp += SURVIVAL.xpPerKill
      this.state.xp += SURVIVAL.xpPerKill
      p.currentLevelXp += SURVIVAL.xpPerKill

      // レベルアップ判定
      // xpPerLevel <= 0 または xpLevelScale <= 1 の場合、nextLevelXpが減少しないため無限ループする
      // 最大100回のレベルアップを1フレームで許可するガード
      let guard = 100
      while (this.state.xp >= this.state.nextLevelXp && guard > 0) {
        guard--
        this.state.xp -= this.state.nextLevelXp
        p.currentLevelXp -= this.state.nextLevelXp
        p.level++
        this.state.nextLevelXp = Math.floor(SURVIVAL.xpPerLevel * Math.pow(SURVIVAL.xpLevelScale, p.level - 1))
        p.nextLevelXp = this.state.nextLevelXp

        // レベルアップ効果
        if (p.hp < p.maxHp) {
          const heal = Math.min(SURVIVAL.levelUpHealHp, p.maxHp - p.hp)
          p.hp += heal
        }
        p.weaponDamage += SURVIVAL.levelUpDamageBonus

        // レベルアップ演出
        soundManager.onLevelUp()
        this._spawnLevelUpEffect(world)
      }
    }
  }

  // ─── 内部: レベルアップ演出 ──────────────────────────────────────
  private _spawnLevelUpEffect(world: MutableWorld): void {
    const p = world.player
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    const colors = SURVIVAL.levelUpParticleColors

    for (let i = 0; i < SURVIVAL.levelUpParticleCount; i++) {
      const angle = (i / SURVIVAL.levelUpParticleCount) * Math.PI * 2
      const speed = SURVIVAL.levelUpParticleSpeedMin + Math.random() * (SURVIVAL.levelUpParticleSpeedMax - SURVIVAL.levelUpParticleSpeedMin)
      const color = colors[Math.floor(Math.random() * colors.length)]
      world.addParticle(
        cx, cy,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        SURVIVAL.levelUpParticleLife, color, SURVIVAL.levelUpParticleSize,
      )
    }

    world.addScorePopup(cx, p.y - 20, `Lv.${p.level}!`, SURVIVAL.levelUpPopupColor)
    world.triggerShake(VFX.hitShakeIntensity * SURVIVAL.levelUpShakeIntensity)
  }

  // ─── 内部: food/weaponアイテム収集 ──────────────────────────────
  private _processItemPickups(world: MutableWorld): void {
    const p = world.player
    for (const item of world.items) {
      if (!item.alive) continue
      if (item.type !== 'food' && item.type !== 'weapon') continue

      const iRect = { ...item.rect, x: item.rect.x - world.cameraX }
      if (!rectsOverlap(p.rect, iRect, 0)) continue

      item.alive = false
      world.addScoreVarsItemCollected()
      soundManager.onItemPickup()

      if (item.type === 'food') {
        p.hunger = Math.min(SURVIVAL.maxHunger, p.hunger + SURVIVAL.foodRestore)
        world.addScorePopup(item.x - world.cameraX, item.y, `+${SURVIVAL.foodRestore} hunger`, SURVIVAL.foodPopupColor)
      } else if (item.type === 'weapon') {
        p.weaponDamage += SURVIVAL.weaponUpgradeAmount
        world.addScorePopup(item.x - world.cameraX, item.y, `+${SURVIVAL.weaponUpgradeAmount} ATK`, SURVIVAL.weaponPopupColor)
      }

      // onItemPickup フック発火
      for (const sys of getActiveSystems(world.rules.features)) {
        sys.onItemPickup?.(world, item.type)
      }
    }
  }
}
