/**
 * genres/shared/gimmickRender.ts
 * runner / bullet_runner 共通: 穴・空中足場・バネの描画。
 *
 * 両ジャンルとも同じギミック（isHole / isPlatform / isSpring）を使うため、
 * 見た目のロジックを1箇所にまとめ、各プラグインの drawHazard から呼び出す。
 *
 * NOTE: src/genres/index.ts は `./*.ts`（直下のみ）を glob して各ファイルの
 * default export をジャンルプラグインとして自動登録する。この共有ヘルパーは
 * プラグインではない（default export を持たない）ため、直下ではなく
 * このサブディレクトリに置いて glob 対象から外している。
 */

import { PixelCanvas } from '../../game/render'
import type { Hazard } from '../../game/entities'

/**
 * ギミック系ハザード（穴・足場・バネ）を描画する。
 * 対象外（通常の敵・障害物）の場合は false を返し、呼び出し元にデフォルト描画を委ねる。
 */
export function drawGimmickHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, screenH: number): boolean {
  const px = new PixelCanvas(ctx)

  if (hazard.isHole) {
    // 穴: 地面の色をくり抜き、暗い縦穴として描く（画面下端まで続く落とし穴）
    const y = hazard.rect.y
    px.rect(sx, y, hazard.w, screenH - y, '#05070a')
    px.withAlpha(0.5, () => px.rect(sx, y, hazard.w, 8, '#000000'))
    px.line(sx, y, sx + hazard.w, y, '#000000aa', 1)
    return true
  }

  if (hazard.isSpring) {
    // 台座（茶色の土台）+ 反発面（ジャンル配色）+ 上方向へ跳ねることを示す矢印。
    // 足場・穴と混同されないよう、台座を狭く・反発面を目立たせて「バネらしさ」を強調する
    const y = hazard.rect.y
    const baseY = y + hazard.h * 0.55
    px.rect(sx + hazard.w * 0.15, baseY, hazard.w * 0.7, hazard.h * 0.45, '#5a4636')
    px.rect(sx, y, hazard.w, hazard.h * 0.55, hazard.color)
    px.line(sx, y, sx + hazard.w, y, '#ffffffcc', 1)
    px.line(sx + hazard.w * 0.1, y + hazard.h * 0.22, sx + hazard.w * 0.9, y + hazard.h * 0.22, hazard.glowColor, 1)
    // 反発方向を示す上向き矢印（穏やかに上下するアニメーション）
    const bob = Math.sin(performance.now() / 220) * hazard.h * 0.12
    px.tri(sx + hazard.w * 0.5 - hazard.w * 0.22, y - hazard.h * 0.55 + bob, hazard.w * 0.44, hazard.h * 0.4, 'up', hazard.glowColor)
    return true
  }

  if (hazard.isPlatform) {
    const y = hazard.rect.y
    px.rect(sx, y, hazard.w, hazard.h, hazard.color)
    px.line(sx, y, sx + hazard.w, y, '#ffffff55', 1)
    if (hazard.conveyorVx !== 0) {
      const dir = hazard.conveyorVx > 0 ? 1 : -1
      const t = (performance.now() / 200) % 20
      px.withAlpha(0.75, () => {
        for (let bx = -20; bx < hazard.w + 20; bx += 20) {
          const ax = sx + bx + (dir > 0 ? t : 20 - t)
          px.tri(ax, y + hazard.h / 2 - 4, 8, 8, dir > 0 ? 'right' : 'left', '#ffffff')
        }
      })
    }
    return true
  }

  return false
}
