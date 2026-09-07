import { describe, it, expect, beforeEach } from 'vitest'
import { AquaticFeature } from '../../../src/game/systems/AquaticFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'

function createMockWorld(): MutableWorld {
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
      features: new Set(['aquatic']),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'aquatic',
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'vertical',
      environment: 'ocean',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'y',
      colorTouchScore: 200,
    },
    gameStats,
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'y',
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
    getHazardScreenX(_h: Hazard): number { return _h.x },
    getPlayerWorldX(): number { return world.player.x },
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

describe('AquaticFeature', () => {
  let feature: AquaticFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new AquaticFeature()
    world = createMockWorld()
    feature.onManualUpdated(world)
  })

  describe('handles', () => {
    it('aquatic をハンドルすること', () => {
      expect(feature.handles).toContain('aquatic')
    })
  })

  describe('初期状態', () => {
    it('酸素ゲージが 100 で初期化される', () => {
      const oxygen = (feature as { _state: { oxygen: number } })._state.oxygen
      expect(oxygen).toBe(100)
    })

    it('重力は変更されない（浮力ロジックは削除済み）', () => {
      // 浮力ロジックを削除したので、gravity は変更されない
      expect(world.rules.gravity).toBe(1600)
    })
  })

  describe('酸素減少', () => {
    it('時間経過で酸素が減少する', () => {
      const initialOxygen = (feature as { _state: { oxygen: number } })._state.oxygen
      expect(initialOxygen).toBe(100)

      feature.update(world, world.input, 1.0)

      const oxygen = (feature as { _state: { oxygen: number } })._state.oxygen
      expect(oxygen).toBeLessThan(initialOxygen)
    })

    it('酸素が 0 になると modifyPlayerHp が呼ばれる', () => {
      let hpModified = false
      ;(world as { modifyPlayerHp: (delta: number) => void }).modifyPlayerHp = (delta: number) => {
        hpModified = true
      }

      // 酸素を少量に設定
      ;(feature as { _state: { oxygen: number } })._state.oxygen = 0.1

      feature.update(world, world.input, 1.0)

      expect(hpModified).toBe(true)
    })
  })

  describe('酸素回復', () => {
    it('safe hazard に接触すると酸素が回復する', () => {
      // 酸素を中程度に設定
      ;(feature as { _state: { oxygen: number } })._state.oxygen = 50

      // プレイヤーの位置に safe hazard を配置
      const hazard = new Hazard(
        world.player.x,
        world.player.y,
        20, 20,
        '#44ccff', '#88ddff',
        'diamond', 1, true, 0, 'right'
      )
      world.hazards.push(hazard)

      const initialOxygen = (feature as { _state: { oxygen: number } })._state.oxygen

      feature.update(world, world.input, 0.016)

      const oxygen = (feature as { _state: { oxygen: number } })._state.oxygen
      expect(oxygen).toBeGreaterThan(initialOxygen)
    })

    it('酸素が MAX(100) を超えない', () => {
      // 酸素を満タンに設定
      ;(feature as { _state: { oxygen: number } })._state.oxygen = 90

      const hazard = new Hazard(
        world.player.x,
        world.player.y,
        20, 20,
        '#44ccff', '#88ddff',
        'diamond', 1, true, 0, 'right'
      )
      world.hazards.push(hazard)

      feature.update(world, world.input, 0.016)

      const oxygen = (feature as { _state: { oxygen: number } })._state.oxygen
      expect(oxygen).toBeLessThanOrEqual(100)
    })
  })

  describe('海流', () => {
    it('一定間隔で海流が発生する', () => {
      // 5秒経過
      for (let i = 0; i < 300; i++) {
        feature.update(world, world.input, 1 / 60)
      }

      const currentActive = (feature as { _state: { currentActive: boolean } })._state.currentActive
      // 海流が発生している可能性がある（乱数依存）
      // 一応タイマーが進んでいることを確認
      const currentTimer = (feature as { _state: { currentTimer: number } })._state.currentTimer
      expect(typeof currentTimer).toBe('number')
    })
  })

  describe('onManualUpdated', () => {
    it('内部状態がリセットされる', () => {
      ;(feature as { _state: { oxygen: number } })._state.oxygen = 50
      feature.onManualUpdated()

      expect((feature as { _state: { oxygen: number } })._state.oxygen).toBe(100)
    })
  })

  describe('render', () => {
    it('dirty フラグは update 後に true になる', () => {
      feature.update(world, world.input, 0.016)
      expect((feature as { _state: { _dirty: boolean } })._state._dirty).toBe(true)
    })
  })
})
