// genre-<id>.mjs（到達不可能ジャンル用）共通ヘルパー。
// 説明書デッキ経由でのジャンル収束UIテストが行えない（src/data/manuals/*.json の
// genreParams 配分では genres.json のしきい値に到達しない）ジャンルについて、
// genres.json のジャンル定義そのものの整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// src/domain/types.ts の FeatureId と一致させる（30種）
export const FEATURE_IDS = new Set([
  'shoot', 'three_way', 'charge_shot', 'spread_shot', 'bomb', 'enemy_hp', 'boss',
  'movement', 'auto_run', 'slow_precise', 'double_jump', 'long_air', 'dash',
  'wall_jump', 'slide', 'gravity_flip', 'vertical_scroll',
  'hp', 'exp', 'item_pickup', 'shield',
  'grid_stop', 'puzzle_solve',
  'beat_hazard', 'just_input', 'beat_dash',
  'stealth_mode', 'time_bonus',
  'tower',
  'color_touch',
])

// src/domain/types.ts の ScoreVars と一致させる
export const SCORE_VARS = new Set([
  'distance', 'kills', 'combo', 'exp', 'beatHits', 'survivedSec',
  'accuracy', 'maxCombo', 'deaths', 'itemsCollected', 'bossKills', 'stealthBonus', 'colorTouches',
])

// scoreCalc.ts の SAFE_PATTERN と同一（数値/変数名/四則演算/括弧/空白のみ許可）
const SAFE_PATTERN = /^[\d\s+\-*/().a-z_]+$/i

export function loadGenres() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/config/genres.json'), 'utf-8')).genres
}

/**
 * @param {string} genreId
 * @param {object} [opts]
 * @param {Record<string, number>} [opts.maxAccum] 通常プレイで到達しうる genreParams の最大累積値
 *   （_analyze-genre-paths.mjs での全パス探索結果。未到達の根拠として記録する）
 */
export function verifyGenreDefinition(genreId, opts = {}) {
  const genres = loadGenres()
  const g = genres.find(x => x.id === genreId)
  assert.ok(g, `genres.json に "${genreId}" が見つかりません`)

  // 基本フィールド
  assert.ok(g.label && g.label.length > 0, `${genreId}: label が空です`)
  assert.ok(g.thresholds && typeof g.thresholds === 'object', `${genreId}: thresholds が不正です`)
  assert.ok(Object.keys(g.thresholds).length > 0, `${genreId}: thresholds が空です（baseジャンル以外は1つ以上必要）`)
  assert.ok(Array.isArray(g.enableFeatures) && g.enableFeatures.length > 0, `${genreId}: enableFeatures が空です`)
  assert.ok(typeof g.manualReveal === 'string' && g.manualReveal.length > 0, `${genreId}: manualReveal が空です`)
  assert.ok(typeof g.endingFlavor === 'string' && g.endingFlavor.length > 0, `${genreId}: endingFlavor が空です`)
  assert.ok(typeof g.theme === 'string' && g.theme.length > 0, `${genreId}: theme が空です`)
  assert.ok(typeof g.bgColor === 'string' && /^#[0-9a-f]{6}$/i.test(g.bgColor), `${genreId}: bgColor が不正です (${g.bgColor})`)

  // enableFeatures / disableFeatures が既知の FeatureId であること
  for (const f of g.enableFeatures) {
    assert.ok(FEATURE_IDS.has(f), `${genreId}: enableFeatures に未知の FeatureId "${f}"`)
  }
  for (const f of g.disableFeatures ?? []) {
    assert.ok(FEATURE_IDS.has(f), `${genreId}: disableFeatures に未知の FeatureId "${f}"`)
  }
  // enable/disable が重複していないこと
  for (const f of g.enableFeatures) {
    assert.ok(!(g.disableFeatures ?? []).includes(f), `${genreId}: "${f}" が enableFeatures と disableFeatures の両方に存在します`)
  }

  // scoreFormula: scoreCalc.ts の SAFE_PATTERN を満たし、変数は ScoreVars のみを参照すること
  assert.ok(SAFE_PATTERN.test(g.scoreFormula), `${genreId}: scoreFormula "${g.scoreFormula}" が SAFE_PATTERN に違反しています`)
  const varNames = g.scoreFormula.match(/[a-z_][a-z0-9_]*/gi) ?? []
  for (const v of varNames) {
    assert.ok(SCORE_VARS.has(v), `${genreId}: scoreFormula が未知の変数 "${v}" を参照しています`)
  }

  // 到達可能性の記録（_analyze-genre-paths.mjs の結果に基づくドキュメント目的の出力）
  if (opts.maxAccum) {
    const gaps = Object.entries(g.thresholds)
      .map(([k, req]) => `${k}: ${opts.maxAccum[k] ?? 0}/${req}`)
      .join(', ')
    console.log(`  [既知の課題] 説明書デッキ経由では未到達。最大累積値 vs しきい値 -> ${gaps}`)
  }

  console.log(`✓ ${genreId}: genres.json 定義の静的検証 OK (label="${g.label}", theme=${g.theme})`)
  console.log('PASS')
}
