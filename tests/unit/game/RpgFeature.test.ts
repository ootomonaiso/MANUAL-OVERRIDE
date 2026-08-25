import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RpgFeature } from '../../../src/game/systems/RpgFeature'
import { Player, Item } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { SPAWN } from '../../../src/data/tunables'

// テスト用の最小限のMutableWorldモック
function createMockWorld(options?: {
  features?: string[]
  controls?: { shoot?: string }
}): MutableWorld {
  const player = new Player(100, 500)
  const hazards: unknown[] = []
  const items: Item[] = []
  const particles: unknown[] = []
  const popups: unknown[] = []
  let shakeAmount = 0

  const world: MutableWorld = {
    player,
    hazards,
    items,
    cameraX: 0,
    distance: 0,
    rules: {
      features: new Set(options?.features ?? ['item_pickup']),
      controls: options?.controls ?? { shoot: 'x' },
      genre: 'rpg',
      hazardColors: new Set(),
      safeColors: new Set(),
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal',
      environment: 'plain',
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
    addParticle: (_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size: number) => {
      particles.push({ _x, _y, _vx, _vy, _life, _color, _size })
    },
    addScorePopup: (_x: number, _y: number, _text: string, _color: string) => {
      popups.push({ _x, _y, _text, _color })
    },
    triggerShake: (amount: number) => {
      shakeAmount = amount
    },
    modifyPlayerHp: (delta: number) => {
      player.hp += delta
      if (player.hp < 0) player.hp = 0
    },
    resetCombo: () => {},
    setTimescale: () => {},
    addScoreVarsItemCollected: () => {},
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
    getHazardScreenX: (h) => h.x,
    getPlayerWorldX: () => player.x,
    addScore: () => {},
  } as unknown as MutableWorld

  return world
}

function createMockInput(justPressed: Set<string> = new Set()): InputSnapshot {
  return {
    keys: new Set<string>(),
    justPressed,
    justReleased: new Set<string>(),
  } as InputSnapshot
}

// GameRegistry の getActiveSystems をモック（onItemPickup フックが呼ばれないようにする）
vi.mock('../../../src/engine/GameRegistry', async () => {
  const actual = await vi.importActual<typeof import('../../../src/engine/GameRegistry')>('../../../src/engine/GameRegistry')
  return {
    ...actual,
    getActiveSystems: () => [],
  }
})

// soundManager のメソッドをモック（エラーを出さないようにする）
vi.mock('../../../src/plugins/SoundManager', () => ({
  soundManager: {
    onItemPickup: () => {},
    onMeleeAttack: () => {},
    onMeleeHit: () => {},
    onShieldAbsorb: () => {},
    onHungerDamage: () => {},
    onLevelUp: () => {},
  },
}))

describe('RpgFeature', () => {
  let feature: RpgFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new RpgFeature()
    world = createMockWorld()
  })

  describe('update — item_pickup', () => {
    it('exp アイテムを収集して exp を付与する', () => {
      const expItem = new Item(world.player.x, world.player.y, 'exp')
      world.items.push(expItem)

      feature.update(world, createMockInput(), 0)

      expect(world.player.exp).toBe(SPAWN.expItemExpGain)
      expect(expItem.alive).toBe(false)
    })

    it('hp アイテムを収集して HP を回復する', () => {
      world.player.hp = 1
      const hpItem = new Item(world.player.x, world.player.y, 'hp')
      world.items.push(hpItem)

      feature.update(world, createMockInput(), 0)

      expect(world.player.hp).toBe(2)
      expect(hpItem.alive).toBe(false)
    })

    it('hp アイテムは HP 満タン時は回復しない', () => {
      world.player.hp = world.player.maxHp
      const hpItem = new Item(world.player.x, world.player.y, 'hp')
      world.items.push(hpItem)

      feature.update(world, createMockInput(), 0)

      expect(world.player.hp).toBe(world.player.maxHp)
      expect(hpItem.alive).toBe(false)
    })

    it('food アイテムは消費しない（alive のまま残る）', () => {
      const food = new Item(world.player.x, world.player.y, 'food')
      world.items.push(food)

      feature.update(world, createMockInput(), 0)

      // RpgFeature は food を消費しない → alive のまま
      expect(food.alive).toBe(true)
    })

    it('weapon アイテムは消費しない（alive のまま残る）', () => {
      const weapon = new Item(world.player.x, world.player.y, 'weapon')
      world.items.push(weapon)

      feature.update(world, createMockInput(), 0)

      // RpgFeature は weapon を消費しない → alive のまま
      expect(weapon.alive).toBe(true)
    })

    it('item_pickup 無効時は一切処理しない', () => {
      const worldNoPickup = createMockWorld({ features: [] })
      const expItem = new Item(worldNoPickup.player.x, worldNoPickup.player.y, 'exp')
      worldNoPickup.items.push(expItem)

      feature.update(worldNoPickup, createMockInput(), 0)

      expect(expItem.alive).toBe(true)
      expect(worldNoPickup.player.exp).toBe(0)
    })

    it('パルスアニメーションは全アイテムで継続（food/weapon も）', () => {
      const food = new Item(world.player.x, world.player.y, 'food')
      const initialPulse = food.pulse
      world.items.push(food)

      feature.update(world, createMockInput(), 0.1)

      // pulse は増加している（alive に関係なくパルスアニメは全アイテムで継続）
      expect(food.pulse).toBeGreaterThan(initialPulse)
      expect(food.alive).toBe(true)
    })

    it('収集時に加算変数がインクリメントされる', () => {
      let collectedCount = 0
      world.addScoreVarsItemCollected = () => { collectedCount++ }

      const expItem = new Item(world.player.x, world.player.y, 'exp')
      world.items.push(expItem)

      feature.update(world, createMockInput(), 0)

      expect(collectedCount).toBe(1)
    })

    it('収集時に加算スコアが反映される', () => {
      let scoreAdded = 0
      world.addScore = (amount: number) => { scoreAdded += amount }

      const expItem = new Item(world.player.x, world.player.y, 'exp')
      world.items.push(expItem)

      feature.update(world, createMockInput(), 0)

      expect(scoreAdded).toBe(SPAWN.expItemScore)
    })
  })
})
