/**
 * game/systems/PuzzleFeature.ts
 * パズル系フィーチャーを担当（未実装）。
 * grid_stop / puzzle_solve
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

export class PuzzleFeature implements FeatureSystem {
  readonly handles = ['grid_stop', 'puzzle_solve'] as const

  update(_world: MutableWorld, _input: InputSnapshot, _dt: number): void {}
}
