/**
 * game/systems/meleeShared.ts
 *
 * melee 攻撃の矩形構築とスイング演出描画を MeleeKillFeature / SurvivalFeature
 * の両方で共用する。座標変換（スクリーン系）もここで 1 箇所に集約する。
 */

import type { Rect } from '../entities'
import { SURVIVAL } from '../../data/tunables'

/**
 * melee 攻撃矩形を構築する（プレイヤー中心を軸に左右両方向へ伸びる）。
 * 戻り値はスクリーン座標系（player.x がスクリーン座標である前提）。
 */
export function buildMeleeRect(
  playerX: number,
  playerY: number,
  playerW: number,
  playerH: number,
): Rect {
  const range = SURVIVAL.meleeRange
  const meleeLeft = playerX - range
  const meleeRight = playerX + playerW + range
  const meleeTop = playerY - range * SURVIVAL.meleeVerticalRatio
  const meleeBottom = playerY + playerH + range * SURVIVAL.meleeVerticalRatio
  return {
    x: meleeLeft,
    y: meleeTop,
    w: meleeRight - meleeLeft,
    h: meleeBottom - meleeTop,
  }
}

/**
 * melee スイング演出を描画する。
 * active <= 0 の場合は何もしない。
 */
export function drawMeleeSwing(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  playerW: number,
  playerH: number,
  active: number,
  meleeCooldown: number,
): void {
  if (active <= 0) return

  const cx = playerX + playerW / 2
  const cy = playerY + playerH / 2
  const range = SURVIVAL.meleeRange
  const arc = SURVIVAL.meleeArc
  const totalActiveTime = meleeCooldown * SURVIVAL.meleeActiveRatio

  ctx.save()
  ctx.globalAlpha = active / totalActiveTime
  ctx.strokeStyle = SURVIVAL.meleeSwingStrokeColor
  ctx.lineWidth = SURVIVAL.meleeSwingLineWidth
  ctx.shadowColor = SURVIVAL.meleeSwingShadowColor
  ctx.shadowBlur = SURVIVAL.meleeSwingShadowBlur

  // 右方向の弧
  ctx.beginPath()
  ctx.arc(cx, cy, range, -arc / 2, arc / 2)
  ctx.stroke()

  // 左方向の弧
  ctx.beginPath()
  ctx.arc(cx, cy, range, Math.PI - arc / 2, Math.PI + arc / 2)
  ctx.stroke()

  ctx.restore()
}
