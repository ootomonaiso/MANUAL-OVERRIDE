import { describe, it, expect, vi } from 'vitest'
import { TowerDefMode } from '../../../src/game/modes/TowerDefMode'
import type { MutableWorld } from '../../../src/engine/types'

function createMockWorld(overrides: Partial<MutableWorld> = {}): MutableWorld {
  const canvas = { width: 400, height: 600 } as HTMLCanvasElement
  const ctx = {} as CanvasRenderingContext2D
  const keys = new Set<string>()
  const justPressed = new Set<string>()
  const justReleased = new Set<string>()

  return {
    player: { x: 80, y: 400, w: 32, h: 48, hp: 100, color: '#fff' },
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

describe('TowerDefMode — Bug fix: Space key detection', () => {
  it('Space をホールドすると gameStarted になる（justPressed でない場合でも）', () => {
    const mode = new TowerDefMode()
    const world = createMockWorld()

    mode.setup(world)

    // justReleased ではなく keys に Space を追加（ホールド状態をシミュレート）
    world.input.keys.add('Space')
    mode.update(world, 1 / 60)

    expect(mode['state'].gameStarted).toBe(true)
    // 1ウェーブ目が開始されている
    expect(mode['state'].currentWave).toBe(1)
    expect(mode['state'].waveInProgress).toBe(true)
  })

  it('Space を押さない間は gameStarted=false のまま', () => {
    const mode = new TowerDefMode()
    const world = createMockWorld()

    mode.setup(world)

    for (let i = 0; i < 60; i++) {
      mode.update(world, 1 / 60)
    }

    expect(mode['state'].gameStarted).toBe(false)
  })
})
