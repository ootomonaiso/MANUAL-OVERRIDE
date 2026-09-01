import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BulletHellBossFeature } from '../../../src/game/systems/BulletHellBossFeature'
import { Player } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'

// ─── モック構築 ──────────────────────────────────────────────────

function createMockWorld(options?: {
  features?: string[]
  playerHp?: number
  playerInvincible?: number
  playerX?: number
  playerY?: number
}): MutableWorld {
  const player = new Player(options?.playerX ?? 300, 300)
  player.hp = options?.playerHp ?? 3
  player.invincible = options?.playerInvincible ?? 0
  player.w = 36; player.h = 52

  const bullets: unknown[] = []
  const particles: unknown[] = []
  const popups: unknown[] = []
  let shakeAmount = 0
  let hpDelta = 0
  let hitsOnBoss = 0
  let maxHitCombo = 0

  const world: MutableWorld = {
    player,
    hazards: [],
    items: [],
    bullets,
    cameraX: 0,
    distance: 0,
    rules: {
      features: new Set(options?.features ?? ['boss_stationary']),
      controls: { shoot: 'z', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', moveUp: 'ArrowUp', moveDown: 'ArrowDown' },
      genre: 'bullet_hell',
      hazardColors: new Set(),
      safeColors: new Set(),
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'vertical',
      environment: 'space',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'y',
      colorTouchScore: 200,
    },
    survivedSec: 0,
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
    scrollMode: 'y',
    stealthHidden: false,
    addParticle: (_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size?: number) => {
      particles.push({ _x, _y, _vx, _vy, _life, _color, _size })
    },
    addScorePopup: (_x: number, _y: number, _text: string, _color: string) => {
      popups.push({ _x, _y, _text, _color })
    },
    triggerShake: (amount: number) => { shakeAmount = amount },
    modifyPlayerHp: (delta: number) => { hpDelta += delta; player.hp += delta; if (player.hp < 0) player.hp = 0 },
    resetCombo: () => {},
    setTimescale: () => {},
    addScoreVarsHit: () => {},
    addScoreVarsItemCollected: () => {},
    addScoreVarsBossKill: () => {},
    addScoreVarsStealthBonus: () => {},
    addScoreVarsColorTouch: () => {},
    addScoreVarsHitsOnBoss: () => { hitsOnBoss++ },
    setScoreVarsMaxHitCombo: (n: number) => { if (n > maxHitCombo) maxHitCombo = n },
    spawnHazard: () => {},
    spawnItem: () => {},
    removeHazardById: () => {},
    setKills: () => {},
    setCombo: () => {},
    addBeatHit: () => {},
    setBeatHazardInverted: () => {},
    addShot: () => {},
    getHazardScreenX: (h) => h.x,
    getPlayerWorldX: () => player.x,
    addScore: () => {},
    setStealthHidden: () => {},
  } as unknown as MutableWorld

  // テストから内部カウンタを読み取れるようにする
  ;(world as any)._hitsOnBossCount = () => hitsOnBoss
  ;(world as any)._maxHitComboCount = () => maxHitCombo
  ;(world as any)._hpDelta = () => hpDelta
  ;(world as any)._shakeAmount = () => shakeAmount

  return world
}

function createMockInput(keys: string[] = []): InputSnapshot {
  return {
    keys: new Set(keys),
    justPressed: new Set(),
    justReleased: new Set(),
  } as InputSnapshot
}

// GameRegistry の getActiveSystems をモック
vi.mock('../../../src/engine/GameRegistry', async () => {
  const actual = await vi.importActual<typeof import('../../../src/engine/GameRegistry')>('../../../src/engine/GameRegistry')
  return {
    ...actual,
    getActiveSystems: () => [],
  }
})

// soundManager のメソッドをモック
vi.mock('../../../src/plugins/SoundManager', () => ({
  soundManager: {
    onEnemyHit: () => {},
    onEnemyDestroyed: () => {},
  },
}))

describe('BulletHellBossFeature', () => {
  let feature: BulletHellBossFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new BulletHellBossFeature()
    world = createMockWorld()
  })

  describe('初期状態', () => {
    it('onInit で内部状態がリセットされる', () => {
      const s = (feature as any).state
      expect(s.enemyBullets).toEqual([])
      expect(s.hitCombo).toBe(0)
      expect(s.hitsOnBoss).toBe(0)
      expect(s.maxHitCombo).toBe(0)
    })
  })

  describe('パターン生成と移動', () => {
    it('radial パターンで弾が全方向に生成される', () => {
      // fireIntervalSec=0.5 なので、0.5秒経過してから更新
      feature.update(world, createMockInput(), 0.51)

      const s = (feature as any).state
      expect(s.enemyBullets.length).toBe(24) // radialCount
    })

    it('弾が毎フレーム移動する', () => {
      // 弾を生成
      feature.update(world, createMockInput(), 0.51)

      const s = (feature as any).state
      expect(s.enemyBullets.length).toBeGreaterThan(0)

      const firstBullet = s.enemyBullets[0]
      const beforeX = firstBullet.x
      const beforeY = firstBullet.y

      // 1フレーム経過
      feature.update(world, createMockInput(), 0.016)

      // 弾が移動している（速度 > 0）
      const moved = firstBullet.x !== beforeX || firstBullet.y !== beforeY
      expect(moved).toBe(true)
    })

    it('パターンが時間経過で切り替わる（radial → fan → aimed）', () => {
      const s = (feature as any).state
      // 2.41秒でパターン切替 → fan、かつ fireInterval を超えて弾が発射される
      feature.update(world, createMockInput(), 2.41)
      feature.update(world, createMockInput(), 0.016)

      // fan パターンで 9 発が発射される（radial の弾が残る可能性があるが、
      // 末尾 9 発が fan パターンの弾であることを確認）
      const newBullets = s.enemyBullets.slice(-9)
      expect(newBullets.length).toBe(9)
      // fan パターンは下方（+y方向）を向く
      for (const b of newBullets) {
        expect(b.vy).toBeGreaterThan(0)
      }
    })

    it('aimed パターンでプレイヤー方向に弾が発射される', () => {
      const s = (feature as any).state
      // 2周期分経過して aimed に
      feature.update(world, createMockInput(), 2.41)
      feature.update(world, createMockInput(), 2.41)
      feature.update(world, createMockInput(), 0.016)

      // aimedCount = 3 発が発射される（前パターンからの弾が残る可能性がある）
      // 新しい弾が aimed パターンで発射されたことを確認
      const newBullets = s.enemyBullets.slice(-3)
      expect(newBullets.length).toBe(3)

      // aimed パターンは下方（+y方向）を向く
      for (const b of newBullets) {
        expect(b.vy).toBeGreaterThan(0)
      }
    })
  })

  describe('敵弾 × プレイヤー 衝突', () => {
    it('敵弾がプレイヤーと重なると HP が減る', () => {
      const s = (feature as any).state
      s.enemyBullets.push({
        x: world.player.x + world.player.w / 2,
        y: world.player.y + world.player.h / 2,
        vx: 0, vy: 100, r: 6,
      })

      feature.update(world, createMockInput(), 0.016)

      expect(world._hpDelta()).toBe(-1)
      expect(world.player.hp).toBe(2)
    })

    it('被弾で hitCombo がリセットされる', () => {
      const s = (feature as any).state
      s.hitCombo = 5
      s.enemyBullets.push({
        x: world.player.x + world.player.w / 2,
        y: world.player.y + world.player.h / 2,
        vx: 0, vy: 100, r: 6,
      })

      feature.update(world, createMockInput(), 0.016)

      expect(s.hitCombo).toBe(0)
    })

    it('被弾で無敵時間が付与される', () => {
      const s = (feature as any).state
      s.enemyBullets.push({
        x: world.player.x + world.player.w / 2,
        y: world.player.y + world.player.h / 2,
        vx: 0, vy: 100, r: 6,
      })

      feature.update(world, createMockInput(), 0.016)

      expect(world.player.invincible).toBeGreaterThan(0)
    })

    it('被弾でシェイクが発生する', () => {
      const s = (feature as any).state
      s.enemyBullets.push({
        x: world.player.x + world.player.w / 2,
        y: world.player.y + world.player.h / 2,
        vx: 0, vy: 100, r: 6,
      })

      feature.update(world, createMockInput(), 0.016)

      expect(world._shakeAmount()).toBeGreaterThan(0)
    })

    it('無敵時間中は被弾判定がスキップされる', () => {
      world = createMockWorld({ playerInvincible: 999 })
      const s = (feature as any).state
      s.enemyBullets.push({
        x: world.player.x + world.player.w / 2,
        y: world.player.y + world.player.h / 2,
        vx: 0, vy: 100, r: 6,
      })

      feature.update(world, createMockInput(), 0.016)

      expect(world._hpDelta()).toBe(0)
      expect(world.player.hp).toBe(3)
    })

    it('HP 0 でも弾は除去される', () => {
      world = createMockWorld({ playerHp: 1 })
      const s = (feature as any).state
      s.enemyBullets.push({
        x: world.player.x + world.player.w / 2,
        y: world.player.y + world.player.h / 2,
        vx: 0, vy: 100, r: 6,
      })

      feature.update(world, createMockInput(), 0.016)

      expect(world.player.hp).toBe(0)
      expect(s.enemyBullets).toHaveLength(0)
    })
  })

  describe('自機弾 × ボス 衝突', () => {
    it('自機弾がボスと重なると hitsOnBoss が加算される', () => {
      const s = (feature as any).state
      const bossX = 800 / 2
      const bossY = 0.12 * 600
      const bullet = {
        x: bossX, y: bossY, vx: 0, vy: -900, alive: true,
        w: 14, h: 5,
        rect: { x: bossX - 7, y: bossY - 2, w: 14, h: 5 },
      }
      world.bullets.push(bullet as any)

      feature.update(world, createMockInput(), 0.016)

      expect(world._hitsOnBossCount()).toBe(1)
    })

    it('連続命中で hitCombo が上昇し maxHitCombo が更新される', () => {
      const s = (feature as any).state
      const bossX = 800 / 2
      const bossY = 0.12 * 600

      for (let i = 0; i < 5; i++) {
        const bullet = {
          x: bossX, y: bossY, vx: 0, vy: -900, alive: true,
          w: 14, h: 5,
          rect: { x: bossX - 7, y: bossY - 2, w: 14, h: 5 },
        }
        world.bullets.push(bullet as any)
        feature.update(world, createMockInput(), 0.016)
      }

      expect(s.hitCombo).toBe(5)
      expect(s.maxHitCombo).toBe(5)
      expect(world._hitsOnBossCount()).toBe(5)
      expect(world._maxHitComboCount()).toBe(5)
    })

    it('被弾で hitCombo がリセットされる', () => {
      const s = (feature as any).state
      const bossX = 800 / 2
      const bossY = 0.12 * 600

      // 命中5回
      for (let i = 0; i < 5; i++) {
        const bullet = {
          x: bossX, y: bossY, vx: 0, vy: -900, alive: true,
          w: 14, h: 5,
          rect: { x: bossX - 7, y: bossY - 2, w: 14, h: 5 },
        }
        world.bullets.push(bullet as any)
        feature.update(world, createMockInput(), 0.016)
      }
      expect(s.hitCombo).toBe(5)

      // 被弾
      s.enemyBullets.push({
        x: world.player.x + world.player.w / 2,
        y: world.player.y + world.player.h / 2,
        vx: 0, vy: 100, r: 6,
      })
      feature.update(world, createMockInput(), 0.016)

      expect(s.hitCombo).toBe(0)
    })

    it('命中弾は alive=false になる', () => {
      const s = (feature as any).state
      const bossX = 800 / 2
      const bossY = 0.12 * 600
      const bullet = {
        x: bossX, y: bossY, vx: 0, vy: -900, alive: true,
        w: 14, h: 5,
        rect: { x: bossX - 7, y: bossY - 2, w: 14, h: 5 },
      }
      world.bullets.push(bullet as any)

      feature.update(world, createMockInput(), 0.016)

      expect(bullet.alive).toBe(false)
    })
  })

  describe('maxBullets 上限', () => {
    it('敵弾が maxBullets を超えない', () => {
      const bh = (feature as any)._bh ?? undefined
      // 内部状態に直接弾を充満させて、update 後も cap を超えないことを検証する。
      // 単純に 32 フレーム走査では maxBullets=220 に到達しない（1 フレームで最大 24 発）。
      const s = (feature as any).state
      const maxBullets = 220
      for (let i = 0; i < maxBullets; i++) {
        s.enemyBullets.push({ x: 400, y: 300, vx: 0, vy: 0, r: 6 })
      }
      expect(s.enemyBullets.length).toBe(maxBullets)

      // update を呼んでも cap を超えない（発射条件 `length < maxBullets` が false になる）
      feature.update(world, createMockInput(), 0.016)
      expect(s.enemyBullets.length).toBeLessThanOrEqual(maxBullets)
    })
  })

  describe('画面外カリング', () => {
    it('画面外に出た敵弾が除去される', () => {
      const s = (feature as any).state
      s.enemyBullets.push({ x: -9999, y: 300, vx: 0, vy: 0, r: 6 })
      s.enemyBullets.push({ x: 9999, y: 300, vx: 0, vy: 0, r: 6 })
      s.enemyBullets.push({ x: 400, y: -9999, vx: 0, vy: 0, r: 6 })
      s.enemyBullets.push({ x: 400, y: 9999, vx: 0, vy: 0, r: 6 })

      feature.update(world, createMockInput(), 0.016)

      expect(s.enemyBullets.length).toBe(0)
    })

    it('画面内の弾は残る', () => {
      const s = (feature as any).state
      s.enemyBullets.push({ x: 400, y: 300, vx: 0, vy: 0, r: 6 })

      feature.update(world, createMockInput(), 0.016)

      expect(s.enemyBullets.length).toBe(1)
    })
  })

  describe('boss_stationary 無効時', () => {
    it('更新処理がスキップされる', () => {
      world = createMockWorld({ features: [] })
      const s = (feature as any).state

      feature.update(world, createMockInput(), 0.016)

      expect(s.enemyBullets.length).toBe(0)
      expect(s.patternIndex).toBe(0)
    })
  })

  describe('render', () => {
    it('boss_stationary 有効時でもクラッシュしない', () => {
      const mockCtx = {
        save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(),
        beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
        moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        ellipse: vi.fn(),
        shadowColor: null, shadowBlur: 0,
      } as unknown as CanvasRenderingContext2D

      feature.render(mockCtx, world)

      expect(mockCtx.save).toHaveBeenCalled()
      expect(mockCtx.restore).toHaveBeenCalled()
    })

    it('boss_stationary 無効時は描画しない', () => {
      world = createMockWorld({ features: [] })
      const mockCtx = {
        save: vi.fn(), restore: vi.fn(),
      } as unknown as CanvasRenderingContext2D

      feature.render(mockCtx, world)

      expect(mockCtx.save).not.toHaveBeenCalled()
    })
  })
})
