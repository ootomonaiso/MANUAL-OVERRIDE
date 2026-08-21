/**
 * src/domain/comboMilestones.ts
 *
 * コンボ到達時のマイルストーン判定（純粋関数）。
 * combo が milestones[].at にちょうど一致したらその要素を返す。
 */

export interface ComboMilestone {
  at: number
  label: string
}

/**
 * 現在の combo 値が milestones のいずれかの at に一致するか判定する。
 * 一致すればその milestone を返し、一致しなければ null を返す。
 *
 * @param combo 現在のコンボ数
 * @param milestones 昇順にソートされたマイルストーン配列
 */
export function comboMilestone(
  combo: number,
  milestones: readonly ComboMilestone[],
): ComboMilestone | null {
  for (const m of milestones) {
    if (m.at === combo) return m
  }
  return null
}
