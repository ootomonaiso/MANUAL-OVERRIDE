/**
 * genreLabSim.ts
 *
 * genre-lab（開発者用ジャンル設計GUI）のシミュレーション層。
 * ドメインの本物のロジック（computeBayesianPosteriors / sampleCards）を
 * そのまま使い、ゲーム1プレイ分の選択の流れをモンテカルロで再現する。
 * scripts/genre-reach-sim.mjs のブラウザ版。
 */

import type { GenreDef, GenreId, GenreParams, GenreParam, BayesConfig, ManualCard } from '../domain/types'
import { computeBayesianPosteriors, DEFAULT_BAYES_CONFIG } from '../domain/genreResolver'
import { sampleCards } from '../data/cardPool'
import { MAX_ROUNDS, DEFAULT_FALLBACK_GENRE } from '../data/gameBalance'

// useGameState.ts の PARAM_JITTER_RANGE と同値（±20% ブレ）
const PARAM_JITTER_RANGE = 0.4

/** 12軸の一覧。schemas/genre.schema.json の thresholds.properties と同期を保つこと */
export const GENRE_AXES: GenreParam[] = [
  'tempo', 'range', 'enemy', 'combo', 'growth', 'rhythm',
  'stealth', 'vertical', 'aerial', 'survive', 'craft', 'speed',
]

export interface ConvergenceJudgment {
  top: { id: GenreId; prob: number } | null
  second: { id: GenreId; prob: number } | null
  minProbMet: boolean
  dominanceMet: boolean
  converged: GenreId | null
}

/** genreResolver の収束判定と同じ基準で、UI表示用に判定内訳も返す */
export function judgeConvergence(
  posteriors: Record<GenreId, number>,
  genres: GenreDef[],
  config: BayesConfig = DEFAULT_BAYES_CONFIG,
): ConvergenceJudgment {
  const ranked = genres
    .filter(g => g.id !== 'base')
    .map(g => ({ id: g.id, prob: posteriors[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)

  const top = ranked[0] ?? null
  const second = ranked[1] ?? null
  const minProbMet = top !== null && top.prob >= config.minProb
  const dominanceMet = top !== null && (!second || top.prob >= config.dominanceRatio * second.prob)
  return {
    top, second, minProbMet, dominanceMet,
    converged: minProbMet && dominanceMet && top ? top.id : null,
  }
}

/** カード適用による軸加算値を返す（jitter は任意） */
export function cardDelta(card: ManualCard, useJitter: boolean): GenreParams {
  const jitter = useJitter ? 1 + (Math.random() - 0.5) * PARAM_JITTER_RANGE : 1
  const mult = card.paramMultiplier ?? 1
  const delta: GenreParams = {}
  for (const [k, v] of Object.entries(card.genreParams ?? {}) as [GenreParam, number][]) {
    delta[k] = v * jitter * mult
  }
  return delta
}

type Picker = (a: ManualCard, b: ManualCard) => ManualCard

const _randomPicker: Picker = (a, b) => (Math.random() < 0.5 ? a : b)

/** target ジャンルの閾値軸との内積が大きいカードを選ぶプレイヤー */
function _focusedPicker(target: GenreDef): Picker {
  const score = (c: ManualCard) =>
    (Object.entries(c.genreParams ?? {}) as [GenreParam, number][])
      .reduce((s, [k, v]) => s + (k in target.thresholds ? v : 0), 0)
  return (a, b) => {
    const sa = score(a), sb = score(b)
    if (sa === sb) return _randomPicker(a, b)
    return sa > sb ? a : b
  }
}

/** 1プレイをシミュレーションして最終ジャンルを返す（useGameState.choose の流れを再現） */
function _playOnce(genres: GenreDef[], picker: Picker): GenreId {
  const acc: GenreParams = {}
  let exclude = new Set<string>()
  let post: Record<GenreId, number> | undefined

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const pair = sampleCards(2, exclude, post)
    if (pair.length === 0) break
    const card = pair.length === 1 ? pair[0] : picker(pair[0], pair[1])
    exclude = new Set(pair.map(c => c.id))

    for (const [k, v] of Object.entries(cardDelta(card, true)) as [GenreParam, number][]) {
      acc[k] = (acc[k] ?? 0) + v
    }

    post = computeBayesianPosteriors(acc, genres)
    const { converged } = judgeConvergence(post, genres)
    if (converged) return converged === 'base' ? DEFAULT_FALLBACK_GENRE : converged
  }

  const final = judgeConvergence(computeBayesianPosteriors(acc, genres), genres).top?.id ?? DEFAULT_FALLBACK_GENRE
  return final === 'base' ? DEFAULT_FALLBACK_GENRE : final
}

export interface SimResult {
  /** ランダムプレイヤーの最終ジャンル出現率（0〜1） */
  randomDist: Record<GenreId, number>
  /** 狙い撃ちプレイヤーの到達成功率（0〜1） */
  focusedRate: Record<GenreId, number>
}

export function runSimulation(
  genres: GenreDef[],
  randomRuns: number,
  focusRuns: number,
): SimResult {
  const randomDist: Record<GenreId, number> = {}
  for (let i = 0; i < randomRuns; i++) {
    const g = _playOnce(genres, _randomPicker)
    randomDist[g] = (randomDist[g] ?? 0) + 1
  }
  for (const k of Object.keys(randomDist)) randomDist[k] /= randomRuns

  const focusedRate: Record<GenreId, number> = {}
  for (const g of genres.filter(g => g.id !== 'base')) {
    const picker = _focusedPicker(g)
    let hit = 0
    for (let i = 0; i < focusRuns; i++) {
      if (_playOnce(genres, picker) === g.id) hit++
    }
    focusedRate[g.id] = hit / focusRuns
  }
  return { randomDist, focusedRate }
}
