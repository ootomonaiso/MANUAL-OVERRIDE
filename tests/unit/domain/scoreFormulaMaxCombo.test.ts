import { describe, it, expect } from 'vitest'
import { GENRES } from '../../../src/data/genres'

/**
 * 対象13ジャンルの scoreFormula に独立トークン "combo" が残っていないことを検証する。
 *
 * 対象: stg, aerial_stg, bullet_hell, bullet_runner, arena, tower_def,
 *       platformer, puzzle, racing, rhythm, runner, sports, tetris
 *
 * 変更対象外（確認のみ）:
 *   - hack_slash: 既に maxCombo を使用
 *   - aquatic, base, dungeon, glitch, horror, idle, rpg, stealth_action, survival:
 *     scoreFormula に combo が元々含まれていない
 */

const TARGET_GENRES = [
  'stg', 'aerial_stg', 'bullet_hell', 'bullet_runner', 'arena', 'tower_def',
  'platformer', 'puzzle', 'racing', 'rhythm', 'runner', 'sports', 'tetris',
] as const

/**
 * scoreFormula 内で独立した "combo" トークン（maxCombo の一部ではない）が
 * 存在するか検査する。正規表現 \bcombo\b に相当。
 */
function hasStandaloneCombo(formula: string): boolean {
  // "combo" が単語境界で出現し、"maxCombo" の一部でないことを確認
  const pattern = /(?<!max)combo\b/
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

      // maxCombo が含まれていることを確認
      expect(
        formula.includes('maxCombo'),
        `${genreId} の scoreFormula に "maxCombo" が含まれている`,
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
      'idle', 'rpg', 'stealth_action', 'survival',
    ]
    for (const genreId of noComboGenres) {
      const genre = GENRES.find(g => g.id === genreId)
      expect(genre, `${genreId} が GENRES に存在する`).toBeDefined()
      // これらのジャンルは scoreFormula に combo が元々含まれていない
      expect(hasStandaloneCombo(genre!.scoreFormula)).toBe(false)
    }
  })
})
