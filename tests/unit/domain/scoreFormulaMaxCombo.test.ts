import { describe, it, expect } from 'vitest'
import { GENRES } from '../../../src/data/genres'

/**
 * 対象12ジャンルの scoreFormula に独立トークン "combo" が残っていないことを検証する。
 *
 * 対象: stg, aerial_stg, bullet_hell, bullet_runner, arena, tower_def,
 *       puzzle, racing, rhythm, runner, sports, tetris
 *
 * 変更対象外（確認のみ）:
 *   - hack_slash: 既に maxCombo を使用
 *   - aquatic, base, dungeon, glitch, horror, idle, platformer, rpg, stealth_action, survival:
 *     scoreFormula に combo が元々含まれていない
 *     （platformer は縦登りクライミングへの再設計により near_miss_combo を廃止）
 */

const TARGET_GENRES = [
  'stg', 'aerial_stg', 'bullet_hell', 'bullet_runner', 'arena', 'tower_def',
  'puzzle', 'racing', 'rhythm', 'runner', 'sports', 'tetris',
] as const

/**
 * scoreFormula 内で独立した "combo" トークン（maxCombo / maxHitCombo の一部
 * ではない）が存在するか検査する。
 */
function hasStandaloneCombo(formula: string): boolean {
  // "combo" が単語境界で出現し、"maxCombo" / "maxHitCombo" の一部でないことを確認
  const pattern = /(?<!maxHit)(?<!max)combo\b/
  return pattern.test(formula)
}

describe('genre scoreFormula — combo → maxCombo 置換検証 (#215)', () => {
  it('対象13ジャンルの scoreFormula に独立トークン "combo" が残っていない', () => {
    for (const genreId of TARGET_GENRES) {
      const genre = GENRES.find(g => g.id === genreId)
      expect(genre, `${genreId} が GENRES に存在する`).toBeDefined()

      const formula = genre!.scoreFormula
      expect(
        hasStandaloneCombo(formula),
        `${genreId} の scoreFormula "${formula}" に独立した "combo" が残っている`,
      ).toBe(false)

      // maxCombo / maxHitCombo が含まれていることを確認
      expect(
        formula.includes('maxCombo') || formula.includes('maxHitCombo'),
        `${genreId} の scoreFormula に "maxCombo" または "maxHitCombo" が含まれている`,
      ).toBe(true)
    }
  })

  it('hack_slash は変更対象外（既に maxCombo を使用）', () => {
    const hackSlash = GENRES.find(g => g.id === 'hack_slash')
    expect(hackSlash).toBeDefined()
    expect(hackSlash!.scoreFormula).toContain('maxCombo')
    expect(hasStandaloneCombo(hackSlash!.scoreFormula)).toBe(false)
  })

  it('combo を含まないジャンルの scoreFormula は変更されていない', () => {
    const noComboGenres = [
      'aquatic', 'base', 'dungeon', 'glitch', 'horror',
      'idle', 'platformer', 'rpg', 'stealth_action', 'survival',
    ]
    for (const genreId of noComboGenres) {
      const genre = GENRES.find(g => g.id === genreId)
      expect(genre, `${genreId} が GENRES に存在する`).toBeDefined()
      // これらのジャンルは scoreFormula に combo が元々含まれていない
      expect(hasStandaloneCombo(genre!.scoreFormula)).toBe(false)
    }
  })
})
