import { describe, it, expect, beforeEach } from 'vitest'
import { StealthFeature } from '../../../src/game/systems/StealthFeature'
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
      features: new Set(['stealth_detect', 'stealth_mode', 'slow_precise']),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', moveUp: 'ArrowUp', moveDown: 'ArrowDown' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'stealth_action',
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

describe('StealthFeature', () => {
  let feature: StealthFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new StealthFeature()
    world = setupMockWorld()
    feature.onManualUpdated()
  })

  describe('handles', () => {
    it('stealth_detect をハンドルすること', () => {
      expect(feature.handles).toContain('stealth_detect')
    })
  })

  describe('初期状態', () => {
    it('検知が 0 で初期化される', () => {
      const detection = (feature as { _state: { detection: number } })._state.detection
      expect(detection).toBe(0)
    })

    it('alertLevel が hidden で初期化される', () => {
      const alertLevel = (feature as { _state: { alertLevel: string } })._state.alertLevel
      expect(alertLevel).toBe('hidden')
    })
  })

  describe('検知メーター', () => {
    it('円錐外では検知が減衰する', () => {
      // 見張りを遠くに配置（円錐外）
      const guard = new Hazard(
        2000, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      const initialDetection = (feature as { _state: { detection: number } })._state.detection

      feature.update(world, world.input, 1.0)

      const detection = (feature as { _state: { detection: number } })._state.detection
      expect(detection).toBeLessThanOrEqual(initialDetection)
    })

    it('検知が 0 以下にならない', () => {
      // 見張りを遠くへ
      const guard = new Hazard(
        2000, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      // 検知を 5 に設定
      ;(feature as { _state: { detection: number } })._state.detection = 5

      feature.update(world, world.input, 1.0)

      const detection = (feature as { _state: { detection: number } })._state.detection
      expect(detection).toBeGreaterThanOrEqual(0)
    })

    it('検知が 100 を超えない', () => {
      // 見張りを遠くへ
      const guard = new Hazard(
        2000, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      // 検知を 99 に設定
      ;(feature as { _state: { detection: number } })._state.detection = 99

      feature.update(world, world.input, 1.0)

      const detection = (feature as { _state: { detection: number } })._state.detection
      expect(detection).toBeLessThanOrEqual(100)
    })
  })

  describe('警戒円錐内判定', () => {
    it('pillar 型ハザードの左側にプレイヤーがいると検知が上昇する', () => {
      // 見張りをプレイヤーの右側に配置
      // 円錐: (guard.x - 120, guard.y - 40, 120, 80)
      // プレイヤーが円錐内になるように
      const guard = new Hazard(
        world.player.x + 50, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      // プレイヤーに vx を設定（移動中）
      world.player.vx = 100

      const initialDetection = (feature as { _state: { detection: number } })._state.detection

      feature.update(world, world.input, 1.0)

      const detection = (feature as { _state: { detection: number } })._state.detection
      expect(detection).toBeGreaterThan(initialDetection)
    })

    it('非 pillar 型ハザードは無視される', () => {
      // rect 型のハザード
      const nonGuard = new Hazard(
        world.player.x + 50, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(nonGuard)

      const initialDetection = (feature as { _state: { detection: number } })._state.detection

      feature.update(world, world.input, 1.0)

      const detection = (feature as { _state: { detection: number } })._state.detection
      // 非 pillar 型は無視されるので、減衰のみ（円錐外）
      expect(detection).toBeLessThanOrEqual(initialDetection)
    })
  })

  describe('alertLevel 遷移', () => {
    it('検知 0〜29 で hidden', () => {
      ;(feature as { _state: { detection: number } })._state.detection = 15
      // update を呼んで alertLevel を更新
      const guard = new Hazard(
        2000, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      feature.update(world, world.input, 0.001)

      expect((feature as { _state: { alertLevel: string } })._state.alertLevel).toBe('hidden')
    })

    it('検知 30〜69 で suspicious', () => {
      ;(feature as { _state: { detection: number } })._state.detection = 50

      const guard = new Hazard(
        2000, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      feature.update(world, world.input, 0.001)

      expect((feature as { _state: { alertLevel: string } })._state.alertLevel).toBe('suspicious')
    })

    it('検知 70〜 で detected', () => {
      ;(feature as { _state: { detection: number } })._state.detection = 80

      const guard = new Hazard(
        2000, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      feature.update(world, world.input, 0.001)

      expect((feature as { _state: { alertLevel: string } })._state.alertLevel).toBe('detected')
    })
  })

  describe('render', () => {
    it('警戒円錐と HUD が描画できる', () => {
      const guard = new Hazard(
        world.player.x + 50, world.player.y + 20,
        20, 40, '#888888', '#aaaaaa', 'pillar', 1, false, 0, 'right'
      )
      world.hazards.push(guard)

      const ctx = {
        save: () => {},
        restore: () => {},
        fillStyle: '',
        fillRect: () => {},
        font: '',
        textAlign: '',
        fillText: () => {},
      } as unknown as CanvasRenderingContext2D

      expect(() => feature.render(ctx, world)).not.toThrow()
    })
  })

  describe('onManualUpdated', () => {
    it('内部状態がリセットされる', () => {
      ;(feature as { _state: { detection: number } })._state.detection = 50
      ;(feature as { _state: { alertLevel: string } })._state.alertLevel = 'suspicious'

      feature.onManualUpdated()

      expect((feature as { _state: { detection: number } })._state.detection).toBe(0)
      expect((feature as { _state: { alertLevel: string } })._state.alertLevel).toBe('hidden')
    })
  })
})
