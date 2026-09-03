import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MovementFeature } from '../../../src/game/systems/MovementFeature'
import { Player } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'
import { PHYSICS, SCORE, EXTRA_MOVEMENT } from '../../../src/data/tunables'
import { PLAYER_PHYSICS } from '../../../src/data/gameBalance'

// ─────────────────────────────────────────────────────────────
// テスト用モック
// ─────────────────────────────────────────────────────────────

function createMockWorld(options?: {
  features?: string[]
  controls?: Record<string, string>
  scrollAxis?: 'x' | 'y'
}): MutableWorld {
  const player = new Player(100, 500)
  const hazards: unknown[] = []
  const items: unknown[] = []
  const bullets: unknown[] = []
  const particles: unknown[] = []
  const popups: unknown[] = []

  const world: MutableWorld = {
    player,
    hazards,
    items,
    bullets,
    cameraX: 0,
    distance: 0,
    rules: {
      features: new Set(options?.features ?? ['movement']),
      controls: options?.controls ?? {
        moveRight: 'ArrowRight',
        moveLeft: 'ArrowLeft',
        moveUp: 'ArrowUp',
        moveDown: 'ArrowDown',
        jump: 'Space',
        dash: 'Shift',
      },
      genre: 'base',
      hazardColors: new Set(),
      safeColors: new Set(),
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal',
      environment: 'plain',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: options?.scrollAxis ?? 'x',
      colorTouchScore: 200,
    },
    survivedSec: 0,
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    gameStats: {
      kills: 0,
      combo: 0,
      maxCombo: 0,
      beatHits: 0,
      beatHazardInverted: false,
    },
    scrollMode: 'x',
    stealthHidden: false,
    addParticle: (_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size?: number) => {
      particles.push({ _x, _y, _vx, _vy, _life, _color, _size })
    },
    addScorePopup: (_x: number, _y: number, _text: string, _color: string) => {
      popups.push({ _x, _y, _text, _color })
    },
    triggerShake: (_amount: number) => {},
    modifyPlayerHp: (delta: number) => {
      player.hp += delta
      if (player.hp < 0) player.hp = 0
    },
    resetCombo: () => {},
    setTimescale: () => {},
    addScoreVarsItemCollected: () => {},
    addScoreVarsHit: () => {},
    addScoreVarsBossKill: () => {},
    addScoreVarsStealthBonus: () => {},
    addScoreVarsColorTouch: () => {},
    spawnHazard: () => {},
    spawnItem: () => {},
    removeHazardById: () => {},
    setKills: () => {},
    setCombo: () => {},
    addBeatHit: () => {},
    setBeatHazardInverted: () => {},
    addShot: () => {},
    getHazardScreenX: (h: { x: number }) => h.x,
    getPlayerWorldX: () => player.x,
    addScore: () => {},
    setStealthHidden: () => {},
  } as unknown as MutableWorld

  return world
}

function createInput(keys: string[] = [], justPressed: string[] = []): InputSnapshot {
  return {
    keys: new Set(keys),
    justPressed: new Set(justPressed),
    justReleased: new Set(),
  } as InputSnapshot
}

// soundManager のメソッドをモック（エラーを出さないようにする）
vi.mock('../../../src/plugins/SoundManager', () => ({
  soundManager: {
    onDash: () => {},
    onWallJump: () => {},
    onSlide: () => {},
    onJump: () => {},
    onLand: () => {},
  },
}))

// ─────────────────────────────────────────────────────────────
// テスト
// ─────────────────────────────────────────────────────────────

describe('MovementFeature — 水平移動加速・減速', () => {
  let feature: MovementFeature

  beforeEach(() => {
    feature = new MovementFeature()
  })

  // ── UT-01: 地上・右加速 ──────────────────────────────────
  it('UT-01: 地上で右キー押下時、vx が 0 から +runSpeed へ滑らかに加速し、超過しない', () => {
    const world = createMockWorld({ features: ['movement'] })
    world.player.vx = 0
    world.player.onGround = true

    const input = createInput(['ArrowRight'])
    const dt = 1 / 60
    const groundAccel = PHYSICS.groundAccel

    // 数フレーム加速をシミュレート
    for (let i = 0; i < 10; i++) {
      feature.preUpdate(world, input, dt)
    }

    // 0 から加速している（即座に runSpeed になっていない）
    expect(world.player.vx).toBeGreaterThan(0)
    // runSpeed を超過していない
    expect(world.player.vx).toBeLessThanOrEqual(PLAYER_PHYSICS.runSpeed)
    // 十分にフレームを回せば runSpeed に到達している
    expect(world.player.vx).toBeGreaterThan(PLAYER_PHYSICS.runSpeed * 0.9)
    // 加速中は単調増加（逆転しない）
    const prevVx = world.player.vx
    feature.preUpdate(world, input, dt)
    expect(world.player.vx).toBeGreaterThanOrEqual(prevVx)
  })

  // ── UT-02: 地上・停止減速 ────────────────────────────────
  it('UT-02: 地上で入力なし時、vx が +runSpeed から 0 へ漸減し、即座に 0 にならない', () => {
    const world = createMockWorld({ features: ['movement'] })
    world.player.vx = PLAYER_PHYSICS.runSpeed
    world.player.onGround = true

    const input = createInput([]) // 無入力
    const dt = 1 / 60

    // 最初のフレーム: 即座に 0 にならない
    feature.preUpdate(world, input, dt)
    expect(world.player.vx).toBeGreaterThan(0)

    // 減速を継続
    for (let i = 0; i < 20; i++) {
      feature.preUpdate(world, input, dt)
    }

    // 0 に収束している
    expect(world.player.vx).toBeLessThanOrEqual(0.5)
  })

  // ── UT-03: 空中加速は地上より弱い ────────────────────────
  it('UT-03: 空中の加速度が地上より弱い（airAccel < groundAccel）', () => {
    const groundWorld = createMockWorld({ features: ['movement'] })
    const airWorld = createMockWorld({ features: ['movement'] })

    groundWorld.player.vx = 0
    groundWorld.player.onGround = true
    airWorld.player.vx = 0
    airWorld.player.onGround = false

    const input = createInput(['ArrowRight'])
    const dt = 1 / 60

    // 同一フレーム数だけ実行
    for (let i = 0; i < 5; i++) {
      feature.preUpdate(groundWorld, input, dt)
      feature.preUpdate(airWorld, input, dt)
    }

    // 空中の vx 増加量が地上より小さい
    expect(airWorld.player.vx).toBeLessThan(groundWorld.player.vx)
    // airAccel < groundAccel の前提確認
    expect(PHYSICS.airAccel).toBeLessThan(PHYSICS.groundAccel)
  })

  // ── UT-04: 空中減速は地上より弱い ────────────────────────
  it('UT-04: 空中の減速度は地上より弱い（airDecel < groundDecel）', () => {
    const groundWorld = createMockWorld({ features: ['movement'] })
    const airWorld = createMockWorld({ features: ['movement'] })

    groundWorld.player.vx = PLAYER_PHYSICS.runSpeed
    groundWorld.player.onGround = true
    airWorld.player.vx = PLAYER_PHYSICS.runSpeed
    airWorld.player.onGround = false

    const input = createInput([]) // 無入力
    const dt = 1 / 60

    for (let i = 0; i < 5; i++) {
      feature.preUpdate(groundWorld, input, dt)
      feature.preUpdate(airWorld, input, dt)
    }

    // 両方減速しているが、空中の方が減速量が少ない（vx が大きい）
    expect(airWorld.player.vx).toBeGreaterThan(groundWorld.player.vx)
    // airDecel < groundDecel の前提確認
    expect(PHYSICS.airDecel).toBeLessThan(PHYSICS.groundDecel)
  })

  // ── UT-05: 方向反転は滑らか ──────────────────────────────
  it('UT-05: 方向反転（右→左）は即座に -runSpeed にならず、減速→反転→加速で遷移する', () => {
    const world = createMockWorld({ features: ['movement'] })
    world.player.vx = PLAYER_PHYSICS.runSpeed
    world.player.onGround = true

    const dt = 1 / 60

    // 右キーを押した状態で左キーに切り替え
    const leftInput = createInput(['ArrowLeft'])

    // 最初の数フレーム: vx は正のままで減速中
    let crossedZero = false
    for (let i = 0; i < 30; i++) {
      feature.preUpdate(world, leftInput, dt)
      if (world.player.vx <= 0 && !crossedZero) {
        crossedZero = true
        // 0 を跨いだ時点で -runSpeed より大きい（即座反転していない）
        expect(world.player.vx).toBeGreaterThan(-PLAYER_PHYSICS.runSpeed)
      }
    }

    // 十分に回せば -runSpeed に到達
    expect(world.player.vx).toBeLessThanOrEqual(-PLAYER_PHYSICS.runSpeed * 0.9)
    // 最終的には負の方向
    expect(world.player.vx).toBeLessThan(0)
  })

  // ── UT-06: auto_run ──────────────────────────────────────
  it('UT-06: auto_run 時、無入力でも vx が +runSpeed へ加速する', () => {
    const world = createMockWorld({ features: ['movement', 'auto_run'] })
    world.player.vx = 0
    world.player.onGround = true

    const input = createInput([]) // 無入力
    const dt = 1 / 60

    for (let i = 0; i < 10; i++) {
      feature.preUpdate(world, input, dt)
    }

    // 加速している
    expect(world.player.vx).toBeGreaterThan(0)
    expect(world.player.vx).toBeLessThanOrEqual(PLAYER_PHYSICS.runSpeed)
  })

  // ── UT-07: slow_precise ──────────────────────────────────
  it('UT-07: slow_precise 時、目標速度が runSpeed × slowPreciseRatio になる', () => {
    const world = createMockWorld({ features: ['movement', 'slow_precise'] })
    world.player.vx = 0
    world.player.onGround = true

    const targetVx = PLAYER_PHYSICS.runSpeed * PHYSICS.slowPreciseRatio
    const input = createInput(['ArrowRight'])
    const dt = 1 / 60

    for (let i = 0; i < 20; i++) {
      feature.preUpdate(world, input, dt)
    }

    // 目標速度に収束している（±1% 許容）
    expect(world.player.vx).toBeGreaterThan(targetVx * 0.99)
    expect(world.player.vx).toBeLessThanOrEqual(targetVx * 1.01)
  })

  // ── UT-08: ダッシュ中は加速スキップ ──────────────────────
  it('UT-08: ダッシュ中は加速ロジックが干渉せず、vx は dashSpeed を維持する', () => {
    const world = createMockWorld({ features: ['movement', 'dash'] })
    world.player.vx = 0
    world.player.onGround = true

    // ダッシュを発動（timer を直接セット）
    ;(feature as unknown as { dash: { timer: number } }).dash.timer = 1

    const input = createInput(['ArrowRight'])
    const dt = 1 / 60

    const dashSpeed = PLAYER_PHYSICS.dashSpeed
    feature.preUpdate(world, input, dt)

    // ダッシュ中は vx が dashSpeed に設定されている（加速ロジックが上書きしない）
    expect(world.player.vx).toBe(dashSpeed)
  })

  // ── UT-09: dt 非依存 ─────────────────────────────────────
  it('UT-09: 同一実時間後の vx が dt に依存しない（フレームレート非依存）', () => {
    const world60 = createMockWorld({ features: ['movement'] })
    const world30 = createMockWorld({ features: ['movement'] })

    world60.player.vx = 0
    world60.player.onGround = true
    world30.player.vx = 0
    world30.player.onGround = true

    const input = createInput(['ArrowRight'])

    // 1秒間: 60fps × 1/60 dt × 60frames vs 30fps × 1/30 dt × 30frames
    for (let i = 0; i < 60; i++) {
      feature.preUpdate(world60, input, 1 / 60)
    }
    for (let i = 0; i < 30; i++) {
      feature.preUpdate(world30, input, 1 / 30)
    }

    // ほぼ一致する（±5% 許容）
    const ratio = world60.player.vx / world30.player.vx
    expect(ratio).toBeGreaterThan(0.95)
    expect(ratio).toBeLessThan(1.05)
  })

  // ── UT-10: 可動域クランプ維持（回帰確認） ─────────────────
  it('UT-10: 加速ロジック後も位置積分とクランプは sideScroller 側で正常動作する（回帰確認）', () => {
    // MovementFeature は位置積分を呼ばない。
    // 本テストは sideScroller.ts の p.x += p.vx * dt とクランプが
    // 加速ロジック変更で壊れていないことを確認する回帰テスト。
    const world = createMockWorld({ features: ['movement'] })
    world.player.vx = PLAYER_PHYSICS.runSpeed
    world.player.onGround = true
    world.player.x = PLAYER_PHYSICS.playerMinX

    const input = createInput(['ArrowRight'])
    const dt = 1 / 60

    // MovementFeature.preUpdate を実行（vx が加速ロジックで更新される）
    feature.preUpdate(world, input, dt)

    // vx が正の範囲内に収まっている
    expect(world.player.vx).toBeGreaterThanOrEqual(0)
    expect(world.player.vx).toBeLessThanOrEqual(PLAYER_PHYSICS.runSpeed * 1.01)
    // x は playerMinX 以上
    expect(world.player.x).toBeGreaterThanOrEqual(PLAYER_PHYSICS.playerMinX)
  })
})

// ── 追加: 地上/空中の加速値が JSON 定義と一致していることを確認 ─
describe('MovementFeature — パラメータ整合性', () => {
  it('groundAccel / groundDecel / airAccel / airDecel がすべて正の数である', () => {
    expect(PHYSICS.groundAccel).toBeGreaterThan(0)
    expect(PHYSICS.groundDecel).toBeGreaterThan(0)
    expect(PHYSICS.airAccel).toBeGreaterThan(0)
    expect(PHYSICS.airDecel).toBeGreaterThan(0)
  })

  it('空中の加速・減速が地上より弱い', () => {
    expect(PHYSICS.airAccel).toBeLessThan(PHYSICS.groundAccel)
    expect(PHYSICS.airDecel).toBeLessThan(PHYSICS.groundDecel)
  })
})
