import { describe, it, expect } from 'vitest'
import {
  initContradictionState,
  recordContradiction,
  getContradictionSeverity,
  getContradictionEffectClass,
  isBadEndingTriggered,
  getContradictionWarning,
  generateBadEndingMessage,
  BAD_ENDING_THRESHOLD,
  CONTRADICTION_WARNING_THRESHOLD,
} from '../../../src/domain/contradictionTracker'

describe('initContradictionState', () => {
  it('初期状態を返す', () => {
    const state = initContradictionState()
    expect(state.level).toBe(0)
    expect(state.events).toEqual([])
    expect(state.badEndingTriggered).toBe(false)
  })
})

describe('recordContradiction', () => {
  it('矛盾レベルを増加させる', () => {
    const state = initContradictionState()
    const newState = recordContradiction(state, 'card-a', 'card-b')
    expect(newState.level).toBeGreaterThan(0)
    expect(newState.events.length).toBe(1)
  })

  it('複数の矛盾を累積する', () => {
    let state = initContradictionState()
    state = recordContradiction(state, 'card-a', 'card-b')
    state = recordContradiction(state, 'card-c', 'card-d')
    state = recordContradiction(state, 'card-e', 'card-f')
    expect(state.events.length).toBe(3)
    expect(state.level).toBeGreaterThan(0.3)
  })

  it('バッドエンド閾値を超えると badEndingTriggered=true になる', () => {
    let state = initContradictionState()
    // 1回の矛盾で 0.15 増加、閾値 0.6 なので 4回で超える
    for (let i = 0; i < 4; i++) {
      state = recordContradiction(state, `card-${i}`, `card-${i + 10}`)
    }
    expect(state.badEndingTriggered).toBe(true)
  })

  it('badEndingTriggered 後は追加処理しない', () => {
    let state = initContradictionState()
    for (let i = 0; i < 4; i++) {
      state = recordContradiction(state, `card-${i}`, `card-${i + 10}`)
    }
    expect(state.badEndingTriggered).toBe(true)
    const eventCount = state.events.length
    state = recordContradiction(state, 'card-x', 'card-y')
    // 状態は変更されない
    expect(state.events.length).toBe(eventCount)
  })

  it('矛盾レベルは 1.0 を超えない', () => {
    let state = initContradictionState()
    for (let i = 0; i < 20; i++) {
      state = recordContradiction(state, `card-${i}`, `card-${i + 10}`)
    }
    expect(state.level).toBeLessThanOrEqual(1.0)
  })

  it('イベントに反応メッセージが含まれる', () => {
    const state = initContradictionState()
    const newState = recordContradiction(state, 'card-a', 'card-b')
    expect(newState.events[0].reactionMessage).toBeTypeOf('string')
    expect(newState.events[0].reactionMessage.length).toBeGreaterThan(0)
  })
})

describe('getContradictionSeverity', () => {
  it('レベル 0 で none を返す', () => {
    expect(getContradictionSeverity(0)).toBe('none')
  })

  it('警告閾値未満で mild を返す', () => {
    expect(getContradictionSeverity(0.1)).toBe('mild')
  })

  it('中程度で moderate を返す', () => {
    expect(getContradictionSeverity(0.35)).toBe('moderate')
  })

  it('高レベルで severe を返す', () => {
    expect(getContradictionSeverity(0.5)).toBe('severe')
  })

  it('閾値以上で broken を返す', () => {
    expect(getContradictionSeverity(BAD_ENDING_THRESHOLD)).toBe('broken')
  })
})

describe('getContradictionEffectClass', () => {
  it('レベル 0 で空文字列を返す', () => {
    expect(getContradictionEffectClass(0)).toBe('')
  })

  it('mild で mild クラスを返す', () => {
    expect(getContradictionEffectClass(0.1)).toBe('manual-contradiction-mild')
  })

  it('moderate で moderate クラスを返す', () => {
    expect(getContradictionEffectClass(0.35)).toBe('manual-contradiction-moderate')
  })

  it('severe で severe クラスを返す', () => {
    expect(getContradictionEffectClass(0.5)).toBe('manual-contradiction-severe')
  })

  it('broken で broken クラスを返す', () => {
    expect(getContradictionEffectClass(0.7)).toBe('manual-contradiction-broken')
  })
})

describe('isBadEndingTriggered', () => {
  it('閾値未満で false を返す', () => {
    expect(isBadEndingTriggered(0.5)).toBe(false)
  })

  it('閾値以上で true を返す', () => {
    expect(isBadEndingTriggered(BAD_ENDING_THRESHOLD)).toBe(true)
  })
})

describe('getContradictionWarning', () => {
  it('警告閾値未満で null を返す', () => {
    expect(getContradictionWarning(0)).toBeNull()
    expect(getContradictionWarning(0.2)).toBeNull()
  })

  it('moderate で警告メッセージを返す', () => {
    const warning = getContradictionWarning(0.35)
    expect(warning).not.toBeNull()
    expect(warning!).toContain('矛盾')
  })

  it('severe で強い警告を返す', () => {
    const warning = getContradictionWarning(0.5)
    expect(warning).not.toBeNull()
    expect(warning!).toContain('崩壊')
  })

  it('broken で最大の警告を返す', () => {
    const warning = getContradictionWarning(0.7)
    expect(warning).not.toBeNull()
    expect(warning!).toContain('読めなくなっ')
  })
})

describe('generateBadEndingMessage', () => {
  it('イベントなしでデフォルトメッセージを返す', () => {
    const msg = generateBadEndingMessage([])
    expect(msg).toBeTypeOf('string')
    expect(msg.length).toBeGreaterThan(0)
  })

  it('1つのイベントで短いメッセージを返す', () => {
    const events = [{ cardId: 'a', conflictedId: 'b', reactionMessage: 'test' }]
    const msg = generateBadEndingMessage(events)
    expect(msg).toContain('1 回の矛盾')
  })

  it('複数のイベントで長いメッセージを返す', () => {
    const events = [
      { cardId: 'a', conflictedId: 'b', reactionMessage: 'test1' },
      { cardId: 'c', conflictedId: 'd', reactionMessage: 'test2' },
    ]
    const msg = generateBadEndingMessage(events)
    expect(msg).toContain('2 回の矛盾')
    expect(msg).toContain('矛盾に満ちていた')
  })

  it('4つ以上のイベントで最长的なメッセージを返す', () => {
    const events = [
      { cardId: 'a', conflictedId: 'b', reactionMessage: 't1' },
      { cardId: 'c', conflictedId: 'd', reactionMessage: 't2' },
      { cardId: 'e', conflictedId: 'f', reactionMessage: 't3' },
      { cardId: 'g', conflictedId: 'h', reactionMessage: 't4' },
    ]
    const msg = generateBadEndingMessage(events)
    expect(msg).toContain('4 回の矛盾')
    expect(msg).toContain('読める状態ではなかった')
  })
})
