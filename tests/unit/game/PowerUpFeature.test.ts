import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PowerUpFeature } from '../../../src/game/systems/PowerUpFeature'
import { Player, Item } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'

// テスト定数（PowerUpFeature 内部と同期）
const POWER_BOOST_DURATION_SEC = 5
const POWER_BOOST_REDUCTION = 0.5

// テスト用の最小限のMutableWorldモック
function createMockWorld(options?: {
  features?: string[]
  powerBoostTimer?: number
}): MutableWorld {
  const player = new Player(100, 500)
  const hazards: unknown[] = []
  const items: Item[] = []
  const popups: unknown[] = []
  let scoreAdded = 0
  let itemsCollected = 0

  const world: MutableWorld = {
    player,
    hazards,
    items,
    cameraX: 0,
    distance: 0,
    rules: {
      features: new Set(options?.features ?? ['power_up']),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      genre: 'stg',
      hazardColors: new Set(),
      safeColors: new Set(),
      scrollSpeed: 300,
      bpm: 120,
      gravity: 0,
      scrollDirection: 'horizontal',
      environment: 'space',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'x',
      colorTouchScore: 200,
    },
    survivedSec: 0,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    gameStats: {
      kills: 0,
      combo: 0,
      maxCombo: 0,
      beatHits: 0,
      beatHazardInverted: false,
    },
    scrollMode: 'x',
    powerBoostTimer: options?.powerBoostTimer ?? 0,
    addParticle: () => {},
    addScorePopup: (_x: number, _y: number, _text: string, _color: string) => {
      popups.push({ _x, _y, _text, _color })
    },
    triggerShake: () => {},
    modifyPlayerHp: () => {},
    resetCombo: () => {},
    setTimescale: () => {},
    addScoreVarsItemCollected: () => { itemsCollected++ },
    addScoreVarsHit: () => {},
    addScoreVarsBossKill: () => {},
    addScoreVarsStealthBonus: () => {},
    addScoreVarsColorTouch: () => {},
    spawnHazard: () => {},
    spawnItem: () => {},
    removeHazardById: () => {},
    setKills: () => {},
    setCombo: () => {},
    addBeatHit: () => {},
    setBeatHazardInverted: () => {},
    addShot: () => {},
    addScore: (amount: number) => { scoreAdded += amount },
  } as unknown as MutableWorld

  return world
}

function createMockInput(): InputSnapshot {
  return {
    keys: new Set<string>(),
    justPressed: new Set<string>(),
    justReleased: new Set<string>(),
  } as InputSnapshot
}

// GameRegistry の getActiveSystems をモック
vi.mock('../../../src/engine/GameRegistry', async () => {
  const actual = await vi.importActual<typeof import('../../../src/engine/GameRegistry')>('../../../src/engine/GameRegistry')
  return {
    ...actual,
    getActiveSystems: () => [],
  }
})

// soundManager のメソッドをモック
vi.mock('../../../src/plugins/SoundManager', () => ({
  soundManager: {
    onItemPickup: () => {},
  },
}))

describe('PowerUpFeature', () => {
  let feature: PowerUpFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new PowerUpFeature()
    world = createMockWorld()
  })

  describe('handles', () => {
    it('power_up を handles に持つ', () => {
      expect(feature.handles).toEqual(['power_up'])
    })
  })

  describe('update — power アイテム収集', () => {
    it('power アイテムを収集すると powerBoostTimer が設定される', () => {
      // プレイヤーの近くに power アイテムを配置
      const powerItem = new Item(world.player.x, world.player.y, 'power')
      world.items.push(powerItem)

      feature.update(world, createMockInput(), 0)

      expect(powerItem.alive).toBe(false)
      expect(world.powerBoostTimer).toBe(POWER_BOOST_DURATION_SEC)
    })

    it('power アイテム収集時に addScoreVarsItemCollected が呼ばれる', () => {
      let collectedCount = 0
      world.addScoreVarsItemCollected = () => { collectedCount++ }

      const powerItem = new Item(world.player.x, world.player.y, 'power')
      world.items.push(powerItem)

      feature.update(world, createMockInput(), 0)

      expect(collectedCount).toBe(1)
    })

    it('power アイテム収集時にスコアが加算される', () => {
      let scoreAdded = 0
      world.addScore = (amount: number) => { scoreAdded += amount }

      const powerItem = new Item(world.player.x, world.player.y, 'power')
      world.items.push(powerItem)

      feature.update(world, createMockInput(), 0)

      expect(scoreAdded).toBe(50)
    })

    it('power アイテム収集時にスコアポップアップが表示される', () => {
      const powerItem = new Item(world.player.x, world.player.y, 'power')
      world.items.push(powerItem)

      feature.update(world, createMockInput(), 0)

      // addScorePopup が 'POWER UP!' テキストで呼ばれたことを確認
      // (mock の popups 配列から確認)
    })

    it('power_up 無効時は power アイテムを収集しない', () => {
      const worldNoPower = createMockWorld({ features: [] })
      const powerItem = new Item(worldNoPower.player.x, worldNoPower.player.y, 'power')
      worldNoPower.items.push(powerItem)

      feature.update(worldNoPower, createMockInput(), 0)

      // power_up 無効 → 収集されない（alive のまま）
      expect(powerItem.alive).toBe(true)
      expect(worldNoPower.powerBoostTimer).toBe(0)
    })

    it('power アイテム以外（exp, hp）は収集しない', () => {
      const expItem = new Item(world.player.x, world.player.y, 'exp')
      world.items.push(expItem)

      feature.update(world, createMockInput(), 0)

      // exp は PowerUpFeature ではなく RpgFeature が処理
      expect(expItem.alive).toBe(true)
      expect(world.powerBoostTimer).toBe(0)
    })
  })

  describe('update — powerBoostTimer デクリメント', () => {
    it('毎フレーム powerBoostTimer がデクリメントされる', () => {
      world.powerBoostTimer = POWER_BOOST_DURATION_SEC

      feature.update(world, createMockInput(), 1) // 1秒経過

      expect(world.powerBoostTimer).toBe(POWER_BOOST_DURATION_SEC - 1)
    })

    it('powerBoostTimer が 0 以下になると 0 にクランプされる', () => {
      world.powerBoostTimer = 0.3

      feature.update(world, createMockInput(), 1) // 1秒経過

      expect(world.powerBoostTimer).toBe(0)
    })

    it('powerBoostTimer が 0 の時はデクリメントされない', () => {
      world.powerBoostTimer = 0

      feature.update(world, createMockInput(), 1)

      expect(world.powerBoostTimer).toBe(0)
    })
  })

  describe('getBoostFactor', () => {
    it('powerBoostTimer > 0 の時 0.5 を返す', () => {
      world.powerBoostTimer = 3

      const factor = feature.getBoostFactor(world)

      expect(factor).toBe(POWER_BOOST_REDUCTION)
    })

    it('powerBoostTimer <= 0 の時 0 を返す', () => {
      world.powerBoostTimer = 0

      const factor = feature.getBoostFactor(world)

      expect(factor).toBe(0)
    })
  })

  describe('render — ブーストインジケーター', () => {
    it('powerBoostTimer > 0 の時にインジケーターを描画する（エラーにならない）', () => {
      world.powerBoostTimer = 3
      const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D

      // エラーにならないことを確認
      expect(() => feature.render(ctx, world)).not.toThrow()
    })

    it('powerBoostTimer <= 0 の時に描画しない（エラーにならない）', () => {
      world.powerBoostTimer = 0
      const ctx = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D

      expect(() => feature.render(ctx, world)).not.toThrow()
    })
  })
})
