/**
 * src/domain/updateWindow.ts
 *
 * 説明書更新ウィンドウの計算（純粋関数）。
 * 現在の updateProgress から、次回の更新ウィンドウ [start, end) を求める。
 *
 * progress < distances[0]                    → { start: 0, end: distances[0] }
 * distances[i] <= progress < distances[i+1]  → { start: distances[i], end: distances[i+1] }
 * progress >= 最後の距離                      → infinite の floor ウィンドウを返す
 */

export interface UpdateWindow {
  start: number
  end: number
}

/**
 * 現在の updateProgress に対応する更新ウィンドウを計算する。
 *
 * @param progress 現在の進行度（updateProgress）
 * @param distances 更新閾値の配列（昇順）
 * @param infiniteInterval 最後の閾値を超過した後の無限更新間隔
 */
export function computeUpdateWindow(
  progress: number,
  distances: readonly number[],
  infiniteInterval: number,
): UpdateWindow {
  // distances が空の場合は 0〜infiniteInterval のウィンドウを返す
  if (distances.length === 0) {
    return { start: 0, end: infiniteInterval }
  }

  // progress が最初の閾値より前
  if (progress < distances[0]) {
    return { start: 0, end: distances[0] }
  }

  // 通常の閾値間
  for (let i = 0; i < distances.length - 1; i++) {
    if (progress >= distances[i] && progress < distances[i + 1]) {
      return { start: distances[i], end: distances[i + 1] }
    }
  }

  // 最後の閾値を超過: infiniteInterval 単位の floor ウィンドウ
  const lastDist = distances[distances.length - 1]
  const excess = progress - lastDist
  const floor = Math.floor(excess / infiniteInterval) * infiniteInterval
  return {
    start: lastDist + floor,
    end: lastDist + floor + infiniteInterval,
  }
}
