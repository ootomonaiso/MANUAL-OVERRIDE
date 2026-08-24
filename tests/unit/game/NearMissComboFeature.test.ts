import { describe, it, expect, beforeEach } from 'vitest'
import { NearMissComboFeature } from '../../../src/game/systems/NearMissComboFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { NEAR_MISS } from '../../../src/data/tunables'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

// ─── モックヘルパー ────────────────────────────────────────────────

interface MockResult {
  world: MutableWorld
}

/**
 * テスト用の MutableWorld を構築する。
 *
 * ★ cameraX > 0（例: 1000）で設定することで、実ゲームの座標系ミスマッチバグを
 *   テストが検出できるようにする。ハザードは「cameraX + 画面X」のワールド座標で配置。
 */
function setupMockWorld(cameraX: number = 1000): MockResult {
  const player = new Player(400, 500) // X=400 はスクリーン座標（画面内）
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
    cameraX,
    distance: 0,
    survivedSec: 0,
    rules: {
      features: new Set(['near_miss_combo']),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'platformer',
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal',
      environment: 'sky',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'x',
      colorTouchScore: 200,
    },
    gameStats,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'x',

    setKills(_n: number): void { /* no-op */ },
    setCombo(n: number): void {
      gameStats.combo = n
      if (n > gameStats.maxCombo) gameStats.maxCombo = n
    },
    resetCombo(): void { gameStats.combo = 0 },

    removeHazardById(_h: Hazard): void { /* no-op */ },
    spawnHazard(_h: Hazard): void { /* no-op */ },
    spawnItem(_item: unknown): void { /* no-op */ },

    addScore(_amount: number): void { /* no-op */ },
    addScorePopup(_x: number, _y: number, _text: string, _color: string): void { /* no-op */ },
    triggerShake(_intensity: number): void { /* no-op */ },
    addParticle(_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size?: number): void { /* no-op */ },

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

  return { world }
}

function createMockInput(justPressed: Set<string> = new Set()): InputSnapshot {
  return {
    keys: new Set<string>(),
    justPressed,
    justReleased: new Set<string>(),
  } as InputSnapshot
}

// プレイヤーの Y 中心
const PLAYER_CENTER_Y = (): number => 500 - 52 / 2 // y=500, h=52 → center=474

// ─── テスト ────────────────────────────────────────────────────────

describe('NearMissComboFeature', () => {
  let feature: NearMissComboFeature
  let world: MutableWorld

  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())

    feature = new NearMissComboFeature()
    const result = setupMockWorld(1000) // ★ cameraX=1000 で実座標系を再現
    world = result.world
    feature.onInit(world)
  })

  describe('near-miss 検出', () => {
    it('接近回避（垂直間隔が閾値以内）で combo が +1 される', () => {
      // cameraX=1000 の世界で:
      //   プレイヤーはスクリーン X=400 → ワールド X=1400
      //   ハザードはワールド座標で配置
      //
      // 通過判定: hScreenX + h.w < p.x
      //   hScreenX = h.x - 1000
      //   p.x = 400
      //
      // ハザードをプレイヤーの右側（画面内）に配置:
      //   h.x = cameraX + 300 = 1300 → hScreenX = 300
      //   h.w = 30 → hScreenX + h.w = 330 < 400 (まだ通過していない)
      //
      // その後ハザードを通過位置へ移動:
      //   h.x = cameraX - 100 = 900 → hScreenX = -100
      //   hScreenX + h.w = -70 < 400 → 通過!
      const hazard = new Hazard(
        world.cameraX + 300, // ワールド座標: cameraX + 画面X=300
        PLAYER_CENTER_Y() - 30, // 垂直間隔を小さく
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      // ハザードをプレイヤーの左まで移動させる（通過させる）
      hazard.x = world.cameraX - 100 // ワールド座標: cameraX - 100

      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(1)
    })

    it('遠くの通過（垂直間隔が閾値超）では combo が増えない', () => {
      const hazard = new Hazard(
        world.cameraX + 300,
        PLAYER_CENTER_Y() - 200, // 垂直間隔 200px > threshold 50px
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      hazard.x = world.cameraX - 100

      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(0)
    })

    it('衝突しているハザードは near-miss としてカウントされない', () => {
      // プレイヤーと重なっているハザード（衝突判定で near-miss スキップされる）
      // p.x=400, p.w=36 → p.rect = {x:400, y:474, w:36, h:52}
      // ハザードをスクリーン座標でプレイヤーと重なる位置に配置
      const hazard = new Hazard(
        world.cameraX + 380, // スクリーンX=380 → p.x=400 と重なる
        PLAYER_CENTER_Y() - 10,
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      // 衝突している状態で update → near-miss としてカウントされない
      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(0)
    })

    it('連続した near-miss で combo が積み上がる', () => {
      const hazards: Hazard[] = []
      for (let i = 0; i < 3; i++) {
        const h = new Hazard(
          world.cameraX + 300 + i * 100, // ワールド座標
          PLAYER_CENTER_Y() - 20, // 閾値以内
          30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(h)
        hazards.push(h)
      }

      // 全ハザードを通過させる（スクリーン座標でプレイヤー左側へ）
      for (const h of hazards) {
        h.x = world.cameraX - 100
      }

      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(3)
    })

    it('maxCombo が combo よりも大きくならない（setCombo が自動更新）', () => {
      const hazard = new Hazard(
        world.cameraX + 300,
        PLAYER_CENTER_Y() - 20,
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)
      hazard.x = world.cameraX - 100

      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.maxCombo).toBeGreaterThanOrEqual(world.gameStats.combo)
    })

    it('isSafe のハザードは near-miss 対象外', () => {
      // 安全色のハザードは near-miss としてカウントされない
      const hazard = new Hazard(
        world.cameraX + 300,
        PLAYER_CENTER_Y() - 20,
        30, 30, 'green', '#00ff00', 'rect', 1, true, 0, 'right'
      )
      world.hazards.push(hazard)
      hazard.x = world.cameraX - 100

      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(0)
    })

    it('beatHazardInverted 時は isSafe が near-miss 対象になる', () => {
      world.gameStats.beatHazardInverted = true
      world.rules.features.add('beat_hazard')

      const hazard = new Hazard(
        world.cameraX + 300,
        PLAYER_CENTER_Y() - 20,
        30, 30, 'green', '#00ff00', 'rect', 1, true, 0, 'right'
      )
      world.hazards.push(hazard)
      hazard.x = world.cameraX - 100

      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(1)
    })
  })

  describe('onPlayerHit', () => {
    it('被弾（onPlayerHit）で combo がリセットされる', () => {
      // まず combo を 3 にする
      const hazards: Hazard[] = []
      for (let i = 0; i < 3; i++) {
        const h = new Hazard(
          world.cameraX + 300 + i * 100,
          PLAYER_CENTER_Y() - 20,
          30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(h)
        hazards.push(h)
      }
      for (const h of hazards) {
        h.x = world.cameraX - 100
      }
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.combo).toBe(3)

      // 被弾
      feature.onPlayerHit?.(world)

      expect(world.gameStats.combo).toBe(0)
    })
  })

  describe('減衰', () => {
    it('減衰時間経過で combo が 0 になる', () => {
      // まず combo を 2 にする
      const h1 = new Hazard(
        world.cameraX + 300,
        PLAYER_CENTER_Y() - 20,
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      const h2 = new Hazard(
        world.cameraX + 400,
        PLAYER_CENTER_Y() - 20,
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(h1, h2)
      h1.x = world.cameraX - 100
      h2.x = world.cameraX - 100
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.combo).toBe(2)

      // 減衰時間分以上経過させる（nearMissComboDecay = 2.0 秒）
      feature.update(world, createMockInput(), NEAR_MISS.nearMissComboDecay + 0.1)

      expect(world.gameStats.combo).toBe(0)
    })

    it('near-miss がない状態が継続すると combo が 0 に戻る', () => {
      // まず combo を 1 にする
      const h = new Hazard(
        world.cameraX + 300,
        PLAYER_CENTER_Y() - 20,
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(h)
      h.x = world.cameraX - 100
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.combo).toBe(1)

      // 減衰時間分以上経過
      feature.update(world, createMockInput(), NEAR_MISS.nearMissComboDecay + 0.5)

      expect(world.gameStats.combo).toBe(0)
    })

    it('combo が 0 の時は decayTimer がリセットされない（無界増加防止）', () => {
      // combo=0 の状態で update しても decayTimer が蓄積しないことを確認
      feature.update(world, createMockInput(), NEAR_MISS.nearMissComboDecay + 0.5)
      // 再度 update しても combo が 0 のまま（減衰タイマーがリセットされる）
      feature.update(world, createMockInput(), NEAR_MISS.nearMissComboDecay + 0.5)
      expect(world.gameStats.combo).toBe(0)
    })
  })

  describe('通過済みハザードの追跡（Set<Hazard>）', () => {
    it('オブジェクト参照で通過済みハザードを管理する', () => {
      // 同一ハザードオブジェクトを2回追加しても1回しかカウントされない
      const h = new Hazard(
        world.cameraX + 300,
        PLAYER_CENTER_Y() - 20,
        30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(h)
      h.x = world.cameraX - 100

      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.combo).toBe(1)

      // 同じハザードを再追加（配列に追加）しても、オブジェクト参照で既通過判定
      world.hazards.push(h)
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.combo).toBe(1) // 増えていない
    })
  })
})
