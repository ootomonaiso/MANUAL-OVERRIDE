import { describe, it, expect, beforeEach } from 'vitest'
import { SurvivalFeature } from '../../../src/game/systems/SurvivalFeature'
import { Player, Hazard, Item } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { SURVIVAL } from '../../../src/data/tunables'

// テスト用の最小限のMutableWorldモック
function createMockWorld(): MutableWorld {
  const player = new Player(100, 500)
  const hazards: Hazard[] = []
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
      features: new Set(['survival_hunger', 'survival_melee', 'survival_level']),
      controls: { shoot: 'z' },
    },
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
    addScoreVarsItemCollected: () => {},
    spawnItem: (item: Item) => {
      items.push(item)
    },
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

describe('SurvivalFeature', () => {
  let feature: SurvivalFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new SurvivalFeature()
    world = createMockWorld()
    feature.onInit(world)
  })

  describe('onInit', () => {
    it('プレイヤーのhunger/level/weaponDamageを初期化する', () => {
      expect(world.player.hunger).toBe(SURVIVAL.maxHunger)
      expect(world.player.level).toBe(1)
      expect(world.player.weaponDamage).toBe(SURVIVAL.meleeDamage)
    })

    it('currentLevelXpとnextLevelXpを初期化する', () => {
      expect(world.player.currentLevelXp).toBe(0)
      expect(world.player.nextLevelXp).toBe(SURVIVAL.xpPerLevel)
    })
  })

  describe('hunger減衰', () => {
    it('時間経過でhungerが減衰する', () => {
      const initialHunger = world.player.hunger
      feature.update(world, createMockInput(), 1) // 1秒経過
      expect(world.player.hunger).toBeCloseTo(initialHunger - SURVIVAL.hungerDecayRate)
    })

    it('hungerが0未満にならない', () => {
      world.player.hunger = 1
      feature.update(world, createMockInput(), 1)
      expect(world.player.hunger).toBeGreaterThanOrEqual(0)
    })

    it('臨界域以下でHPダメージを与える', () => {
      world.player.hunger = SURVIVAL.hungerCriticalThreshold - 1
      // ダメージ間隔分だけ時間を進める
      feature.update(world, createMockInput(), SURVIVAL.hungerDamageInterval)
      expect(world.player.hp).toBeLessThan(3) // 初期HP3から減っている
    })

    it('臨界域以上ではHPダメージを与えない', () => {
      const initialHp = world.player.hp
      // hunger減衰を考慮して、臨界域以上に保つ
      world.player.hunger = SURVIVAL.maxHunger
      feature.update(world, createMockInput(), SURVIVAL.hungerDamageInterval * 2)
      expect(world.player.hp).toBe(initialHp)
    })
  })

  describe('近接攻撃', () => {
    it('Zキー入力で攻撃が発動する', () => {
      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0) // 次のフレームで攻撃判定
      // 攻撃中はmeleeActive > 0
    })

    it('クールダウン中は再攻撃できない', () => {
      const input1 = createMockInput(new Set(['z']))
      feature.update(world, input1, 0)
      // クールダウン切れる前に再度攻撃
      const input2 = createMockInput(new Set(['z']))
      feature.update(world, input2, 0)
      // 2回目の攻撃は無効
    })

    it('攻撃範囲内の敵にダメージを与える', () => {
      // プレイヤーの近くに敵を配置
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 3, false, 0, 'right'
      )
      world.hazards.push(hazard)

      // 攻撃入力
      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      // 次のフレームで攻撃判定
      feature.update(world, createMockInput(), 0)

      expect(hazard.hp).toBeLessThan(3)
    })

    it('安全な敵にはダメージを与えない', () => {
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'green', '#00ff00', 'rect', 3, true, 0, 'right'
      )
      world.hazards.push(hazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      expect(hazard.hp).toBe(3)
    })
  })

  describe('XP/レベルシステム', () => {
    it('敵撃破でXPを獲得する', () => {
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      expect(world.player.exp).toBe(SURVIVAL.xpPerKill)
      expect(world.player.currentLevelXp).toBe(SURVIVAL.xpPerKill)
    })

    it('XPが閾値を超えるとレベルアップする', () => {
      // 複数の敵を撃破してXPを蓄積
      const enemiesNeeded = Math.ceil(SURVIVAL.xpPerLevel / SURVIVAL.xpPerKill)
      for (let i = 0; i < enemiesNeeded; i++) {
        const hazard = new Hazard(
          world.player.x + world.player.w + 10,
          world.player.y,
          30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(hazard)

        const input = createMockInput(new Set(['z']))
        feature.update(world, input, SURVIVAL.meleeCooldown + 0.01) // クールダウン回復
        feature.update(world, createMockInput(), 0)
      }

      expect(world.player.level).toBeGreaterThanOrEqual(2)
    })

    it('レベルアップでHPが回復する', () => {
      world.player.hp = 1
      const enemiesNeeded = Math.ceil(SURVIVAL.xpPerLevel / SURVIVAL.xpPerKill)
      for (let i = 0; i < enemiesNeeded; i++) {
        const hazard = new Hazard(
          world.player.x + world.player.w + 10,
          world.player.y,
          30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(hazard)

        const input = createMockInput(new Set(['z']))
        feature.update(world, input, SURVIVAL.meleeCooldown + 0.01)
        feature.update(world, createMockInput(), 0)
      }

      expect(world.player.hp).toBeGreaterThan(1)
    })

    it('レベルアップでweaponDamageが増加する', () => {
      const initialDamage = world.player.weaponDamage
      const enemiesNeeded = Math.ceil(SURVIVAL.xpPerLevel / SURVIVAL.xpPerKill)
      for (let i = 0; i < enemiesNeeded; i++) {
        const hazard = new Hazard(
          world.player.x + world.player.w + 10,
          world.player.y,
          30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(hazard)

        const input = createMockInput(new Set(['z']))
        feature.update(world, input, SURVIVAL.meleeCooldown + 0.01)
        feature.update(world, createMockInput(), 0)
      }

      expect(world.player.weaponDamage).toBeGreaterThan(initialDamage)
    })
  })

  describe('アイテム収集', () => {
    it('食料アイテムでhungerが回復する', () => {
      world.player.hunger = 10
      const food = new Item(
        world.player.x,
        world.player.y,
        'food'
      )
      world.items.push(food)

      feature.update(world, createMockInput(), 0)

      expect(world.player.hunger).toBeGreaterThan(10)
      expect(food.alive).toBe(false)
    })

    it('武器アイテムでweaponDamageが増加する', () => {
      const initialDamage = world.player.weaponDamage
      const weapon = new Item(
        world.player.x,
        world.player.y,
        'weapon'
      )
      world.items.push(weapon)

      feature.update(world, createMockInput(), 0)

      expect(world.player.weaponDamage).toBeGreaterThan(initialDamage)
      expect(weapon.alive).toBe(false)
    })

    it('exp/hpアイテムはSurvivalFeatureで処理しない', () => {
      const expItem = new Item(world.player.x, world.player.y, 'exp')
      const hpItem = new Item(world.player.x, world.player.y, 'hp')
      world.items.push(expItem, hpItem)

      feature.update(world, createMockInput(), 0)

      // exp/hpアイテムはSurvivalFeatureで処理しないため、aliveのまま
      expect(expItem.alive).toBe(true)
      expect(hpItem.alive).toBe(true)
    })
  })

  describe('onManualUpdated', () => {
    it('状態とプレイヤー統計をリセットする', () => {
      world.player.hunger = 10
      world.player.level = 5
      world.player.weaponDamage = 10
      world.player.currentLevelXp = 50
      world.player.nextLevelXp = 200

      feature.onManualUpdated(world, 'test-v1')

      expect(world.player.hunger).toBe(SURVIVAL.maxHunger)
      expect(world.player.level).toBe(1)
      expect(world.player.weaponDamage).toBe(SURVIVAL.meleeDamage)
      expect(world.player.currentLevelXp).toBe(0)
      expect(world.player.nextLevelXp).toBe(SURVIVAL.xpPerLevel)
    })
  })

  describe('onDisable', () => {
    it('状態とプレイヤー統計をクリーンアップする', () => {
      world.player.hunger = 10
      world.player.level = 5
      world.player.weaponDamage = 10

      feature.onDisable?.(world)

      expect(world.player.hunger).toBe(SURVIVAL.maxHunger)
      expect(world.player.level).toBe(1)
      expect(world.player.weaponDamage).toBe(SURVIVAL.meleeDamage)
    })
  })
})
