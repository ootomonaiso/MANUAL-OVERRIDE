/**
 * game/systems/SpecialFeature.ts
 * ステルス / タワー / 特殊系フィーチャーを担当。
 *
 * onSafeHazardTouch() — color_touch: 安全色ハザードを踏んだ時の得点・消滅・パーティクル
 *
 * stealth_mode / time_bonus / tower / boss は未実装（スタブ）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { Hazard } from '../entities'
import { VFX } from '../../data/tunables'

export class SpecialFeature implements FeatureSystem {
  readonly handles = ['stealth_mode', 'time_bonus', 'tower', 'color_touch', 'boss'] as const

  /** color_touch: 安全色ハザード接触時のスコア・消滅・エフェクト */
  onSafeHazardTouch(world: MutableWorld, hazard: Hazard, screenX: number): void {
    if (!world.rules.features.has('color_touch')) return
    const gain = world.rules.colorTouchScore
    world.addScore(gain)
    world.removeHazardById(hazard)
    world.addScorePopup(screenX + hazard.w / 2, hazard.y, `TOUCH! +${gain}`, '#00ffcc')
    const cx = screenX + hazard.w / 2
    const cy = hazard.y + hazard.h / 2
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.hitParticleSpeedMin + Math.random() * (VFX.hitParticleSpeedMax - VFX.hitParticleSpeedMin)
      const life  = VFX.hitParticleLifeMin + Math.random() * VFX.hitParticleLifeRange
      world.addParticle(cx, cy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, '#00ffcc', VFX.hitParticleSizeBase)
    }
  }

  update(_world: MutableWorld, _input: InputSnapshot, _dt: number): void {}
}
