import { describe, it, expect } from 'vitest'
import { buildFromFiles } from '../../../src/framework/ManualLoader'
import type { ManualDeckFile } from '../../../src/framework/types'

// #214: ManualLoader が gravity のみ既定値で強制し、genreDef.gravity（stg/tetris=0）を
// マスクする問題の回帰テスト。未持ちは undefined を残すべき。

function _deck(entries: ManualDeckFile['entries']): Record<string, unknown> {
  return buildFromFiles([{ id: 'test', entries }])
}

describe('ManualLoader runtimeOverrides gravity 既定値 (#214)', () => {
  it('空の runtimeOverrides では runtimeConfig ごと省略される（省略ガードが機能）', () => {
    const deck = _deck([
      { version: '1.0', manualText: ['test'], choices: [], runtimeOverrides: {} },
    ])
    const ver = deck['1.0'] as { runtimeConfig?: unknown }
    expect(ver.runtimeConfig).toBeUndefined()
  })

  it('gravity 未指定の runtimeOverrides では gravity が undefined（genreDef.gravity にフォールバック）', () => {
    const deck = _deck([
      { version: '2.0', manualText: ['test'], choices: [], runtimeOverrides: { scrollSpeed: 300 } },
    ])
    const ver = deck['2.0'] as { runtimeConfig?: { gravity?: number; scrollSpeed?: number } }
    // scrollSpeed は保持される
    expect(ver.runtimeConfig?.scrollSpeed).toBe(300)
    // gravity は既定値で埋められず undefined（ruleEngine が genreDef.gravity を参照する）
    expect(ver.runtimeConfig?.gravity).toBeUndefined()
  })

  it('gravity: 0 を明示指定した場合は 0 が保持される（無重力ジャンル対応）', () => {
    const deck = _deck([
      { version: '3.0', manualText: ['test'], choices: [], runtimeOverrides: { gravity: 0 } },
    ])
    const ver = deck['3.0'] as { runtimeConfig?: { gravity?: number } }
    expect(ver.runtimeConfig?.gravity).toBe(0)
  })
})
