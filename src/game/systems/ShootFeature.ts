/**
 * game/systems/ShootFeature.ts
 * 'shoot', 'three_way', 'charge_shot', 'spread_shot', 'enemy_hp', 'bomb' Feature を担当。
 *
 * 変更点（framework強化）:
 * - world.cameraX を使い横モードのワールドX座標を正しく計算（旧実装の座標バグ修正）
 * - kills/combo を world.setKills()/setCombo() 経由で GameStats に書き込む
 * - 弾の描画を render() に移し sideScroller から分離
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { createShootState, updateShoot } from './shootSystem'
import type { ShootState } from './shootSystem'
import { HAZARD_VFX } from '../../data/tunables'
import { getGenre, getActiveSystems } from '../../engine/GameRegistry'
import { soundManager } from '../../plugins/SoundManager'

export class ShootFeature implements FeatureSystem {
  readonly handles = ['shoot', 'three_way', 'charge_shot', 'spread_shot', 'enemy_hp', 'bomb'] as const

  private state: ShootState = createShootState()

  onInit(): void {
    this.state = createShootState()
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const p = world.player
    const isVertical = world.rules.scrollAxis === 'y'
    const shootKey = world.rules.controls.shoot?.toLowerCase() ?? 'z'
    const shootJust = input.justPressed.has(shootKey)

    // 横モード: プレイヤーはスクリーン座標 → ワールドXへ変換
    const playerX = isVertical ? p.x : p.x + world.cameraX
    const W = world.canvas.width
    const viewportLeft  = isVertical ? -100 : world.cameraX - 100
    const viewportRight = isVertical ? W + 100 : world.cameraX + W + 100

    const { scoreGain, destroyedHazards, shotFired } = updateShoot(
      this.state,
      world.hazards,
      shootJust,
      playerX, p.y, p.h,
      world.rules,
      dt,
      viewportLeft, viewportRight, -100,
    )

    if (shotFired) {
      soundManager.onShoot()
    }

    if (scoreGain > 0) {
      world.addScore(scoreGain)
      const popupX = isVertical ? p.x + p.w / 2 : p.x + p.w + 4
      world.addScorePopup(popupX, p.y - 20, `+${scoreGain}`, '#ffdd00')
    }

    if (destroyedHazards.length > 0) {
      const plugin = getGenre(world.rules.genre)
      for (const h of destroyedHazards) {
        plugin.onHazardDestroyed?.(world, h)
        // ScoreVars: 敵撃破カウント（accuracy 計算用）
        world.addScoreVarsHit()
      }
    }

    // GameStats に統計を同期
    const oldCombo = world.gameStats.combo
    world.setKills(this.state.kills)
    world.setCombo(this.state.combo)

    // コンボが変化した場合、フック発火
    if (oldCombo !== this.state.combo) {
      for (const sys of getActiveSystems(world.rules.features)) {
        sys.onComboChange?.(world, this.state.combo)
      }
    }

    // world.bullets に同期（sideScroller や他システムが参照できる）
    ;(world.bullets as typeof this.state.bullets).length = 0
    ;(world.bullets as typeof this.state.bullets).push(...this.state.bullets)
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (world.bullets.length === 0) return
    const isVertical = world.rules.scrollAxis === 'y'

    ctx.save()
    ctx.shadowColor = '#ffff88'
    ctx.shadowBlur = HAZARD_VFX.glowBlur * 0.6

    for (const b of world.bullets) {
      // 横モード: ワールドX → スクリーンX変換
      const sx = isVertical ? b.x : b.x - world.cameraX
      ctx.fillStyle = '#ffff00'
      ctx.fillRect(sx - 4, b.y - 2, 8, 4)
    }

    ctx.restore()
  }

  onManualUpdated(): void {
    this.state = createShootState()
  }
}
