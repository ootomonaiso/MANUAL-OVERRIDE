import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OxygenFeature, BUBBLE_COUNT, BUBBLE_COLOR } from '../../../src/game/systems/OxygenFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot, GameStats } from '../../../src/engine/types'
import { OXYGEN, VFX } from '../../../src/data/tunables'

// soundManager をモック
vi.mock('../../../src/plugins/SoundManager', () => ({
  soundManager: {
    onHungerDamage: vi.fn(),
    onItemPickup: vi.fn(),
  },
}))

// モックから soundManager をインポート
import { soundManager } from '../../../src/plugins/SoundManager'

// テスト用の最小限の MutableWorld モック
function createMockWorld(options?: {
  features?: string[]
}): MutableWorld {
  const player = new Player(100, 500)
  const hazards: Hazard[] = []
  const items: unknown[] = []
  const particles: unknown[] = []
  const popups: unknown[] = []
  const modifyHpCalls: number[] = []

  const gameStats: GameStats = {
    kills: 0,
    combo: 0,
    maxCombo: 0,
    beatHits: 0,
    beatHazardInverted: false,
  }

  const world: MutableWorld = {
    player,
    hazards,
    items,
    cameraX: 0,
    distance: 0,
    rules: {
      features: new Set(options?.features ?? ['oxygen']),
      controls: {},
      genre: 'aquatic',
      hazardColors: new Set(),
      safeColors: new Set(),
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
    survivedSec: 0,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    gameStats,
    scrollMode: 'y',
    addParticle: (_x: number, _y: number, _vx: number, _vy: number, _life: number, _color: string, _size: number) => {
      particles.push({ _x, _y, _vx, _vy, _life, _color, _size })
    },
    addScorePopup: (_x: number, _y: number, _text: string, _color: string) => {
      popups.push({ _x, _y, _text, _color })
    },
    triggerShake: () => {},
    modifyPlayerHp: (delta: number) => {
      player.hp += delta
      if (player.hp < 0) player.hp = 0
      modifyHpCalls.push(delta)
    },
    resetCombo: () => { gameStats.combo = 0 },
    setTimescale: () => {},
    addScoreVarsItemCollected: () => {},
    addScoreVarsHit: () => {},
    addScoreVarsBossKill: () => {},
    addScoreVarsStealthBonus: () => {},
    addScoreVarsColorTouch: () => {},
    spawnHazard: (h: Hazard) => { hazards.push(h) },
    spawnItem: (item: unknown) => { items.push(item) },
    removeHazardById: (h: Hazard) => {
      const i = hazards.indexOf(h)
      if (i >= 0) hazards.splice(i, 1)
    },
    setKills: (n: number) => { gameStats.kills = n },
    setCombo: (n: number) => { gameStats.combo = n; if (n > gameStats.maxCombo) gameStats.maxCombo = n },
    addBeatHit: () => { gameStats.beatHits++ },
    setBeatHazardInverted: () => {},
    addShot: () => {},
    getHazardScreenX: (h) => h.x - 0,
    getPlayerWorldX: () => player.x + 0,
    addScore: () => {},
  } as unknown as MutableWorld

  // modifyPlayerHp の呼び出し記録を外部から取得可能にする
  ;(world as Record<string, unknown>).modifyPlayerHpCalls = modifyHpCalls
  // popups/particles を外部から取得可能にする（T-10）
  ;(world as Record<string, unknown>).testPopups = popups
  ;(world as Record<string, unknown>).testParticles = particles

  return world
}

function createMockInput(justPressed: Set<string> = new Set()): InputSnapshot {
  return {
    keys: new Set<string>(),
    justPressed,
    justReleased: new Set<string>(),
  } as InputSnapshot
}

describe('OxygenFeature', () => {
  let feature: OxygenFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new OxygenFeature()
    world = createMockWorld()
    feature.onInit(world)
    vi.clearAllMocks()
  })

  // ─── T-1: update() で時間経過に酸素が減少 ────────────────────────
  describe('T-1: 酸素減衰', () => {
    it('1秒更新で maxOxygen - oxygenDecayRate になる', () => {
      feature.update(world, createMockInput(), 1)
      expect(feature.oxygen).toBeCloseTo(OXYGEN.maxOxygen - OXYGEN.oxygenDecayRate)
    })

    it('0.5秒更新で半分になる', () => {
      feature.update(world, createMockInput(), 0.5)
      expect(feature.oxygen).toBeCloseTo(OXYGEN.maxOxygen - OXYGEN.oxygenDecayRate * 0.5)
    })
  })

  // ─── T-2: 酸素は maxOxygen を超えない ────────────────────────────
  describe('T-2: 酸素の上限', () => {
    it('満タン状態から coral 回復しても maxOxygen を超えない', () => {
      feature.update(world, createMockInput(), 0) // 減衰なし
      // 酸素はすでに maxOxygen
      const hazard = new Hazard(200, 300, 30, 30, '#33ff66', '#00ff66', 'diamond', 0, true, 0, 'right')
      world.hazards.push(hazard)
      feature.onSafeHazardTouch(world, hazard, 200)
      expect(feature.oxygen).toBe(OXYGEN.maxOxygen)
    })
  })

  // ─── T-3: 酸素 0 で死亡トリガー ──────────────────────────────────
  describe('T-3: 酸素枯渇死', () => {
    it('oxygenDecayRate * n 秒更新後に modifyPlayerHp が負値で呼ばれる', () => {
      const calls = (world as Record<string, unknown>).modifyPlayerHpCalls as number[]
      // 100 / 4.0 = 25秒で枯渇
      feature.update(world, createMockInput(), 25)
      expect(calls).toContain(-world.player.maxHp)
    })
  })

  // ─── T-4: 死亡トリガーは 1 回のみ ────────────────────────────────
  describe('T-4: 死亡トリガーの二重発火ガード', () => {
    it('死亡後さらに update() を回しても追加呼び出しなし', () => {
      const calls = (world as Record<string, unknown>).modifyPlayerHpCalls as number[]
      // 25秒で死亡
      feature.update(world, createMockInput(), 25)
      const countAfterDeath = calls.filter(v => v === -world.player.maxHp).length

      // さらに 10秒経過
      feature.update(world, createMockInput(), 10)
      const countAfterMore = calls.filter(v => v === -world.player.maxHp).length

      expect(countAfterMore).toBe(countAfterDeath)
    })
  })

  // ─── T-5: onPlayerHit で oxygenHitDamage 減算 ────────────────────
  describe('T-5: 被弾で酸素減算', () => {
    it('100 → 75（oxygenHitDamage = 25）', () => {
      feature.onPlayerHit(world)
      expect(feature.oxygen).toBe(OXYGEN.maxOxygen - OXYGEN.oxygenHitDamage)
    })
  })

  // ─── T-6: onPlayerHit かつ oxygen > 0 で無敵付与 ────────────────
  describe('T-6: 被弾で無敵フレーム付与（oxygen > 0）', () => {
    it('player.invincible === VFX.invincibleDuration', () => {
      world.player.invincible = 0
      feature.onPlayerHit(world)
      expect(world.player.invincible).toBe(VFX.invincibleDuration)
    })
  })

  // ─── T-7: onPlayerHit かつ oxygen <= 0 で死亡 ───────────────────
  describe('T-7: 被弾で死亡（oxygen <= 0）', () => {
    it('酸素 10 の状態で被弾 → 死亡トリガー', () => {
      // 酸素を 10 に設定（update で減衰させるのではなく直接操作）
      const state = (feature as any).state as { oxygen: number }
      state.oxygen = 10
      const calls = (world as Record<string, unknown>).modifyPlayerHpCalls as number[]

      feature.onPlayerHit(world)
      expect(calls).toContain(-world.player.maxHp)
    })
  })

  // ─── T-8: onPlayerHit の戻り値 ──────────────────────────────────
  describe('T-8: onPlayerHit の戻り値', () => {
    it('oxygen feature 有効時に true を返す', () => {
      const result = feature.onPlayerHit(world)
      expect(result).toBe(true)
    })

    it('oxygen feature 無効時に false を返す', () => {
      const worldNoOxygen = createMockWorld({ features: [] })
      const featureNoOxygen = new OxygenFeature()
      featureNoOxygen.onInit(worldNoOxygen)
      const result = featureNoOxygen.onPlayerHit(worldNoOxygen)
      expect(result).toBe(false)
    })
  })

  // ─── T-9: onSafeHazardTouch で酸素回復 ───────────────────────────
  describe('T-9: 珊瑚接触で酸素回復', () => {
    it('50 → 80（oxygenCoralRestore = 30）', () => {
      const state = (feature as any).state as { oxygen: number }
      state.oxygen = 50
      const hazard = new Hazard(200, 300, 30, 30, '#33ff66', '#00ff66', 'diamond', 0, true, 0, 'right')
      world.hazards.push(hazard)
      feature.onSafeHazardTouch(world, hazard, 200)
      expect(feature.oxygen).toBe(80)
    })

    it('90 → 100（max クランプ）', () => {
      const state = (feature as any).state as { oxygen: number }
      state.oxygen = 90
      const hazard = new Hazard(200, 300, 30, 30, '#33ff66', '#00ff66', 'diamond', 0, true, 0, 'right')
      world.hazards.push(hazard)
      feature.onSafeHazardTouch(world, hazard, 200)
      expect(feature.oxygen).toBe(OXYGEN.maxOxygen)
    })
  })

  // ─── T-10: onSafeHazardTouch でポップアップ＋パーティクル＋ハザード除去 ──
  describe('T-10: 珊瑚接触の演出とハザード除去', () => {
    it('popups に +O2 が記録され、particles に気泡が記録され、hazards が空になる', () => {
      const hazard = new Hazard(200, 300, 30, 30, '#33ff66', '#00ff66', 'diamond', 0, true, 0, 'right')
      world.hazards.push(hazard)

      feature.onSafeHazardTouch(world, hazard, 200)

      // popups
      const popups = (world as Record<string, unknown>).testPopups as { _text: string }[]
      const popup = popups.find(p => p._text === '+O2')
      expect(popup).toBeDefined()

      // particles（気泡 BUBBLE_COUNT 個、色は BUBBLE_COLOR）
      const particles = (world as Record<string, unknown>).testParticles as { _color: string }[]
      const bubbles = particles.filter(p => p._color === BUBBLE_COLOR)
      expect(bubbles.length).toBe(BUBBLE_COUNT)

      // hazard 除去
      expect(world.hazards).toHaveLength(0)
    })
  })

  // ─── T-11: 低酸素警告は閾値超過時に 1 回のみ ─────────────────────
  describe('T-11: 低酸素警告', () => {
    it('閾値（30）超過で 1 回発火し、次のフレームは再発火しない', () => {
      // 酸素を 31 に設定
      const state = (feature as any).state as { oxygen: number; lowWarningFired: boolean }
      state.oxygen = 31

      // 1秒経過して 27 になる（31 - 4 = 27）→ 警告発火
      feature.update(world, createMockInput(), 1)
      expect(state.oxygen).toBeLessThanOrEqual(OXYGEN.oxygenLowThreshold)
      expect(state.lowWarningFired).toBe(true)
      expect(soundManager.onHungerDamage).toHaveBeenCalledOnce()

      // 次のフレーム（さらに 0.1秒）→ 再発火しない
      vi.clearAllMocks()
      feature.update(world, createMockInput(), 0.1)
      expect(soundManager.onHungerDamage).not.toHaveBeenCalled()
    })

    it('回復後は再発火可能', () => {
      const state = (feature as any).state as { oxygen: number; lowWarningFired: boolean }
      state.oxygen = 31

      // 警告発火
      feature.update(world, createMockInput(), 1)
      expect(state.lowWarningFired).toBe(true)

      // 珊瑚で回復（閾値以上）
      const hazard = new Hazard(200, 300, 30, 30, '#33ff66', '#00ff66', 'diamond', 0, true, 0, 'right')
      world.hazards.push(hazard)
      feature.onSafeHazardTouch(world, hazard, 200)
      expect(state.oxygen).toBeGreaterThan(OXYGEN.oxygenLowThreshold)
      expect(state.lowWarningFired).toBe(false)

      // 再度減衰して閾値以下 → 再発火
      vi.clearAllMocks()
      feature.update(world, createMockInput(), 10)
      expect(state.oxygen).toBeLessThanOrEqual(OXYGEN.oxygenLowThreshold)
      expect(state.lowWarningFired).toBe(true)
      expect(soundManager.onHungerDamage).toHaveBeenCalledOnce()
    })
  })

  // ─── T-12: onManualUpdated で酸素は保持される ────────────────────
  describe('T-12: onManualUpdated で酸素保持（#179）', () => {
    it('酸素 40 の状態で更新 → 40 のまま', () => {
      const state = (feature as any).state as { oxygen: number }
      state.oxygen = 40
      state.lowWarningFired = true
      state.deathTriggered = false

      feature.onManualUpdated(world, '1.2a')

      expect(state.oxygen).toBe(40)
      expect(state.lowWarningFired).toBe(true)
      expect(state.deathTriggered).toBe(false)
    })
  })

  // ─── T-13: feature 無効時は何もしない ────────────────────────────
  describe('T-13: feature 無効時の挙動', () => {
    it('update() で酸素不変・modifyPlayerHp 未呼び出し', () => {
      const worldNoOxygen = createMockWorld({ features: [] })
      const featureNoOxygen = new OxygenFeature()
      featureNoOxygen.onInit(worldNoOxygen)

      const state = (featureNoOxygen as any).state as { oxygen: number }
      state.oxygen = 50
      const calls = (worldNoOxygen as Record<string, unknown>).modifyPlayerHpCalls as number[]

      featureNoOxygen.update(worldNoOxygen, createMockInput(), 10)

      expect(state.oxygen).toBe(50) // 不変
      expect(calls).toHaveLength(0) // 死亡トリガー未発火
    })

    it('onPlayerHit は false を返す・modifyPlayerHp 未呼び出し', () => {
      const worldNoOxygen = createMockWorld({ features: [] })
      const featureNoOxygen = new OxygenFeature()
      featureNoOxygen.onInit(worldNoOxygen)

      const calls = (worldNoOxygen as Record<string, unknown>).modifyPlayerHpCalls as number[]

      const result = featureNoOxygen.onPlayerHit(worldNoOxygen)
      expect(result).toBe(false)
      expect(calls).toHaveLength(0)
    })
  })

  // ─── T-14: feature 無効時 render() は throw しない ───────────────
  describe('T-14: feature 無効時 render()', () => {
    it('ctx モックで呼び出しても throw しない', () => {
      const worldNoOxygen = createMockWorld({ features: [] })
      const featureNoOxygen = new OxygenFeature()
      featureNoOxygen.onInit(worldNoOxygen)

      const mockCtx = {
        rect: vi.fn(), fillRect: vi.fn(), fill: vi.fn(),
        save: vi.fn(), restore: vi.fn(),
      } as unknown as CanvasRenderingContext2D

      expect(() => {
        featureNoOxygen.render?.(mockCtx, worldNoOxygen)
      }).not.toThrow()
    })
  })

  // ─── T-15: onDisable() で状態がリセット ───────────────────────────
  describe('T-15: onDisable() で状態リセット', () => {
    it('酸素を減らしてから onDisable → maxOxygen に戻る', () => {
      // 酸素を減らす（珊瑚接触で回復＋閾値超えでフラグリセットの両方をテスト）
      const state = (feature as any).state as { oxygen: number }
      state.oxygen = 50

      const hazard = new Hazard(200, 300, 30, 30, '#33ff66', '#00ff66', 'diamond', 0, true, 0, 'right')
      world.hazards.push(hazard)
      feature.onSafeHazardTouch(world, hazard, 200)
      expect(state.oxygen).toBeGreaterThan(OXYGEN.oxygenLowThreshold)

      // onDisable
      feature.onDisable(world)
      expect(feature.oxygen).toBe(OXYGEN.maxOxygen)
    })
  })

  // ─── T-16: onPlayerHit 二重呼び出しガード（hit-path 死亡） ────────
  describe('T-16: onPlayerHit 二重呼び出しガード', () => {
    it('oxygen <= 0 の状態で onPlayerHit を 2 回呼んでも modifyPlayerHp は 1 回のみ', () => {
      const calls = (world as Record<string, unknown>).modifyPlayerHpCalls as number[]
      // 酸素を 0 に設定（すでに枯渇）
      const state = (feature as any).state as { oxygen: number; deathTriggered: boolean }
      state.oxygen = 0
      state.deathTriggered = false

      feature.onPlayerHit(world)
      expect(calls.filter(v => v === -world.player.maxHp).length).toBe(1)

      // 2 回目の被弾（死亡済み）
      feature.onPlayerHit(world)
      expect(calls.filter(v => v === -world.player.maxHp).length).toBe(1)
    })
  })

  // ─── T-17: onPlayerHit で oxygen <= 0 のとき無敵は付与されない ────
  describe('T-17: 被弾で死亡時は無敵付与なし（negative case of T-6）', () => {
    it('oxygen <= 0 なら player.invincible は変更されない', () => {
      world.player.invincible = 0
      // 酸素を 0 に設定（被弾でさらに 0 以下）
      const state = (feature as any).state as { oxygen: number }
      state.oxygen = 0

      feature.onPlayerHit(world)
      expect(world.player.invincible).toBe(0)
    })
  })
})
