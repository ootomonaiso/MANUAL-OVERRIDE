import type { ContradictionState } from './types'
import type { ChoiceRecord } from './ruleEngine'
import { CARD_POOL } from '../data/cardPool'

// ─────────────────────────────────────────────────────────────
// 矛盾トラッキング
//
// プレイヤーが互いに矛盾するカードを選択した場合、
// 矛盾スコアを累積し、閾値を超えると「ゲームが壊れた」
// 特別な結末（glitch）への分岐を可能にする。
// ─────────────────────────────────────────────────────────────

/** 矛盾が1つ発生したときのスコア加算量 */
const CONTRADICTION_WEIGHT = 0.25

/** glitch 結末への分岐を可能にする矛盾スコアの閾値 */
const GLITCH_THRESHOLD = 0.5

/**
 * 選択履歴から矛盾状態を計算する純粋関数。
 *
 * 各カードの conflictsWith フィールドを参照し、
 * 両方とも選択されているカードペアを検出する。
 */
export function trackContradictions(history: ChoiceRecord[]): ContradictionState {
  const selectedIds = new Set(history.map(r => r.choiceId))
  const pairs: { idA: string; idB: string }[] = []
  const seenPairs = new Set<string>()

  for (const record of history) {
    const card = CARD_POOL.find(c => c.id === record.choiceId)
    if (!card?.conflictsWith?.length) continue

    for (const conflictId of card.conflictsWith) {
      if (!selectedIds.has(conflictId)) continue

      // ペアを一意に識別（順序无关）
      // slice() でコピーしてから sort() する（破壊的操作を避ける）
      const pairKey = [record.choiceId, conflictId].slice().sort().join('|')
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)

      pairs.push({ idA: record.choiceId, idB: conflictId })
    }
  }

  // 矛盾スコア計算（最大 1.0 にクランプ）
  const score = Math.min(1, pairs.length * CONTRADICTION_WEIGHT)

  return {
    pairs,
    score,
    hasEffect: score >= GLITCH_THRESHOLD,
  }
}

/**
 * 矛盾スコアが glitch 結末の閾値を超えているか判定する。
 */
export function shouldTriggerGlitchEnd(state: ContradictionState): boolean {
  return state.hasEffect
}

/**
 * 矛盾スコアを 0〜100 のパーセンテージで返す（UI 表示用）。
 */
export function contradictionPercentage(state: ContradictionState): number {
  return Math.round(state.score * 100)
}
