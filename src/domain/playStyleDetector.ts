import type { ActionStats, DetectedPlayStyle, PlayStyleResult } from './types'

// ─────────────────────────────────────────────────────────────
// プレイスタイル検出の閾値
// ─────────────────────────────────────────────────────────────

/** 統計量がこの値未満だと信頼度が下がります */
const MIN_MEANINGFUL_TICKS = 300

/** 各スタイルのスコア計算で使用する重み係数 */
const WEIGHTS = {
  /** shotRate の重み（攻撃的判定） */
  shotRate: 3.0,
  /** jumpRate の重み（防御的判定） */
  jumpRate: 2.0,
  /** moveRate の重み（探索的判定） */
  moveRate: 1.5,
  /** collisionRate の重み（混沌判定） */
  collisionRate: 2.5,
  /** itemsCollected の重み（探索的判定） */
  itemRate: 1.0,
} as const

/** 各スタイルの判定に使用する最低閾値（rate = count / ticks * 60） */
const THRESHOLDS = {
  /** 攻撃的と判定する最低射撃レート（フレームあたりの射撃数） */
  aggressiveShotRate: 0.02,
  /** 防御的と判定する最低ジャンプレート */
  defensiveJumpRate: 0.015,
  /** 探索的と判定する最低移動レート */
  explorerMoveRate: 0.025,
  /** 混沌と判定する最低衝突レート */
  chaoticCollisionRate: 0.005,
  /** 消極的と判定する最高操作レート合計 */
  passiveMaxTotalRate: 0.01,
  /** 均衡と判定する最低バランス比率（どの操作も全体の30%以下） */
  balancedMinRatio: 0.3,
} as const

/** 各スタイルのスコア計算で使用する補正係数 */
const MULTIPLIERS = {
  /** ダッシュの防御的スコアへの補正係数 */
  dashDefensive: 1.5,
  /** アイテム収集の探索的スコアへの補正係数 */
  itemExplorer: 10,
  /** 均衡スコアの倍率 */
  balancedRatio: 2,
  /** 消極的スコアの倍率 */
  passiveRate: 50,
} as const

/** フレームレート（fps）。ticks を秒数に変換するために使用する */
const FRAMES_PER_SECOND = 60

/**
 * ActionStats からプレイスタイルを推定する純粋関数。
 *
 * 各操作の「レート」（ticks に対する比率）を計算し、
 * 閾値と比較して最も高いスコアを持つスタイルを返す。
 * ticks が少ない場合は confidence を下げる。
 */
export function detectPlayStyle(stats: ActionStats): PlayStyleResult {
  const { jumps, moveRight, moveLeft, shots, ticks, collisions, itemsCollected, dashes } = stats

  // ticks が 0 なら passive を返す
  if (ticks <= 0) {
    return {
      style: 'passive',
      confidence: 0,
      scores: defaultScores(),
    }
  }

  // レート計算（normalize: 1秒あたりの操作数）
  const seconds = ticks / FRAMES_PER_SECOND
  const shotRate = shots / seconds
  const jumpRate = jumps / seconds
  const moveRate = (moveRight + moveLeft) / seconds
  const collisionRate = collisions / seconds
  const itemRate = itemsCollected / seconds
  const dashRate = dashes / seconds

  // 各スタイルのスコア計算
  const scores: Record<DetectedPlayStyle, number> = {
    aggressive: 0,
    defensive: 0,
    explorer: 0,
    balanced: 0,
    chaotic: 0,
    passive: 0,
  }

  // 攻撃的: 射撃が多い
  if (shotRate >= THRESHOLDS.aggressiveShotRate) {
    scores.aggressive += WEIGHTS.shotRate * (shotRate / THRESHOLDS.aggressiveShotRate)
  }

  // 防御的: ジャンプ・ダッシュが多いが射撃が少ない
  if (jumpRate >= THRESHOLDS.defensiveJumpRate) {
    scores.defensive += WEIGHTS.jumpRate * (jumpRate / THRESHOLDS.defensiveJumpRate)
  }
  if (dashRate > 0) {
    scores.defensive += dashRate * MULTIPLIERS.dashDefensive
  }

  // 探索的: 移動が多い
  if (moveRate >= THRESHOLDS.explorerMoveRate) {
    scores.explorer += WEIGHTS.moveRate * (moveRate / THRESHOLDS.explorerMoveRate)
  }
  if (itemRate > 0) {
    scores.explorer += WEIGHTS.itemRate * itemRate * MULTIPLIERS.itemExplorer
  }

  // 混沌: 衝突が多く、操作が不規則
  if (collisionRate >= THRESHOLDS.chaoticCollisionRate) {
    scores.chaotic += WEIGHTS.collisionRate * (collisionRate / THRESHOLDS.chaoticCollisionRate)
  }

  // 均衡: 全操作が均等に分散している
  const totalActions = shots + jumps + moveRight + moveLeft + (dashes ?? 0)
  if (totalActions > 0) {
    const maxSingle = Math.max(shots, jumps, moveRight + moveLeft, dashes ?? 0)
    const balanceRatio = 1 - (maxSingle / totalActions)
    // balancedMinRatio以上（どの操作も全体の30%以下）なら均衡候補
    if (balanceRatio >= THRESHOLDS.balancedMinRatio) {
      scores.balanced = balanceRatio * MULTIPLIERS.balancedRatio
    }
  }

  // 消極的: 操作総数が少ない
  const totalRate = (shots + jumps + moveRight + moveLeft) / seconds
  if (totalRate < THRESHOLDS.passiveMaxTotalRate) {
    scores.passive = (THRESHOLDS.passiveMaxTotalRate - totalRate) * MULTIPLIERS.passiveRate
  }

  // 信頼度計算
  const confidence = Math.min(1, ticks / MIN_MEANINGFUL_TICKS)

  // 最高スコアのスタイルを返す
  let bestStyle: DetectedPlayStyle = 'balanced'
  let bestScore = 0
  for (const [style, score] of Object.entries(scores) as [DetectedPlayStyle, number][]) {
    if (score > bestScore) {
      bestScore = score
      bestStyle = style
    }
  }

  return {
    style: bestStyle,
    confidence: Math.round(confidence * 100) / 100,
    scores,
  }
}

function defaultScores(): Record<DetectedPlayStyle, number> {
  return {
    aggressive: 0,
    defensive: 0,
    explorer: 0,
    balanced: 0,
    chaotic: 0,
    passive: 0,
  }
}
