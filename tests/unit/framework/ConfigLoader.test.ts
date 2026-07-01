import { describe, it, expect } from 'vitest'
import { loadConfigFromGlob } from '../../../src/framework/ConfigLoader'

describe('loadConfigFromGlob', () => {
  it('空のモジュールで空のマップを返す', () => {
    const result = loadConfigFromGlob({})
    expect(result).toBeDefined()
  })

  it('section フィールドを持つモジュールを正しくロードする', () => {
    const modules = {
      './config/physics.json': {
        default: {
          section: 'physics',
          playerWidth: 36,
          playerHeight: 52,
        },
      },
    }
    const result = loadConfigFromGlob(modules)
    expect((result as Record<string, unknown>).physics).toBeDefined()
    const phys = (result as Record<string, Record<string, unknown>>).physics
    expect(phys.playerWidth).toBe(36)
    expect(phys.playerHeight).toBe(52)
    expect(phys.section).toBeUndefined() // section は除去される
  })

  it('default プロパティがないモジュールも処理する', () => {
    const modules = {
      './config/throw.json': {
        section: 'throw',
        gravity: 800,
      },
    }
    const result = loadConfigFromGlob(modules)
    const thr = (result as Record<string, Record<string, unknown>>).throw
    expect(thr.gravity).toBe(800)
  })

  it('section フィールドがないモジュールはスキップされる', () => {
    const modules = {
      './config/bad.json': {
        default: { foo: 'bar' },
      },
    }
    const result = loadConfigFromGlob(modules)
    expect(Object.keys(result).length).toBe(0)
  })

  it('重複セクションは上書きされる', () => {
    const modules = {
      './config/a.json': {
        default: { section: 'physics', value: 1 },
      },
      './config/b.json': {
        default: { section: 'physics', value: 2 },
      },
    }
    const result = loadConfigFromGlob(modules)
    const phys = (result as Record<string, Record<string, unknown>>).physics
    expect(phys.value).toBe(2)
  })

  it('複数のセクションを同時にロードできる', () => {
    const modules = {
      './config/physics.json': {
        default: { section: 'physics', playerWidth: 36 },
      },
      './config/shoot.json': {
        default: { section: 'shoot', bulletSpeed: 500 },
      },
      './config/throw.json': {
        default: { section: 'throw', gravity: 800 },
      },
    }
    const result = loadConfigFromGlob(modules)
    const map = result as Record<string, Record<string, unknown>>
    expect(map.physics.playerWidth).toBe(36)
    expect(map.shoot.bulletSpeed).toBe(500)
    expect(map.throw.gravity).toBe(800)
  })
})
