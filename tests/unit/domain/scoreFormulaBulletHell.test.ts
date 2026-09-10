import { describe, it, expect } from 'vitest'
import { evalScoreFormula } from '../../../src/domain/scoreCalc'
import { GENRES } from '../../../src/data/genres'
import type { ScoreVars } from '../../../src/domain/types'

const BULLET_HELL_GENRE = GENRES.find(g => g.id === 'bullet_hell')!
const FORMULA = BULLET_HELL_GENRE.scoreFormula

describe('scoreFormula — bullet_hell', () => {
  it('基本式が正しく評価される', () => {
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 10, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 5, maxHitCombo: 3,
    }
    const result = evalScoreFormula(FORMULA, vars)
    // 10 * 15 + 5 * 25 + 3 * 40 = 150 + 125 + 120 = 395
    expect(result).toBe(395)
  })

  it('survivedSec だけの計算', () => {
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 20, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 0, maxHitCombo: 0,
    }
    expect(evalScoreFormula(FORMULA, vars)).toBe(300) // 20 * 15
  })

  it('hitsOnBoss だけの計算', () => {
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 0, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 10, maxHitCombo: 0,
    }
    expect(evalScoreFormula(FORMULA, vars)).toBe(250) // 10 * 25
  })

  it('maxHitCombo だけの計算', () => {
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 0, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 0, maxHitCombo: 7,
    }
    expect(evalScoreFormula(FORMULA, vars)).toBe(280) // 7 * 40
  })

  it('全変数が0のときは0を返す', () => {
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 0, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 0, maxHitCombo: 0,
    }
    expect(evalScoreFormula(FORMULA, vars)).toBe(0)
  })

  it('未設定変数は 0 扱いになる', () => {
    // ScoreVars の一部変数を0に設定して、他の変数が正しく計算されるか
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 5, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 0, maxHitCombo: 0,
    }
    expect(evalScoreFormula(FORMULA, vars)).toBe(75) // 5 * 15
  })

  it('hitsOnBoss と maxHitCombo が ScoreVars に存在する', () => {
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 0, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 0, maxHitCombo: 0,
    }
    expect(vars.hitsOnBoss).toBe(0)
    expect(vars.maxHitCombo).toBe(0)
  })

  it('複雑な組み合わせも正しく評価される', () => {
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0,
      survivedSec: 30, accuracy: 0, maxCombo: 0, deaths: 0,
      itemsCollected: 0, bossKills: 0, stealthBonus: 0,
      colorTouches: 0, hitsOnBoss: 12, maxHitCombo: 8,
    }
    // 30 * 15 + 12 * 25 + 8 * 40 = 450 + 300 + 320 = 1070
    expect(evalScoreFormula(FORMULA, vars)).toBe(1070)
  })
})
