import { describe, it, expect, beforeEach } from 'vitest'
import { ArenaMode } from '../../../src/game/modes/ArenaMode'
import type { MutableWorld } from '../../../src/engine/types'

function createMockWorld(overrides: Partial<MutableWorld> = {}): MutableWorld {
  const canvas = { width: 400, height: 600 } as HTMLCanvasElement
  const ctx = {} as CanvasRenderingContext2D
  const keys = new Set<string>()
  const justPressed = new Set<string>()
  const justReleased = new Set<string>()

  return {
    player: { x: 80, y: 300, w: 24, h: 32, hp: 3, vy: 0, vx: 0, onGround: false, jumpsLeft: 1, invincible: 0 },
    hazards: [],
    items: [],
    bullets: [],
    rules: {
      features: new Set(),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'arena',
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1200,
      scrollDirection: 'horizontal',
      environment: 'ground',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'x',
      colorTouchScore: 200,
    },
    distance: 0,
    survivedSec: 0,
    canvas,
    ctx,
    cameraX: 0,
    gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
    scrollMode: 'x',
    stealthHidden: false,
    input: { keys, justPressed, justReleased },
    setStealthHidden: (_v: boolean): void => {},
    addScore: (_amount: number): void => {},
    addScorePopup: (_x: number, _y: number, _text: string, _color: string): void => {},
    triggerShake: (_intensity: number): void => {},
    addParticle: (_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size?: number): void => {},
    spawnHazard: (_h: unknown): void => {},
    spawnItem: (_item: unknown): void => {},
    removeHazardById: (_h: unknown): void => {},
    modifyPlayerHp: (_delta: number): void => {},
    resetCombo: (): void => {},
    setTimescale: (_scale: number, _durationSec?: number): void => {},
    getHazardScreenX: (_h: unknown): number => 0,
    getPlayerWorldX: (): number => 0,
    setKills: (_n: number): void => {},
    setCombo: (_n: number): void => {},
    addBeatHit: (): void => {},
    setBeatHazardInverted: (_v: boolean): void => {},
    addShot: (): void => {},
    addScoreVarsHit: (): void => {},
    addScoreVarsItemCollected: (): void => {},
    addScoreVarsBossKill: (): void => {},
    addScoreVarsStealthBonus: (_amount: number): void => {},
    addScoreVarsColorTouch: (): void => {},
    ...overrides,
  } as MutableWorld
}

describe('ArenaMode', () => {
  let mode: ArenaMode
  let world: MutableWorld

  beforeEach(() => {
    mode = new ArenaMode()
    world = createMockWorld()
    mode.setup(world)
  })

  describe('初期状態', () => {
    it('setup 後に initialized が true', () => {
      expect(mode['state'].initialized).toBe(true)
    })

    it('gameStarted は false', () => {
      expect(mode['state'].gameStarted).toBe(false)
    })

    it('currentWave は 0', () => {
      expect(mode['state'].currentWave).toBe(0)
    })

    it('プレイヤー HP は 3', () => {
      expect(mode['_playerHp']).toBe(3)
    })
  })

  describe('ゲーム開始', () => {
    it('Space を押さない間は開始しない', () => {
      for (let i = 0; i < 60; i++) {
        mode.update(world, 1 / 60)
      }
      expect(mode['state'].gameStarted).toBe(false)
    })

    it('Space でゲームが開始しウェーブ1が開始する', () => {
      world.input.keys.add('Space')
      mode.update(world, 1 / 60)
      expect(mode['state'].gameStarted).toBe(true)
      expect(mode['state'].currentWave).toBe(1)
      expect(mode['state'].waveInProgress).toBe(true)
    })
  })

  describe('ウェーブ管理', () => {
    it('5ウェーブ全クリアで isWon が true', () => {
      // 手動で全ウェーブをクリア状態に
      mode['state'].currentWave = 5
      mode['state'].waveInProgress = false
      expect(mode.isWon(world)).toBe(true)
    })

    it('ウェーブ進行中は isWon が false', () => {
      mode['state'].currentWave = 3
      mode['state'].waveInProgress = true
      expect(mode.isWon(world)).toBe(false)
    })
  })

  describe('敗北条件', () => {
    it('HP が 0 だと isLost が true', () => {
      mode['_playerHp'] = 0
      expect(mode.isLost(world)).toBe(true)
    })

    it('HP が 1 以上だと isLost が false', () => {
      mode['_playerHp'] = 1
      expect(mode.isLost(world)).toBe(false)
    })
  })

  describe('敵スポーン', () => {
    it('ウェーブ開始後に敵がスポーンする', () => {
      world.input.keys.add('Space')
      // 1.5秒以上経過（ENEMY_SPAWN_INTERVAL）
      for (let i = 0; i < 100; i++) {
        mode.update(world, 1 / 60)
      }
      const aliveEnemies = mode['state'].enemies.filter(e => e.alive)
      expect(aliveEnemies.length).toBeGreaterThan(0)
    })
  })

  describe('射撃', () => {
    it('Z キーで弾が発射される', () => {
      world.input.keys.add('Space')
      // ゲーム開始
      for (let i = 0; i < 5; i++) {
        mode.update(world, 1 / 60)
      }

      world.input.keys.add('z')
      mode.update(world, 1 / 60)

      const bullets = mode['state'].bullets.filter(b => b.alive)
      expect(bullets.length).toBeGreaterThan(0)
    })
  })

  describe('id', () => {
    it('id が arena である', () => {
      expect(mode.id).toBe('arena')
    })
  })

  describe('横向き移動（N1 修正: _playerDrawX が毎フレームリセットされない）', () => {
    it('ArrowRight で _playerDrawX が増加する', () => {
      world.input.keys.add('Space')
      // ゲーム開始
      for (let i = 0; i < 5; i++) {
        mode.update(world, 1 / 60)
      }

      const startX = mode['_playerDrawX']
      world.input.keys.add('ArrowRight')
      // 60フレーム（1秒）経過
      for (let i = 0; i < 60; i++) {
        mode.update(world, 1 / 60)
      }
      const endX = mode['_playerDrawX']
      expect(endX).toBeGreaterThan(startX)
    })

    it('ArrowLeft で _playerDrawX が減少する', () => {
      world.input.keys.add('Space')
      for (let i = 0; i < 5; i++) {
        mode.update(world, 1 / 60)
      }

      const startX = mode['_playerDrawX']
      world.input.keys.add('ArrowLeft')
      for (let i = 0; i < 60; i++) {
        mode.update(world, 1 / 60)
      }
      const endX = mode['_playerDrawX']
      expect(endX).toBeLessThan(startX)
    })

    it('_playerVx フィールドは存在しない（死んでいたフィールドを削除）', () => {
      expect((mode as { _playerVx?: number })._playerVx).toBeUndefined()
    })
  })
})
