import type { MutableWorld } from '../../engine/types'
import { VFX } from '../../data/tunables'

/**
 * 被弾エフェクトの共有処理。
 *
 * HP 減算 → 無敵時間付与 → シェイク → 赤パーティクル を順に実行する。
 * BulletHellBossFeature / RpgFeature 等他の被弾経路でも同一の視覚・挙動を
 * 保証するために、ここへ集約する。
 */
export function applyPlayerHitEffect(
  world: MutableWorld,
  opts: { particleCount?: number; yBoost?: number } = {},
): void {
  const { particleCount = VFX.hitParticleCount, yBoost = 0 } = opts
  const p = world.player

  world.modifyPlayerHp(-1)
  if (p.hp > 0) {
    p.invincible = VFX.invincibleDuration
    world.triggerShake(VFX.hitShakeIntensity)
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin)
      const life = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
      const size = VFX.hitParticleSizeBase + Math.random() * VFX.hitParticleSizeRange
      world.addParticle(
        p.x + p.w / 2, p.y + p.h / 2,
        Math.cos(angle) * speed, Math.sin(angle) * speed + yBoost,
        life, '#ff4444', size,
      )
    }
  }
}
