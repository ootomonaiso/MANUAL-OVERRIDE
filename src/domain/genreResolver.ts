import type { GenreDef, GenreId, GenreParams, GenreParam, FeatureId, BayesianState, BayesConfig } from './types'
import { BAYES } from '../data/tunables'

// ─────────────────────────────────────────────────────────────
// ベイズ収束のデフォルト設定 (config/bayes.json からロード)
// ─────────────────────────────────────────────────────────────
export const DEFAULT_BAYES_CONFIG: BayesConfig = {
  convergenceThreshold: BAYES.convergenceThreshold,
  minProb:              BAYES.minProb,
  dominanceRatio:       BAYES.dominanceRatio,
  decayRate:            BAYES.decayRate,
  baseDecay:            BAYES.baseDecay,
  candidateThreshold:   BAYES.candidateThreshold,
}

// ─────────────────────────────────────────────────────────────
// 選択履歴から genreParams を累積（乗数なしの単純合算・後方互換用）
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
// 選択履歴から genrePoints を累積（後方互換用）
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
// ベイズ更新: 累積パラメータから事後確率を計算
//
// 各ジャンル G に対して:
//   L(G) = exp( -decayRate × Σ max(0, threshold[a] - accumulated[a]) )
//   閾値を超過した軸は deviation=0（ペナルティなし）、不足のみペナルティ。
//   base ジャンルは総累積量に応じて尤度が減衰
// ─────────────────────────────────────────────────────────────
export function computeBayesianPosteriors(
  accumulated: GenreParams,
  genres: GenreDef[],
  config: BayesConfig = DEFAULT_BAYES_CONFIG,
): Record<GenreId, number> {
  const { decayRate } = config
  const unnormalized: Record<GenreId, number> = {}

  for (const genre of genres) {
    const entries = Object.entries(genre.thresholds) as [GenreParam, number][]

    if (entries.length === 0) {
      const totalAccumulated = Object.values(accumulated).reduce((s, v) => s + v, 0)
      unnormalized[genre.id] = Math.exp(-config.baseDecay * totalAccumulated)
      continue
    }

    let deviation = 0
    for (const [axis, thresholdVal] of entries) {
      const have = accumulated[axis] ?? 0
      deviation += Math.max(0, thresholdVal - have)
    }
    unnormalized[genre.id] = Math.exp(-decayRate * deviation)
  }

  const sum = genres.reduce((acc, g) => acc + (unnormalized[g.id] ?? 0), 0)
  if (sum <= 0) {
    const uniform = 1 / genres.length
    const result: Record<GenreId, number> = {}
    for (const g of genres) result[g.id] = uniform
    return result
  }

  const posteriors: Record<GenreId, number> = {}
  for (const g of genres) {
    posteriors[g.id] = (unnormalized[g.id] ?? 0) / sum
  }
  return posteriors
}

// ─────────────────────────────────────────────────────────────
// ベイズ状態を初期化（一様事前分布）
// ─────────────────────────────────────────────────────────────
export function initBayesianState(genres: GenreDef[]): BayesianState {
  const posteriors: Record<GenreId, number> = {}
  const uniform = 1 / genres.length
  for (const genre of genres) {
    posteriors[genre.id] = uniform
  }
  return {
    posteriors,
    converged: false,
    convergedGenre: null,
    updateCount: 0,
  }
}

// ─────────────────────────────────────────────────────────────
// ベイズ更新: 1 回の選択で状態を更新
// ─────────────────────────────────────────────────────────────
export function updateBayesianState(
  prevState: BayesianState,
  accumulated: GenreParams,
  genres: GenreDef[],
  config: BayesConfig = DEFAULT_BAYES_CONFIG,
): BayesianState {
  if (prevState.converged) {
    return { ...prevState }
  }

  const posteriors = computeBayesianPosteriors(accumulated, genres, config)

  const sorted = genres
    .filter(g => g.id !== 'base')
    .map(g => ({ id: g.id, prob: posteriors[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)

  if (sorted.length < 2) {
    const converged = sorted[0].prob >= config.minProb
    return {
      posteriors,
      converged,
      convergedGenre: converged ? sorted[0].id : null,
      updateCount: prevState.updateCount + 1,
    }
  }

  const top    = sorted[0]
  const second = sorted[1]
  const converged = top.prob >= config.minProb && top.prob >= config.dominanceRatio * second.prob

  return {
    posteriors,
    converged,
    convergedGenre: converged ? top.id : null,
    updateCount: prevState.updateCount + 1,
  }
}

// ─────────────────────────────────────────────────────────────
// 累積パラメータからジャンルを決定する（ベイズ事後確率で収束判定）
// ─────────────────────────────────────────────────────────────
export function resolveGenre(
  accumulated: GenreParams,
  genres: GenreDef[],
  _genrePoints?: Record<string, number>,
  _selectedChoiceIds?: string[],
  bayesConfig?: BayesConfig,
): GenreId {
  const config = bayesConfig ?? DEFAULT_BAYES_CONFIG
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)

  const sorted = genres
    .filter(g => g.id !== 'base')
    .map(g => ({ id: g.id, prob: posteriors[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)

  if (sorted.length < 2) {
    return sorted[0].prob >= config.minProb ? sorted[0].id : 'base'
  }

  const top    = sorted[0]
  const second = sorted[1]
  if (top.prob >= config.minProb && top.prob >= config.dominanceRatio * second.prob) {
    return top.id
  }
  return 'base'
}

// ─────────────────────────────────────────────────────────────
// 未収束時に「最も確率の高いジャンル」を返す（強制解決用）
// ─────────────────────────────────────────────────────────────
export function resolveHighestProbGenre(
  accumulated: GenreParams,
  genres: GenreDef[],
  bayesConfig?: BayesConfig,
): GenreId {
  const config = bayesConfig ?? DEFAULT_BAYES_CONFIG
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)

  let bestId: GenreId = genres.find(g => g.id !== 'base')?.id ?? 'base' as GenreId
  let bestProb = 0

  for (const genre of genres) {
    if (genre.id === 'base') continue
    const prob = posteriors[genre.id] ?? 0
    if (prob > bestProb) {
      bestProb = prob
      bestId = genre.id
    }
  }
  return bestId
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
// ベイズ事後確率の最高値を progress として返す
// ─────────────────────────────────────────────────────────────
export function resolveGenreProgress(
  accumulated: GenreParams,
  genres: GenreDef[],
  _genrePoints?: Record<string, number>,
  bayesConfig?: BayesConfig,
): { closestGenre: GenreId; progress: number } {
  const config = bayesConfig ?? DEFAULT_BAYES_CONFIG
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)

  let bestGenre: GenreId = 'base'
  let bestProb = 0

  for (const genre of genres) {
    if (genre.id === 'base') continue
    const prob = posteriors[genre.id] ?? 0
    if (prob > bestProb) {
      bestProb = prob
      bestGenre = genre.id
    }
  }
  return { closestGenre: bestGenre, progress: bestProb }
}

// ─────────────────────────────────────────────────────────────
// 全ジャンルの収束進捗を 0〜1 のマップで返す（カードプール重みかけ用）
// ベイズ事後確率をそのまま返す
// ─────────────────────────────────────────────────────────────
export function resolveAllGenreProgress(
  accumulated: GenreParams,
  genres: GenreDef[],
  _genrePoints?: Record<string, number>,
  bayesConfig?: BayesConfig,
): Record<string, number> {
  const posteriors = computeBayesianPosteriors(accumulated, genres, bayesConfig)
  const result: Record<string, number> = {}
  for (const genre of genres) {
    if (genre.id === 'base') continue
    result[genre.id] = posteriors[genre.id] ?? 0
  }
  return result
}

// ─────────────────────────────────────────────────────────────
// 収束済みの全ジャンルを返す
// ManualPanel の「あなたはこのゲームを◯◯にもできた」表示に使用
// ベイズ版: 事後確率が candidateThreshold 以上のジャンルを返す
// ─────────────────────────────────────────────────────────────
export function resolveAllMetGenres(
  accumulated: GenreParams,
  genres: GenreDef[],
  _genrePoints?: Record<string, number>,
  _selectedChoiceIds?: string[],
  bayesConfig?: BayesConfig,
): GenreId[] {
  const config = bayesConfig ?? DEFAULT_BAYES_CONFIG
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)

  return genres
    .filter(g => g.id !== 'base' && (posteriors[g.id] ?? 0) >= config.candidateThreshold)
    .sort((a, b) => (posteriors[b.id] ?? 0) - (posteriors[a.id] ?? 0))
    .map(g => g.id)
}

// ─────────────────────────────────────────────────────────────
// 現在の事後確率分布を返す（デバッグ・UI 表示用）
// ─────────────────────────────────────────────────────────────
export function getGenreDistribution(
  accumulated: GenreParams,
  genres: GenreDef[],
  bayesConfig?: BayesConfig,
): Record<GenreId, number> {
  return computeBayesianPosteriors(accumulated, genres, bayesConfig)
}
