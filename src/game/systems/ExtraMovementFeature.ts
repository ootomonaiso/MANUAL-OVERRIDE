/**
 * game/systems/ExtraMovementFeature.ts
 * 拡張移動フィーチャーを担当（未実装）。
 * dash / wall_jump / slide / gravity_flip / vertical_scroll
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

export class ExtraMovementFeature implements FeatureSystem {
  readonly handles = ['dash', 'wall_jump', 'slide', 'gravity_flip', 'vertical_scroll'] as const

  update(_world: MutableWorld, _input: InputSnapshot, _dt: number): void {}
}
