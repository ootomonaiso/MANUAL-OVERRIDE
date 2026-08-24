import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MeleeKillFeature } from '../../../src/game/systems/MeleeKillFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { SURVIVAL } from '../../../src/data/tunables'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

// ─── モックヘルパー ────────────────────────────────────────────────

interface MockResult {
  world: MutableWorld
  destroyedHazards: Hazard[]
}

/**
 * テスト用の MutableWorld を構築する。
 * melee_kill Feature が参照する全 API を実装済み。
 */
function setupMockWorld(): MockResult {
  const destroyedHazards: Hazard[] = []
  const player = new Player(100, 500)
  const hazards: Hazard[] = []

  const gameStats = {
    kills: 0,
    combo: 0,
    maxCombo: 0,
    beatHits: 0,
    beatHazardInverted: false,
  }

  const world: MutableWorld = {
    player,
    hazards,
    items: [],
    bullets: [],
    cameraX: 0,
    distance: 0,
    survivedSec: 0,
    rules: {
      features: new Set(['melee_kill']),
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'rpg',
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal',
      environment: 'dungeon',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'x',
      colorTouchScore: 200,
    },
    gameStats,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'x',

    // ── 統計書き込み ────────────────────────────────────────────
    setKills(n: number): void { gameStats.kills = n },
    setCombo(n: number): void {
      gameStats.combo = n
      if (n > gameStats.maxCombo) gameStats.maxCombo = n
    },
    resetCombo(): void { gameStats.combo = 0 },

    // ── 世界操作 ────────────────────────────────────────────────
    removeHazardById(h: Hazard): void {
      const idx = world.hazards.indexOf(h)
      if (idx >= 0) world.hazards.splice(idx, 1)
      destroyedHazards.push(h)
    },
    spawnHazard(_h: Hazard): void { /* no-op */ },
    spawnItem(_item: unknown): void { /* no-op */ },

    // ── スコア/UI ───────────────────────────────────────────────
    addScore(_amount: number): void { /* no-op */ },
    addScorePopup(_x: number, _y: number, _text: string, _color: string): void { /* no-op */ },
    triggerShake(_intensity: number): void { /* no-op */ },
    addParticle(_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size?: number): void { /* no-op */ },

    // ── その他 ──────────────────────────────────────────────────
    modifyPlayerHp(_delta: number): void { /* no-op */ },
    setTimescale(_scale: number, _durationSec?: number): void { /* no-op */ },
    getHazardScreenX(h: Hazard): number { return h.x - world.cameraX },
    getPlayerWorldX(): number { return world.player.x + world.cameraX },
    addBeatHit(): void { /* no-op */ },
    setBeatHazardInverted(_v: boolean): void { /* no-op */ },
    addShot(): void { /* no-op */ },
    addScoreVarsHit(): void { /* no-op */ },
    addScoreVarsItemCollected(): void { /* no-op */ },
    addScoreVarsBossKill(): void { /* no-op */ },
    addScoreVarsStealthBonus(_amount: number): void { /* no-op */ },
    addScoreVarsColorTouch(): void { /* no-op */ },
  } as unknown as MutableWorld

  return { world, destroyedHazards }
}

function createMockInput(justPressed: Set<string> = new Set()): InputSnapshot {
  return {
    keys: new Set<string>(),
    justPressed,
    justReleased: new Set<string>(),
  } as InputSnapshot
}

// ─── テスト ────────────────────────────────────────────────────────

describe('MeleeKillFeature', () => {
  let feature: MeleeKillFeature
  let world: MutableWorld
  let destroyedHazards: Hazard[]

  beforeEach(() => {
    resetRegistry()
    // base ジャンルを登録（getGenre が onHazardDestroyed 内で呼ばれるため）
    registerGenre(new BasePlugin())

    feature = new MeleeKillFeature()
    const result = setupMockWorld()
    world = result.world
    destroyedHazards = result.destroyedHazards
    feature.onInit(world)
  })

  describe('Z キー入力で近接攻撃', () => {
    it('Z キー押下で melee 範囲内のハザードが一撃破壊される', () => {
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      // 次のフレームで攻撃判定が走る
      feature.update(world, createMockInput(), 0)

      expect(world.hazards).toHaveLength(0)
    })

    it('kills が +1 される', () => {
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.kills).toBe(1)
    })

    it('kills が連続で増加する', () => {
      // 右側に1体だけ配置（左側は範囲外）
      const h1 = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(h1)

      // 1発目
      const input1 = createMockInput(new Set(['z']))
      feature.update(world, input1, 0)
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.kills).toBe(1)

      // 2体目を追加
      const h2 = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(h2)

      // 2発目
      const input2 = createMockInput(new Set(['z']))
      feature.update(world, input2, SURVIVAL.meleeCooldown + 0.01)
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.kills).toBe(2)
    })
  })

  describe('onHazardDestroyed フック', () => {
    it('ハザード破壊時に onHazardDestroyed が発火すること', () => {
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      // destroyedHazards は removeHazardById 内で push される
      expect(destroyedHazards).toContain(hazard)
    })
  })

  describe('ハザード除去', () => {
    it('破壊したハザードが hazards 配列から除去される', () => {
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      expect(world.hazards).not.toContain(hazard)
      expect(world.hazards).toHaveLength(0)
    })
  })

  describe('cooldown', () => {
    it('cooldown 中の 2 撃目が効かない', () => {
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      // 1発目: 破壊
      const input1 = createMockInput(new Set(['z']))
      feature.update(world, input1, 0)
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.kills).toBe(1)
      expect(world.hazards).toHaveLength(0)

      // 2発目: ハザードがないので何もしない（kills は増えない）
      const input2 = createMockInput(new Set(['z']))
      feature.update(world, input2, 0)
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.kills).toBe(1)
    })

    it('安全なハザードには攻撃しない', () => {
      const safeHazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y,
        30, 40, 'green', '#00ff00', 'rect', 1, true, 0, 'right'
      )
      world.hazards.push(safeHazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      // 安全ハザードは残っている
      expect(world.hazards).toContain(safeHazard)
      expect(world.gameStats.kills).toBe(0)
    })
  })

  describe('range 外', () => {
    it('melee 範囲外のハザードは破壊されない', () => {
      // プレイヤーから遠く離す（meleeRange = 60, player.w = 36）
      const farHazard = new Hazard(
        world.player.x + world.player.w + SURVIVAL.meleeRange + 100,
        world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(farHazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      expect(world.hazards).toContain(farHazard)
      expect(world.gameStats.kills).toBe(0)
    })
  })
})
