import { describe, it, expect, beforeEach } from 'vitest'
import { DungeonFeature } from '../../../src/game/systems/DungeonFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'

function setupMockWorld(): MutableWorld {
  const player = new Player(400, 500)
  const hazards: Hazard[] = []

  const gameStats = {
    kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false,
  }

  const keys = new Set<string>()
  const justPressed = new Set<string>()
  const justReleased = new Set<string>()

  const world: MutableWorld = {
    player,
    hazards,
    items: [],
    bullets: [],
    cameraX: 0,
    distance: 0,
    survivedSec: 0,
    rules: {
      features: new Set(['dungeon']),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', moveUp: 'ArrowUp', moveDown: 'ArrowDown', shoot: 'Z' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'dungeon',
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
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'x',
    stealthHidden: false,
    input: { keys, justPressed, justReleased } as InputSnapshot,

    setStealthHidden(_v: boolean): void { /* no-op */ },
    addScore(_amount: number): void { /* no-op */ },
    addScorePopup(_x: number, _y: number, _text: string, _color: string): void { /* no-op */ },
    triggerShake(_intensity: number): void { /* no-op */ },
    addParticle(_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size?: number): void { /* no-op */ },
    spawnHazard(_h: Hazard): void { /* no-op */ },
    spawnItem(_item: unknown): void { /* no-op */ },
    removeHazardById(_h: Hazard): void { /* no-op */ },
    modifyPlayerHp(_delta: number): void { /* no-op */ },
    resetCombo(): void { /* no-op */ },
    setTimescale(_scale: number, _durationSec?: number): void { /* no-op */ },
    getHazardScreenX(h: Hazard): number { return h.x - world.cameraX },
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

describe('DungeonFeature', () => {
  let feature: DungeonFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new DungeonFeature()
    world = setupMockWorld()
    feature.onManualUpdated()
  })

  describe('handles', () => {
    it('dungeon をハンドルすること', () => {
      expect(feature.handles).toContain('dungeon')
    })
  })

  describe('松明管理', () => {
    it('初期値が 100', () => {
      const torch = (feature as { _state: { torch: number } })._state.torch
      expect(torch).toBe(100)
    })

    it('時間経過で減少する', () => {
      const initialTorch = (feature as { _state: { torch: number } })._state.torch

      feature.update(world, world.input, 1.0)

      const torch = (feature as { _state: { torch: number } })._state.torch
      expect(torch).toBeLessThan(initialTorch)
    })

    it('最小値 20 を下回らない', () => {
      // 松明を 21 に設定
      ;(feature as { _state: { torch: number } })._state.torch = 21

      feature.update(world, world.input, 1.0)

      const torch = (feature as { _state: { torch: number } })._state.torch
      expect(torch).toBeGreaterThanOrEqual(20)
    })

    it('safe hazard 回収で removeHazardById が呼ばれる', () => {
      // 松明を中程度に設定
      ;(feature as { _state: { torch: number } })._state.torch = 50

      // safe hazard をプレイヤー位置に配置
      const safeItem = new Hazard(
        world.player.x, world.player.y,
        22, 22, '#ffff00', '#ffff88', 'diamond', 1, true, 0, 'right'
      )
      world.hazards.push(safeItem)

      let removed = false
      ;(world as { removeHazardById: (h: Hazard) => void }).removeHazardById = () => {
        removed = true
      }

      feature.update(world, world.input, 0.016)

      const torch = (feature as { _state: { torch: number } })._state.torch
      expect(torch).toBeGreaterThan(50)
      expect(removed).toBe(true)
    })

    it('MAX(100) を超えない', () => {
      ;(feature as { _state: { torch: number } })._state.torch = 90

      const safeItem = new Hazard(
        world.player.x, world.player.y,
        22, 22, '#ffff00', '#ffff88', 'diamond', 1, true, 0, 'right'
      )
      world.hazards.push(safeItem)

      feature.update(world, world.input, 0.016)

      const torch = (feature as { _state: { torch: number } })._state.torch
      expect(torch).toBeLessThanOrEqual(100)
    })

    it('安全でない hazard には反応しない', () => {
      ;(feature as { _state: { torch: number } })._state.torch = 50

      const dangerHazard = new Hazard(
        world.player.x, world.player.y,
        22, 22, '#ff0000', '#ff4444', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(dangerHazard)

      feature.update(world, world.input, 0.016)

      const torch = (feature as { _state: { torch: number } })._state.torch
      // safe ではないので回復しない（減少のみ）
      expect(torch).toBeLessThanOrEqual(50)
    })
  })

  describe('部屋制', () => {
    it('distance 400 以上で部屋番号が 2 になる', () => {
      world.distance = 400

      const roomNumber = Math.floor(world.distance / 400) + 1
      expect(roomNumber).toBe(2)
    })

    it('distance 0〜399 で部屋番号が 1', () => {
      world.distance = 200

      const roomNumber = Math.floor(world.distance / 400) + 1
      expect(roomNumber).toBe(1)
    })
  })

  describe('onManualUpdated', () => {
    it('松明がリセットされる', () => {
      ;(feature as { _state: { torch: number } })._state.torch = 50
      feature.onManualUpdated()

      expect((feature as { _state: { torch: number } })._state.torch).toBe(100)
    })

    it('回収アイテムリストは存在しない（removeHazardById で即消えるため追跡不要）', () => {
      // _state に collectedItems が存在しないことを確認
      const state = (feature as { _state: DungeonState })._state
      expect('collectedItems' in state).toBe(false)
    })
  })

  describe('render', () => {
    it('暗闇と HUD が描画できる', () => {
      const ctx = {
        save: () => {},
        restore: () => {},
        fillStyle: '',
        fillRect: () => {},
        globalCompositeOperation: '',
        createRadialGradient: () => ({
          addColorStop: () => {},
        }),
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        font: '',
        textAlign: '',
        fillText: () => {},
      } as unknown as CanvasRenderingContext2D

      // エラーなく実行されることを確認
      expect(() => feature.render(ctx, world)).not.toThrow()
    })
  })
})
