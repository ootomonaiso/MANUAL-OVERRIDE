/**
 * game/systems/MovementFeature.ts
 * 'auto_run', 'slow_precise', 'double_jump', 'long_air' Feature を担当。
 *
 * preUpdate() — 物理計算前に呼ばれ、入力→速度マッピングを担当。
 *               sideScroller.ts からの inline 移動コードを置き換える。
 * update()    — 物理計算後に呼ばれ、long_air のスコアボーナスを付与。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { PLAYER_PHYSICS } from '../../data/gameBalance'
import { PHYSICS, SCORE } from '../../data/tunables'

export class MovementFeature implements FeatureSystem {
  readonly handles = ['auto_run', 'slow_precise', 'double_jump', 'long_air'] as const

  onInit(world: MutableWorld): void {
    if (world.rules.features.has('double_jump')) {
      world.player.jumpsLeft = Math.max(world.player.jumpsLeft, 2)
    }
  }

  /** 物理計算前: 入力を読み取りプレイヤーの vx をセット */
  preUpdate(world: MutableWorld, input: InputSnapshot, _dt: number): void {
    const p = world.player
    const r = world.rules
    const leftKey  = r.controls.moveLeft
    const rightKey = r.controls.moveRight

    const runSpeed = r.features.has('slow_precise')
      ? PLAYER_PHYSICS.runSpeed * PHYSICS.slowPreciseRatio
      : PLAYER_PHYSICS.runSpeed

    if (r.scrollAxis === 'y') {
      // 縦スクロール: 左右移動のみ
      const movingLeft  = input.keys.has(leftKey)
      const movingRight = input.keys.has(rightKey)
      p.vx = movingRight ? runSpeed : movingLeft ? -runSpeed : 0
    } else {
      // 横スクロール: auto_run は右方向を強制
      const isAutoRun   = r.features.has('auto_run')
      const movingLeft  = !isAutoRun && input.keys.has(leftKey)
      const movingRight =  isAutoRun || input.keys.has(rightKey)
      p.vx = movingRight ? runSpeed : movingLeft ? -runSpeed : 0
    }
  }

  /** 物理計算後: long_air 中のスコアボーナス */
  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (world.rules.features.has('long_air') && !world.player.onGround) {
      world.addScore(SCORE.longAirScoreRate * dt)
    }
  }
}
