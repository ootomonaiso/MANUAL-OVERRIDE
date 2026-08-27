import { describe, it, expect, beforeEach } from 'vitest'
import { MeleeKillFeature } from '../../../src/game/systems/MeleeKillFeature'
import { NearMissComboFeature } from '../../../src/game/systems/NearMissComboFeature'
import { RpgFeature } from '../../../src/game/systems/RpgFeature'
import { Player, Hazard, Item } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'
import { SPAWN } from '../../../src/data/tunables'

// ─── ヘルパー: ジャンル ID → 有効 Feature 一覧 ─────────────────────

/** rpg/dungeon: melee_kill 有効な world */
function createMeleeKillWorld(): MutableWorld {
  const player = new Player(100, 500)
  const hazards: Hazard[] = []

  const gameStats = { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false }

  const world: MutableWorld = {
    player, hazards, items: [], bullets: [],
    cameraX: 1000, distance: 0, survivedSec: 0,
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
    cameraX: 1000, distance: 0, survivedSec: 0,
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
      world.rules.genre = 'rpg'
      feature.onInit(world)

      // cameraX=1000 の世界: スクリーン X=150 にハザードを配置
      const hazard = new Hazard(
        world.cameraX + 150,
        world.player.y, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.kills).toBeGreaterThan(0)
    })

    it('dungeon: melee_kill Feature で kills が 0 でなくなる', () => {
      const feature = new MeleeKillFeature()
      const world = createMeleeKillWorld()
      world.rules.genre = 'dungeon'
      feature.onInit(world)

      const hazard = new Hazard(
        world.cameraX + 150,
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

      const PLAYER_CY = 500 - 52 / 2
      const h = new Hazard(
        world.cameraX + 300, // スクリーンX=300 → 画面内
        PLAYER_CY - 20, // 垂直間隔 20px < threshold 50px
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(h)
      h.x = world.cameraX - 100 // 通過させる

      feature.onInit(world)
      feature.update(world, createMockInput(), 0)

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

// ─── JSON 直接検証: 7 ジャンルが新 Feature を enableFeatures に持つ ─

/**
 * ジャンル JSON ファイルを直接読み込み、melee_kill / near_miss_combo が
 * enableFeatures に含まれていることを検証する。
 *
 * これまで tests/unit/game/ScoreFormulaProducers.test.ts では
 * `rules.features` を手組みしていたため、JSON 定義と実際の挙動の
 * 乖離を検出できなかった。このテストで JSON 直接検証する。
 */
describe('JSON 直接検証: ジャンル定義と Feature enable 整合性', () => {
  // dynamic import で JSON を読み込む（Vitest 対応）
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rpgJson = require('../../../src/data/genres/rpg.json')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const dungeonJson = require('../../../src/data/genres/dungeon.json')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const platformerJson = require('../../../src/data/genres/platformer.json')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const runnerJson = require('../../../src/data/genres/runner.json')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const racingJson = require('../../../src/data/genres/racing.json')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sportsJson = require('../../../src/data/genres/sports.json')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rhythmJson = require('../../../src/data/genres/rhythm.json')

  it('rpg.json が melee_kill を enableFeatures に持つ', () => {
    expect(rpgJson.enableFeatures).toContain('melee_kill')
  })

  it('dungeon.json が melee_kill を enableFeatures に持つ', () => {
    expect(dungeonJson.enableFeatures).toContain('melee_kill')
  })

  it('platformer.json が near_miss_combo を enableFeatures に持つ', () => {
    expect(platformerJson.enableFeatures).toContain('near_miss_combo')
  })

  it('runner.json が near_miss_combo を enableFeatures に持つ', () => {
    expect(runnerJson.enableFeatures).toContain('near_miss_combo')
  })

  it('racing.json が near_miss_combo を enableFeatures に持つ', () => {
    expect(racingJson.enableFeatures).toContain('near_miss_combo')
  })

  it('sports.json が near_miss_combo を enableFeatures に持つ', () => {
    expect(sportsJson.enableFeatures).toContain('near_miss_combo')
  })

  it('rhythm.json が near_miss_combo を enableFeatures に持つ', () => {
    expect(rhythmJson.enableFeatures).toContain('near_miss_combo')
  })

  it('melee_kill Feature が rpg/dungeon の scoreFormula に kills 項を含んでいる', () => {
    // rpg: "exp * 2 + kills * 60 + distance * 0.3"
    expect(rpgJson.scoreFormula).toContain('kills')
    // dungeon: "exp * 3 + kills * 70 + itemsCollected * 60 + distance * 0.2"
    expect(dungeonJson.scoreFormula).toContain('kills')
  })

  it('near_miss_combo Feature が 5 ジャンルの scoreFormula に maxCombo 項を含んでいる', () => {
    expect(platformerJson.scoreFormula).toContain('maxCombo')
    expect(runnerJson.scoreFormula).toContain('maxCombo')
    expect(racingJson.scoreFormula).toContain('maxCombo')
    expect(sportsJson.scoreFormula).toContain('maxCombo')
    expect(rhythmJson.scoreFormula).toContain('maxCombo')
  })

  // ─── Issue #251: hack_slash に item_pickup が無いと EXP 経路が閉じる ─

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const hackSlashJson = require('../../../src/data/genres/hack_slash.json')

  it('hack_slash.json が item_pickup を enableFeatures に持つ', () => {
    expect(hackSlashJson.enableFeatures).toContain('item_pickup')
  })

  it('hack_slash.json の scoreFormula に exp 項を含んでいる', () => {
    // "kills * 90 + maxCombo * 200 + exp * 2 + bossKills * 400"
    expect(hackSlashJson.scoreFormula).toContain('exp')
  })

  it('hack_slash: item_pickup 有効で RpgFeature の update が exp 加算をゲートしない', () => {
    // RpgFeature は features.has('item_pickup') で update 全体を early-return する。
    // hack_slash.json の enableFeatures に item_pickup が含まれていれば、
    // exp アイテム収集経路が成立する。
    const feature = new RpgFeature()
    const world = createMeleeKillWorld()
    world.rules.features = new Set(['exp', 'item_pickup'])
    world.rules.genre = 'hack_slash'
    // cameraX=0 にしてアイテムとプレイヤーの座標を一致させる（RpgFeature は
    // item.rect.x - world.cameraX でスクリーン座標に変換する）
    world.cameraX = 0

    const expItem = new Item(world.player.x, world.player.y, 'exp')
    world.items.push(expItem)

    feature.update(world, createMockInput(), 0)

    expect(world.player.exp).toBe(SPAWN.expItemExpGain)
    expect(expItem.alive).toBe(false)
  })

  it('hack_slash: item_pickup 無効だと RpgFeature の exp 加算がゲートされる（回帰テスト）', () => {
    // item_pickup が features に無い場合、RpgFeature.update() は early return する。
    const feature = new RpgFeature()
    const world = createMeleeKillWorld()
    world.rules.features = new Set(['exp']) // item_pickup 無し
    world.rules.genre = 'hack_slash'
    world.cameraX = 0

    const expItem = new Item(world.player.x, world.player.y, 'exp')
    world.items.push(expItem)

    feature.update(world, createMockInput(), 0)

    // item_pickup 無効 → RpgFeature が update 全体をスキップ → exp は加算されない
    expect(world.player.exp).toBe(0)
    expect(expItem.alive).toBe(true)
  })
})
