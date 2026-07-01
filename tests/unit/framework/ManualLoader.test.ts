import { describe, it, expect } from 'vitest'
import {
  loadFromGlob,
  buildFromFiles,
  extendDeck,
} from '../../../src/framework/ManualLoader'
import type { ManualDeckFile } from '../../../src/framework/types'

describe('loadFromGlob', () => {
  it('空のモジュールで空のデッキを返す', () => {
    const deck = loadFromGlob({})
    expect(Object.keys(deck)).toHaveLength(0)
  })

  it('entries フィールドを持つモジュールを正しくロードする', () => {
    const modules = {
      './manuals/base.json': {
        default: {
          entries: [
            {
              key: '1.0',
              version: '1.0',
              manualText: ['Welcome!'],
              choices: [
                { id: 'c1', label: 'Go', next: '2.0', genreParams: { tempo: 2 } },
              ],
              hazards: { colors: ['red'], safeColors: ['blue'] },
            },
          ],
        },
      },
    }
    const deck = loadFromGlob(modules)
    expect(deck['1.0']).toBeDefined()
    expect(deck['1.0'].manualText).toEqual(['Welcome!'])
    expect(deck['1.0'].choices).toHaveLength(1)
  })

  it('entries フィールドがないモジュールはスキップされる', () => {
    const modules = {
      './manuals/bad.json': {
        default: { foo: 'bar' },
      },
    }
    const deck = loadFromGlob(modules)
    expect(Object.keys(deck)).toHaveLength(0)
  })

  it('複数のファイルからエントリーを集約する', () => {
    const modules = {
      './manuals/base.json': {
        default: {
          entries: [
            {
              key: '1.0',
              version: '1.0',
              manualText: ['Base'],
              choices: [],
              hazards: { colors: ['red'], safeColors: ['blue'] },
            },
          ],
        },
      },
      './manuals/branch.json': {
        default: {
          entries: [
            {
              key: '2.0',
              version: '2.0',
              manualText: ['Branch'],
              choices: [],
              hazards: { colors: ['green'], safeColors: ['yellow'] },
            },
          ],
        },
      },
    }
    const deck = loadFromGlob(modules)
    expect(deck['1.0'].manualText).toEqual(['Base'])
    expect(deck['2.0'].manualText).toEqual(['Branch'])
  })

  it('key が重複している場合は後勝ちで上書きされる', () => {
    const modules = {
      './manuals/a.json': {
        default: {
          entries: [
            { key: '1.0', version: '1.0', manualText: ['first'], choices: [], hazards: { colors: ['r'], safeColors: ['b'] } },
          ],
        },
      },
      './manuals/b.json': {
        default: {
          entries: [
            { key: '1.0', version: '1.0', manualText: ['second'], choices: [], hazards: { colors: ['r'], safeColors: ['b'] } },
          ],
        },
      },
    }
    const deck = loadFromGlob(modules)
    expect(deck['1.0'].manualText).toEqual(['second'])
  })

  it('runtimeOverrides を ManualRuntimeConfig に変換する', () => {
    const modules = {
      './manuals/test.json': {
        default: {
          entries: [
            {
              key: '1.0',
              version: '1.0',
              manualText: [],
              choices: [],
              hazards: { colors: ['r'], safeColors: ['b'] },
              runtimeOverrides: {
                scrollSpeed: 400,
                environment: 'sky',
                bpm: 130,
              },
            },
          ],
        },
      },
    }
    const deck = loadFromGlob(modules)
    expect(deck['1.0'].runtimeConfig?.scrollSpeed).toBe(400)
    expect(deck['1.0'].runtimeConfig?.environment).toBe('sky')
    expect(deck['1.0'].runtimeConfig?.bpm).toBe(130)
  })

  it('image パスの正規化（ファイル名のみの場合 /manuals/ を付与）', () => {
    const modules = {
      './manuals/test.json': {
        default: {
          entries: [
            {
              key: '1.0',
              version: '1.0',
              manualText: [],
              choices: [],
              hazards: { colors: ['r'], safeColors: ['b'] },
              image: 'test.png',
            },
          ],
        },
      },
    }
    const deck = loadFromGlob(modules)
    expect(deck['1.0'].image).toBe('/manuals/test.png')
  })

  it('image パスが絶対パスの場合はそのまま', () => {
    const modules = {
      './manuals/test.json': {
        default: {
          entries: [
            {
              key: '1.0',
              version: '1.0',
              manualText: [],
              choices: [],
              hazards: { colors: ['r'], safeColors: ['b'] },
              image: '/custom/img.png',
            },
          ],
        },
      },
    }
    const deck = loadFromGlob(modules)
    expect(deck['1.0'].image).toBe('/custom/img.png')
  })
})

describe('buildFromFiles', () => {
  it('ファイル配列からデッキを構築する', () => {
    const files: ManualDeckFile[] = [
      {
        id: 'base',
        entries: [
          {
            key: '1.0',
            version: '1.0',
            manualText: ['Start'],
            choices: [],
            hazards: { colors: ['r'], safeColors: ['b'] },
          },
        ],
      },
    ]
    const deck = buildFromFiles(files)
    expect(deck['1.0'].manualText).toEqual(['Start'])
  })

  it('複数のファイルを結合する', () => {
    const files: ManualDeckFile[] = [
      {
        id: 'f1',
        entries: [
          { key: 'a', version: 'a', manualText: ['A'], choices: [], hazards: { colors: ['r'], safeColors: ['b'] } },
        ],
      },
      {
        id: 'f2',
        entries: [
          { key: 'b', version: 'b', manualText: ['B'], choices: [], hazards: { colors: ['r'], safeColors: ['b'] } },
        ],
      },
    ]
    const deck = buildFromFiles(files)
    expect(deck['a'].manualText).toEqual(['A'])
    expect(deck['b'].manualText).toEqual(['B'])
  })
})

describe('extendDeck', () => {
  it('既存デッキにエントリーを追加する', () => {
    const deck: Record<string, unknown> = {
      '1.0': { version: '1.0', manualText: ['orig'] },
    }
    extendDeck(deck, [
      ['2.0', { version: '2.0', manualText: ['new'] } as never],
    ])
    expect((deck as Record<string, { manualText: string[] }>)['2.0'].manualText).toEqual(['new'])
    expect((deck as Record<string, { manualText: string[] }>)['1.0'].manualText).toEqual(['orig'])
  })

  it('既存キーを上書きする', () => {
    const deck: Record<string, unknown> = {
      '1.0': { version: '1.0', manualText: ['old'] },
    }
    extendDeck(deck, [
      ['1.0', { version: '1.0', manualText: ['new'] } as never],
    ])
    expect((deck as Record<string, { manualText: string[] }>)['1.0'].manualText).toEqual(['new'])
  })
})
