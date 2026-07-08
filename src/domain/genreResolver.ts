import type { GenreDef, GenreId, GenreParams, GenreParam, FeatureId, BayesianState, BayesConfig } from './types'
import { BAYES } from '../data/tunables'

// ─────────────────────────────────────────────────────────────
// ベイズ収束のデフォルト設定 (config/bayes.json からロード)
// ─────────────────────────────────────────────────────────────
export const DEFAULT_BAYES_CONFIG: BayesConfig = {
  minProb:        BAYES.minProb,
  dominanceRatio: BAYES.dominanceRatio,
  decayRate:      BAYES.decayRate,
  baseDecay:      BAYES.baseDecay,
}

// ─────────────────────────────────────────────────────────────
// 通常のベイズ収束で成立しうるジャンルか。
// base は横スクロールの「原点」なので尤度計算には残す（累積が増えると減衰し、
// 実ジャンルへ道を譲る）が、ランキング＝収束候補からは除外する。
// resolvable:false のジャンル（glitch 等）は矛盾トリガーで forcedGenre として
// 明示指定されたときだけ成立する特殊ジャンルなので、尤度計算にもランキングにも
// 一切含めない（含めると空 thresholds ゆえ序盤の尤度が ≈1 になり、実ジャンルの
// 事後確率を吸い取って一生収束しなくなる）。
// ─────────────────────────────────────────────────────────────
function isConvergenceCandidate(genre: GenreDef): boolean {
  return genre.id !== 'base' && genre.resolvable !== false
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
    // 特殊ジャンル(glitch 等)は尤度計算から除外（正規化の分母にも入れない）
    if (genre.resolvable === false) continue

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
// base 以外のジャンルを事後確率の降順に並べる
// ─────────────────────────────────────────────────────────────
function _rankGenres(
  posteriors: Record<GenreId, number>,
  genres: GenreDef[],
): { id: GenreId; prob: number }[] {
  return genres
    .filter(isConvergenceCandidate)
    .map(g => ({ id: g.id, prob: posteriors[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)
}

// ─────────────────────────────────────────────────────────────
// 収束判定: 最尤ジャンルが minProb 以上、かつ2位を dominanceRatio 倍
// 以上引き離していれば、そのジャンルIDを返す。未収束なら null
// ─────────────────────────────────────────────────────────────
function _judgeConvergence(
  ranked: { id: GenreId; prob: number }[],
  config: BayesConfig,
): GenreId | null {
  const top = ranked[0]
  if (!top || top.prob < config.minProb) return null
  const second = ranked[1]
  if (second && top.prob < config.dominanceRatio * second.prob) return null
  return top.id
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
// ベイズ更新: 1 回の選択で状態を更新（収束後は状態を凍結）
// ─────────────────────────────────────────────────────────────
export function updateBayesianState(
  prevState: BayesianState,
  accumulated: GenreParams,
  genres: GenreDef[],
  config: BayesConfig = DEFAULT_BAYES_CONFIG,
): BayesianState {
  if (prevState.converged) return prevState

  const posteriors = computeBayesianPosteriors(accumulated, genres, config)
  const convergedGenre = _judgeConvergence(_rankGenres(posteriors, genres), config)

  return {
    posteriors,
    converged: convergedGenre !== null,
    convergedGenre,
    updateCount: prevState.updateCount + 1,
  }
}

// ─────────────────────────────────────────────────────────────
// 累積パラメータからジャンルを決定（未収束なら 'base'）
// ─────────────────────────────────────────────────────────────
export function resolveGenre(
  accumulated: GenreParams,
  genres: GenreDef[],
  config: BayesConfig = DEFAULT_BAYES_CONFIG,
): GenreId {
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)
  return _judgeConvergence(_rankGenres(posteriors, genres), config) ?? 'base'
}

// ─────────────────────────────────────────────────────────────
// 未収束時に「最も確率の高いジャンル」を返す（MAX_ROUNDS 到達時の強制解決用）
// ─────────────────────────────────────────────────────────────
export function resolveHighestProbGenre(
  accumulated: GenreParams,
  genres: GenreDef[],
  config: BayesConfig = DEFAULT_BAYES_CONFIG,
): GenreId {
  const posteriors = computeBayesianPosteriors(accumulated, genres, config)
  return _rankGenres(posteriors, genres)[0]?.id ?? 'base'
}

// ─────────────────────────────────────────────────────────────
// ジャンルの有効 feature セット（enableFeatures − disableFeatures）
// ─────────────────────────────────────────────────────────────
export function resolveFeatureSet(genreId: GenreId, genres: GenreDef[]): Set<FeatureId> {
  const genre = genres.find(g => g.id === genreId)
  if (!genre) return new Set()
  const features = new Set<FeatureId>(genre.enableFeatures)
  for (const f of genre.disableFeatures) features.delete(f)
  return features
}
