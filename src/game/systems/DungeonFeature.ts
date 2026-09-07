/**
 * game/systems/DungeonFeature.ts
 *
 * 松明の光が減少するダンジョン。暗闇で視界が制限される。
 * - 松明: 100 初期、-2/sec で減少（最小 20）。safe hazard 回収で +40（上限 100）
 * - 部屋制: 400px ごとに部屋番号が増加
 * - 暗闇ビネット: 松明の光半径に応じた円形明かり。外側は暗い。
 * - HUD: 松明バー（右上）、部屋番号（左上）
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

// 松明
const TORCH_MAX = 100
const TORCH_MIN = 20
const TORCH_DECAY_PER_SEC = 2.0
const TORCH_RECOVERY_AMOUNT = 40

// 部屋
const ROOM_WIDTH = 400

// HUD
const TORCH_BAR_W = 120
const TORCH_BAR_H = 10

// 色
const COLOR_TORCH_HIGH = '#ff8800'
const COLOR_TORCH_LOW = '#884400'

// 内部状態
interface DungeonState {
  torch: number
}

export class DungeonFeature implements FeatureSystem {
  readonly handles = ['dungeon'] as const

  private _state: DungeonState = this._createState()

  private _createState(): DungeonState {
    return {
      torch: TORCH_MAX,
    }
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    // 松明減少
    this._state.torch -= TORCH_DECAY_PER_SEC * dt
    if (this._state.torch < TORCH_MIN) {
      this._state.torch = TORCH_MIN
    }

    // アイテム回収（safe hazard）
    this._collectItems(world)
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    this._renderDarkness(ctx, world)
    this._renderHud(ctx, world)
  }

  onManualUpdated(): void {
    this._state = this._createState()
  }

  // ─── 内部: 松明管理 ──────────────────────────────────────────────

  private _collectItems(world: MutableWorld): void {
    const player = world.player
    for (const hazard of world.hazards) {
      if (!hazard.isSafe) continue

      // C6: hazard.x はワールド座標、player.x はスクリーン座標なので
      // getHazardScreenX でスクリーン座標に変換してから衝突判定
      const hScreenX = world.getHazardScreenX(hazard)
      const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h }
      const hazardRect = { x: hScreenX, y: hazard.y, w: hazard.w, h: hazard.h }
      const overlap = (
        playerRect.x < hazardRect.x + hazardRect.w &&
        playerRect.x + playerRect.w > hazardRect.x &&
        playerRect.y < hazardRect.y + hazardRect.h &&
        playerRect.y + playerRect.h > hazardRect.y
      )

      if (overlap) {
        this._state.torch = Math.min(TORCH_MAX, this._state.torch + TORCH_RECOVERY_AMOUNT)
        world.removeHazardById(hazard)
        world.addScorePopup(hScreenX + hazard.w / 2, hazard.y, `+${TORCH_RECOVERY_AMOUNT} TORCH`, COLOR_TORCH_HIGH)
      }
    }
  }

  // ─── 内部: 暗闇ビネット ──────────────────────────────────────────

  private _renderDarkness(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const H = world.canvas.height

    // 光半径: torch * 1.5（20〜150px の範囲）
    const radius = Math.max(20, Math.min(150, this._state.torch * 1.5))

    // C12: destination-out だと既存描画を消去してしまうので、
    // ラジアルグラデーションで暗闇を描く（中心透明 → 外周暗い）
    const playerScreenX = world.player.x + world.player.w / 2
    const playerScreenY = world.player.y + world.player.h / 2

    const gradient = ctx.createRadialGradient(
      playerScreenX, playerScreenY, radius * 0.3,
      playerScreenX, playerScreenY, radius,
    )
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.4)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.85)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, W, H)
  }

  // ─── 内部: HUD ───────────────────────────────────────────────────

  private _renderHud(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const s = this._state

    // ─── 部屋番号（左上） ──────────────────────────────────────
    const roomNumber = Math.floor(world.distance / ROOM_WIDTH) + 1
    ctx.save()
    ctx.fillStyle = '#ffffff'
    ctx.font = '14px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`ROOM: ${roomNumber}`, 12, 20)
    ctx.restore()

    // ─── 松明バー（右上） ─────────────────────────────────────
    const barX = W - TORCH_BAR_W - 16
    const barY = 12

    // パネル背景
    ctx.save()
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(barX - 3, barY - 3, TORCH_BAR_W + 6, TORCH_BAR_H + 6)

    // バー背景
    ctx.fillStyle = 'rgba(20,10,0,0.6)'
    ctx.fillRect(barX, barY, TORCH_BAR_W, TORCH_BAR_H)

    // 充填
    const fillRatio = s.torch / TORCH_MAX
    const fillW = fillRatio * TORCH_BAR_W
    const barColor = s.torch >= 60 ? COLOR_TORCH_HIGH : COLOR_TORCH_LOW
    if (fillW > 0) {
      ctx.fillStyle = barColor
      ctx.fillRect(barX + 1, barY + 1, fillW - 2, TORCH_BAR_H - 2)
    }

    // ラベル
    ctx.fillStyle = '#ffaa44'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('TORCH', barX + TORCH_BAR_W / 2, barY - 5)
    ctx.textAlign = 'start'

    // 値
    ctx.fillStyle = barColor
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`${Math.floor(s.torch)}`, barX + TORCH_BAR_W + 8, barY + TORCH_BAR_H - 2)

    ctx.restore()
  }
}
