/**
 * src/domain/nearMiss.ts
 *
 *ニアミス判定（純粋関数）。
 * 障害物がプレイヤーの衝突圏をすり抜け、垂直/水平方向の隙間が閾値未満のとき true。
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 *ニアミスかどうかを判定する。
 *
 * @param player プレイヤーの矩形（ワールド座標）
 * @param hazardScreen 障害物の矩形（画面座標: 横モードは h.x - cameraX 済み、縦モードはそのまま）
 * @param mode 'x' = 横スクロール（通過判定は左方向） / 'y' = 縦スクロール（障害物は上から落下、通過判定は下方向）
 * @param gapPx 許容ギャップ（px）。これ以下ならニアミスとみなす
 * @returns 重複している場合は false（被弾なのでニアミスではない）
 */
export function isNearMiss(
  player: Rect,
  hazardScreen: Rect,
  mode: 'x' | 'y',
  gapPx: number,
): boolean {
  // 重複 → 被弾なのでニアミスではない
  if (rectsOverlap(player, hazardScreen)) {
    return false
  }

  if (mode === 'x') {
    // 横モード: 障害物がプレイヤーの左に完全に通過済み
    // h.x + h.w < p.x かつ 垂直方向のギャップ < gapPx
    if (hazardScreen.x + hazardScreen.w >= player.x) {
      return false // 未通過
    }
    // 垂直ギャップ: 両矩形が垂直軸で重ならない部分の距離。
    // gapTop > 0 なら hazard は player 下方、gapBottom > 0 なら上方。
    // 両方 negative または一方 positive 一方 negative → 垂直軸で重なっている → gap = 0
    const gapTop = player.y - (hazardScreen.y + hazardScreen.h)
    const gapBottom = hazardScreen.y - (player.y + player.h)
    const gap = Math.max(0, gapTop, gapBottom)
    return gap < gapPx
  }

  // 縦モード: 障害物は上から落下するため、プレイヤーの下に完全に通過済み
  // h.y > p.y + p.h かつ 水平方向のギャップ < gapPx
  if (hazardScreen.y <= player.y + player.h) {
    return false // 未通過
  }
  // 水平ギャップ
  const gapLeft = player.x - (hazardScreen.x + hazardScreen.w)
  const gapRight = hazardScreen.x - (player.x + player.w)
  const gap = Math.max(0, gapLeft, gapRight)
  return gap < gapPx
}

/** 矩形の重複判定（grace なし） */
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}
