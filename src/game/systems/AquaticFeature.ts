/**
 * game/systems/AquaticFeature.ts
 * aquatic ジャンル固有のフィーチャー（酸素ゲージ・地形/生物/回復の相互作用）。
 *
 * 酸素ゲージは player.hp / maxHp をそのまま流用する（HUDは Hud.vue の oxygen バーが表示）。
 * 地形・危険生物・回復サンゴは全て isSafe:true として生成されるため、通常の被弾即死経路
 * （sideScroller._onPlayerHit）を通らない。接触の意味づけ（押し戻し/大幅減少/回復）は
 * このFeatureが毎フレーム重なり判定して処理する。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap } from '../entities'
import { AQUATIC_TUNING } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'

export class AquaticFeature implements FeatureSystem {
  readonly handles = ['oxygen'] as const

  private bubbleTimer = 0

  onManualUpdated(): void {
    this.bubbleTimer = 0
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('oxygen')) return
    const p = world.player

    // 時間経過による酸素減少（常時）
    world.modifyPlayerHp(-AQUATIC_TUNING.oxygenDecayRate * dt)

    this.bubbleTimer -= dt

    for (const h of world.hazards) {
      if (!h.interactionKind || !rectsOverlap(p.rect, h.rect)) continue

      switch (h.interactionKind) {
        case 'terrain':
          // 地形に押し上げられる（画面上端から完全に出ると下の判定でゲームオーバーになる）
          p.y -= AQUATIC_TUNING.terrainPushSpeed * dt
          break
        case 'creature':
          world.modifyPlayerHp(-AQUATIC_TUNING.creatureDamageRate * dt)
          if (this.bubbleTimer <= 0) {
            this.bubbleTimer = AQUATIC_TUNING.bubbleIntervalSec
            soundManager.onHungerDamage()
            world.triggerShake(2)
          }
          break
        case 'heal':
          world.modifyPlayerHp(AQUATIC_TUNING.healRate * dt)
          if (this.bubbleTimer <= 0) {
            this.bubbleTimer = AQUATIC_TUNING.bubbleIntervalSec
            world.addParticle(
              h.x + h.w / 2, h.y,
              (Math.random() - 0.5) * 20, -40 - Math.random() * 30,
              0.6, '#aaddff', 3,
            )
          }
          break
      }
    }

    // 画面上端から完全に出た（押し上げられ続けた末の脱落）→ ゲームオーバー
    if (p.y + p.h <= 0) {
      world.modifyPlayerHp(-p.maxHp)
    }
  }
}
