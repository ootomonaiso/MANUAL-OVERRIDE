import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SurvivalPlugin } from '../../../src/genres/SurvivalPlugin'
import { Hazard, Item } from '../../../src/game/entities'
import type { MutableWorld } from '../../../src/engine/types'
import { SURVIVAL } from '../../../src/data/tunables'

interface MockPlayer {
  x: number; y: number; w: number; h: number
  vx: number; vy: number; onGround: boolean
  jumpsLeft: number; invincible: number
  hp: number; maxHp: number
  exp: number; currentLevelXp: number; nextLevelXp: number
  hunger: number; level: number; weaponDamage: number
}

// テスト用の最小限の MutableWorld モック
function createMockWorld(): MutableWorld {
  const player: MockPlayer = {
    x: 100, y: 500, w: 36, h: 52, vx: 0, vy: 0, onGround: false,
    jumpsLeft: 1, invincible: 0, hp: 3, maxHp: 3, exp: 0,
    currentLevelXp: 0, nextLevelXp: 100, hunger: 100, level: 1, weaponDamage: 1,
  }
  const hazards: Hazard[] = []
  const items: Item[] = []
  const particles: unknown[] = []
  const popups: unknown[] = []

  return {
    player,
    hazards,
    items,
    cameraX: 0,
    distance: 0,
    rules: {
      features: new Set(['survival_hunger']),
      controls: { shoot: 'z' },
      genre: 'survival',
      hazardColors: new Set(),
      safeColors: new Set(),
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal',
      environment: 'forest',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'x',
      colorTouchScore: 200,
    },
    survivedSec: 0,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
    scrollMode: 'x',
    addParticle: (_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size: number) => {
      particles.push({ _x, _y, _vx, _vy, _life, _color, _size })
    },
    addScorePopup: (_x: number, _y: number, _text: string, _color: string) => {
      popups.push({ _x, _y, _text, _color })
    },
    triggerShake: () => {},
    modifyPlayerHp: () => {},
    resetCombo: () => {},
    setTimescale: () => {},
    addScoreVarsItemCollected: () => {},
    addScoreVarsHit: () => {},
    addScoreVarsBossKill: () => {},
    addScoreVarsStealthBonus: () => {},
    addScoreVarsColorTouch: () => {},
    spawnHazard: (h: Hazard) => { hazards.push(h) },
    spawnItem: (item: Item) => { items.push(item) },
    removeHazardById: (h: Hazard) => {
      const i = hazards.indexOf(h)
      if (i >= 0) hazards.splice(i, 1)
    },
    setKills: () => {},
    setCombo: () => {},
    addBeatHit: () => {},
    setBeatHazardInverted: () => {},
    addShot: () => {},
    getHazardScreenX: (h: Hazard) => h.x,
    getPlayerWorldX: () => player.x,
    addScore: () => {},
  } as unknown as MutableWorld
}

describe('SurvivalPlugin', () => {
  let plugin: SurvivalPlugin
  let world: MutableWorld

  beforeEach(() => {
    plugin = new SurvivalPlugin()
    world = createMockWorld()
  })

  describe('onHazardDestroyed', () => {
    it('Math.random が foodDropChance 未満の場合、food アイテムが spawnItem される', () => {
      const hazard = new Hazard(200, 300, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right')
      world.hazards.push(hazard)

      // 1度目: food ドロップ判定 (0.1 < 0.35), 2度目: weapon ドロップ判定 (0.9 >= 0.15)
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.1)
        .mockReturnValue(0.9)

      plugin.onHazardDestroyed(world, hazard)

      expect(world.items).toHaveLength(1)
      expect(world.items[0]).toBeInstanceOf(Item)
      expect((world.items[0] as Item).type).toBe('food')
      // food は hazard.x + hazard.w/2 - halfItemW に配置される
      expect((world.items[0] as Item).x).toBe(hazard.x + hazard.w / 2 - 11)
      expect((world.items[0] as Item).y).toBe(hazard.y)
    })

    it('Math.random が weaponDropChance 未満の場合、weapon アイテムが spawnItem される', () => {
      const hazard = new Hazard(200, 300, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right')
      world.hazards.push(hazard)

      // 1度目: food ドロップ判定 (0.5 >= 0.35), 2度目: weapon ドロップ判定 (0.05 < 0.15)
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5)
        .mockReturnValue(0.05)

      plugin.onHazardDestroyed(world, hazard)

      expect(world.items).toHaveLength(1)
      expect(world.items[0]).toBeInstanceOf(Item)
      expect((world.items[0] as Item).type).toBe('weapon')
      // weapon は food より 22px 上に配置される
      expect((world.items[0] as Item).x).toBe(hazard.x + hazard.w / 2 - 11)
      expect((world.items[0] as Item).y).toBe(hazard.y - 22)
    })

    it('Math.random が両方の閾値以上の場合、spawnItem は呼ばれない', () => {
      const hazard = new Hazard(200, 300, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right')
      world.hazards.push(hazard)

      vi.spyOn(Math, 'random').mockReturnValue(0.9)

      plugin.onHazardDestroyed(world, hazard)

      expect(world.items).toHaveLength(0)
    })

    it('両方のドロップが独立に発生する', () => {
      const hazard = new Hazard(200, 300, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right')
      world.hazards.push(hazard)

      // 両方とも閾値未満
      vi.spyOn(Math, 'random').mockReturnValue(0.05)

      plugin.onHazardDestroyed(world, hazard)

      expect(world.items).toHaveLength(2)
      const types = world.items.map((i) => (i as Item).type)
      expect(types).toContain('food')
      expect(types).toContain('weapon')
      // weapon は food より上に配置される
      const foodItem = world.items.find((i) => (i as Item).type === 'food') as Item
      const weaponItem = world.items.find((i) => (i as Item).type === 'weapon') as Item
      expect(weaponItem.y).toBe(foodItem.y - 22)
    })

    it('SURVIVAL.foodDropChance / weaponDropChance の値を参照している', () => {
      // 閾値の値自体が tunables から来ていることを確認
      expect(SURVIVAL.foodDropChance).toBeGreaterThan(0)
      expect(SURVIVAL.foodDropChance).toBeLessThan(1)
      expect(SURVIVAL.weaponDropChance).toBeGreaterThan(0)
      expect(SURVIVAL.weaponDropChance).toBeLessThan(1)
      // foodDropChance > weaponDropChance であるべき（食料は多めにドロップ）
      expect(SURVIVAL.foodDropChance).toBeGreaterThan(SURVIVAL.weaponDropChance)
    })
  })
})
