/**
 * game/systems/ExtraMovementFeature.ts
 * 拡張移動フィーチャーを担当（未実装）。
 * dash / wall_jump / slide / gravity_flip / vertical_scroll
 *
 * 有効化された未実装 feature は console.warn で警告を出す。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

export class ExtraMovementFeature implements FeatureSystem {
  readonly handles = ['dash', 'wall_jump', 'slide', 'gravity_flip', 'vertical_scroll'] as const

  update(world: MutableWorld, _input: InputSnapshot, _dt: number): void {
    const unimplementedFeatures = ['dash', 'wall_jump', 'slide', 'gravity_flip', 'vertical_scroll'] as const
    for (const feature of unimplementedFeatures) {
      if (world.rules.features.has(feature)) {
        console.warn(`⚠️ ExtraMovementFeature: '${feature}' is not yet implemented`)
      }
    }
  }
}
