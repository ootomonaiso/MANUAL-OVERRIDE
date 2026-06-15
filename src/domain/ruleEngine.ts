import type { ManualVersion, RuntimeRules, GenreParams, GenreParam, FeatureId, GenreId } from './types'
import { accumulateParams, resolveGenre, resolveFeaturesForGenre } from './genreResolver'
import { GENRES } from '../data/genres'
import { BASE_SCROLL_SPEED, TEMPO_SPEED_BONUS } from '../data/gameBalance'
import { DEFAULT_CONTROLS } from './defaults'
export interface ChoiceRecord {
  versionKey: string
  choiceId: string
  genreParams: GenreParams
  /** genreParams への乗数（デフォルト 1.0） */
  paramMultiplier?: number
}

/**
 * 選択履歴と現在のバージョンから RuntimeRules を合成する純粋関数。
 *
 * 適用順序:
 *  1. 蓄積 genreParams → ジャンル解決
 *  2. ジャンルの enable/disableFeatures → features セット
 *  3. ジャンルの scrollDirection / environment → デフォルト
 *  4. currentVersion.runtimeConfig → バージョン固有の上書き（最優先）
 */
export function buildRuntimeRules(
  currentVersion: ManualVersion,
  history: ChoiceRecord[],
  lockedGenre: GenreId | null,
): RuntimeRules {
  // ── 1. ジャンルパラメータ累積（paramMultiplier を考慮） ──────────────
  const allParams = _accumulateWithMultiplier(history)

  // ── 2. ジャンル解決 ──────────────────────────────────────────────────
  const genre = lockedGenre ?? resolveGenre(allParams, GENRES)
  const genreDef = GENRES.find(g => g.id === genre)

  // ── 3. feature セット ────────────────────────────────────────────────
  const { enable, disable } = resolveFeaturesForGenre(genre, GENRES)
  const features = new Set<FeatureId>(enable)
  for (const f of disable) features.delete(f)

  // ── 4. ジャンルデフォルト値 ──────────────────────────────────────────
  const tempo = allParams.tempo ?? 0
  const baseScrollSpeed = BASE_SCROLL_SPEED + tempo * TEMPO_SPEED_BONUS
  const baseBpm         = 120 + tempo * 10
  const baseScrollDir   = genreDef?.scrollDirection ?? 'horizontal'
  const baseEnvironment = genreDef?.environment     ?? 'ground'

  // ── 5. runtimeConfig の上書き適用（最優先） ───────────────────────────
  const rc = currentVersion.runtimeConfig

  const resolvedScrollDir = rc?.scrollDirection ?? baseScrollDir
  const resolvedGenre     = rc?.forceGenreId ?? genre

  // forceGenreId が指定されている場合は features も再合成
  let resolvedFeatures = features
  if (rc?.forceGenreId) {
    const { enable: fe, disable: fd } = resolveFeaturesForGenre(rc.forceGenreId, GENRES)
    resolvedFeatures = new Set<FeatureId>(fe)
    for (const f of fd) resolvedFeatures.delete(f)
  }

  // 基本移動は常時有効（ジャンル・フェーズに関わらず左右移動を保証）
  resolvedFeatures.add('movement')

  return {
    controls:        {...DEFAULT_CONTROLS,...(genreDef?.controls ?? {}),},
    hazardColors:    new Set(currentVersion.hazards.colors),
    safeColors:      new Set(currentVersion.hazards.safeColors),
    features:        resolvedFeatures,
    genre:           resolvedGenre,
    scrollSpeed:     rc?.scrollSpeed     ?? baseScrollSpeed,
    bpm:             rc?.bpm             ?? baseBpm,
    gravity:         rc?.gravity         ?? genreDef?.gravity ?? 1600,  //ハードコードやんけ～吹っ飛ばすぞ
    scrollDirection: resolvedScrollDir,
    environment:     rc?.environment     ?? baseEnvironment,
    playerMaxHp:     rc?.playerMaxHp     ?? 3,
    timescale:       rc?.timescale       ?? 1.0,
    scrollAxis:      resolvedScrollDir === 'vertical' ? 'y' : 'x',
    colorTouchScore: rc?.colorTouchScore ?? 200,
  }
}

/** paramMultiplier を考慮した genreParams 累積 */
function _accumulateWithMultiplier(history: ChoiceRecord[]): GenreParams {
  const total: GenreParams = {}
  for (const record of history) {
    const mult = record.paramMultiplier ?? 1.0
    for (const [key, val] of Object.entries(record.genreParams) as [GenreParam, number][]) {
      total[key] = (total[key] ?? 0) + val * mult
    }
  }
  return total
}

// 現在のバージョンに選択をたどって次バージョンキーを返す
export function nextVersionKey(deck: Record<string, ManualVersion>, currentKey: string, choiceId: string): string | null {
  const version = deck[currentKey]
  if (!version) return null
  const choice = version.choices.find(c => c.id === choiceId)
  return choice?.next ?? null
}

// genreResolver の accumulateParams を後方互換のため再エクスポート
export { accumulateParams }
