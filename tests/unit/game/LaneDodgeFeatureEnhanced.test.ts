import { describe, it, expect, beforeEach } from 'vitest'
import { LaneDodgeFeature } from '../../../src/game/systems/LaneDodgeFeature'
import { Player } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

function setupMockWorld(canvasH: number = 600): MutableWorld {
  const player = new Player(100, canvasH - 60)
  const gameStats = {
    kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false,
  }

  const keys = new Set<string>()
  const justPressed = new Set<string>()
  const justReleased = new Set<string>()

  const world: MutableWorld = {
    player,
    hazards: [],
    items: [],
    bullets: [],
    cameraX: 0,
    distance: 0,
    survivedSec: 0,
    rules: {
      features: new Set(['lane_dodge']),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', moveUp: 'ArrowUp', moveDown: 'ArrowDown' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'runner',
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal',
      environment: 'city',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'x',
      colorTouchScore: 200,
    },
    gameStats,
    canvas: { width: 800, height: canvasH } as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'x',
    stealthHidden: false,
    input: { keys, justPressed, justReleased } as InputSnapshot,

    setStealthHidden(_v: boolean): void { /* no-op */ },
    addScore(_amount: number): void { /* no-op */ },
    addScorePopup(_x: number, _y: number, _text: string, _color: string): void { /* no-op */ },
    triggerShake(_intensity: number): void { /* no-op */ },
    addParticle(_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size?: number): void { /* no-op */ },
    spawnHazard(_h: unknown): void { /* no-op */ },
    spawnItem(_item: unknown): void { /* no-op */ },
    removeHazardById(_h: unknown): void { /* no-op */ },
    modifyPlayerHp(_delta: number): void { /* no-op */ },
    resetCombo(): void { /* no-op */ },
    setTimescale(_scale: number, _durationSec?: number): void { /* no-op */ },
    getHazardScreenX(_h: unknown): number { return 0 },
    getPlayerWorldX(): number { return world.player.x + world.cameraX },
    setKills(_n: number): void { /* no-op */ },
    setCombo(_n: number): void { /* no-op */ },
    addBeatHit(): void { /* no-op */ },
    setBeatHazardInverted(_v: boolean): void { /* no-op */ },
    addShot(): void { /* no-op */ },
    addScoreVarsHit(): void { /* no-op */ },
    addScoreVarsItemCollected(): void { /* no-op */ },
    addScoreVarsBossKill(): void { /* no-op */ },
    addScoreVarsStealthBonus(_amount: number): void { /* no-op */ },
    addScoreVarsColorTouch(): void { /* no-op */ },
  } as unknown as MutableWorld

  return world
}

describe('LaneDodgeFeature (enhanced)', () => {
  let feature: LaneDodgeFeature
  let world: MutableWorld

  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())

    feature = new LaneDodgeFeature()
    world = setupMockWorld(600)
    feature.onInit?.(world)
  })

  describe('レーンロック', () => {
    it('update 時に player.vx が 0 に設定される', () => {
      world.player.vx = 100

      feature.update(world, world.input, 0.016)

      expect(world.player.vx).toBe(0)
    })

    it('vx が毎フレーム 0 にリセットされる', () => {
      feature.update(world, world.input, 0.016)
      world.player.vx = 50
      feature.update(world, world.input, 0.016)

      expect(world.player.vx).toBe(0)
    })
  })

  describe('コヨーテタイム', () => {
    it('切替中に ArrowUp を押すと即座にキャンセルされる', () => {
      // 切替開始
      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowDown')
      feature.update(world, world.input, 0.016)

      expect((feature as { targetLane: number }).targetLane).toBe(2)
      expect((feature as { laneSwitchTimer: number }).laneSwitchTimer).toBeGreaterThan(0)

      // 0.05秒経過させて残り時間を 0.1 以下にする（0.15 - 0.05 = 0.10 → 直前でキャンセル可能）
      input.justPressed.clear()
      feature.update(world, world.input, 0.049) // 残り 0.15 - 0.016 - 0.049 = 0.085 < 0.1

      // コヨーテタイム内: ArrowUp を押すとキャンセル + 新しい切替
      input.justPressed.clear()
      input.justPressed.add('ArrowUp')
      feature.update(world, world.input, 0.001)

      // currentLane が targetLane(2) に即座に合わせる
      expect((feature as { currentLane: number }).currentLane).toBe(2)
      // 新しい切替が開始される
      expect((feature as { targetLane: number }).targetLane).toBe(1)
      expect((feature as { laneSwitchTimer: number }).laneSwitchTimer).toBeGreaterThan(0)
    })

    it('コヨーテタイム外（切替完了後）ではキャンセルされない', () => {
      // 切替完了
      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowDown')
      feature.update(world, world.input, 0.016)
      feature.update(world, world.input, 0.2) // 切替完了

      expect((feature as { laneSwitchTimer: number }).laneSwitchTimer).toBe(0)
      // 切替完了後、currentLane は targetLane(2) に更新されている
      expect((feature as { currentLane: number }).currentLane).toBe(2)

      // 通常の入力（キャンセルではない）: currentLane=2 から ArrowUp → targetLane=1
      input.justPressed.clear()
      input.justPressed.add('ArrowUp')
      feature.update(world, world.input, 0.016)

      expect((feature as { targetLane: number }).targetLane).toBe(1)
    })
  })

  describe('速度加速', () => {
    it('10秒ごとに scrollSpeed が +10 増加する', () => {
      const initialSpeed = world.rules.scrollSpeed

      // 10秒経過
      feature.update(world, world.input, 10.0)

      expect(world.rules.scrollSpeed).toBe(initialSpeed + 10)
    })

    it('最大 +100 まで増加する', () => {
      const initialSpeed = world.rules.scrollSpeed

      // 100秒経過（10回加速）
      for (let i = 0; i < 10; i++) {
        feature.update(world, world.input, 10.0)
      }

      expect(world.rules.scrollSpeed).toBe(initialSpeed + 100)
    })

    it('最大値を超えない', () => {
      const initialSpeed = world.rules.scrollSpeed

      // 110秒経過（11回加速、12回目は上限）
      for (let i = 0; i < 11; i++) {
        feature.update(world, world.input, 10.0)
      }

      expect(world.rules.scrollSpeed).toBe(initialSpeed + 100)
    })
  })

  describe('onManualUpdated', () => {
    it('内部状態がリセットされる', () => {
      ;(feature as { currentLane: number }).currentLane = 2
      ;(feature as { targetLane: number }).targetLane = 2
      ;(feature as { _speedBonus: number })._speedBonus = 50

      feature.onManualUpdated()

      expect((feature as { currentLane: number }).currentLane).toBe(1)
      expect((feature as { targetLane: number }).targetLane).toBe(1)
      expect((feature as { _speedBonus: number })._speedBonus).toBe(0)
    })
  })
})
