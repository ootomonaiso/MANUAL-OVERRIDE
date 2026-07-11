import { describe, it, expect } from 'vitest'
import { computeSurpriseEnding } from '../../../src/composables/useGameState'
import type { ContradictionState, PlayStyleResult, DetectedPlayStyle } from '../../../src/domain/types'

function contradiction(hasEffect: boolean): ContradictionState {
  return { pairs: [], score: hasEffect ? 1 : 0, hasEffect }
}

function playStyle(style: DetectedPlayStyle, confidence: number): PlayStyleResult {
  return {
    style,
    confidence,
    scores: { aggressive: 0, defensive: 0, explorer: 0, balanced: 0, chaotic: 0, passive: 0 },
  }
}

describe('computeSurpriseEnding (#146)', () => {
  it('高矛盾なら glitch を最優先で返す（プレイスタイルに関わらず）', () => {
    const e = computeSurpriseEnding(contradiction(true), playStyle('aggressive', 0.9))
    expect(e?.type).toBe('glitch')
    expect(e?.forcedGenre).toBe('glitch')
  })

  it('passive（高信頼）で bad_ending', () => {
    expect(computeSurpriseEnding(contradiction(false), playStyle('passive', 0.7))?.type).toBe('bad_ending')
  })

  it('chaotic（高信頼）で bad_ending', () => {
    expect(computeSurpriseEnding(contradiction(false), playStyle('chaotic', 0.7))?.type).toBe('bad_ending')
  })

  it('explorer（高信頼）で hidden_genre', () => {
    expect(computeSurpriseEnding(contradiction(false), playStyle('explorer', 0.7))?.type).toBe('hidden_genre')
  })

  it('aggressive / defensive（高信頼）で narrative_twist', () => {
    expect(computeSurpriseEnding(contradiction(false), playStyle('aggressive', 0.7))?.type).toBe('narrative_twist')
    expect(computeSurpriseEnding(contradiction(false), playStyle('defensive', 0.7))?.type).toBe('narrative_twist')
  })

  it('balanced は予定調和（null）', () => {
    expect(computeSurpriseEnding(contradiction(false), playStyle('balanced', 0.9))).toBeNull()
  })

  it('信頼度が閾値未満なら偏っていても null', () => {
    expect(computeSurpriseEnding(contradiction(false), playStyle('passive', 0.3))).toBeNull()
  })

  it('サプライズエンド（glitch 以外）は forcedGenre を持たない', () => {
    const e = computeSurpriseEnding(contradiction(false), playStyle('explorer', 0.8))
    expect(e?.forcedGenre).toBeUndefined()
  })
})
