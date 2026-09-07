import { describe, it, expect, beforeEach } from 'vitest'
import { GlitchCorruptFeature } from '../../../src/game/systems/GlitchCorruptFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'

// ─── モックヘルパー ────────────────────────────────────────────────

function setupMockWorld(): { world: MutableWorld; keys: Set<string> } {
  const player = new Player(100, 500)
  const hazards: Hazard[] = []
  const keys = new Set<string>()

  const gameStats = {
    kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false,
  }

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
      features: new Set(['glitch_corrupt']),
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      genre: 'glitch',
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal',
      environment: 'ground',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: 'x',
      colorTouchScore: 200,
    },
    gameStats,
    canvas: {} as HTMLCanvasElement,
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

  return { world, keys }
}

// ─── テスト ────────────────────────────────────────────────────────

describe('GlitchCorruptFeature', () => {
  let feature: GlitchCorruptFeature
  let world: MutableWorld
  let keys: Set<string>

  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())

    feature = new GlitchCorruptFeature()
    const result = setupMockWorld()
    world = result.world
    keys = result.keys
    feature.onInit?.(world)
  })

  describe('handles', () => {
    it('glitch_corrupt をハンドルすること', () => {
      expect(feature.handles).toContain('glitch_corrupt')
    })
  })

  describe('入力反転', () => {
    it('入力反転フラグが設定・解除される', () => {
      expect(feature.isInputReversed).toBe(false)

      // setInputReversal を直接呼び出してテスト
      feature['setInputReversal'](true)
      expect(feature.isInputReversed).toBe(true)

      feature['setInputReversal'](false)
      expect(feature.isInputReversed).toBe(false)
    })

    it('ハザードが存在する状態で update してもエラーにならない', () => {
      const hazard = new Hazard(200, 400, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right')
      world.hazards.push(hazard)

      for (let i = 0; i < 100; i++) {
        feature.update(world, world.input, 0.016)
      }
      expect(world.hazards).toHaveLength(1)
    })
  })

  describe('onManualUpdated', () => {
    it('内部状態がリセットされる', () => {
      ;(feature as { nextReversalTime: number }).nextReversalTime = 0
      ;(feature as { reversalRemaining: number }).reversalRemaining = 2.0

      feature.onManualUpdated()

      expect((feature as { reversalRemaining: number }).reversalRemaining).toBe(0)
      expect((feature as { reversalCooldown: number }).reversalCooldown).toBe(0)
    })
  })
})
