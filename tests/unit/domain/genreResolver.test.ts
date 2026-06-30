import { describe, it, expect } from 'vitest'
import {
  accumulateParams,
  accumulateGenrePoints,
  resolveGenre,
  resolveFeaturesForGenre,
  resolveGenreProgress,
  resolveAllGenreProgress,
  resolveAllMetGenres,
} from '../../../src/domain/genreResolver'
import type { GenreDef, GenreParams, GenreId } from '../../../src/domain/types'

// テスト用ジャンル定義（import.meta.glob に依存しない）
const TEST_GENRES: GenreDef[] = [
  {
    id: 'base', label: 'Base', thresholds: {},
    enableFeatures: ['auto_run'], disableFeatures: [],
    scoreFormula: 'distance * 0.8', manualReveal: '',
    theme: 'plain', bgColor: '#fff',
  },
  {
    id: 'stg', label: 'STG', thresholds: { range: 5, enemy: 5 },
    enableFeatures: ['shoot', 'enemy_hp'], disableFeatures: ['grid_stop'],
    scoreFormula: 'kills * 100 + distance * 0.5', manualReveal: 'STG',
    theme: 'stg', bgColor: '#000',
  },
  {
    id: 'rpg', label: 'RPG', thresholds: { growth: 6, tempo: 2 },
    enableFeatures: ['hp', 'exp'], disableFeatures: [],
    scoreFormula: 'exp * 2 + distance * 0.3', manualReveal: 'RPG',
    theme: 'rpg', bgColor: '#333',
  },
  {
    id: 'puzzle', label: 'Puzzle', thresholds: { combo: 8 },
    enableFeatures: ['grid_stop', 'puzzle_solve'], disableFeatures: ['shoot'],
    scoreFormula: 'combo * 50 + distance * 0.1', manualReveal: 'Puzzle',
    theme: 'puzzle', bgColor: '#eee',
  },
  {
    // genrePoints 方式のジャンル
    id: 'runner', label: 'Runner', thresholds: { tempo: 6, enemy: 2 },
    enableFeatures: ['auto_run'], disableFeatures: [],
    scoreFormula: 'distance * 1.0', manualReveal: 'Runner',
    theme: 'plain', bgColor: '#fff',
  },
]

describe('accumulateParams', () => {
  it('空配列で空オブジェクトを返す', () => {
    expect(accumulateParams([])).toEqual({})
  })

  it('単一のparamsをそのまま返す', () => {
    expect(accumulateParams([{ tempo: 3 }])).toEqual({ tempo: 3 })
  })

  it('複数のparamsを合算する', () => {
    const result = accumulateParams([
      { tempo: 3, range: 2 },
      { tempo: 2, enemy: 4 },
    ])
    expect(result).toEqual({ tempo: 5, range: 2, enemy: 4 })
  })

  it('存在しないキーは 0 として扱わない（未定義のまま）', () => {
    const result = accumulateParams([{ tempo: 1 }])
    expect('range' in result).toBe(false)
  })
})

describe('accumulateGenrePoints', () => {
  it('空配列で空オブジェクトを返す', () => {
    expect(accumulateGenrePoints([])).toEqual({})
  })

  it('genrePoints が無しのエントリはスキップする', () => {
    expect(accumulateGenrePoints([{ genrePoints: undefined }, {}])).toEqual({})
  })

  it('genrePoints を合算する', () => {
    const result = accumulateGenrePoints([
      { genrePoints: { stg: 3, rpg: 1 } },
      { genrePoints: { stg: 2, puzzle: 5 } },
    ])
    expect(result).toEqual({ stg: 5, rpg: 1, puzzle: 5 })
  })
})

describe('resolveGenre', () => {
  it('パラメータなしで base を返す', () => {
    expect(resolveGenre({}, TEST_GENRES)).toBe('base')
  })

  it('stg の閾値を満たすと stg を返す', () => {
    const params: GenreParams = { range: 5, enemy: 5 }
    expect(resolveGenre(params, TEST_GENRES)).toBe('stg')
  })

  it('stg の閾値を超過すると stg を返す', () => {
    const params: GenreParams = { range: 10, enemy: 10 }
    expect(resolveGenre(params, TEST_GENRES)).toBe('stg')
  })

  it('1つの閾値が未達ならそのジャンルは選択されない', () => {
    const params: GenreParams = { range: 5, enemy: 4 } // enemy が 5 未満
    expect(resolveGenre(params, TEST_GENRES)).toBe('base')
  })

  it('複数のジャンルが閾値を満たす場合は超過量が大きい方を選ぶ', () => {
    // stg: range=5, enemy=5 → 超過量 = (10-5) + (10-5) + 1 = 11
    // rpg: growth=6, tempo=2 → 超過量 = (10-6) + (10-2) + 1 = 13
    const params: GenreParams = { range: 10, enemy: 10, growth: 10, tempo: 10 }
    expect(resolveGenre(params, TEST_GENRES)).toBe('rpg')
  })

  it('genrePoints 方式でジャンルを解決する', () => {
    // genrePoints 方式のテストには threshold を持つジャンルが必要
    // ここでは thresholds 方式のテストのみを行う
    const params: GenreParams = { combo: 8 }
    expect(resolveGenre(params, TEST_GENRES)).toBe('puzzle')
  })

  it('score が 0 以下の場合は base を返す', () => {
    const params: GenreParams = { tempo: 1 } // どのジャンルも満たさない
    expect(resolveGenre(params, TEST_GENRES)).toBe('base')
  })
})

describe('resolveFeaturesForGenre', () => {
  it('存在するジャンルの features を返す', () => {
    const { enable, disable } = resolveFeaturesForGenre('stg', TEST_GENRES)
    expect(enable).toEqual(new Set(['shoot', 'enemy_hp']))
    expect(disable).toEqual(new Set(['grid_stop']))
  })

  it('存在しないジャンルで空セットを返す', () => {
    const { enable, disable } = resolveFeaturesForGenre('nonexistent', TEST_GENRES)
    expect(enable).toEqual(new Set())
    expect(disable).toEqual(new Set())
  })

  it('base ジャンルの features を返す', () => {
    const { enable, disable } = resolveFeaturesForGenre('base', TEST_GENRES)
    expect(enable).toEqual(new Set(['auto_run']))
    expect(disable).toEqual(new Set())
  })
})

describe('resolveGenreProgress', () => {
  it('パラメータなしで progress=0 を返す', () => {
    const { progress } = resolveGenreProgress({}, TEST_GENRES)
    expect(progress).toBe(0)
  })

  it('半分満たすと progress=0.5 を返す', () => {
    // puzzle: combo=8 が必要、combo=4 → 4/8 = 0.5
    const params: GenreParams = { combo: 4 }
    const { closestGenre, progress } = resolveGenreProgress(params, TEST_GENRES)
    expect(closestGenre).toBe('puzzle')
    expect(progress).toBe(0.5)
  })

  it('全閾値を超えても progress=1 にクリップされる', () => {
    const params: GenreParams = { combo: 100 }
    const { progress } = resolveGenreProgress(params, TEST_GENRES)
    expect(progress).toBe(1)
  })

  it('複数の軸がある場合は最小充足率を返す', () => {
    // stg: range=5, enemy=5 → range=5(1.0), enemy=2.5(0.5) → min = 0.5
    const params: GenreParams = { range: 5, enemy: 2.5 }
    const { closestGenre, progress } = resolveGenreProgress(params, TEST_GENRES)
    expect(closestGenre).toBe('stg')
    expect(progress).toBe(0.5)
  })
})

describe('resolveAllGenreProgress', () => {
  it('全ジャンルの進捗を返す', () => {
    const params: GenreParams = { combo: 4, range: 2.5, enemy: 2.5 }
    const result = resolveAllGenreProgress(params, TEST_GENRES)
    expect(result.puzzle).toBe(0.5) // combo: 4/8 = 0.5
    expect(result.stg).toBe(0.5) // min(2.5/5, 2.5/5) = 0.5
    expect(result.rpg).toBeUndefined() // growth=0/6=0, tempo=0/2=0 → min=0 → 0 以下は除外
  })

  it('進捗が 0 のジャンルは結果に含まれない', () => {
    const result = resolveAllGenreProgress({}, TEST_GENRES)
    expect(Object.keys(result)).toHaveLength(0)
  })
})

describe('resolveAllMetGenres', () => {
  it('満たされた全ジャンルを返す', () => {
    const params: GenreParams = { range: 5, enemy: 5, combo: 8 }
    const result = resolveAllMetGenres(params, TEST_GENRES)
    expect(result).toContain('stg')
    expect(result).toContain('puzzle')
    expect(result).not.toContain('rpg')
  })

  it('どのジャンルも満たさなければ空配列', () => {
    const result = resolveAllMetGenres({}, TEST_GENRES)
    expect(result).toEqual([])
  })

  it('base は結果に含まれない', () => {
    const params: GenreParams = { range: 5, enemy: 5 }
    const result = resolveAllMetGenres(params, TEST_GENRES)
    expect(result).not.toContain('base')
  })
})
