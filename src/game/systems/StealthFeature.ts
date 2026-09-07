/**
 * game/systems/StealthFeature.ts
 *
 * 見張りの警戒円錐に入ると検知される。静止すると隠密。
 * - 見張り: pillar 型ハザードが警戒円錐を持つ
 * - 検知メーター: 0〜100。移動中検知加速、静止中ゆっくり増加、円錐外で減衰
 * - 100 で敗北（発覚）
 * - alertLevel: hidden / suspicious / detected
 * - HUD: 検知メーター（右上）、ステータステキスト（左上）
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

// 検知
const DETECTION_MAX = 100
const DETECTION_MOVE_RATE = 25     // 移動中の増加率（per sec）
const DETECTION_STILL_RATE = 5     // 静止時の増加率（per sec）
const DETECTION_OUT_RATE = -15     // 円錐外の減衰率（per sec）

// 警戒円錐
const CONE_LENGTH = 120
const CONE_HALF_HEIGHT = 55       // C8: 40 → 55（プレイヤー高さ 52px をカバー）

// alertLevel 閾値
const ALERT_SUSPICIOUS_THRESHOLD = 30
const ALERT_DETECTED_THRESHOLD = 70

// 検知判定: 移動速度閾値（px/s 以上を「移動中」と判定）
const MOVE_SPEED_THRESHOLD = 10

// HUD
const DETECTION_BAR_W = 160
const DETECTION_BAR_H = 12

// 色
const COLOR_CONE_HIDDEN = 'rgba(204,68,34,0.15)'
const COLOR_CONE_DETECTED = 'rgba(255,68,34,0.3)'
const COLOR_DETECTION_GREEN = '#44aa44'
const COLOR_DETECTION_YELLOW = '#ffcc44'
const COLOR_DETECTION_RED = '#ff4444'

// ステータステキスト
const TEXT_HIDDEN = '隠密中'
const TEXT_SUSPICIOUS = '警戒'
const TEXT_DETECTED = '発覚寸前!'

// 内部状態
type AlertLevel = 'hidden' | 'suspicious' | 'detected'

interface StealthState {
  detection: number
  alertLevel: AlertLevel
  _dirty: boolean
}

export class StealthFeature implements FeatureSystem {
  readonly handles = ['stealth_detect'] as const

  private _state: StealthState = this._createState()

  private _createState(): StealthState {
    return {
      detection: 0,
      alertLevel: 'hidden',
      _dirty: true,
    }
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    this._updateDetection(world, dt)
    this._state._dirty = true
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!this._state._dirty) return
    this._state._dirty = false

    this._renderCone(ctx, world)
    this._renderHud(ctx, world)
  }

  onManualUpdated(): void {
    this._state = this._createState()
  }

  // ─── 内部: 検知更新 ──────────────────────────────────────────────

  private _updateDetection(world: MutableWorld, dt: number): void {
    const player = world.player
    const playerMoving = Math.abs(player.vx) > MOVE_SPEED_THRESHOLD
    let inCone = false

    for (const hazard of world.hazards) {
      if (hazard.shape !== 'pillar') continue

      // C7: hazard.x はワールド座標、player.x はスクリーン座標なので
      // getHazardScreenX でスクリーン座標に変換してから判定
      const hScreenX = world.getHazardScreenX(hazard)
      const hScreenY = hazard.y  // pillar の上辺 Y（スクリーン座標）

      // C8: 円錐を pillar の下辺（地面側）にアンカー
      const coneCenterY = hScreenY + hazard.h
      const coneLeft = hScreenX - CONE_LENGTH
      const coneRight = hScreenX
      const coneTop = coneCenterY - CONE_HALF_HEIGHT
      const coneBottom = coneCenterY + CONE_HALF_HEIGHT

      const playerInCone = (
        player.x + player.w > coneLeft &&
        player.x < coneRight &&
        player.y + player.h > coneTop &&
        player.y < coneBottom
      )

      if (playerInCone) {
        inCone = true
        if (playerMoving) {
          this._state.detection += DETECTION_MOVE_RATE * dt
        } else {
          this._state.detection += DETECTION_STILL_RATE * dt
        }
      }
    }

    if (!inCone) {
      this._state.detection += DETECTION_OUT_RATE * dt
    }

    // クランプ
    this._state.detection = Math.max(0, Math.min(DETECTION_MAX, this._state.detection))

    // 検知 100 で敗北（HP を 0 にして死亡処理）
    if (this._state.detection >= DETECTION_MAX) {
      world.modifyPlayerHp(-world.player.hp)
      return
    }

    // alertLevel 更新
    if (this._state.detection >= ALERT_DETECTED_THRESHOLD) {
      this._state.alertLevel = 'detected'
    } else if (this._state.detection >= ALERT_SUSPICIOUS_THRESHOLD) {
      this._state.alertLevel = 'suspicious'
    } else {
      this._state.alertLevel = 'hidden'
    }
  }

  // ─── 内部: 警戒円錐描画 ──────────────────────────────────────────

  private _renderCone(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    ctx.save()
    for (const hazard of world.hazards) {
      if (hazard.shape !== 'pillar') continue

      // C7: スクリーン座標に変換
      const hScreenX = world.getHazardScreenX(hazard)
      const hScreenY = hazard.y

      // C8: 円錐を pillar の下辺（地面側）にアンカー
      const coneCenterY = hScreenY + hazard.h
      const coneLeft = hScreenX - CONE_LENGTH
      const coneTop = coneCenterY - CONE_HALF_HEIGHT
      const coneW = CONE_LENGTH
      const coneH = CONE_HALF_HEIGHT * 2

      const color = this._state.alertLevel === 'detected'
        ? COLOR_CONE_DETECTED
        : COLOR_CONE_HIDDEN

      ctx.fillStyle = color
      ctx.fillRect(coneLeft, coneTop, coneW, coneH)
    }
    ctx.restore()
  }

  // ─── 内部: HUD ───────────────────────────────────────────────────

  private _renderHud(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const s = this._state

    // ─── ステータステキスト（左上） ─────────────────────────────
    ctx.save()
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'left'

    let statusColor: string
    let statusText: string
    switch (s.alertLevel) {
      case 'hidden':
        statusColor = '#4488ff'
        statusText = TEXT_HIDDEN
        break
      case 'suspicious':
        statusColor = '#ffcc44'
        statusText = TEXT_SUSPICIOUS
        break
      case 'detected':
        statusColor = '#ff4444'
        statusText = TEXT_DETECTED
        break
    }

    // detected のとき点滅
    if (s.alertLevel === 'detected') {
      const blink = Math.sin(Date.now() * 0.01) > 0
      if (blink) {
        ctx.fillStyle = statusColor
        ctx.fillText(statusText, 12, 20)
      }
    } else {
      ctx.fillStyle = statusColor
      ctx.fillText(statusText, 12, 20)
    }
    ctx.restore()

    // ─── 検知メーター（右上） ───────────────────────────────────
    const barX = W - DETECTION_BAR_W - 16
    const barY = 12

    // パネル背景
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(barX - 3, barY - 3, DETECTION_BAR_W + 6, DETECTION_BAR_H + 6)

    // バー背景
    ctx.fillStyle = 'rgba(20,0,0,0.6)'
    ctx.fillRect(barX, barY, DETECTION_BAR_W, DETECTION_BAR_H)

    // 充填
    const fillRatio = s.detection / DETECTION_MAX
    const fillW = fillRatio * DETECTION_BAR_W
    let barColor: string
    if (s.detection <= ALERT_SUSPICIOUS_THRESHOLD) {
      barColor = COLOR_DETECTION_GREEN
    } else if (s.detection <= ALERT_DETECTED_THRESHOLD) {
      barColor = COLOR_DETECTION_YELLOW
    } else {
      barColor = COLOR_DETECTION_RED
    }
    if (fillW > 0) {
      ctx.fillStyle = barColor
      ctx.fillRect(barX + 1, barY + 1, fillW - 2, DETECTION_BAR_H - 2)
    }

    // ラベル
    ctx.fillStyle = '#ff8888'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('DETECT', barX + DETECTION_BAR_W / 2, barY - 5)
    ctx.textAlign = 'start'

    // 値
    ctx.fillStyle = barColor
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`${Math.floor(s.detection)}`, barX + DETECTION_BAR_W + 8, barY + DETECTION_BAR_H - 2)

    ctx.restore()
  }
}
