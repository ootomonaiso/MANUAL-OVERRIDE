/**
 * game/systems/meleeShared.ts
 *
 * melee 攻撃の矩形構築とスイング演出描画を MeleeKillFeature / SurvivalFeature
 * の両方で共用する。座標変換（スクリーン系）もここで 1 箇所に集約する。
 */

import type { Rect } from '../entities'
import { SURVIVAL, PIXELART } from '../../data/tunables'
import { PixelCanvas } from '../render'

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

  const px = new PixelCanvas(ctx)
  const cx = playerX + playerW / 2
  const cy = playerY + playerH / 2
  const range = SURVIVAL.meleeRange
  const arc = SURVIVAL.meleeArc
  const totalActiveTime = meleeCooldown * SURVIVAL.meleeActiveRatio
  // 太さ・ハロー幅は実px指定だった既存値をセル単位APIに合わせて変換（値そのものは JSON から読む）
  const thickness = Math.max(1, Math.round(SURVIVAL.meleeSwingLineWidth / Math.max(1, PIXELART.size)))
  const haloSteps = Math.max(1, Math.round(SURVIVAL.meleeSwingShadowBlur / Math.max(1, PIXELART.size)))
  const fadeAlpha = active / totalActiveTime

  // px.withAlpha は現在の globalAlpha に乗算するため、ハローも本体もフェードが掛かる
  px.withAlpha(fadeAlpha, () => {
    px.halo((expand, c) => {
      px.arcBlocks(cx, cy, range + expand, -arc / 2, arc / 2, c, thickness)
      px.arcBlocks(cx, cy, range + expand, Math.PI - arc / 2, Math.PI + arc / 2, c, thickness)
    }, SURVIVAL.meleeSwingShadowColor, haloSteps)

    // 右方向の弧
    px.arcBlocks(cx, cy, range, -arc / 2, arc / 2, SURVIVAL.meleeSwingStrokeColor, thickness)
    // 左方向の弧
    px.arcBlocks(cx, cy, range, Math.PI - arc / 2, Math.PI + arc / 2, SURVIVAL.meleeSwingStrokeColor, thickness)
  })
}
