import { describe, it, expect } from 'vitest'
import {
  validateManualVersionStructure,
  validateDeckStructure,
  validateDeck,
  type ValidationResult,
} from '../../../src/framework/ManualValidator'
import type { ManualVersion } from '../../../src/domain/types'

// デフォルトハザード設定
const DEFAULT_HAZARDS = { colors: ['red'], safeColors: ['blue'] }

// テスト用の最小限な ManualVersion（hazards はオプション）
function _makeVersion(
  version: string,
  text: string[] = [],
  choices: ManualVersion['choices'] = [],
  hazards?: ManualVersion['hazards'],
): ManualVersion {
  return {
    version,
    manualText: text,
    choices,
    hazards: hazards ?? { ...DEFAULT_HAZARDS },
  }
}

describe('validateManualVersionStructure', () => {
  it('正しい構造のエラーは空配列', () => {
    const valid: ManualVersion = {
      version: '1.0',
      manualText: ['line1', 'line2'],
      choices: [
        { id: 'c1', label: 'Choice 1', next: '2.0', genreParams: { tempo: 2 } },
      ],
      hazards: { colors: ['red'], safeColors: ['blue'] },
    }
    const errs = validateManualVersionStructure('1.0', valid)
    expect(errs).toEqual([])
  })

  it('非オブジェクトの場合エラー', () => {
    const errs = validateManualVersionStructure('key', 'not an object')
    expect(errs.length).toBeGreaterThan(0)
    expect(errs.some(e => e.includes('オブジェクトである必要があります'))).toBe(true)
  })

  it('version が文字列でない場合エラー', () => {
    const errs = validateManualVersionStructure('key', { version: 123 })
    expect(errs.some(e => e.includes('version'))).toBe(true)
  })

  it('manualText が配列でない場合エラー', () => {
    const errs = validateManualVersionStructure('key', { manualText: 'not array' })
    expect(errs.some(e => e.includes('manualText'))).toBe(true)
  })

  it('choices が配列でない場合エラー', () => {
    const errs = validateManualVersionStructure('key', { choices: 'not array' })
    expect(errs.some(e => e.includes('choices'))).toBe(true)
  })

  it('choice の必須フィールドが不足している場合エラー', () => {
    const errs = validateManualVersionStructure('key', {
      choices: [{ id: 'c1' }], // label, next, genreParams が不足
    })
    expect(errs.some(e => e.includes('label'))).toBe(true)
    expect(errs.some(e => e.includes('next'))).toBe(true)
    expect(errs.some(e => e.includes('genreParams'))).toBe(true)
  })

  it('hazards が正しくない場合エラー', () => {
    const errs = validateManualVersionStructure('key', { hazards: 'not object' })
    expect(errs.some(e => e.includes('hazards'))).toBe(true)
  })

  it('hazards.colors が配列でない場合エラー', () => {
    const errs = validateManualVersionStructure('key', {
      hazards: { colors: 'red' },
    })
    expect(errs.some(e => e.includes('colors'))).toBe(true)
  })
})

describe('validateDeckStructure', () => {
  it('全エントリーが正しい場合エラーなし', () => {
    const deck = {
      '1.0': {
        version: '1.0',
        manualText: ['line1'],
        choices: [],
        hazards: { colors: ['red'], safeColors: ['blue'] },
      },
    }
    const errs = validateDeckStructure(deck as Record<string, unknown>)
    expect(errs).toEqual([])
  })

  it('複数のエントリーのエラーを集約する', () => {
    const deck = {
      '1.0': { version: '1.0' }, // manualText, choices, hazards 不足
      '2.0': { version: '2.0' }, // 同上
    }
    const errs = validateDeckStructure(deck)
    expect(errs.length).toBeGreaterThan(0)
  })
})

describe('validateDeck', () => {
  it('ルートキー "1.0" が存在しない場合エラー', () => {
    const deck = { '2.0': _makeVersion('2.0') }
    const result = validateDeck(deck)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('1.0'))).toBe(true)
  })

  it('空のデッキはエラーになる', () => {
    const result = validateDeck({})
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('1.0'))).toBe(true)
  })

  it('next の参照先が存在しない場合エラー', () => {
    const deck = {
      '1.0': _makeVersion('1.0', [], [
        { id: 'c1', label: 'Go', next: '999', genreParams: {} },
      ]),
    }
    const result = validateDeck(deck)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('999'))).toBe(true)
  })

  it('直接循環参照を検出する', () => {
    const deck = {
      '1.0': _makeVersion('1.0', [], [
        { id: 'c1', label: 'Loop', next: '1.0', genreParams: {} },
      ]),
    }
    const result = validateDeck(deck)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('循環'))).toBe(true)
  })

  it('深い循環参照を検出する', () => {
    const deck = {
      '1.0': _makeVersion('1.0', [], [
        { id: 'c1', label: 'A', next: '2.0', genreParams: {} },
      ]),
      '2.0': _makeVersion('2.0', [], [
        { id: 'c2', label: 'B', next: '3.0', genreParams: {} },
      ]),
      '3.0': _makeVersion('3.0', [], [
        { id: 'c3', label: 'C', next: '1.0', genreParams: {} },
      ]),
    }
    const result = validateDeck(deck)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('循環'))).toBe(true)
  })

  it('到達不可能なエントリーを警告する', () => {
    const deck = {
      '1.0': _makeVersion('1.0', [], [
        { id: 'c1', label: 'A', next: '2.0', genreParams: {} },
      ]),
      '2.0': _makeVersion('2.0'),
      'orphan': _makeVersion('orphan'),
    }
    const result = validateDeck(deck)
    expect(result.warnings.some(w => w.includes('orphan'))).toBe(true)
  })

  it('正しいデッキは ok=true', () => {
    const deck = {
      '1.0': _makeVersion('1.0', ['start'], [
        { id: 'c1', label: 'A', next: '2.0', genreParams: { tempo: 2 } },
      ]),
      '2.0': _makeVersion('2.0', ['next']),
    }
    const result = validateDeck(deck)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })
})
