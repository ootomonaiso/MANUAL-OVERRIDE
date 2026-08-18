import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isSkinUnlocked, loadSelectedSkinId, toPlayerSkin, loadSkins, getSkinById } from '../../src/domain/skins'
import type { SaveRecords, SkinDef } from '../../src/domain/types'

// Mock localStorage
const store: Record<string, string> = {}
const mockStorage: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear() { for (const k of Object.keys(store)) delete store[k] },
  get length() { return Object.keys(store).length },
  key: (i: number) => Object.keys(store)[i] ?? null,
}
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true })

function emptyRecords(): SaveRecords {
  return { overallBest: null, perGenre: {}, playCount: 0, totalDistance: 0, totalPlayTime: 0 }
}

describe('isSkinUnlocked', () => {
  it('free → true', () => {
    const skin: SkinDef = {
      id: 'default', name: 'デフォルト',
      body: '#fff', head: '#eee', limb: '#ccc', eye: '#222', accent: '#88f',
      unlock: { type: 'free' },
    }
    expect(isSkinUnlocked(skin, emptyRecords())).toBe(true)
  })

  it('record 条件を満たす → true', () => {
    const skin: SkinDef = {
      id: 'neon', name: 'ネオン',
      body: '#0ff', head: '#6ff', limb: '#0c9', eye: '#032', accent: '#0ff',
      unlock: { type: 'record', metric: 'playCount', threshold: 3 },
    }
    const records: SaveRecords = { ...emptyRecords(), playCount: 5 }
    expect(isSkinUnlocked(skin, records)).toBe(true)
  })

  it('record 条件を満たさない → false', () => {
    const skin: SkinDef = {
      id: 'neon', name: 'ネオン',
      body: '#0ff', head: '#6ff', limb: '#0c9', eye: '#032', accent: '#0ff',
      unlock: { type: 'record', metric: 'playCount', threshold: 10 },
    }
    const records: SaveRecords = { ...emptyRecords(), playCount: 3 }
    expect(isSkinUnlocked(skin, records)).toBe(false)
  })

  it('totalDistance 条件', () => {
    const skin: SkinDef = {
      id: 'x', name: 'x',
      body: '#0ff', head: '#6ff', limb: '#0c9', eye: '#032', accent: '#0ff',
      unlock: { type: 'record', metric: 'totalDistance', threshold: 5000 },
    }
    expect(isSkinUnlocked(skin, { ...emptyRecords(), totalDistance: 4999 })).toBe(false)
    expect(isSkinUnlocked(skin, { ...emptyRecords(), totalDistance: 5000 })).toBe(true)
    expect(isSkinUnlocked(skin, { ...emptyRecords(), totalDistance: 5001 })).toBe(true)
  })

  it('overallBestTotal 条件', () => {
    const skin: SkinDef = {
      id: 'x', name: 'x',
      body: '#0ff', head: '#6ff', limb: '#0c9', eye: '#032', accent: '#0ff',
      unlock: { type: 'record', metric: 'overallBestTotal', threshold: 2000 },
    }
    const noBest: SaveRecords = { ...emptyRecords(), overallBest: null }
    expect(isSkinUnlocked(skin, noBest)).toBe(false)

    const records: SaveRecords = {
      ...emptyRecords(),
      overallBest: { total: 2000, play: 1400, throw: 600, genre: 'base', distance: 500, date: '2024-01-01' },
    }
    expect(isSkinUnlocked(skin, records)).toBe(true)
  })
})

describe('loadSelectedSkinId', () => {
  beforeEach(() => { mockStorage.clear() })
  afterEach(() => { mockStorage.clear() })

  it('未設定 → "default"', () => {
    expect(loadSelectedSkinId('test_skin_key')).toBe('default')
  })

  it('無効な ID → "default"', () => {
    store['test_skin_key'] = 'nonexistent_skin'
    expect(loadSelectedSkinId('test_skin_key')).toBe('default')
  })
})

describe('toPlayerSkin', () => {
  it('unlock 情報を落として PlayerSkin を返す', () => {
    const skin: SkinDef = {
      id: 'fire', name: 'ファイア',
      body: '#f63', head: '#fa6', limb: '#c42', eye: '#310', accent: '#fc0',
      unlock: { type: 'record', metric: 'overallBestTotal', threshold: 2000 },
    }
    const ps = toPlayerSkin(skin)
    expect(ps.id).toBe('fire')
    expect(ps.body).toBe('#f63')
    expect(ps.head).toBe('#fa6')
    expect(ps.limb).toBe('#c42')
    expect(ps.eye).toBe('#310')
    expect(ps.accent).toBe('#fc0')
  })
})

describe('loadSkins / getSkinById', () => {
  it('loadSkins() は空でない配列を返す', () => {
    const skins = loadSkins()
    expect(skins.length).toBeGreaterThan(0)
  })

  it('getSkinById("default") は存在する', () => {
    expect(getSkinById('default')).toBeDefined()
    expect(getSkinById('default')?.name).toBe('デフォルト')
  })

  it('getSkinById("nonexistent") は undefined', () => {
    expect(getSkinById('nonexistent')).toBeUndefined()
  })
})
