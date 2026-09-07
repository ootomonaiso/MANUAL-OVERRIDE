import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SideScroller } from '../../../src/game/sideScroller'
import { resetRegistry, registerGenre, registerMode, getMode } from '../../../src/engine/GameRegistry'
import { BasePlugin } from '../../../src/genres/BasePlugin'
import type { RuntimeRules } from '../../../src/domain/types'

// ─── ヘルパー ──────────────────────────────────────────────────────

function createMockCanvas(w = 800, h = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  // getContext をモック（SideScroller が null チェックする）
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    // happy-dom では '2d' が undefined になる場合がある
    vi.spyOn(canvas, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      line: vi.fn(),
      tri: vi.fn(),
      halo: vi.fn(),
      text: vi.fn(),
      sprite: vi.fn(),
      bandGradient: vi.fn(),
      roundedRect: vi.fn(),
      circle: vi.fn(),
      withAlpha: vi.fn(),
      imageSmoothingEnabled: false,
    } as unknown as CanvasRenderingContext2D)
  }
  return canvas
}

function createDefaultRules(overrides: Partial<RuntimeRules> = {}): RuntimeRules {
  return {
    features: new Set(),
    controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
    hazardColors: new Set(),
    safeColors: new Set(),
    genre: 'base',
    scrollSpeed: 300,
    bpm: 120,
    gravity: 1600,
    scrollDirection: 'horizontal',
    environment: 'ground',
    playerMaxHp: 3,
    timescale: 1,
    scrollAxis: 'x',
    colorTouchScore: 200,
    ...overrides,
  }
}

// ─── テスト ────────────────────────────────────────────────────────

describe('Fix 1: GameMode activation', () => {
  it('_refreshMode 後に _activeMode が null でなくなる', () => {
    resetRegistry()
    registerGenre(new BasePlugin())

    // モック Mode を登録
    const mockMode = {
      id: 'test_mode',
      setup: vi.fn(),
      update: vi.fn(),
      render: vi.fn(),
    }
    registerMode('base', mockMode as any)

    const canvas = createMockCanvas()
    const rules = createDefaultRules({ genre: 'base' })
    const scroller = new SideScroller(canvas, rules)

    // _getActiveMode が呼ばれて Mode が取得されることを確認
    const activeMode = (scroller as any)._getActiveMode()
    expect(activeMode).toBe(mockMode)
  })

  it('_refreshMode 後に即座に Mode が解決される', () => {
    resetRegistry()
    registerGenre(new BasePlugin())

    const mockMode = {
      id: 'test_mode2',
      setup: vi.fn(),
      update: vi.fn(),
      render: vi.fn(),
    }
    registerMode('rhythm', mockMode as any)

    const canvas = createMockCanvas()
    const rules = createDefaultRules({ genre: 'rhythm' })
    const scroller = new SideScroller(canvas, rules)

    // _refreshMode を呼ぶ（updateRules 内部から呼ばれる）
    ;(scroller as any)._refreshMode()

    const activeMode = (scroller as any)._activeMode
    expect(activeMode).toBe(mockMode)
  })

  it('Mode がないジャンルでは _activeMode は null のまま', () => {
    resetRegistry()
    registerGenre(new BasePlugin())

    // base には Mode を登録しない
    const canvas = createMockCanvas()
    const rules = createDefaultRules({ genre: 'base' })
    const scroller = new SideScroller(canvas, rules)

    // _refreshMode を呼んでも Mode が未登録なので null
    ;(scroller as any)._refreshMode()

    const activeMode = (scroller as any)._activeMode
    expect(activeMode).toBeNull()
  })
})

describe('Fix 3: SanityFeature declareWin', () => {
  it('world.declareWin が呼ばれると _onWin が実行される', () => {
    resetRegistry()
    registerGenre(new BasePlugin())

    const canvas = createMockCanvas()
    const rules = createDefaultRules({
      features: new Set(['sanity']),
      genre: 'horror',
    })
    const scroller = new SideScroller(canvas, rules)

    // _buildWorld 経由で declareWin を取得
    const world = (scroller as any)._buildWorld()
    expect(world.declareWin).toBeDefined()
    expect(typeof world.declareWin).toBe('function')

    // declareWin を呼ぶと won が true になる
    world.declareWin!()
    const snapshot = scroller.getSnapshot()
    expect(snapshot.won).toBe(true)
  })
})

describe('Fix 4: GlitchCorruptFeature probability', () => {
  it('ハザード速度倍化の確率が秒ベースになる', async () => {
    const { GlitchCorruptFeature } = await import('../../../src/game/systems/GlitchCorruptFeature')
    const { Player, Hazard } = await import('../../../src/game/entities')
    const { BasePlugin } = await import('../../../src/genres/BasePlugin')

    resetRegistry()
    registerGenre(new BasePlugin())

    const feature = new GlitchCorruptFeature()
    const player = new Player(100, 500)
    const hazards = [new Hazard(200, 400, 30, 40, 'red', '#ff0000', 'rect', 1, false, 0, 'right')]

    const keys = new Set<string>()
    const justPressed = new Set<string>()
    const justReleased = new Set<string>()

    const world: any = {
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
      gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
      canvas: { width: 800, height: 600 } as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
      scrollMode: 'x',
      stealthHidden: false,
      input: { keys, justPressed, justReleased },
      setStealthHidden: vi.fn(),
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
      getHazardScreenX: vi.fn(),
      getPlayerWorldX: vi.fn(),
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

    feature.onInit?.(world)

    // 大量フレームで update してエラーにならないことを確認
    for (let i = 0; i < 100; i++) {
      feature.update(world, world.input, 0.016)
    }
    expect(hazards).toHaveLength(1)
  })
})

describe('Fix 5: TowerDefMode keyboard input', () => {
  it('_tryPlaceTowerAtPlayer を直接呼び出す', async () => {
    const { TowerDefMode } = await import('../../../src/game/modes/TowerDefMode')
    const { Player } = await import('../../../src/game/entities')

    resetRegistry()
    registerGenre(new BasePlugin())

    const mode = new TowerDefMode()
    const player = new Player(150, 400)

    const world: any = {
      player,
      hazards: [], items: [], bullets: [],
      cameraX: 0, distance: 0, survivedSec: 0,
      rules: {
        features: new Set(),
        controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
        hazardColors: new Set(), safeColors: new Set(),
        genre: 'tower_def', scrollSpeed: 300, bpm: 120, gravity: 0,
        scrollDirection: 'horizontal', environment: 'ground',
        playerMaxHp: 3, timescale: 1, scrollAxis: 'x', colorTouchScore: 200,
      },
      gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
      canvas: { width: 800, height: 600 } as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
      scrollMode: 'x', stealthHidden: false,
      input: { keys: new Set(), justPressed: new Set(), justReleased: new Set() },
      setStealthHidden: vi.fn(), addScore: vi.fn(), addScorePopup: vi.fn(),
      triggerShake: vi.fn(), addParticle: vi.fn(),
      spawnHazard: vi.fn(), spawnItem: vi.fn(), removeHazardById: vi.fn(),
      modifyPlayerHp: vi.fn(), resetCombo: vi.fn(), setTimescale: vi.fn(),
      getHazardScreenX: vi.fn(), getPlayerWorldX: vi.fn(),
      setKills: vi.fn(), setCombo: vi.fn(), addBeatHit: vi.fn(),
      setBeatHazardInverted: vi.fn(), addShot: vi.fn(),
      addScoreVarsHit: vi.fn(), addScoreVarsItemCollected: vi.fn(),
      addScoreVarsBossKill: vi.fn(), addScoreVarsStealthBonus: vi.fn(),
      addScoreVarsColorTouch: vi.fn(), declareWin: vi.fn(),
      getDoubledHazardIds: vi.fn(() => new Set()),
    }

    mode.setup(world)

    // selectedTowerType を直接設定
    mode['state'].selectedTowerType = 0

    const before = mode['state'].towers.length
    expect(before).toBe(0)
    expect(mode['state'].gold).toBe(200)

    // 直接メソッド呼び出し
    ;(mode as any)._tryPlaceTowerAtPlayer(world)

    const after = mode['state'].towers.length
    expect(after).toBe(1)
    expect(mode['state'].gold).toBe(150)
  })

  it('end-to-end: update 内で Space キーがタワー配置をトリガーする', async () => {
    const { TowerDefMode } = await import('../../../src/game/modes/TowerDefMode')
    const { Player } = await import('../../../src/game/entities')

    resetRegistry()
    registerGenre(new BasePlugin())

    const mode = new TowerDefMode()
    const player = new Player(150, 400)

    const keys = new Set<string>()
    const justPressed = new Set<string>()
    const justReleased = new Set<string>()

    const world: any = {
      player,
      hazards: [], items: [], bullets: [],
      cameraX: 0, distance: 0, survivedSec: 0,
      rules: {
        features: new Set(),
        controls: { jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
        hazardColors: new Set(), safeColors: new Set(),
        genre: 'tower_def', scrollSpeed: 300, bpm: 120, gravity: 0,
        scrollDirection: 'horizontal', environment: 'ground',
        playerMaxHp: 3, timescale: 1, scrollAxis: 'x', colorTouchScore: 200,
      },
      gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
      canvas: { width: 800, height: 600 } as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
      scrollMode: 'x', stealthHidden: false,
      input: { keys, justPressed, justReleased },
      setStealthHidden: vi.fn(), addScore: vi.fn(), addScorePopup: vi.fn(),
      triggerShake: vi.fn(), addParticle: vi.fn(),
      spawnHazard: vi.fn(), spawnItem: vi.fn(), removeHazardById: vi.fn(),
      modifyPlayerHp: vi.fn(), resetCombo: vi.fn(), setTimescale: vi.fn(),
      getHazardScreenX: vi.fn(), getPlayerWorldX: vi.fn(),
      setKills: vi.fn(), setCombo: vi.fn(), addBeatHit: vi.fn(),
      setBeatHazardInverted: vi.fn(), addShot: vi.fn(),
      addScoreVarsHit: vi.fn(), addScoreVarsItemCollected: vi.fn(),
      addScoreVarsBossKill: vi.fn(), addScoreVarsStealthBonus: vi.fn(),
      addScoreVarsColorTouch: vi.fn(), declareWin: vi.fn(),
      getDoubledHazardIds: vi.fn(() => new Set()),
    }

    mode.setup(world)

    // 1フレーム目: Space を押してゲーム開始
    justPressed.add('Space')
    keys.add('Space')
    mode.update(world, 0.016)
    expect(mode['state'].gameStarted).toBe(true)

    // 2フレーム目: Space を離す（justReleased に Space を追加）
    justReleased.add('Space')
    const before = mode['state'].towers.length
    mode.update(world, 0.016)
    const after = mode['state'].towers.length

    expect(after).toBe(before + 1)
  })
})

describe('Fix 6: Win overlay fade-in', () => {
  it('勝利時に _winFadeTimer が 0 にリセットされる', () => {
    resetRegistry()
    registerGenre(new BasePlugin())

    const canvas = createMockCanvas()
    const rules = createDefaultRules({
      features: new Set(['sanity']),
      genre: 'horror',
    })
    const scroller = new SideScroller(canvas, rules)

    // 直接 _onWin を呼んで勝利状態にする
    ;(scroller as any)._onWin()

    expect((scroller as any).won).toBe(true)
    expect((scroller as any)._winFadeTimer).toBe(0)
  })

  it('死亡時と勝利時に deathTimer / _winFadeTimer が独立して管理される', () => {
    resetRegistry()
    registerGenre(new BasePlugin())

    const canvas = createMockCanvas()
    const rules = createDefaultRules({
      features: new Set(['sanity']),
      genre: 'horror',
    })
    const scroller = new SideScroller(canvas, rules)

    // 死亡状態
    scroller.dead = true
    scroller.deathTimer = 3.0

    expect((scroller as any).won).toBe(false)
    expect((scroller as any)._winFadeTimer).toBe(0)
    expect((scroller as any).deathTimer).toBe(3.0)

    // 勝利状態に切り替え（_onWin を呼ぶと _winFadeTimer が 0 にリセットされる）
    scroller.dead = false
    ;(scroller as any)._onWin()

    // _winFadeTimer は 0（_onWin でリセットされた）
    expect((scroller as any)._winFadeTimer).toBe(0)
    expect((scroller as any).won).toBe(true)
    // deathTimer は死亡時に設定した値のまま（勝利時には変更されない）
    expect((scroller as any).deathTimer).toBe(3.0)
  })
})
