/**
 * game/systems/PowerUpFeature.ts
 * 'power_up' フィーチャーを担当。
 *
 * power アイテムの収集判定と、射撃クールダウンの一時短縮を処理する。
 * ShootFeature との連携: world に powerBoostTimer を設定し、
 * ShootFeature が shotCooldown の計算時にこれを参照する。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap } from '../entities'
import { getActiveSystems } from '../../engine/GameRegistry'
import { soundManager } from '../../plugins/SoundManager'

// power_boost の持続時間（秒）
const POWER_BOOST_DURATION_SEC = 5
// クールダウン短縮率（0.5 = 50% 短縮）
const POWER_BOOST_REDUCTION = 0.5

export class PowerUpFeature implements FeatureSystem {
  readonly handles = ['power_up'] as const

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('power_up')) return

    // powerBoostTimer のデクリメント（ShootFeature が参照するため world 上に保持）
    this._tickBoostTimer(world, dt)

    // power アイテムの収集判定
    this._collectPowerItems(world)
  }

  render(_ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    // powerBoostTimer が残っている時に HUD 的なインジケーターを描画
    if (world.rules.features.has('power_up') && this._getBoostTimer(world) > 0) {
      this._drawBoostIndicator(_ctx, world)
    }
  }

  // ─── 内部: ブーストタイマー管理 ──────────────────────────────────
  private _getBoostTimer(world: MutableWorld): number {
    return world.powerBoostTimer ?? 0
  }

  private _setBoostTimer(world: MutableWorld, seconds: number): void {
    world.powerBoostTimer = seconds
  }

  private _tickBoostTimer(world: MutableWorld, dt: number): void {
    const timer = this._getBoostTimer(world)
    if (timer <= 0) return
    const next = Math.max(0, timer - dt)
    this._setBoostTimer(world, next)
  }

  /**
   * ShootFeature が this を通じてクールダウン短縮率を取得するためのヘルパー。
   * 設計書: 「ShootFeature が参照」するため world 経由でアクセスする。
   */
  getBoostFactor(world: MutableWorld): number {
    return this._getBoostTimer(world) > 0 ? POWER_BOOST_REDUCTION : 0
  }

  // ─── 内部: power アイテムの収集 ──────────────────────────────────
  private _collectPowerItems(world: MutableWorld): void {
    const p = world.player
    for (const item of world.items) {
      if (!item.alive || item.type !== 'power') continue
      const iRect = { ...item.rect, x: item.rect.x - world.cameraX }
      if (!rectsOverlap(p.rect, iRect, 0)) continue

      // 収集: クールダウンを POWER_BOOST_DURATION_SEC 秒間 50% 短縮
      item.alive = false
      world.addScoreVarsItemCollected()
      this._setBoostTimer(world, POWER_BOOST_DURATION_SEC)
      soundManager.onItemPickup()

      // スコアポップアップ
      world.addScorePopup(item.x - world.cameraX, item.y, 'POWER UP!', '#00ccff')
      world.addScore(50)

      // onItemPickup フック発火
      for (const sys of this._getActiveSystems(world)) {
        sys.onItemPickup?.(world, 'power')
      }
    }
  }

  // ─── 内部: ブーストインジケーター描画 ────────────────────────────
  private _drawBoostIndicator(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const timer = this._getBoostTimer(world)
    const maxTime = POWER_BOOST_DURATION_SEC
    const ratio = timer / maxTime

    ctx.save()
    // プレイヤーの上に半透明バー
    const p = world.player
    const barW = p.w * 1.2
    const barH = 3
    const barX = p.x + p.w / 2 - barW / 2
    const barY = p.y - 8

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(barX, barY, barW, barH)
    // fill
    const boostColor = ratio > 0.5 ? '#00ccff' : '#ff8800'
    ctx.fillStyle = boostColor
    ctx.fillRect(barX, barY, barW * ratio, barH)
    ctx.restore()
  }

  // ─── 内部: ヘルパー ──────────────────────────────────────────────
  private _getActiveSystems(world: MutableWorld): FeatureSystem[] {
    return getActiveSystems(world.rules.features)
  }
}
