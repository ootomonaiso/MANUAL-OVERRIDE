import { describe, it, expect } from 'vitest'
import { evalScoreFormula, getLastFormulaError } from '../../../src/domain/scoreCalc'
import type { ScoreVars, ThrowResult, FinalScore } from '../../../src/domain/types'

// テスト用スコア変数
const makeVars = (overrides?: Partial<ScoreVars>): ScoreVars => ({
  distance: 1000,
  kills: 10,
  combo: 5,
  exp: 500,
  beatHits: 20,
  survivedSec: 60,
  accuracy: 0.8,
  maxCombo: 10,
  deaths: 0,
  itemsCollected: 5,
  bossKills: 2,
  stealthBonus: 100,
  colorTouches: 3,
  ...overrides,
})

describe('evalScoreFormula', () => {
  it('単純な乗算式を評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('distance * 0.5', vars)).toBe(500)
  })

  it('加算と乗算の組み合わせを評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('distance * 0.5 + kills * 100', vars)).toBe(1500)
  })

  it('複数の変数を使用する式を評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('kills * 120 + distance * 0.5 + combo * 80', vars)).toBe(2100) // 1200 + 500 + 400
  })

  it('括弧付きの式を評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('(kills + combo) * 100', vars)).toBe(1500)
  })

  it('除算を評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('distance / 2', vars)).toBe(500)
  })

  it('0 除算は 0 を返す', () => {
    const vars = makeVars({ deaths: 0 })
    expect(evalScoreFormula('kills / deaths', vars)).toBe(0)
  })

  it('負の値を評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('-distance', vars)).toBe(-1000)
  })

  it('未定義の変数は 0 として扱う', () => {
    const vars = makeVars()
    // unknownVar は ScoreVars に存在しない
    expect(evalScoreFormula('distance + unknownVar', vars)).toBe(1000)
  })

  it('不正な式（関数呼び出し）はデフォルト式で代替する', () => {
    const vars = makeVars()
    const result = evalScoreFormula('Math.max(distance, 0)', vars)
    // SAFE_PATTERN に Math. が含まれるためデフォルト式にフォールバック
    expect(result).toBe(1500) // distance * 0.5 + kills * 100 = 500 + 1000
    expect(getLastFormulaError()).toContain('不正なスコア式')
  })

  it('空文字列はデフォルト式にフォールバックする', () => {
    // SAFE_PATTERN は + (1文字以上) を要求するため、空文字列はパターンマッチに失敗
    // → デフォルト式 'distance * 0.5 + kills * 100' にフォールバック
    expect(evalScoreFormula('', makeVars())).toBe(1500) // 500 + 1000
  })

  it('数値リテラルのみで構成される式を評価する', () => {
    expect(evalScoreFormula('42', makeVars())).toBe(42)
  })

  it('複雑な括弧ネストを評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('((kills * 2) + distance) / 2', vars)).toBe(510)
  })

  it('最後のエラーメッセージは取得後にリセットされる', () => {
    evalScoreFormula('eval(1)', makeVars())
    expect(getLastFormulaError()).not.toBeNull()
    expect(getLastFormulaError()).toBeNull() // 2 回目は null
  })
})

describe('evalScoreFormula - 演算子の優先順位', () => {
  it('乗算が加算より優先される', () => {
    const vars = makeVars()
    // distance * 0.5 + kills = 500 + 10 = 510
    expect(evalScoreFormula('distance * 0.5 + kills', vars)).toBe(510)
  })

  it('減算を正しく評価する', () => {
    const vars = makeVars()
    expect(evalScoreFormula('distance - kills', vars)).toBe(990)
  })

  it('複合演算を正しく評価する', () => {
    const vars = makeVars()
    // distance * 0.5 - kills * 10 + combo * 20 = 500 - 100 + 100 = 500
    expect(evalScoreFormula('distance * 0.5 - kills * 10 + combo * 20', vars)).toBe(500)
  })
})

describe('evalScoreFormula - 境界値', () => {
  it('非常に大きな数値を扱える', () => {
    const vars = makeVars({ distance: 1_000_000, kills: 100_000 })
    expect(evalScoreFormula('distance * 0.5 + kills * 100', vars)).toBe(10_500_000)
  })

  it('小数点を含む数値を扱える', () => {
    const vars = makeVars()
    expect(evalScoreFormula('distance * 0.125', vars)).toBe(125)
  })
})
