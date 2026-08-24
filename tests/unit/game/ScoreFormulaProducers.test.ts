import { describe, it, expect, beforeEach } from 'vitest'
import { MeleeKillFeature } from '../../../src/game/systems/MeleeKillFeature'
import { NearMissComboFeature } from '../../../src/game/systems/NearMissComboFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { resetRegistry, registerGenre, getGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

// ─── ヘルパー: ジャンル ID → 有効 Feature 一覧 ─────────────────────

/** rpg/dungeon: melee_kill 有効な world */
function createMeleeKillWorld(): MutableWorld {
  const player = new Player(100, 500)
  const hazards: Hazard[] = []

  const gameStats = { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false }

  const world: MutableWorld = {
    player, hazards, items: [], bullets: [],
    cameraX: 0, distance: 0, survivedSec: 0,
    rules: {
      features: new Set(['melee_kill']),
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(), safeColors: new Set(),
      genre: 'rpg', scrollSpeed: 300, bpm: 120, gravity: 1600,
      scrollDirection: 'horizontal', environment: 'dungeon',
      playerMaxHp: 3, timescale: 1, scrollAxis: 'x', colorTouchScore: 200,
    },
    gameStats,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'x',
    setKills(n: number): void { gameStats.kills = n },
    setCombo(n: number): void { gameStats.combo = n; if (n > gameStats.maxCombo) gameStats.maxCombo = n },
    resetCombo(): void { gameStats.combo = 0 },
    removeHazardById(h: Hazard): void { const i = world.hazards.indexOf(h); if (i >= 0) world.hazards.splice(i, 1) },
    spawnHazard(_h: Hazard): void {}, spawnItem(_i: unknown): void {},
    addScore(_n: number): void {}, addScorePopup(_x: number, _y: number, _t: string, _c: string): void {},
    triggerShake(_n: number): void {}, addParticle(_x: number, _y: number, _vx: number, _vy: number, _l: number, _c: string, _s?: number): void {},
    modifyPlayerHp(_d: number): void {}, setTimescale(_s: number, _d?: number): void {},
    getHazardScreenX(h: Hazard): number { return h.x - world.cameraX },
    getPlayerWorldX(): number { return world.player.x + world.cameraX },
    addBeatHit(): void {}, setBeatHazardInverted(_v: boolean): void {},
    addShot(): void {}, addScoreVarsHit(): void {}, addScoreVarsItemCollected(): void {},
    addScoreVarsBossKill(): void {}, addScoreVarsStealthBonus(_n: number): void {}, addScoreVarsColorTouch(): void {},
  } as unknown as MutableWorld

  return world
}

/** platformer/runner/racing/sports/rhythm: near_miss_combo 有効な world */
function createNearMissWorld(): MutableWorld {
  const player = new Player(400, 500)
  const hazards: Hazard[] = []

  const gameStats = { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false }

  const world: MutableWorld = {
    player, hazards, items: [], bullets: [],
    cameraX: 0, distance: 0, survivedSec: 0,
    rules: {
      features: new Set(['near_miss_combo']),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(), safeColors: new Set(),
      genre: 'platformer', scrollSpeed: 300, bpm: 120, gravity: 1600,
      scrollDirection: 'horizontal', environment: 'sky',
      playerMaxHp: 3, timescale: 1, scrollAxis: 'x', colorTouchScore: 200,
    },
    gameStats,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'x',
    setKills(_n: number): void {},
    setCombo(n: number): void { gameStats.combo = n; if (n > gameStats.maxCombo) gameStats.maxCombo = n },
    resetCombo(): void { gameStats.combo = 0 },
    removeHazardById(_h: Hazard): void {},
    spawnHazard(_h: Hazard): void {}, spawnItem(_i: unknown): void {},
    addScore(_n: number): void {}, addScorePopup(_x: number, _y: number, _t: string, _c: string): void {},
    triggerShake(_n: number): void {}, addParticle(_x: number, _y: number, _vx: number, _vy: number, _l: number, _c: string, _s?: number): void {},
    modifyPlayerHp(_d: number): void {}, setTimescale(_s: number, _d?: number): void {},
    getHazardScreenX(h: Hazard): number { return h.x - world.cameraX },
    getPlayerWorldX(): number { return world.player.x + world.cameraX },
    addBeatHit(): void {}, setBeatHazardInverted(_v: boolean): void {},
    addShot(): void {}, addScoreVarsHit(): void {}, addScoreVarsItemCollected(): void {},
    addScoreVarsBossKill(): void {}, addScoreVarsStealthBonus(_n: number): void {}, addScoreVarsColorTouch(): void {},
  } as unknown as MutableWorld

  return world
}

function createMockInput(justPressed: Set<string> = new Set()): InputSnapshot {
  return { keys: new Set(), justPressed, justReleased: new Set() } as InputSnapshot
}

// ─── テスト ────────────────────────────────────────────────────────

describe('統合: 7 ジャンルの scoreFormula producer が live になる', () => {
  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())
  })

  describe('rpg / dungeon — melee_kill producer', () => {
    it('rpg: melee_kill Feature で kills が 0 でなくなる', () => {
      const feature = new MeleeKillFeature()
      const world = createMeleeKillWorld()
      // rules.genre を rpg に設定
      world.rules.genre = 'rpg'
      feature.onInit(world)

      // melee 範囲内にハザードを配置
      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      // 攻撃
      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)

      // kills > 0 なら scoreFormula の「kills * 60」項が live
      expect(world.gameStats.kills).toBeGreaterThan(0)
    })

    it('dungeon: melee_kill Feature で kills が 0 でなくなる', () => {
      const feature = new MeleeKillFeature()
      const world = createMeleeKillWorld()
      world.rules.genre = 'dungeon'
      feature.onInit(world)

      const hazard = new Hazard(
        world.player.x + world.player.w + 10,
        world.player.y, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.kills).toBeGreaterThan(0)
    })
  })

  describe('platformer / runner / racing / sports / rhythm — near_miss_combo producer', () => {
    function verifyNearMissCombo(genreId: string): void {
      const feature = new NearMissComboFeature()
      const world = createNearMissWorld()
      world.rules.genre = genreId

      const PLAYER_CY = 500 - 52 / 2 // player center Y
      const h = new Hazard(
        world.player.x + 200,
        PLAYER_CY - 20, // 垂直間隔 20px < threshold 50px
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      h.passId = 1
      world.hazards.push(h)
      h.x = world.player.x - 50 // 通過させる

      feature.onInit(world)
      feature.update(world, createMockInput(), 0)

      // combo > 0 かつ maxCombo > 0 なら scoreFormula の「combo * N」項が live
      expect(world.gameStats.combo).toBeGreaterThan(0)
      expect(world.gameStats.maxCombo).toBeGreaterThan(0)
    }

    it('platformer: near_miss_combo で combo/maxCombo が 0 でなくなる', () => {
      verifyNearMissCombo('platformer')
    })

    it('runner: near_miss_combo で combo/maxCombo が 0 でなくなる', () => {
      verifyNearMissCombo('runner')
    })

    it('racing: near_miss_combo で combo/maxCombo が 0 でなくなる', () => {
      verifyNearMissCombo('racing')
    })

    it('sports: near_miss_combo で combo/maxCombo が 0 でなくなる', () => {
      verifyNearMissCombo('sports')
    })

    it('rhythm: near_miss_combo で combo/maxCombo が 0 でなくなる', () => {
      verifyNearMissCombo('rhythm')
    })
  })
})
