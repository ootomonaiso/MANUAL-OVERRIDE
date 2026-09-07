import { describe, it, expect, beforeEach } from 'vitest'
import { MeleeKillFeature } from '../../../src/game/systems/MeleeKillFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { SURVIVAL } from '../../../src/data/tunables'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

function setupMockWorld(): { world: MutableWorld; destroyedHazards: Hazard[] } {
  const destroyedHazards: Hazard[] = []
  const player = new Player(100, 500)
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
    cameraX: 1000,
    distance: 0,
    survivedSec: 0,
    rules: {
      features: new Set(['melee_kill']),
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'hack_slash',
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
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    scrollMode: 'x',

    setKills(n: number): void { gameStats.kills = n },
    setCombo(n: number): void {
      gameStats.combo = n
      if (n > gameStats.maxCombo) gameStats.maxCombo = n
    },
    resetCombo(): void { gameStats.combo = 0 },

    removeHazardById(h: Hazard): void {
      const idx = world.hazards.indexOf(h)
      if (idx >= 0) world.hazards.splice(idx, 1)
      destroyedHazards.push(h)
    },
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

  return { world, destroyedHazards }
}

function createMockInput(justPressed: Set<string> = new Set()): InputSnapshot {
  return {
    keys: new Set<string>(),
    justPressed,
    justReleased: new Set<string>(),
  } as InputSnapshot
}

describe('MeleeKillFeature (enhanced)', () => {
  let feature: MeleeKillFeature
  let world: MutableWorld
  let destroyedHazards: Hazard[]

  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())

    feature = new MeleeKillFeature()
    const result = setupMockWorld()
    world = result.world
    destroyedHazards = result.destroyedHazards
    feature.onInit(world)
  })

  describe('handles', () => {
    it('melee_kill をハンドルすること', () => {
      expect(feature.handles).toContain('melee_kill')
    })
  })

  describe('コンボシステム', () => {
    it('連続ヒットでコンボが増加する', () => {
      const hazard = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      // 1発目
      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(1)

      // 2体目を追加
      const h2 = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(h2)

      // 2発目: クールダウン回復後
      feature.update(world, createMockInput(new Set(['z'])), SURVIVAL.meleeCooldown + 0.01)
      feature.update(world, createMockInput(), 0)

      expect(world.gameStats.combo).toBe(2)
    })

    it('コンボタイムアウトでリセットされる', () => {
      const hazard = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      // ヒット
      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)
      expect(world.gameStats.combo).toBe(1)

      // 内部 state.comboTimer が 2.0 に設定されていることを確認
      const comboTimer = (feature as { state: { comboTimer: number } }).state.comboTimer
      expect(comboTimer).toBeGreaterThan(0)

      // コンボタイムアウト（2秒以上経過）: update を呼んで timer を減算
      feature.update(world, createMockInput(), 2.1)

      // 内部 state.combo が 0 にリセットされる
      const internalCombo = (feature as { state: { combo: number } }).state.combo
      expect(internalCombo).toBe(0)
    })

    it('comboTimer が更新される', () => {
      const hazard = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)

      const comboTimer = (feature as { state: { comboTimer: number } }).state.comboTimer
      expect(comboTimer).toBeGreaterThan(0)
    })
  })

  describe('クリティカル', () => {
    it('コンボ 5 でクリティカルが発生する', () => {
      let shakeCalled = false
      ;(world as { triggerShake: (intensity: number) => void }).triggerShake = () => {
        shakeCalled = true
      }

      // 5体のハザードを配置
      for (let i = 0; i < 5; i++) {
        const h = new Hazard(
          world.cameraX + 150, world.player.y,
          30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(h)
      }

      // 5連撃
      for (let i = 0; i < 5; i++) {
        feature.update(world, createMockInput(new Set(['z'])), SURVIVAL.meleeCooldown + 0.01)
        feature.update(world, createMockInput(), 0)
      }

      // 5番目のヒットでクリティカル
      expect(shakeCalled).toBe(true)
      expect(world.gameStats.combo).toBe(5)
    })

    it('コンボ 10 でもクリティカルが発生する', () => {
      let criticalCount = 0
      // クリティカルのシェイクは 0.5、非クリティカルは VFX.hitShakeIntensity * 0.3 = 4.2
      // 0.5 以下のシェイクだけカウント
      ;(world as { triggerShake: (intensity: number) => void }).triggerShake = (intensity: number) => {
        if (intensity <= 0.6) criticalCount++
      }

      // 10体のハザード
      for (let i = 0; i < 10; i++) {
        const h = new Hazard(
          world.cameraX + 150, world.player.y,
          30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(h)
      }

      for (let i = 0; i < 10; i++) {
        feature.update(world, createMockInput(new Set(['z'])), SURVIVAL.meleeCooldown + 0.01)
        feature.update(world, createMockInput(), 0)
      }

      // 5 と 10 で2回クリティカル
      expect(criticalCount).toBe(2)
    })
  })

  describe('スコア', () => {
    it('コンボボーナススコアが加算される', () => {
      let scoredAmount = 0
      ;(world as { addScore: (amount: number) => void }).addScore = (amount: number) => {
        scoredAmount += amount
      }

      const hazard = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)

      // combo=1 のとき: 50 * 1 = 50
      expect(scoredAmount).toBe(50)
    })

    it('コンボ 3 で 150 点（50 * 3）', () => {
      let scoredAmount = 0
      ;(world as { addScore: (amount: number) => void }).addScore = (amount: number) => {
        scoredAmount += amount
      }

      // 3体のハザード
      for (let i = 0; i < 3; i++) {
        const h = new Hazard(
          world.cameraX + 150, world.player.y,
          30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
        )
        world.hazards.push(h)
      }

      for (let i = 0; i < 3; i++) {
        feature.update(world, createMockInput(new Set(['z'])), SURVIVAL.meleeCooldown + 0.01)
        feature.update(world, createMockInput(), 0)
      }

      // 50*1 + 50*2 + 50*3 = 50 + 100 + 150 = 300
      expect(scoredAmount).toBe(300)
    })
  })

  describe('HUD', () => {
    it('combo > 1 のとき render がエラーなく実行される', () => {
      const hazard = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      feature.update(world, createMockInput(new Set(['z'])), 0)
      feature.update(world, createMockInput(), 0)

      const ctx = {
        save: () => {},
        restore: () => {},
        fillStyle: '',
        font: '',
        textAlign: '',
        fillText: () => {},
        fillRect: () => {},
        setTransform: () => {},
        clearRect: () => {},
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        closePath: () => {},
        stroke: () => {},
        lineTo: () => {},
        moveTo: () => {},
        clip: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        measureText: () => ({ width: 0 }),
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      } as unknown as CanvasRenderingContext2D

      expect(() => feature.render(ctx, world)).not.toThrow()
    })
  })

  describe('既存動作', () => {
    it('Z キー入力で近接攻撃が可能', () => {
      const hazard = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right'
      )
      world.hazards.push(hazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      expect(world.hazards).toHaveLength(0)
    })

    it('安全なハザードには攻撃しない', () => {
      const safeHazard = new Hazard(
        world.cameraX + 150, world.player.y,
        30, 40, 'green', '#00ff00', 'rect', 1, true, 0, 'right'
      )
      world.hazards.push(safeHazard)

      const input = createMockInput(new Set(['z']))
      feature.update(world, input, 0)
      feature.update(world, createMockInput(), 0)

      expect(world.hazards).toContain(safeHazard)
      expect(world.gameStats.combo).toBe(0)
    })
  })
})
