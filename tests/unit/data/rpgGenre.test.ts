import { describe, it, expect } from 'vitest'
import rpgJson from '../../../src/data/genres/rpg.json'
import dungeonJson from '../../../src/data/genres/dungeon.json'
import { GENRES } from '../../../src/data/genres'
import { evalScoreFormula, getLastFormulaError } from '../../../src/domain/scoreCalc'
import type { ScoreVars } from '../../../src/domain/types'
import type { ScoreVarsBattle } from '../../../src/domain/battle/types'

const BATTLE_VAR_KEYS: ReadonlyArray<keyof ScoreVarsBattle> = [
  'battlesWon', 'bossDefeated', 'maxSkillLevel', 'traitsAcquired',
]

function zeroVars(over: Partial<ScoreVars> = {}): ScoreVars {
  return {
    distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0, survivedSec: 0,
    accuracy: 0, maxCombo: 0, deaths: 0, itemsCollected: 0,
    bossKills: 0, stealthBonus: 0, colorTouches: 0,
    ...over,
  } as ScoreVars
}

describe('rpg ジャンル定義: 戦闘システムへの置き換え', () => {
  it('Canvas 側の Feature は hp だけになっている', () => {
    // rpg は Canvas を止めてメニューUIの戦闘へ置き換わる（docs/genre/rpg/01-architecture.md）
    expect(rpgJson.enableFeatures).toEqual(['hp'])
  })

  it('見た目・操作・テーマは従来のまま保たれている', () => {
    expect(rpgJson.theme).toBe('rpg')
    expect(rpgJson.environment).toBe('dungeon')
    expect(rpgJson.bgColor).toBeTruthy()
    expect(rpgJson.controls.jump).toBeTruthy()
    expect(rpgJson.endingFlavor).toBeTruthy()
    expect(rpgJson.manualReveal).toBeTruthy()
  })

  it('収束の閾値は成長軸のまま（到達性を変えていない）', () => {
    expect(rpgJson.thresholds).toEqual({ growth: 8 })
  })

  it('ローダ経由でも同じ定義が読める', () => {
    const loaded = GENRES.find(g => g.id === 'rpg')
    expect(loaded).toBeDefined()
    expect(loaded?.scoreFormula).toBe(rpgJson.scoreFormula)
    expect(loaded?.enableFeatures).toEqual(rpgJson.enableFeatures)
  })
})

describe('rpg ジャンル定義: スコア式', () => {
  const formula = rpgJson.scoreFormula

  it('スコア式は戦闘結果の変数だけで構成されている', () => {
    const names = [...new Set(formula.match(/[a-z_][a-z0-9_]*/gi) ?? [])]
    expect(names.sort()).toEqual([...BATTLE_VAR_KEYS].sort())
  })

  it('パーサの安全パターンを通り、フォールバックに落ちない', () => {
    getLastFormulaError()   // 直前の状態をクリアしてから評価する
    evalScoreFormula(formula, zeroVars())
    expect(getLastFormulaError()).toBeNull()
  })

  it('何も達成していなければ 0 点', () => {
    expect(evalScoreFormula(formula, zeroVars())).toBe(0)
  })

  it('各変数が単調にスコアを増やす', () => {
    const base = evalScoreFormula(formula, zeroVars())
    for (const key of BATTLE_VAR_KEYS) {
      const withOne = evalScoreFormula(formula, zeroVars({ [key]: 1 } as Partial<ScoreVars>))
      expect(withOne, key).toBeGreaterThan(base)
    }
  })

  it('ボス撃破の配点が最も重い', () => {
    const weightOf = (key: keyof ScoreVarsBattle): number =>
      evalScoreFormula(formula, zeroVars({ [key]: 1 } as Partial<ScoreVars>))
    const boss = weightOf('bossDefeated')
    for (const key of BATTLE_VAR_KEYS) {
      if (key === 'bossDefeated') continue
      expect(boss, key).toBeGreaterThan(weightOf(key))
    }
  })

  it('戦闘数に比例してスコアが伸びる', () => {
    const one = evalScoreFormula(formula, zeroVars({ battlesWon: 1 } as Partial<ScoreVars>))
    const ten = evalScoreFormula(formula, zeroVars({ battlesWon: 10 } as Partial<ScoreVars>))
    expect(ten).toBe(one * 10)
  })
})

describe('dungeon ジャンルへの巻き添えがないこと', () => {
  // rpg と dungeon の重複解消は別件で決着済み。rpg 側の作業で dungeon を変えていないことを固定する
  it('dungeon は従来どおり Canvas の Feature を保っている', () => {
    expect(dungeonJson.enableFeatures).toContain('melee_kill')
    expect(dungeonJson.enableFeatures).toContain('exp')
  })

  it('dungeon のスコア式は従来の横スクロール系の変数のまま', () => {
    expect(dungeonJson.scoreFormula).toContain('kills')
    expect(dungeonJson.scoreFormula).toContain('distance')
    expect(dungeonJson.scoreFormula).not.toContain('battlesWon')
  })
})
