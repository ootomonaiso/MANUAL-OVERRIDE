import type { ManualVersion, RuntimeRules, GenreParams, GenreParam, GenreId } from './types'
import { resolveGenre, resolveFeatureSet } from './genreResolver'
import { GENRES } from '../data/genres'
import { BASE_SCROLL_SPEED, TEMPO_SPEED_BONUS, RULE_DEFAULTS } from '../data/gameBalance'
import { DEFAULT_CONTROLS } from './defaults'

const DEFAULT_TIMESCALE = 1.0

export interface ChoiceRecord {
  choiceId: string
  genreParams: GenreParams
  /** genreParams への乗数（デフォルト 1.0） */
  paramMultiplier?: number
}

/**
 * 選択履歴と現在のバージョンから RuntimeRules を合成する純粋関数。
 *
 * ジャンルの優先順位: runtimeConfig.forceGenreId > lockedGenre > ベイズ解決。
 * ジャンル定義がデフォルト値（features / controls / gravity / scrollDirection /
 * environment）を与え、currentVersion.runtimeConfig が個別に上書きする（最優先）。
 */
export function buildRuntimeRules(
  currentVersion: ManualVersion,
  history: ChoiceRecord[],
  lockedGenre: GenreId | null,
): RuntimeRules {
  const allParams = accumulateWithMultiplier(history)
  const rc = currentVersion.runtimeConfig

  const genre = rc?.forceGenreId ?? lockedGenre ?? resolveGenre(allParams, GENRES)
  const genreDef = GENRES.find(g => g.id === genre)

  const features = resolveFeatureSet(genre, GENRES)
  // 基本移動は常時有効（ジャンル・フェーズに関わらず左右移動を保証）
  features.add('movement')

  const tempo = allParams.tempo ?? 0
  const scrollDirection = rc?.scrollDirection ?? genreDef?.scrollDirection ?? 'horizontal'

  return {
    controls:        { ...DEFAULT_CONTROLS, ...(genreDef?.controls ?? {}) },
    hazardColors:    new Set(currentVersion.hazards.colors),
    safeColors:      new Set(currentVersion.hazards.safeColors),
    features,
    genre,
    scrollSpeed:     rc?.scrollSpeed     ?? BASE_SCROLL_SPEED + tempo * TEMPO_SPEED_BONUS,
    bpm:             rc?.bpm             ?? RULE_DEFAULTS.bpm + tempo * RULE_DEFAULTS.bpmTempoBonus,
    gravity:         rc?.gravity         ?? genreDef?.gravity ?? RULE_DEFAULTS.gravity,
    scrollDirection,
    environment:     rc?.environment     ?? genreDef?.environment ?? 'ground',
    playerMaxHp:     rc?.playerMaxHp     ?? RULE_DEFAULTS.playerMaxHp,
    timescale:       rc?.timescale       ?? DEFAULT_TIMESCALE,
    scrollAxis:      scrollDirection === 'vertical' ? 'y' : 'x',
    colorTouchScore: rc?.colorTouchScore ?? RULE_DEFAULTS.colorTouchScore,
  }
}

/** paramMultiplier を考慮した genreParams 累積 */
export function accumulateWithMultiplier(history: ChoiceRecord[]): GenreParams {
  const total: GenreParams = {}
  for (const record of history) {
    const mult = record.paramMultiplier ?? 1.0
    for (const [key, val] of Object.entries(record.genreParams) as [GenreParam, number][]) {
      total[key] = (total[key] ?? 0) + val * mult
    }
  }
  return total
}
