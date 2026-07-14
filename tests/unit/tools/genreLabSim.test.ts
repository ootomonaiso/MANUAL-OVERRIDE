import { describe, it, expect } from 'vitest'
import { judgeConvergence, cardDelta, runSimulation, GENRE_AXES } from '../../../src/tools/genreLabSim'
import { DEFAULT_BAYES_CONFIG } from '../../../src/domain/genreResolver'
import { GENRES } from '../../../src/data/genres'
import type { GenreId, ManualCard } from '../../../src/domain/types'

function card(genreParams: Record<string, number>, paramMultiplier?: number): ManualCard {
  return { id: 'test', label: 't', manualText: ['x'], genreParams, paramMultiplier }
}

describe('genreLabSim.cardDelta', () => {
  it('jitter 無しなら genreParams をそのまま返す', () => {
    expect(cardDelta(card({ enemy: 2, range: 1 }), false)).toEqual({ enemy: 2, range: 1 })
  })

  it('paramMultiplier を掛ける', () => {
    expect(cardDelta(card({ enemy: 2 }, 3), false)).toEqual({ enemy: 6 })
  })

  it('genreParams が空なら空オブジェクト', () => {
    expect(cardDelta(card({}), false)).toEqual({})
  })

  it('jitter 有りでも ±20% の範囲に収まる', () => {
    for (let i = 0; i < 50; i++) {
      const d = cardDelta(card({ enemy: 10 }), true)
      expect(d.enemy).toBeGreaterThanOrEqual(8)   // 10 * (1 - 0.2)
      expect(d.enemy).toBeLessThanOrEqual(12)      // 10 * (1 + 0.2)
    }
  })
})

describe('genreLabSim.judgeConvergence', () => {
  const cfg = DEFAULT_BAYES_CONFIG // minProb=0.30, dominanceRatio=1.5

  it('minProb 以上かつ2位を dominanceRatio 倍で上回れば収束', () => {
    const j = judgeConvergence({ stg: 0.5, rpg: 0.2 } as Record<GenreId, number>, GENRES, cfg)
    expect(j.top?.id).toBe('stg')
    expect(j.minProbMet).toBe(true)
    expect(j.dominanceMet).toBe(true)   // 0.5 >= 1.5 * 0.2
    expect(j.converged).toBe('stg')
  })

  it('2位に対する優位が足りなければ未収束', () => {
    const j = judgeConvergence({ stg: 0.5, rpg: 0.4 } as Record<GenreId, number>, GENRES, cfg)
    expect(j.dominanceMet).toBe(false)  // 0.5 < 1.5 * 0.4
    expect(j.converged).toBeNull()
  })

  it('最尤でも minProb 未満なら未収束', () => {
    const j = judgeConvergence({ stg: 0.25, rpg: 0.05 } as Record<GenreId, number>, GENRES, cfg)
    expect(j.minProbMet).toBe(false)
    expect(j.converged).toBeNull()
  })

  it('base はランキング対象外', () => {
    const j = judgeConvergence({ base: 0.9, stg: 0.5, rpg: 0.2 } as Record<GenreId, number>, GENRES, cfg)
    expect(j.top?.id).toBe('stg')       // base(0.9) は除外される
    expect(j.converged).toBe('stg')
  })
})

describe('genreLabSim.runSimulation', () => {
  it('分布は確率（0〜1・合計約1）、到達率は 0〜1 に収まる', () => {
    const { randomDist, focusedRate } = runSimulation(GENRES, 30, 10)

    const distValues = Object.values(randomDist)
    for (const p of distValues) {
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
    const sum = distValues.reduce((s, p) => s + p, 0)
    expect(sum).toBeGreaterThan(0.99)
    expect(sum).toBeLessThan(1.01)

    for (const rate of Object.values(focusedRate)) {
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(1)
    }
    // base 以外の全ジャンルに到達率エントリがある
    expect(Object.keys(focusedRate).length).toBe(GENRES.filter(g => g.id !== 'base').length)
  })
})

describe('genreLabSim.GENRE_AXES', () => {
  it('12軸を公開している', () => {
    expect(GENRE_AXES).toHaveLength(12)
    expect(GENRE_AXES).toContain('tempo')
    expect(GENRE_AXES).toContain('speed')
  })
})
