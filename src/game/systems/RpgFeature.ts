/**
 * game/systems/RpgFeature.ts
 * RPG / 育成系フィーチャーを担当。
 *
 * onPlayerHit() — shield feature が有効かつシールドが残っているとき: HPを減らさずシールドを消費
 *                  hp feature が有効なとき: HP 減少・無敵フレーム・シェイク・パーティクル
 * update()      — item_pickup feature が有効なとき: アイテム収集・EXP / HP 回復
 *                  shield feature が有効なとき: シールドのリチャージ
 *
 * 注: アイテム配列の死亡/画面外クリーンアップは sideScroller.ts が担当。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap } from '../entities'
import { VFX, SPAWN } from '../../data/tunables'
import { getActiveSystems } from '../../engine/GameRegistry'

/** shield Feature: シールド再チャージにかかる秒数 */
const SHIELD_RECHARGE_SEC = 8

export class RpgFeature implements FeatureSystem {
  readonly handles = ['hp', 'exp', 'item_pickup', 'shield'] as const

  /** shield feature: ジャンル確定時にシールドを満タンにする */
  onInit(world: MutableWorld): void {
    if (world.rules.features.has('shield')) {
      world.player.shield = 1
      world.player.shieldRecharge = 0
    }
  }

  /** shield → hp の順に被弾を処理する */
  onPlayerHit(world: MutableWorld): void {
    const p = world.player

    // shield feature: シールドが残っていればHPを減らさず消費して防ぐ
    if (world.rules.features.has('shield') && p.shield > 0) {
      p.shield = 0
      p.shieldRecharge = SHIELD_RECHARGE_SEC
      p.invincible = Math.max(p.invincible, VFX.invincibleDuration)
      world.triggerShake(VFX.hitShakeIntensity * 0.5)
      for (let i = 0; i < VFX.hitParticleCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin)
        const life  = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
        const size  = VFX.hitParticleSizeBase + Math.random() * VFX.hitParticleSizeRange
        world.addParticle(
          p.x + p.w / 2, p.y + p.h / 2,
          Math.cos(angle) * speed, Math.sin(angle) * speed + VFX.hitParticleYBoost,
          life, '#66ccff', size,
        )
      }
      return
    }

    if (!world.rules.features.has('hp')) return
    world.modifyPlayerHp(-1)
    if (p.hp > 0) {
      p.invincible = VFX.invincibleDuration
      world.triggerShake(VFX.hitShakeIntensity)
      for (let i = 0; i < VFX.hitParticleCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin)
        const life  = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
        const size  = VFX.hitParticleSizeBase + Math.random() * VFX.hitParticleSizeRange
        world.addParticle(
          p.x + p.w / 2, p.y + p.h / 2,
          Math.cos(angle) * speed, Math.sin(angle) * speed + VFX.hitParticleYBoost,
          life, '#ff4444', size,
        )
      }
    }
  }

  /** item_pickup feature: アイテムのパルスアニメ・収集判定・EXP / HP 付与 */
  /** shield feature: シールドのリチャージ */
  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (world.rules.features.has('shield') && world.player.shield <= 0) {
      world.player.shieldRecharge = Math.max(0, world.player.shieldRecharge - dt)
      if (world.player.shieldRecharge <= 0) {
        world.player.shield = 1
      }
    }

    if (!world.rules.features.has('item_pickup')) return
    const p = world.player
    for (const item of world.items) {
      if (!item.alive) continue
      item.pulse += dt * SPAWN.itemPulseRate
      const iRect = { ...item.rect, x: item.rect.x - world.cameraX }
      if (!rectsOverlap(p.rect, iRect, 0)) continue
      item.alive = false
      world.addScoreVarsItemCollected()
      if (item.type === 'exp') {
        p.exp += SPAWN.expItemExpGain
        world.addScore(SPAWN.expItemScore)
        world.addScorePopup(item.x - world.cameraX, item.y, '+EXP', '#ffcc00')
      } else if (item.type === 'hp' && p.hp < p.maxHp) {
        p.hp++
        world.addScorePopup(item.x - world.cameraX, item.y, '+HP', '#ff8888')
      }
      // onItemPickup フック発火
      for (const sys of getActiveSystems(world.rules.features)) {
        sys.onItemPickup?.(world, item.type)
      }
    }
    // 死亡/画面外の除去は sideScroller の filter で行う
  }
}
