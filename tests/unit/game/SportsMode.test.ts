import { describe, it, expect, vi } from 'vitest'
import { SportsMode } from '../../../src/game/modes/SportsMode'
import type { MutableWorld } from '../../../src/engine/types'

/** 最小限の MutableWorld モック（テスト用に必要最小限のフィールドだけ設定） */
function createMockWorld(overrides: Partial<MutableWorld> = {}): MutableWorld {
  const canvas = { width: 400, height: 600 } as HTMLCanvasElement
  const ctx = {} as CanvasRenderingContext2D
  const keys = new Set<string>()
  const justPressed = new Set<string>()
  const justReleased = new Set<string>()

  return {
    player: { x: 0, y: 0, w: 32, h: 48, hp: 100, color: '#fff' },
    hazards: [],
    items: [],
    bullets: [],
    rules: { manualVersion: '1.0', rules: [] },
    distance: 0,
    survivedSec: 0,
    canvas,
    ctx,
    cameraX: 0,
    gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
    scrollMode: 'x',
    stealthHidden: false,
    input: { keys, justPressed, justReleased },
    setStealthHidden: vi.fn(),
    addScore: vi.fn(),
    addScorePopup: vi.fn(),
    triggerShake: vi.fn(),
    addParticle: vi.fn(),
    spawnHazard: vi.fn(),
    spawnItem: vi.fn(),
    removeHazardById: vi.fn(),
    modifyPlayerHp: vi.fn(),
    resetCombo: vi.fn(),
    setTimescale: vi.fn(),
    getHazardScreenX: vi.fn(),
    getPlayerWorldX: vi.fn(),
    setKills: vi.fn(),
    setCombo: vi.fn(),
    addBeatHit: vi.fn(),
    setBeatHazardInverted: vi.fn(),
    addShot: vi.fn(),
    addScoreVarsHit: vi.fn(),
    addScoreVarsItemCollected: vi.fn(),
    addScoreVarsBossKill: vi.fn(),
    addScoreVarsStealthBonus: vi.fn(),
    addScoreVarsColorTouch: vi.fn(),
    ...overrides,
  } as MutableWorld
}

describe('SportsMode — Bug fix: timer before race start', () => {
  it('raceStarted=false の間は elapsed が進まない', () => {
    const mode = new SportsMode()
    const world = createMockWorld()

    // setup して初期化
    mode.setup(world)

    // 入力なしで update を複数回呼ぶ
    for (let i = 0; i < 60; i++) {
      mode.update(world, 1 / 60)
    }

    // elapsed は 0 のまま（raceStarted が false の間は進まない）
    expect(mode['state'].elapsed).toBe(0)
    expect(mode['state'].raceStarted).toBe(false)
  })

  it('ArrowRight をホールドすると raceStarted になり、elapsed がカウントされる', () => {
    const mode = new SportsMode()
    const world = createMockWorld()

    mode.setup(world)

    // 1 フレーム目: ArrowRight を押す
    world.input.keys.add('ArrowRight')
    mode.update(world, 1 / 60)

    expect(mode['state'].raceStarted).toBe(true)

    // 以降 elapsed が進む
    for (let i = 0; i < 30; i++) {
      mode.update(world, 1 / 60)
    }
    expect(mode['state'].elapsed).toBeGreaterThan(0)
  })

  it('Space をホールドしても raceStarted になる', () => {
    const mode = new SportsMode()
    const world = createMockWorld()

    mode.setup(world)

    world.input.keys.add('Space')
    mode.update(world, 1 / 60)

    expect(mode['state'].raceStarted).toBe(true)
  })

  it('60 秒経過で isLost が true になる', () => {
    const mode = new SportsMode()
    const world = createMockWorld()

    mode.setup(world)

    // 開始
    world.input.keys.add('ArrowRight')
    mode.update(world, 1 / 60)

    // 60 秒分進める（1fps で）
    for (let i = 0; i < 3600; i++) {
      mode.update(world, 1)
    }

    expect(mode.isLost(world)).toBe(true)
  })
})
