import { describe, it, expect, beforeEach } from 'vitest'
import { PlatformerMode } from '../../../src/game/modes/PlatformerMode'
import type { MutableWorld } from '../../../src/engine/types'

function createMockWorld(overrides: Partial<MutableWorld> = {}): MutableWorld {
  const canvas = { width: 400, height: 600 } as HTMLCanvasElement
  const ctx = {} as CanvasRenderingContext2D
  const keys = new Set<string>()
  const justPressed = new Set<string>()
  const justReleased = new Set<string>()

  return {
    player: { x: 200, y: 400, w: 24, h: 32, hp: 3, vy: 0, vx: 0, onGround: false, jumpsLeft: 2, invincible: 0 },
    hazards: [],
    items: [],
    bullets: [],
    rules: {
      features: new Set(),
      controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'platformer',
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1200,
      scrollDirection: 'vertical',
      environment: 'sky',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'y',
      colorTouchScore: 200,
    },
    distance: 0,
    survivedSec: 0,
    canvas,
    ctx,
    cameraX: 0,
    gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
    scrollMode: 'y',
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

describe('PlatformerMode', () => {
  let mode: PlatformerMode
  let world: MutableWorld

  beforeEach(() => {
    mode = new PlatformerMode()
    world = createMockWorld()
    mode.setup(world)
  })

  describe('初期状態', () => {
    it('setup 後に initialized が true になる', () => {
      expect(mode['state'].initialized).toBe(true)
    })

    it('gameStarted は false のまま', () => {
      expect(mode['state'].gameStarted).toBe(false)
    })

    it('totalClimb は 0', () => {
      expect(mode['state'].totalClimb).toBe(0)
    })
  })

  describe('ゲーム開始', () => {
    it('Space を押さない間は update が return する', () => {
      // 何も起きないことを確認
      const initialLavaY = mode['state'].lavaY
      mode.update(world, 1 / 60)
      expect(mode['state'].lavaY).toBe(initialLavaY)
    })

    it('Space をホールドすると gameStarted になる', () => {
      world.input.keys.add('Space')
      mode.update(world, 1 / 60)
      expect(mode['state'].gameStarted).toBe(true)
    })
  })

  describe('溶岩', () => {
    it('ゲーム開始後、溶岩が下降する', () => {
      world.input.keys.add('Space')
      const initialLavaY = mode['state'].lavaY
      mode.update(world, 1) // 1秒経過

      expect(mode['state'].lavaY).toBeLessThan(initialLavaY)
    })

    it('10秒ごとに溶岩速度が加速する', () => {
      world.input.keys.add('Space')
      const initialSpeed = mode['state'].lavaSpeed

      // 10秒経過
      for (let i = 0; i < 600; i++) {
        mode.update(world, 1 / 60)
      }

      expect(mode['state'].lavaSpeed).toBeGreaterThan(initialSpeed)
    })
  })

  describe('プラットフォーム生成', () => {
    it('ゲーム開始後にプラットフォームが生成される', () => {
      world.input.keys.add('Space')
      // 数フレーム経過
      for (let i = 0; i < 10; i++) {
        mode.update(world, 1 / 60)
      }

      const platforms = mode['state'].platforms
      expect(platforms.length).toBeGreaterThan(0)
    })

    it('プラットフォームには種類がある', () => {
      world.input.keys.add('Space')
      for (let i = 0; i < 60; i++) {
        mode.update(world, 1 / 60)
      }

      const platforms = mode['state'].platforms
      const types = platforms.map(p => p.type)
      // 少なくとも1つのプラットフォームが存在し、有効な種類を持つ
      expect(types.length).toBeGreaterThan(0)
      for (const t of types) {
        expect(['normal', 'spring', 'conveyor', 'crumble']).toContain(t)
      }
    })
  })

  describe('勝利条件', () => {
    it('totalClimb >= 3000 で isWon が true', () => {
      mode['state'].totalClimb = 3000
      expect(mode.isWon(world)).toBe(true)
    })

    it('totalClimb < 3000 で isWon が false', () => {
      mode['state'].totalClimb = 2999
      expect(mode.isWon(world)).toBe(false)
    })
  })

  describe('敗北条件', () => {
    it('溶岩がプレイヤーに到達すると isLost が true', () => {
      // プレイヤーを溶岩に近い位置に
      mode['state'].lavaY = 100
      mode['_playerY'] = 80
      // PLAYER_H = 32, so playerBottom = 112 >= 100
      expect(mode.isLost(world)).toBe(true)
    })

    it('溶岩が遠ければ isLost が false', () => {
      mode['state'].lavaY = 1000
      mode['_playerY'] = 400
      expect(mode.isLost(world)).toBe(false)
    })
  })

  describe('id', () => {
    it('id が platformer である', () => {
      expect(mode.id).toBe('platformer')
    })
  })

  describe('プラットフォーム生成（N2 修正: 到達可能範囲内）', () => {
    it('生成されたプラットフォームの X 位置が前プラットフォームから MAX_PLATFORM_H_GAP 以内', () => {
      world.input.keys.add('Space')
      // 十分に多くのプラットフォームを生成
      for (let i = 0; i < 300; i++) {
        mode.update(world, 1 / 60)
      }

      const platforms = mode['state'].platforms
      expect(platforms.length).toBeGreaterThan(5)

      // 各プラットフォームが前プラットフォームから到達可能範囲内か確認
      const MAX_H_GAP = 250 * 1.31 * 0.8  // = 262.6
      for (let i = 1; i < platforms.length; i++) {
        const prev = platforms[i - 1]
        const curr = platforms[i]
        const hDist = Math.abs(curr.x - prev.x)
        expect(hDist).toBeLessThanOrEqual(MAX_H_GAP + prev.w)
      }
    })

    it('開始プラットフォームは画面中央付近に配置される', () => {
      const firstPlat = mode['state'].platforms[0]
      expect(firstPlat.x).toBeGreaterThan(0)
      expect(firstPlat.x + firstPlat.w).toBeLessThan(world.canvas.width)
    })
  })
})
