import type { GenreDef, GenreId, GenreParams, GenreParam, FeatureId, BayesianState, BayesConfig, ManualVersion } from './types'
import { BAYES } from '../data/tunables'

// ─────────────────────────────────────────────────────────────
// ベイズ収束のデフォルト設定 (config/bayes.json からロード)
// ─────────────────────────────────────────────────────────────
export const DEFAULT_BAYES_CONFIG: BayesConfig = {
  convergenceThreshold: BAYES.convergenceThreshold,
  minProb: BAYES.minProb,
  dominanceRatio: BAYES.dominanceRatio,
  decayRate: BAYES.decayRate,
  baseDecay: BAYES.baseDecay,
  candidateThreshold: BAYES.candidateThreshold,
}

// ─────────────────────────────────────────────────────────────
// 選択履歴から genreParams を累積（乗数なしの単純合算）
// 後方互換用に残す
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
// 後方互換用に残す
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
//   - thresholds を「期待パラメータの中心」として解釈
//   - 累積値 accumulated が中心に近ければ尤度高
//   - P(G | E) ∝ likelihood(accumulated | G.thresholds) × prior(G)
//
// 尤度関数:
//   L(G) = exp( -decayRate × Σ|(accumulated[a] ?? 0) - threshold[a]| )
//   ※ thresholds に含まれる軸のみで計算（genre ごとに異なる軸が対象）
// ─────────────────────────────────────────────────────────────
export function computeBayesianPosteriors(
  accumulated: GenreParams,
  genres: GenreDef[],
  config: BayesConfig = DEFAULT_BAYES_CONFIG,
): Record<GenreId, number> {
  const { decayRate } = config
  const genreIds = genres.map(g => g.id)
  const unnormalized: Record<GenreId, number> = {}

  for (const genre of genres) {
    const thresholds = genre.thresholds
    const entries = Object.entries(thresholds) as [GenreParam, number][]

    if (entries.length === 0) {
      // 'base' などの閾値なしジャンルは累積パラメータの総和に応じて尤度が減衰
      // 選択を重ねて累積値が大きくなるほど、base の尤度が低下する
      if (genre.id !== 'base') {
        console.warn(`[BAYES] Genre '${genre.id}' has empty thresholds — treated as base-like. This may cause unexpected convergence behavior.`)
      }
      const totalAccumulated = Object.values(accumulated).reduce((s, v) => s + v, 0)
      unnormalized[genre.id] = Math.exp(-config.baseDecay * totalAccumulated)
      continue
    }

    // 各軸の偏差の合計
    let deviation = 0
    for (const [axis, thresholdVal] of entries) {
      const have = accumulated[axis] ?? 0
      deviation += Math.abs(have - thresholdVal)
    }

    // 指数関数的 decay
    unnormalized[genre.id] = Math.exp(-decayRate * deviation)
  }

  // 正規化（合計 1.0）
  const sum = genreIds.reduce((acc, id) => acc + (unnormalized[id] ?? 0), 0)
  if (sum <= 0) {
    // 安全策: 一様分布にフォールバック
    const uniform = 1 / genreIds.length
    const result: Record<GenreId, number> = {}
    for (const id of genreIds) result[id] = uniform
    return result
  }

  const posteriors: Record<GenreId, number> = {}
  for (const id of genreIds) {
    posteriors[id] = (unnormalized[id] ?? 0) / sum
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

  // 収束チェック: dominance方式
  // 1. base 除く全ジャンルを確率でソート
  const sorted = genres
    .filter(g => g.id !== 'base')
    .map(g => ({ id: g.id, prob: posteriors[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)

  if (sorted.length < 2) {
    // ジャンルが1つしかない場合はそのジャンルに収束
    return {
      posteriors,
      converged: sorted[0].prob >= (config.minProb ?? config.convergenceThreshold),
      convergedGenre: sorted[0].prob >= (config.minProb ?? config.convergenceThreshold) ? sorted[0].id : null,
      updateCount: prevState.updateCount + 1,
    }
  }

  const top = sorted[0]
  const second = sorted[1]
  const dominanceRatio = config.dominanceRatio ?? 1.8
  const minProb = config.minProb ?? config.convergenceThreshold

  // 最尤ジャンルが minProb 以上 かつ 2位以上に対して dominanceRatio 倍以上で優位
  const converged = top.prob >= minProb && top.prob >= dominanceRatio * second.prob
  const convergedGenre: GenreId | null = converged ? top.id : null

  return {
    posteriors,
    converged,
    convergedGenre,
    updateCount: prevState.updateCount + 1,
  }
}

// ─────────────────────────────────────────────────────────────
// 累積パラメータからジャンルを決定する
//
// ベイズ事後確率で収束判定。
// 最高事後確率のジャンルが収束先になる（base は除外）。
// 未収束時は 'base' を返す。
// ─────────────────────────────────────────────────────────────
export function resolveGenre(
  accumulated: GenreParams,
  genres: GenreDef[],
  genrePoints?: Record<string, number>,
  selectedChoiceIds?: string[],
  bayesConfig?: BayesConfig,
): GenreId {
  const config = bayesConfig ?? DEFAULT_BAYES_CONFIG
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)

  // dominance方式で収束チェック
  const sorted = genres
    .filter(g => g.id !== 'base')
    .map(g => ({ id: g.id, prob: posteriors[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)

  if (sorted.length < 2) {
    return sorted[0].prob >= (config.minProb ?? config.convergenceThreshold) ? sorted[0].id : 'base'
  }

  const top = sorted[0]
  const second = sorted[1]
  const dominanceRatio = config.dominanceRatio ?? 1.8
  const minProb = config.minProb ?? config.convergenceThreshold

  if (top.prob >= minProb && top.prob >= dominanceRatio * second.prob) {
    return top.id
  }

  // 未収束 → base
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

  let bestId: GenreId = 'runner'
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
  genrePoints?: Record<string, number>,
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
// 収束済みの全ジャンルを返す（複数条件が同時に満たされる場合用）
// ManualPanel の「あなたはこのゲームを◯◯にもできた」表示に使用
// ベイズ版: 事後確率が 0.1 以上のジャンルを「候補」として返す
// ─────────────────────────────────────────────────────────────
export function resolveAllMetGenres(
  accumulated: GenreParams,
  genres: GenreDef[],
  genrePoints?: Record<string, number>,
  selectedChoiceIds?: string[],
  bayesConfig?: BayesConfig,
): GenreId[] {
  const config = bayesConfig ?? DEFAULT_BAYES_CONFIG
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)

  const result: GenreId[] = []
  for (const genre of genres) {
    if (genre.id === 'base') continue
    if ((posteriors[genre.id] ?? 0) >= config.candidateThreshold) {
      result.push(genre.id)
    }
  }
  return result.sort((a, b) => (posteriors[b] ?? 0) - (posteriors[a] ?? 0))
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

// ─────────────────────────────────────────────────────────────
// プール選択: ベイズ事後確率に基づいて次の説明書エントリーを選択
//
// 各エントリーの genreAffinity と事後確率の内積をスコアリングする。
// minUpdateIndex / maxUpdateIndex でフィルタリング。
// 既に表示済みのキーは除外。
// 条件に合致するエントリーがない場合は null を返す。
// ─────────────────────────────────────────────────────────────
export function selectNextManual(
  deck: Record<string, ManualVersion>,
  posteriors: Record<GenreId, number>,
  updateIndex: number,
  shownKeys: Set<string>,
): string | null {
  const candidates = Object.entries(deck)
    .filter(([key, ver]) => {
      if (!ver.genreAffinity) return false
      if (ver.minUpdateIndex !== undefined && updateIndex < ver.minUpdateIndex) return false
      if (ver.maxUpdateIndex !== undefined && updateIndex > ver.maxUpdateIndex) return false
      if (shownKeys.has(key)) return false
      return true
    })

  if (candidates.length === 0) return null

  let bestKey: string | null = null
  let bestScore = -1

  for (const [key, ver] of candidates) {
    const affinity = ver.genreAffinity!
    let score = 0
    let weightSum = 0
    for (const [genreId, weight] of Object.entries(affinity)) {
      const prob = posteriors[genreId as GenreId] ?? 0
      score += prob * weight
      weightSum += weight
    }
    if (weightSum > 0) {
      score /= weightSum
    }
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  }

  return bestKey
}
