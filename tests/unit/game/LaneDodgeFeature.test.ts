import { describe, it, expect, beforeEach } from 'vitest'
import { LaneDodgeFeature } from '../../../src/game/systems/LaneDodgeFeature'
import { Player } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

// ─── モックヘルパー ────────────────────────────────────────────────

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

// ─── テスト ────────────────────────────────────────────────────────

describe('LaneDodgeFeature', () => {
  let feature: LaneDodgeFeature
  let world: MutableWorld

  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())

    feature = new LaneDodgeFeature()
    world = setupMockWorld(600)
    feature.onInit?.(world)
  })

  describe('handles', () => {
    it('lane_dodge をハンドルすること', () => {
      expect(feature.handles).toContain('lane_dodge')
    })
  })

  describe('レーン切替', () => {
    it('初期状態は中央レーン（1）', () => {
      const currentLane = (feature as { currentLane: number }).currentLane
      expect(currentLane).toBe(1)
    })

    it('ArrowUp で targetLane が上のレーン（0）に設定される', () => {
      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowUp')

      feature.update(world, world.input, 0.016)

      // targetLane は即座に更新される
      expect((feature as { targetLane: number }).targetLane).toBe(0)
      // currentLane はアニメーション完了時まで変わらない
      expect((feature as { currentLane: number }).currentLane).toBe(1)
      // 切替タイマーが開始される
      expect((feature as { laneSwitchTimer: number }).laneSwitchTimer).toBeGreaterThan(0)
    })

    it('ArrowDown で targetLane が下のレーン（2）に設定される', () => {
      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowDown')

      feature.update(world, world.input, 0.016)

      // targetLane は即座に更新される
      expect((feature as { targetLane: number }).targetLane).toBe(2)
      // currentLane はアニメーション完了時まで変わらない
      expect((feature as { currentLane: number }).currentLane).toBe(1)
    })

    it('アニメーション完了後に currentLane が targetLane に更新される', () => {
      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowDown')

      // 切替開始
      feature.update(world, world.input, 0.016)
      expect((feature as { targetLane: number }).targetLane).toBe(2)

      // アニメーション時間を超過させて完了させる
      feature.update(world, world.input, 0.2)

      expect((feature as { currentLane: number }).currentLane).toBe(2)
      expect((feature as { laneSwitchTimer: number }).laneSwitchTimer).toBe(0)
    })

    it('既に上端のレーンにいるとき ArrowUp は targetLane を変更しない', () => {
      ;(feature as { currentLane: number }).currentLane = 0
      ;(feature as { targetLane: number }).targetLane = 0

      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowUp')

      feature.update(world, world.input, 0.016)

      // 上端なので切替不可
      expect((feature as { targetLane: number }).targetLane).toBe(0)
    })

    it('既に下端のレーンにいるとき ArrowDown は targetLane を変更しない', () => {
      ;(feature as { currentLane: number }).currentLane = 2
      ;(feature as { targetLane: number }).targetLane = 2

      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowDown')

      feature.update(world, world.input, 0.016)

      // 下端なので切替不可
      expect((feature as { targetLane: number }).targetLane).toBe(2)
    })
  })

  describe('レーン境界制限', () => {
    it('プレイヤーがレーン外にはみ出さない', () => {
      const canvasH = 600
      const laneHeight = canvasH / 3 // 200
      // プレイヤーをレーン0の上限にはみ出させる
      world.player.y = -10

      feature.update(world, world.input, 0.016)

      // レーン0: y >= 0
      expect(world.player.y).toBeGreaterThanOrEqual(0)
    })

    it('プレイヤーがレーン2の下限にはみ出さない', () => {
      const canvasH = 600
      const laneHeight = canvasH / 3 // 200
      // プレイヤーをレーン2の下限にはみ出させる
      world.player.y = canvasH - 10

      feature.update(world, world.input, 0.016)

      // レーン2: y <= canvasH - player.h = 600 - 52 = 548
      expect(world.player.y).toBeLessThanOrEqual(canvasH - world.player.h)
    })
  })

  describe('スムーズ移動', () => {
    it('レーン切替中に player.y が補間される', () => {
      const startY = world.player.y
      const input = world.input as { justPressed: Set<string> }
      input.justPressed.add('ArrowDown')

      // 切替中のフレーム（0.15秒未満）
      feature.update(world, world.input, 0.01)
      feature.update(world, world.input, 0.01)
      feature.update(world, world.input, 0.01)

      // 補間中なので startY と異なる位置にいる
      // （完了時は targetLane に teleport される）
      const currentY = world.player.y
      // 補間中なら startY と currentY は異なる（ただし、完了時は target に teleport）
      // 0.03秒経過で完了するので、完了していなければ補間中
      const switchTimer = (feature as { laneSwitchTimer: number }).laneSwitchTimer
      if (switchTimer > 0) {
        expect(currentY).not.toBe(startY)
      }
    })
  })

  describe('onManualUpdated', () => {
    it('内部状態がリセットされる', () => {
      ;(feature as { currentLane: number }).currentLane = 2
      ;(feature as { targetLane: number }).targetLane = 2

      feature.onManualUpdated()

      expect((feature as { currentLane: number }).currentLane).toBe(1)
      expect((feature as { targetLane: number }).targetLane).toBe(1)
    })
  })
})
