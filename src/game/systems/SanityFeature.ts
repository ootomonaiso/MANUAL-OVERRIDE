/**
 * game/systems/SanityFeature.ts
 *
 * 「正気を保つ」サバイバル Feature（RPG 寄り）。
 * - 正気ゲージ: 100 初期。時間経過で減少（-2/秒）。敵接近（200px 以内）で急減（-10/秒）。
 * - アイテムで回復（+30）。
 * - 正気 0 で敗北（HP 0 と同じ）。
 * - 120 秒生存で「脱出」（勝利）。
 * - 正気 50 以下で画面が歪む（HorrorPlugin のビジュアルと連携）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

// 正気ゲージの最大値
const SANITY_MAX = 100
// 正気ゲージの自然減速度（per sec）
const SANITY_DECAY_PER_SEC = 2.0
// 敵接近時の減速度（per sec）
const SANITY_NEAR_ENEMY_DECAY = 10.0
// 敵接近の閾値（px）
const ENEMY_NEAR_DISTANCE = 200
// アイテムでの回復量（RpgFeature 等のアイテム収集時に addScorePopup で表示）
const _SANITY_ITEM_RECOVERY = 30
// 勝利条件：生存秒数
const WIN_SURVIVAL_SEC = 120

export class SanityFeature implements FeatureSystem {
  readonly handles = ['sanity'] as const

  private sanity = SANITY_MAX
  private won = false
  private _sanityDirty = true // HUD 再描画フラグ

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (this.won) return

    // 正気ゲージの減少（時間経過）
    this.sanity -= SANITY_DECAY_PER_SEC * dt

    // 敵接近判定
    const nearEnemy = this._isEnemyNear(world)
    if (nearEnemy) {
      this.sanity -= SANITY_NEAR_ENEMY_DECAY * dt
    }

    // 正気 0 で敗北
    if (this.sanity <= 0) {
      this.sanity = 0
      world.modifyPlayerHp(-world.player.hp) // HP を 0 にして死亡処理
      return
    }

    // 120 秒生存で勝利
    if (world.survivedSec >= WIN_SURVIVAL_SEC) {
      this.won = true
      world.declareWin?.()  // エンジンの勝利処理をトリガー（#fix-sanity-win）
      return
    }

    // アイテム収集で正気回復（RpgFeature 等のアイテム処理で addScorePopup 等を通じて回復）

    this._sanityDirty = true
  }

  render(ctx: CanvasRenderingContext2D, _world: MutableWorld): void {
    if (!this._sanityDirty) return
    this._sanityDirty = false

    // 正気ゲージの HUD 描画（画面上部）
    const gaugeW = 140
    const gaugeH = 12
    const gaugeX = 12
    const gaugeY = 12

    // パネル背景
    ctx.save()
    ctx.fillStyle = 'rgba(2,2,2,0.7)'
    ctx.fillRect(gaugeX - 3, gaugeY - 3, gaugeW + 6, gaugeH + 6)

    // ゲージ背景
    ctx.fillStyle = 'rgba(20,0,0,0.6)'
    ctx.fillRect(gaugeX, gaugeY, gaugeW, gaugeH)

    // ゲージ充填
    const fillRatio = this.sanity / SANITY_MAX
    const fillW = fillRatio * gaugeW
    if (fillW > 0) {
      let gaugeColor: string
      if (this.sanity > 50) {
        gaugeColor = '#cc2222'
      } else if (this.sanity > 25) {
        gaugeColor = '#881111'
      } else {
        gaugeColor = '#550000'
      }
      ctx.fillStyle = gaugeColor
      ctx.fillRect(gaugeX + gaugeW - fillW, gaugeY, fillW, gaugeH)
    }

    // ラベル
    ctx.fillStyle = '#662222'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('SANITY', gaugeX + gaugeW / 2, gaugeY - 5)
    ctx.textAlign = 'start'

    // 正気値
    ctx.fillStyle = '#cc4444'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`${Math.floor(this.sanity)}/${SANITY_MAX}`, gaugeX + gaugeW + 8, gaugeY + gaugeH - 2)

    ctx.restore()
  }

  onManualUpdated(): void {
    this.sanity = SANITY_MAX
    this.won = false
  }

  // ─── 内部 ────────────────────────────────────────────────────────

  private _isEnemyNear(world: MutableWorld): boolean {
    const player = world.player
    const playerX = player.x + player.w / 2
    const playerY = player.y + player.h / 2

    for (const hazard of world.hazards) {
      const hx = hazard.x + hazard.w / 2
      const hy = hazard.y + hazard.h / 2
      const dist = Math.hypot(hx - playerX, hy - playerY)
      if (dist < ENEMY_NEAR_DISTANCE) {
        return true
      }
    }
    return false
  }
}
