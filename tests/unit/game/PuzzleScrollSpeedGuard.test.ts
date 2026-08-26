import { describe, it, expect, vi } from 'vitest'
import { PuzzleFeature } from '../../../src/game/systems/PuzzleFeature'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import type { RuntimeRules } from '../../../src/domain/types'

/**
 * Issue #256: Puzzle の再初期化で scrollSpeed 復元値が 0 に壊れるバグの防止テスト。
 *
 * 概要:
 *   onManualUpdated → onInit 再呼び出し で、baseScrollSpeed が上書きされ 0 になる。
 *   onDisable で 0 が復元されてしまう。firstInit ガードで初回のみ保存するように修正済み。
 *
 * 検証:
 *   1. 初回 onInit で baseScrollSpeed を保存し、scrollSpeed を 0 にする。
 *   2. 再初期化（onManualUpdated 経由）後も baseScrollSpeed は元の値を保持する。
 *   3. onDisable で scrollSpeed が元の値（0 でない値）に復元される。
 */

// ミニマムな MutableWorld モック。scrollSpeed の保存/復元だけ検証するため最小限。
function _makeWorld(initialScrollSpeed: number): MutableWorld {
  const rules: RuntimeRules = {
    scrollSpeed: initialScrollSpeed,
    scrollDirection: 'horizontal' as const,
    scrollAxis: 'x' as const,
    features: new Set(['lights_out']),
    controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
    genre: 'puzzle',
    colorTouchScore: 10,
    learningRules: [],
  } as unknown as RuntimeRules
  return {
    rules,
    player: {
      x: 100, y: 200, w: 20, h: 30,
      vx: 0, vy: 0, onGround: true,
      hp: 3, maxHp: 3, invincible: 0,
      exp: 0, level: 1,
      rect: { x: 100, y: 200, w: 20, h: 30 },
    },
    hazards: [],
    items: [],
    bullets: [],
    distance: 0,
    survivedSec: 0,
    cameraX: 0,
    gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
    scrollMode: 'x',
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    addScore: vi.fn(),
    addScorePopup: vi.fn(),
    triggerShake: vi.fn(),
    addParticle: vi.fn(),
    spawnHazard: vi.fn(),
    spawnItem: vi.fn(),
    removeHazardById: vi.fn(),
    modifyPlayerHp: vi.fn(),
    resetCombo: vi.fn(),
    setTimescale: vi.fn(),
    getHazardScreenX: (h: { x: number }) => h.x,
    getPlayerWorldX: () => 100,
    setKills: vi.fn(),
    setCombo: vi.fn(),
    addBeatHit: vi.fn(),
    setBeatHazardInverted: vi.fn(),
    addShot: vi.fn(),
    addScoreVarsHit: vi.fn(),
    addScoreVarsItemCollected: vi.fn(),
    addScoreVarsBossKill: vi.fn(),
    addScoreVarsStealthBonus: vi.fn(),
    addScoreVarsColorTouch: vi.fn(),
  }
}

describe('PuzzleFeature scrollSpeed guard (#256)', () => {
  it('初回 onInit で scrollSpeed を保存し 0 にし、再初期化後も onDisable で元の値に復元する', () => {
    const feature = new PuzzleFeature()
    const originalSpeed = 5.0

    const world = _makeWorld(originalSpeed)
    expect(world.rules.scrollSpeed).toBe(originalSpeed)

    // 初回初期化
    feature.onInit(world)
    expect(world.rules.scrollSpeed).toBe(0)

    // 再初期化（onManualUpdated が onInit を呼ぶパターン）
    feature.onManualUpdated(world, '1.1')
    expect(world.rules.scrollSpeed).toBe(0)

    // 無効化 — 元の値に復元されるべき
    feature.onDisable(world)
    expect(world.rules.scrollSpeed).toBe(originalSpeed)
  })

  it('初回 onInit 後の scrollSpeed は 0 になる', () => {
    const feature = new PuzzleFeature()
    const world = _makeWorld(3.5)

    feature.onInit(world)
    expect(world.rules.scrollSpeed).toBe(0)
  })

  it('onDisable 後は next onInit で新しい値を保存できる（firstInit リセット確認）', () => {
    const feature = new PuzzleFeature()
    const world = _makeWorld(4.0)

    // 初回
    feature.onInit(world)
    expect(world.rules.scrollSpeed).toBe(0)

    feature.onDisable(world)
    expect(world.rules.scrollSpeed).toBe(4.0)

    // 再度有効化 — 新しい speed で初期化できる
    const world2 = _makeWorld(7.0)
    feature.onInit(world2)
    expect(world2.rules.scrollSpeed).toBe(0)

    world2.rules.scrollSpeed = 7.0 // 復元確認
    feature.onDisable(world2)
    expect(world2.rules.scrollSpeed).toBe(7.0)
  })

  it('scrollSpeed=0 の場合でも再初期化で壊れない（0 を 0 に復元）', () => {
    const feature = new PuzzleFeature()
    const world = _makeWorld(0)

    feature.onInit(world)
    expect(world.rules.scrollSpeed).toBe(0)

    feature.onManualUpdated(world, '1.2')
    expect(world.rules.scrollSpeed).toBe(0)

    feature.onDisable(world)
    expect(world.rules.scrollSpeed).toBe(0)
  })
})
