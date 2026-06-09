/**
 * game/systems/PuzzleFeature.ts
 * パズル系フィーチャー: grid_stop
 *
 * grid_stop: shoot キー（Z）を押すと 2 秒間タイムスケールを 0.05 に落として
 *            ほぼ停止した状態にする（5 秒クールダウン）。
 *            パズルジャンルの「考えながら進む」感覚を表現する。
 *
 * puzzle_solve: 仕様が未確定のため handles から除外。genres.json にも含まれない。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

const GRID_STOP_DURATION  = 2.0   // 停止持続秒数
const GRID_STOP_TIMESCALE = 0.05  // 停止中のタイムスケール（ほぼ静止）
const GRID_STOP_COOLDOWN  = 5.0   // 再使用待機秒数

export class PuzzleFeature implements FeatureSystem {
  readonly handles = ['grid_stop'] as const

  private stopActive   = 0
  private stopCooldown = 0

  onInit(): void {
    this.stopActive   = 0
    this.stopCooldown = 0
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('grid_stop')) return

    if (this.stopActive   > 0) this.stopActive   -= dt
    if (this.stopCooldown > 0) this.stopCooldown -= dt

    const shootKey = (world.rules.controls.shoot ?? 'z').toLowerCase()
    const canStop  = this.stopActive <= 0 && this.stopCooldown <= 0

    if (canStop && input.justPressed.has(shootKey)) {
      world.setTimescale(GRID_STOP_TIMESCALE, GRID_STOP_DURATION)
      this.stopActive   = GRID_STOP_DURATION + 0.5
      this.stopCooldown = GRID_STOP_COOLDOWN

      const p = world.player
      world.addScorePopup(
        p.x + p.w / 2,
        p.y - 24,
        'GRID STOP!',
        '#88ffff',
      )
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('grid_stop') || this.stopActive <= 0) return

    // グリッド停止中: 画面縁に薄いシアン枠を表示
    const W = world.canvas.width
    const H = world.canvas.height
    const alpha = Math.min(1, this.stopActive / GRID_STOP_DURATION) * 0.6
    ctx.save()
    ctx.strokeStyle = '#88ffff'
    ctx.lineWidth   = 4
    ctx.globalAlpha = alpha
    ctx.strokeRect(2, 2, W - 4, H - 4)
    ctx.restore()
  }

  onManualUpdated(): void {
    this.stopActive   = 0
    this.stopCooldown = 0
  }
}
