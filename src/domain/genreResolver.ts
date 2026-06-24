import type { GenreDef, GenreId, GenreParams, GenreParam, FeatureId } from './types'

// ─────────────────────────────────────────────────────────────
// 選択履歴から genreParams を累積（乗数なしの単純合算）
// ─────────────────────────────────────────────────────────────
export function accumulateParams(paramsList: GenreParams[]): GenreParams {
  const total: GenreParams = {}
  for (const params of paramsList) {
    for (const [key, val] of Object.entries(params) as [GenreParam, number][]) {
      total[key] = (total[key] ?? 0) + val
    }
  }
  return total
}

// ─────────────────────────────────────────────────────────────
// 選択履歴から genrePoints を累積（新システム用）
// ─────────────────────────────────────────────────────────────
export function accumulateGenrePoints(
  entries: { genrePoints?: Record<string, number> }[]
): Record<string, number> {
  const total: Record<string, number> = {}
  for (const entry of entries) {
    if (!entry.genrePoints) continue
    for (const [genre, pts] of Object.entries(entry.genrePoints)) {
      total[genre] = (total[genre] ?? 0) + pts
    }
  }
  return total
}

// ─────────────────────────────────────────────────────────────
// 累積パラメータからジャンルを決定する
//
// ジャンルの評価方式:
//   - `threshold` が定義されている → genrePoints ベース（新システム）
//   - `threshold` が未定義 → thresholds 軸ベース（旧システム・後方互換）
//
// どちらも「スコアが最大かつ正」のジャンルが収束先になる。
// ─────────────────────────────────────────────────────────────
export function resolveGenre(
  accumulated: GenreParams,
  genres: GenreDef[],
  genrePoints?: Record<string, number>,
  selectedChoiceIds?: string[],
): GenreId {
  let bestGenre: GenreId = 'base'
  let bestScore = -1

  for (const genre of genres) {
    if (genre.id === 'base') continue
    const score = genre.threshold !== undefined
      ? _computePointsScore(genre, genrePoints ?? {}, selectedChoiceIds ?? [])
      : _computeOverflowScore(accumulated, genre.thresholds)
    if (score > bestScore) {
      bestScore = score
      bestGenre = genre.id
    }
  }

  // score が 0 以下なら閾値未達 → base のまま
  return bestScore > 0 ? bestGenre : 'base'
}

/**
 * genrePoints ベースのスコアを計算する（新システム）。
 * 蓄積ポイントが threshold 以上 かつ requiredChoices を全て選択済みなら正スコアを返す。
 */
function _computePointsScore(
  genre: GenreDef,
  points: Record<string, number>,
  selectedIds: string[],
): number {
  const pts = points[genre.id] ?? 0
  if (pts < (genre.threshold ?? 0)) return -1

  if (genre.requiredChoices && genre.requiredChoices.length > 0) {
    for (const req of genre.requiredChoices) {
      if (!selectedIds.includes(req)) return -1
    }
  }

  // threshold を超えた分を正規化スコアとして返す（多く選んだほど優先）
  return pts - (genre.threshold ?? 0) + 1
}

/**
 * ジャンルの閾値に対する超過量の合計を計算する。
 * 全閾値を満たしていれば正の値、1つでも満たさなければ -1 を返す。
 */
function _computeOverflowScore(accumulated: GenreParams, thresholds: GenreParams): number {
  let score = 0

  for (const [key, required] of Object.entries(thresholds) as [GenreParam, number][]) {
    const have = accumulated[key] ?? 0
    if (have < required) return -1  // 閾値未達
    score += have - required        // 超過量を加算
  }

  // +1 で「全閾値クリア」自体を正スコアとして保証（超過量 0 でも選択される）
  return score + 1
}

// ─────────────────────────────────────────────────────────────
// ジャンルの enable/disable を合成して feature セットを返す
// ─────────────────────────────────────────────────────────────
export function resolveFeaturesForGenre(
  genreId: GenreId,
  genres: GenreDef[],
): { enable: Set<FeatureId>; disable: Set<FeatureId> } {
  const genre = genres.find(g => g.id === genreId)
  if (!genre) return { enable: new Set(), disable: new Set() }
  return {
    enable:  new Set(genre.enableFeatures),
    disable: new Set(genre.disableFeatures),
  }
}

// ─────────────────────────────────────────────────────────────
// ジャンル収束の「近さ」を 0〜1 で返す（UI 演出に使用）
// ─────────────────────────────────────────────────────────────
export function resolveGenreProgress(
  accumulated: GenreParams,
  genres: GenreDef[],
  genrePoints?: Record<string, number>,
): { closestGenre: GenreId; progress: number } {
  let bestGenre: GenreId = 'base'
  let bestProgress = 0

  for (const genre of genres) {
    if (genre.id === 'base') continue
    let progress: number
    if (genre.threshold !== undefined) {
      const pts = (genrePoints ?? {})[genre.id] ?? 0
      progress = Math.min(1, pts / genre.threshold)
    } else {
      progress = _computeMinFulfillment(accumulated, genre.thresholds)
    }
    if (progress > bestProgress) {
      bestProgress = progress
      bestGenre = genre.id
    }
  }

  return { closestGenre: bestGenre, progress: bestProgress }
}

/**
 * 閾値の充足率（0〜1）の最小値を返す。
 * 例: thresholds = { tempo: 5, enemy: 4 }, accumulated = { tempo: 3, enemy: 6 }
 *   → min(3/5, 6/4) = min(0.6, 1.0) = 0.6
 */
function _computeMinFulfillment(accumulated: GenreParams, thresholds: GenreParams): number {
  const entries = Object.entries(thresholds) as [GenreParam, number][]
  if (entries.length === 0) return 0

  let minRate = Infinity
  for (const [key, required] of entries) {
    const have = accumulated[key] ?? 0
    minRate = Math.min(minRate, required > 0 ? have / required : 1)
  }

  return Math.min(1, minRate === Infinity ? 0 : minRate)
}

// ─────────────────────────────────────────────────────────────
// 全ジャンルの収束進捗を 0〜1 のマップで返す（カードプール重みかけ用）
// ─────────────────────────────────────────────────────────────
export function resolveAllGenreProgress(
  accumulated: GenreParams,
  genres: GenreDef[],
  genrePoints?: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const genre of genres) {
    if (genre.id === 'base') continue
    let progress: number
    if (genre.threshold !== undefined) {
      const pts = (genrePoints ?? {})[genre.id] ?? 0
      progress = Math.min(1, pts / genre.threshold)
    } else {
      progress = _computeMinFulfillment(accumulated, genre.thresholds)
    }
    if (progress > 0) result[genre.id] = progress
  }
  return result
}

// ─────────────────────────────────────────────────────────────
// 収束済みの全ジャンルを返す（複数条件が同時に満たされる場合用）
// ManualPanel の「あなたはこのゲームを◯◯にもできた」表示に使用
// ─────────────────────────────────────────────────────────────
export function resolveAllMetGenres(
  accumulated: GenreParams,
  genres: GenreDef[],
  genrePoints?: Record<string, number>,
  selectedChoiceIds?: string[],
): GenreId[] {
  const result: GenreId[] = []
  for (const genre of genres) {
    if (genre.id === 'base') continue
    const score = genre.threshold !== undefined
      ? _computePointsScore(genre, genrePoints ?? {}, selectedChoiceIds ?? [])
      : _computeOverflowScore(accumulated, genre.thresholds)
    if (score > 0) result.push(genre.id)
  }
  return result
}
