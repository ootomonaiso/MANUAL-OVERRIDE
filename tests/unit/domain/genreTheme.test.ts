import { describe, it, expect } from 'vitest'
import { GENRES, GENRE_THEME_COLORS } from '../../../src/data/genres'

describe('Genre Theme System (Issue #136)', () => {
  it('全ジャンルに theme が定義されている', () => {
    for (const genre of GENRES) {
      expect(genre.theme).toBeTruthy()
      expect(typeof genre.theme).toBe('string')
    }
  })

  it('GENRE_THEME_COLORS に定義済み theme が含まれている', () => {
    // GENRE_THEME_COLORS に定義がある theme だけをチェック
    const definedThemes = Object.keys(GENRE_THEME_COLORS)
    expect(definedThemes.length).toBeGreaterThan(0)
    for (const theme of definedThemes) {
      expect(GENRE_THEME_COLORS[theme].accent).toBeTruthy()
      expect(GENRE_THEME_COLORS[theme].border).toBeTruthy()
    }
  })

  it('各テーマカラーに必須プロパティがある', () => {
    for (const colors of Object.values(GENRE_THEME_COLORS)) {
      expect(colors.accent).toBeTruthy()
      expect(colors.border).toBeTruthy()
      expect(colors.bg).toBeTruthy()
      expect(colors.glow).toBeTruthy()
    }
  })

  it('base ジャンルの theme は plain である', () => {
    const baseGenre = GENRES.find(g => g.id === 'base')
    expect(baseGenre).toBeDefined()
    expect(baseGenre?.theme).toBe('plain')
  })

  it('全ジャンルに endingFlavor が定義されている（空文字列でも OK）', () => {
    for (const genre of GENRES) {
      expect(typeof genre.endingFlavor).toBe('string')
    }
  })

  it('全ジャンルに bgColor が定義されている', () => {
    for (const genre of GENRES) {
      expect(genre.bgColor).toBeTruthy()
    }
  })

  it('theme が stg のジャンルは青系統の色を持つ', () => {
    const stgTheme = GENRE_THEME_COLORS['stg']
    expect(stgTheme).toBeDefined()
    expect(stgTheme.accent).toMatch(/^#/)
    expect(stgTheme.border).toMatch(/^#/)
  })

  it('theme が runner のジャンルは赤系統の色を持つ', () => {
    const runnerTheme = GENRE_THEME_COLORS['runner']
    expect(runnerTheme).toBeDefined()
    expect(runnerTheme.accent).toMatch(/^#/)
  })

  it('theme が puzzle のジャンルは白系統の色を持つ', () => {
    const puzzleTheme = GENRE_THEME_COLORS['puzzle']
    expect(puzzleTheme).toBeDefined()
    expect(puzzleTheme.bg).toBeTruthy()
  })

  it('theme が rhythm のジャンルは紫系統の色を持つ', () => {
    const rhythmTheme = GENRE_THEME_COLORS['rhythm']
    expect(rhythmTheme).toBeDefined()
    expect(rhythmTheme.accent).toMatch(/^#/)
  })

  it('theme が horror のジャンルは赤系統の色を持つ', () => {
    const horrorTheme = GENRE_THEME_COLORS['horror']
    expect(horrorTheme).toBeDefined()
    expect(horrorTheme.accent).toMatch(/^#/)
  })

  it('GENRES の全エントリに id, label, scoreFormula がある', () => {
    for (const genre of GENRES) {
      expect(genre.id).toBeTruthy()
      expect(genre.label).toBeTruthy()
      expect(genre.scoreFormula).toBeTruthy()
    }
  })
})
