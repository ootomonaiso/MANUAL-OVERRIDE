/**
 * game/systems/AquaticFeature.ts
 *
 * 水中アドベンチャー Feature。
 * - 酸素ゲージ: 100 初期、-3/sec で減少。0 で敗北。
 * - 酸素回復: safe flag のハザードを回収で +30（上限100）
 * - 泳ぎ: 上キーで上昇、下キーで下降、Space も上昇
 * - 海流: 5秒ごとに一定方向に 2秒間押し流す
 * - HUD: 酸素バー（右上）、深度（左上）
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

// ── 定数 ──────────────────────────────────────────────────────────

const OXYGEN_MAX = 100
const OXYGEN_DECAY_PER_SEC = 3.0
const OXYGEN_RECOVERY_AMOUNT = 30

const CURRENT_INTERVAL = 5     // 海流発生間隔（秒）
const CURRENT_DURATION = 2     // 海流持続（秒）
const CURRENT_SPEED = 30       // 海流速度（px/s）

// HUD
const OXYGEN_BAR_W = 160
const OXYGEN_BAR_H = 12

// 色
const COLOR_OXYGEN_HIGH = '#44ccff'
const COLOR_OXYGEN_MID = '#ffcc44'
const COLOR_OXYGEN_LOW = '#ff4444'

// 内部状態
interface AquaticState {
  oxygen: number
  won: boolean
  elapsed: number
  currentTimer: number
  currentDir: 1 | -1
  currentActive: boolean
  currentRemaining: number
  _dirty: boolean
}

export class AquaticFeature implements FeatureSystem {
  readonly handles = ['aquatic'] as const

  private _state: AquaticState = this._createState()

  private _createState(): AquaticState {
    return {
      oxygen: OXYGEN_MAX,
      won: false,
      elapsed: 0,
      currentTimer: 0,
      currentDir: 1,
      currentActive: false,
      currentRemaining: 0,
      _dirty: true,
    }
  }

  onManualUpdated(_world: MutableWorld): void {
    this._state = this._createState()
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    if (this._state.won) return

    this._state.elapsed += dt
    this._state.currentTimer += dt

    // ─── 海流管理 ─────────────────────────────────────────────
    if (!this._state.currentActive) {
      if (this._state.currentTimer >= CURRENT_INTERVAL) {
        this._state.currentTimer -= CURRENT_INTERVAL
        this._state.currentActive = true
        this._state.currentRemaining = CURRENT_DURATION
        this._state.currentDir = Math.random() < 0.5 ? 1 : -1
      }
    } else {
      this._state.currentRemaining -= dt
      if (this._state.currentRemaining <= 0) {
        this._state.currentActive = false
        this._state.currentRemaining = 0
      }
    }

    // ─── 酸素減少 ─────────────────────────────────────────────
    this._state.oxygen -= OXYGEN_DECAY_PER_SEC * dt

    if (this._state.oxygen <= 0) {
      this._state.oxygen = 0
      // 敗北: HP を 0 にする
      world.modifyPlayerHp(-world.player.hp)
      return
    }

    // ─── 海流の影響 ───────────────────────────────────────────
    const player = world.player
    if (this._state.currentActive) {
      player.vx += CURRENT_SPEED * this._state.currentDir * dt
    }

    // ─── アイテム回収（safe hazard） ──────────────────────────
    for (const hazard of world.hazards) {
      if (!hazard.isSafe) continue

      // 衝突判定
      const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h }
      const hazardRect = { x: hazard.x, y: hazard.y, w: hazard.w, h: hazard.h }
      const overlap = (
        playerRect.x < hazardRect.x + hazardRect.w &&
        playerRect.x + playerRect.w > hazardRect.x &&
        playerRect.y < hazardRect.y + hazardRect.h &&
        playerRect.y + playerRect.h > hazardRect.y
      )

      if (overlap) {
        this._state.oxygen = Math.min(OXYGEN_MAX, this._state.oxygen + OXYGEN_RECOVERY_AMOUNT)
        world.removeHazardById(hazard)
        world.addScorePopup(hazard.x + hazard.w / 2, hazard.y, `+${OXYGEN_RECOVERY_AMOUNT} O2`, COLOR_OXYGEN_HIGH)
        world.addParticle(
          hazard.x + hazard.w / 2, hazard.y + hazard.h / 2,
          (Math.random() - 0.5) * 60, -40 - Math.random() * 40,
          0.5, '#44ccff', 4,
        )
      }
    }

    this._state._dirty = true
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!this._state._dirty) return
    this._state._dirty = false

    const W = world.canvas.width
    const s = this._state

    // ─── 深度表示（左上） ─────────────────────────────────────
    const depth = Math.floor(world.distance * 0.1)
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.font = '12px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`DEPTH: ${depth}m`, 12, 20)
    ctx.restore()

    // ─── 酸素バー（右上） ─────────────────────────────────────
    const barX = W - OXYGEN_BAR_W - 16
    const barY = 12

    // パネル背景
    ctx.save()
    ctx.fillStyle = 'rgba(0,10,30,0.7)'
    ctx.fillRect(barX - 3, barY - 3, OXYGEN_BAR_W + 6, OXYGEN_BAR_H + 6)

    // バー背景
    ctx.fillStyle = 'rgba(0,30,60,0.6)'
    ctx.fillRect(barX, barY, OXYGEN_BAR_W, OXYGEN_BAR_H)

    // 充填
    const fillRatio = s.oxygen / OXYGEN_MAX
    const fillW = fillRatio * OXYGEN_BAR_W
    let barColor: string
    if (s.oxygen >= 60) {
      barColor = COLOR_OXYGEN_HIGH
    } else if (s.oxygen >= 30) {
      barColor = COLOR_OXYGEN_MID
    } else {
      barColor = COLOR_OXYGEN_LOW
    }
    if (fillW > 0) {
      ctx.fillStyle = barColor
      ctx.fillRect(barX + 1, barY + 1, fillW - 2, OXYGEN_BAR_H - 2)
    }

    // ラベル
    ctx.fillStyle = '#88ccff'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('O2', barX + OXYGEN_BAR_W / 2, barY - 5)
    ctx.textAlign = 'start'

    // 値
    ctx.fillStyle = barColor
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`${Math.floor(s.oxygen)}`, barX + OXYGEN_BAR_W + 8, barY + OXYGEN_BAR_H - 2)

    ctx.restore()
  }
}
