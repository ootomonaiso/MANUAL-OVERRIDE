/**
 * game/systems/PuzzleFeature.ts
 * パズル系フィーチャーを担当（未実装）。
 * grid_stop / puzzle_solve
 *
 * 有効化された未実装 feature は console.warn で警告を出す。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

export class PuzzleFeature implements FeatureSystem {
  readonly handles = ['grid_stop', 'puzzle_solve'] as const

  update(world: MutableWorld, _input: InputSnapshot, _dt: number): void {
    const unimplementedFeatures = ['grid_stop', 'puzzle_solve'] as const
    for (const feature of unimplementedFeatures) {
      if (world.rules.features.has(feature)) {
        console.warn(`⚠️ PuzzleFeature: '${feature}' is not yet implemented`)
      }
    }
  }
}
