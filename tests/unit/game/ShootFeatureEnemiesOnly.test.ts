import { describe, it, expect, beforeEach } from 'vitest'
import { ShootFeature } from '../../../src/game/systems/ShootFeature'
import { Player, Hazard, Bullet } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

function setupMockWorld(): MutableWorld {
  const player = new Player(100, 500)
  const hazards: Hazard[] = []
  const bullets: Bullet[] = []

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
    bullets,
    cameraX: 0,
    distance: 0,
    survivedSec: 0,
    rules: {
      features: new Set(['shoot', 'enemy_hp']),
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'stg',
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

describe('ShootFeature (enemies_only)', () => {
  let feature: ShootFeature
  let world: MutableWorld

  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())

    feature = new ShootFeature()
    world = setupMockWorld()
    feature.onInit()
  })

  describe('handles', () => {
    it('enemies_only をハンドルすること', () => {
      expect(feature.handles).toContain('enemies_only')
    })

    it('shoot をハンドルすること', () => {
      expect(feature.handles).toContain('shoot')
    })

    it('enemy_hp をハンドルすること', () => {
      expect(feature.handles).toContain('enemy_hp')
    })
  })

  describe('enemies_only モード', () => {
    it('敵専用射撃時、敵（maxHp > 1）は破壊される', () => {
      world.rules.features.add('enemies_only')

      const bx = 100 + 0 + 14  // 弾 x = 114
      const by = world.player.y + world.player.h / 2 - 2  // 弾 y = 472
      const hy = by + 2  // 弾と重なる y

      const enemy = new Hazard(bx, hy, 30, 30, 'blue', '#0000ff', 'rect', 1, false, 0, 'right')
      enemy.maxHp = 2
      world.hazards.push(enemy)

      const bullet = new Bullet(bx, by, 900, 0)
      ;(feature as unknown as { state: { bullets: Bullet[] } }).state.bullets.push(bullet)

      const result = (feature as unknown as { _resolveBulletHazardCollisions: (w: MutableWorld) => { scoreGain: number; destroyedHazards: Hazard[] } })
        ._resolveBulletHazardCollisions(world)

      expect(enemy.hp).toBeLessThanOrEqual(0)
      expect(result.destroyedHazards).toHaveLength(1)
    })

    it('敵専用射撃時、通常の障害物（maxHp <= 1）は貫通して破壊されない', () => {
      world.rules.features.add('enemies_only')

      const bx = 100 + 0 + 14  // 弾 x = 114
      const by = world.player.y + world.player.h / 2 - 2  // 弾 y = 472
      const hy = by + 2

      const normalHazard = new Hazard(bx, hy, 30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right')
      world.hazards.push(normalHazard)

      const bullet = new Bullet(bx, by, 900, 0)
      ;(feature as unknown as { state: { bullets: Bullet[] } }).state.bullets.push(bullet)

      const result = (feature as unknown as { _resolveBulletHazardCollisions: (w: MutableWorld) => { scoreGain: number; destroyedHazards: Hazard[] } })
        ._resolveBulletHazardCollisions(world)

      expect(normalHazard.hp).toBe(1)
      expect(result.destroyedHazards).toHaveLength(0)
    })

    it('enemies_only 未有効時は通常の障害物も破壊される', () => {
      const bx = 100 + 0 + 14
      const by = world.player.y + world.player.h / 2 - 2
      const hy = by + 2

      const normalHazard = new Hazard(bx, hy, 30, 30, 'red', '#ff0000', 'rect', 1, false, 0, 'right')
      world.hazards.push(normalHazard)

      const bullet = new Bullet(bx, by, 900, 0)
      ;(feature as unknown as { state: { bullets: Bullet[] } }).state.bullets.push(bullet)

      const result = (feature as unknown as { _resolveBulletHazardCollisions: (w: MutableWorld) => { scoreGain: number; destroyedHazards: Hazard[] } })
        ._resolveBulletHazardCollisions(world)

      expect(normalHazard.hp).toBe(0)
      expect(result.destroyedHazards).toHaveLength(1)
    })
  })

  describe('HP バー描画', () => {
    it('enemies_only 有効かつ maxHp > 1 のハザードの上に HP バーが描画される', () => {
      world.rules.features.add('enemies_only')

      // HP のある敵
      const enemy = new Hazard(
        world.player.x + 100, world.player.y,
        40, 30, 'blue', '#0000ff', 'rect', 3, false, 0, 'right'
      )
      world.hazards.push(enemy)

      // 描画メソッドがエラーなく呼べることを確認
      const ctx = {
        save: () => {},
        restore: () => {},
        fillStyle: '',
        fillRect: () => {},
        strokeRect: () => {},
        lineWidth: 0,
      } as unknown as CanvasRenderingContext2D

      // HP バー描画がエラーなく実行される
      expect(() => {
        (feature as unknown as { _renderHpBars: (ctx: CanvasRenderingContext2D, world: MutableWorld) => void })
          ._renderHpBars(ctx, world)
      }).not.toThrow()
    })

    it('enemies_only 未有効時は HP バーが描画されない', () => {
      world.rules.features.delete('enemies_only')

      const enemy = new Hazard(
        world.player.x + 100, world.player.y,
        40, 30, 'blue', '#0000ff', 'rect', 3, false, 0, 'right'
      )
      world.hazards.push(enemy)

      let saveCalled = false
      const ctx = {
        save: () => { saveCalled = true },
        restore: () => {},
        fillStyle: '',
        fillRect: () => {},
        strokeRect: () => {},
        lineWidth: 0,
      } as unknown as CanvasRenderingContext2D

      (feature as unknown as { _renderHpBars: (ctx: CanvasRenderingContext2D, world: MutableWorld) => void })
        ._renderHpBars(ctx, world)

      // enemies_only 未有効時は save() が呼ばれない（HP バー描画がスキップされる）
      expect(saveCalled).toBe(false)
    })
  })
})
