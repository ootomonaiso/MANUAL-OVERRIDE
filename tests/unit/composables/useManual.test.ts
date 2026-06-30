import { describe, it, expect } from 'vitest'
import { computeLineDiff } from '../../../src/composables/useManual'

describe('computeLineDiff', () => {
  it('同一の配列で空配列を返す（差分なし）', () => {
    const prev = ['line1', 'line2', 'line3']
    const next = ['line1', 'line2', 'line3']
    expect(computeLineDiff(prev, next)).toEqual([])
  })

  it('行が追加された場合を検出する', () => {
    const prev = ['line1', 'line2']
    const next = ['line1', 'line2', 'line3']
    const diff = computeLineDiff(prev, next)
    // LCS ベースなので unchanged 行も含まれる
    expect(diff).toHaveLength(3)
    expect(diff[0]).toEqual({ text: 'line1', type: 'unchanged' })
    expect(diff[1]).toEqual({ text: 'line2', type: 'unchanged' })
    expect(diff[2]).toEqual({ text: 'line3', type: 'added' })
  })

  it('行が削除された場合を検出する', () => {
    const prev = ['line1', 'line2', 'line3']
    const next = ['line1', 'line2']
    const diff = computeLineDiff(prev, next)
    expect(diff).toHaveLength(3)
    expect(diff[0]).toEqual({ text: 'line1', type: 'unchanged' })
    expect(diff[1]).toEqual({ text: 'line2', type: 'unchanged' })
    expect(diff[2]).toEqual({ text: 'line3', type: 'removed' })
  })

  it('行が変更された場合を検出する（削除+追加）', () => {
    const prev = ['line1', 'line2', 'line3']
    const next = ['line1', 'modified', 'line3']
    const diff = computeLineDiff(prev, next)
    expect(diff).toHaveLength(4)
    expect(diff[0]).toEqual({ text: 'line1', type: 'unchanged' })
    expect(diff[1]).toEqual({ text: 'line2', type: 'removed' })
    expect(diff[2]).toEqual({ text: 'modified', type: 'added' })
    expect(diff[3]).toEqual({ text: 'line3', type: 'unchanged' })
  })

  it('空配列同士の差分は空', () => {
    expect(computeLineDiff([], [])).toEqual([])
  })

  it('空 → 行追加', () => {
    const diff = computeLineDiff([], ['new line'])
    expect(diff).toEqual([{ text: 'new line', type: 'added' }])
  })

  it('行 → 空で削除', () => {
    const diff = computeLineDiff(['old line'], [])
    expect(diff).toEqual([{ text: 'old line', type: 'removed' }])
  })

  it('複数の追加と削除を正しく検出する', () => {
    const prev = ['a', 'b', 'c', 'd']
    const next = ['a', 'x', 'c', 'y']
    const diff = computeLineDiff(prev, next)
    // b が削除、x が追加、d が削除、y が追加
    expect(diff).toEqual([
      { text: 'a', type: 'unchanged' },
      { text: 'b', type: 'removed' },
      { text: 'x', type: 'added' },
      { text: 'c', type: 'unchanged' },
      { text: 'd', type: 'removed' },
      { text: 'y', type: 'added' },
    ])
  })

  it('重複行を正しく扱う', () => {
    const prev = ['a', 'a', 'b']
    const next = ['a', 'b', 'b']
    const diff = computeLineDiff(prev, next)
    // LCS backtracking は末尾から進むため、2番目の 'a' と 2番目の 'b' が unchanged にマッチ
    // 1番目の 'a' は removed、1番目の 'b' は added
    expect(diff).toEqual([
      { text: 'a', type: 'removed' },
      { text: 'a', type: 'unchanged' },
      { text: 'b', type: 'added' },
      { text: 'b', type: 'unchanged' },
    ])
  })

  it('結果は元の順序で返される', () => {
    const prev = ['first', 'middle', 'last']
    const next = ['first', 'new', 'last']
    const diff = computeLineDiff(prev, next)
    // unchanged, removed, added, unchanged の順
    expect(diff).toHaveLength(4)
    expect(diff[0]).toEqual({ text: 'first', type: 'unchanged' })
    expect(diff[1]).toEqual({ text: 'middle', type: 'removed' })
    expect(diff[2]).toEqual({ text: 'new', type: 'added' })
    expect(diff[3]).toEqual({ text: 'last', type: 'unchanged' })
  })

  it('大規模な差分でも正しく動作する', () => {
    // 100行は「大規模」の閾値として十分
    const largeSize = 100
    const prev = Array.from({ length: largeSize }, (_, i) => `line${i}`)
    const next = Array.from({ length: largeSize }, (_, i) => `line${i + 1}`)
    const diff = computeLineDiff(prev, next)
    // line0 が削除、line1〜line99 が unchanged、line100 が追加 → 合計 101 行
    expect(diff).toHaveLength(largeSize + 1)
    expect(diff[0]).toEqual({ text: 'line0', type: 'removed' })
    expect(diff[diff.length - 1]).toEqual({ text: 'line100', type: 'added' })
  })

  it('全行が異なる場合', () => {
    const prev = ['a', 'b', 'c']
    const next = ['x', 'y', 'z']
    const diff = computeLineDiff(prev, next)
    // 全行が removed または added
    const unchanged = diff.filter(d => d.type === 'unchanged')
    expect(unchanged).toHaveLength(0)
  })
})
