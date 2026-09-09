import { describe, it, expect, beforeEach } from 'vitest'
import { PlatformerFeature } from '../../../src/game/systems/PlatformerFeature'
import { Player, Hazard } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot, GameStats } from '../../../src/engine/types'
import { PLATFORMER } from '../../../src/data/tunables'
import { PLAYER_PHYSICS } from '../../../src/data/gameBalance'

// テスト用の最小限の MutableWorld モック
function createMockWorld(options?: {
  features?: string[]
  scrollAxis?: string
  scrollDirection?: string
}): MutableWorld {
  const player = new Player(100, 500)
  const hazards: Hazard[] = []
  const particles: unknown[] = []
  const popups: unknown[] = []
  const hpCalls: number[] = []

  const gameStats: GameStats = {
    kills: 0,
    combo: 0,
    maxCombo: 0,
    beatHits: 0,
    beatHazardInverted: false,
  }

  const features = options?.features ?? ['platformer', 'double_jump', 'movement']

  const world: MutableWorld = {
    player,
    hazards,
    items: [],
    bullets: [],
    cameraX: 0,
    distance: 0,
    rules: {
      features: new Set(features),
      controls: {
        jump: 'Space',
        moveLeft: 'ArrowLeft',
        moveRight: 'ArrowRight',
        moveUp: 'ArrowUp',
        moveDown: 'ArrowDown',
      },
      genre: options?.scrollDirection === 'vertical' ? 'platformer' : 'base',
      hazardColors: new Set(),
      safeColors: new Set(),
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: options?.scrollDirection ?? 'horizontal',
      environment: 'sky',
      playerMaxHp: 3,
      timescale: 1,
      scrollAxis: options?.scrollAxis ?? 'x',
      colorTouchScore: 200,
    },
    survivedSec: 0,
    canvas: { width: 1280, height: 800 } as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    gameStats,
    scrollMode: options?.scrollDirection === 'vertical' ? 'y' : 'x',
    stealthHidden: false,
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
      hpCalls.push(delta)
    },
    resetCombo: () => { gameStats.combo = 0 },
    setTimescale: () => {},
    spawnHazard: (h: Hazard) => { hazards.push(h) },
    spawnItem: () => {},
    removeHazardById: (h: Hazard) => {
      const i = hazards.indexOf(h)
      if (i >= 0) hazards.splice(i, 1)
    },
    setKills: (n: number) => { gameStats.kills = n },
    setCombo: (n: number) => {
      gameStats.combo = n
      if (n > gameStats.maxCombo) gameStats.maxCombo = n
    },
    addBeatHit: () => { gameStats.beatHits++ },
    setBeatHazardInverted: () => {},
    addShot: () => {},
    addJump: () => {
      (world as unknown as { _jumps: number })._jumps =
        ((world as unknown as { _jumps: number })._jumps ?? 0) + 1
    },
    addScoreVarsHit: () => {},
    addScoreVarsItemCollected: () => {},
    addScoreVarsBossKill: () => {},
    addScoreVarsStealthBonus: () => {},
    addScoreVarsColorTouch: () => {},
    setStealthHidden: () => {},
    getHazardScreenX: (h) => h.x,
    getPlayerWorldX: () => player.x,
    addScore: () => {},
  } as unknown as MutableWorld

  return world
}

function createMockInput(justPressed: Set<string> = new Set(), keys: Set<string> = new Set()): InputSnapshot {
  return {
    keys,
    justPressed,
    justReleased: new Set<string>(),
  } as InputSnapshot
}

describe('PlatformerFeature', () => {
  let feature: PlatformerFeature
  let world: MutableWorld

  beforeEach(() => {
    feature = new PlatformerFeature()
    world = createMockWorld({
      features: ['platformer', 'double_jump', 'movement'],
      scrollAxis: 'y',
      scrollDirection: 'vertical',
    })
    feature.onInit(world)
  })

  describe('onInit', () => {
    it('lavaSurfaceGap が lavaStartOffset（画面下端からの相対オフセット）に初期化される', () => {
      expect(feature.getLavaSurfaceGap()).toBe(PLATFORMER.lavaStartOffset)
    })

    it('prevBottom がプレイヤー底辺に初期化される', () => {
      // prevBottom は private フィールド。update 1 回で prevBottom が記録された値を
      // 初期値と一致するか検証する。
      world.player.x = 1000  // 横外（プラットフォームなし）
      feature.update(world, createMockInput(), 0)
      const recordedPrevBottom = (feature as unknown as { prevBottom: number }).prevBottom
      expect(recordedPrevBottom).toBe(world.player.y + world.player.h)
    })
  })

  describe('preUpdate: 重力積分', () => {
    it('p.vy が gravity * dt ずつ累積増加する', () => {
      const dt = 0.016
      const initialVy = 0
      feature.preUpdate(world, createMockInput(), dt)
      expect(world.player.vy).toBeCloseTo(PLATFORMER.gravity * dt, 0)
      feature.preUpdate(world, createMockInput(), dt)
      expect(world.player.vy).toBeCloseTo(PLATFORMER.gravity * dt * 2, 0)
      feature.preUpdate(world, createMockInput(), dt)
      expect(world.player.vy).toBeCloseTo(PLATFORMER.gravity * dt * 3, 0)
    })

    it('p.vy が maxFallSpeed でクランプされる', () => {
      // maxFallSpeed = 1200。gravity=1500, dt=0.016 → 1 フレームで 24。
      // 1200/24 = 50 フレームで到達。大量に呼び出す。
      const dt = 0.016
      for (let i = 0; i < 100; i++) {
        feature.preUpdate(world, createMockInput(), dt)
      }
      expect(world.player.vy).toBeLessThanOrEqual(PLATFORMER.maxFallSpeed)
    })
  })

  describe('preUpdate: 水平移動', () => {
    it('ArrowRight で vx === runSpeed', () => {
      const keys = new Set(['ArrowRight'])
      feature.preUpdate(world, createMockInput(new Set(), keys), 0)
      expect(world.player.vx).toBe(PLATFORMER.runSpeed)
    })

    it('ArrowLeft で vx === -runSpeed', () => {
      const keys = new Set(['ArrowLeft'])
      feature.preUpdate(world, createMockInput(new Set(), keys), 0)
      expect(world.player.vx).toBe(-PLATFORMER.runSpeed)
    })

    it('入力なしで vx === 0', () => {
      feature.preUpdate(world, createMockInput(), 0)
      expect(world.player.vx).toBe(0)
    })
  })

  describe('preUpdate: ジャンプ', () => {
    it('接地時にジャンプすると vy === jumpVelocity, jumpsLeft 2→1, onGround=false', () => {
      world.player.onGround = true
      world.player.jumpsLeft = 2
      const justPressed = new Set(['Space'])
      feature.preUpdate(world, createMockInput(justPressed), 0)
      expect(world.player.vy).toBe(PLAYER_PHYSICS.jumpVelocity)
      expect(world.player.jumpsLeft).toBe(1)
      expect(world.player.onGround).toBe(false)
    })

    it('二段ジャンプ: 空中 jumpsLeft=1 → 0 に減算され vy 再設定', () => {
      world.player.onGround = false
      world.player.jumpsLeft = 1
      const justPressed = new Set(['Space'])
      feature.preUpdate(world, createMockInput(justPressed), 0)
      expect(world.player.vy).toBe(PLAYER_PHYSICS.jumpVelocity)
      expect(world.player.jumpsLeft).toBe(0)
    })

    it('jumpsLeft=0 且つ非接地 → ジャンプしない', () => {
      world.player.onGround = false
      world.player.jumpsLeft = 0
      const justPressed = new Set(['Space'])
      const initialVy = world.player.vy
      feature.preUpdate(world, createMockInput(justPressed), 0)
      expect(world.player.vy).toBe(initialVy)
      expect(world.player.jumpsLeft).toBe(0)
    })

    it('ジャンプ時に addJump が呼ばれて統計に記録される', () => {
      world.player.onGround = true
      world.player.jumpsLeft = 2
      const justPressed = new Set(['Space'])
      feature.preUpdate(world, createMockInput(justPressed), 0)
      expect((world as unknown as { _jumps: number })._jumps).toBe(1)
    })
  })

  describe('update: 着地', () => {
    it('着地: vy>0, prevBottom が頂上より上, bottom がバンド内 → 着地する', () => {
      // プラットフォームをプレイヤー上に配置（x=80, w=100 → 80〜180）
      const platform = new Hazard(80, 300, 100, 20, '#ffcc00', '#ffee88', 'rect', 1, true, 0)
      world.hazards.push(platform)

      // プレイヤーをプラットフォーム上で（bottom が 300〜324 の範囲）
      world.player.y = 305 - world.player.h  // bottom = 305
      world.player.vy = 100  // 下降中

      // まず update を 1 回呼んで prevBottom を記録（player はまだプラットフォーム外）
      world.player.x = 1000  // プラットフォーム横外
      feature.update(world, createMockInput(), 0)
      // プレイヤーをプラットフォーム上に移動
      world.player.x = 100
      world.player.y = 305 - world.player.h
      world.player.vy = 100
      feature.update(world, createMockInput(), 0)

      expect(world.player.y).toBe(300 - world.player.h)
      expect(world.player.vy).toBe(0)
      expect(world.player.onGround).toBe(true)
      expect(world.player.jumpsLeft).toBe(2)
    })

    it('高速落下（swept）: bottom が top+threshold を超過しても着地する', () => {
      const platform = new Hazard(80, 300, 100, 20, '#ffcc00', '#ffee88', 'rect', 1, true, 0)
      world.hazards.push(platform)

      // プレイヤーをプラットフォーム横外に配置して prevBottom を記録
      world.player.x = 1000
      world.player.y = 200
      feature.update(world, createMockInput(), 0)

      // プレイヤーをプラットフォーム上に移動（bottom=340、top+threshold=324 を超過）
      world.player.x = 100
      world.player.y = 340 - world.player.h
      world.player.vy = 500
      feature.update(world, createMockInput(), 0)

      expect(world.player.y).toBe(300 - world.player.h)
      expect(world.player.vy).toBe(0)
      expect(world.player.onGround).toBe(true)
    })

    it('上昇中（vy<0）は通過する', () => {
      const platform = new Hazard(400, 300, 100, 20, '#ffcc00', '#ffee88', 'rect', 1, true, 0)
      world.hazards.push(platform)

      // prevBottom を記録
      world.player.y = 200
      feature.update(world, createMockInput(), 0)

      // プレイヤーをプラットフォーム上で上昇中
      world.player.y = 290
      world.player.vy = -100
      const initialY = world.player.y
      feature.update(world, createMockInput(), 0)

      expect(world.player.y).toBe(initialY)
      expect(world.player.onGround).toBe(false)
    })

    it('水平非重なり → 着地しない', () => {
      const platform = new Hazard(400, 300, 100, 20, '#ffcc00', '#ffee88', 'rect', 1, true, 0)
      world.hazards.push(platform)

      world.player.y = 200
      feature.update(world, createMockInput(), 0)

      // プレイヤーを横外に
      world.player.x = 1000
      world.player.y = 310 - world.player.h
      world.player.vy = 100
      const initialY = world.player.y
      feature.update(world, createMockInput(), 0)

      expect(world.player.y).toBe(initialY)
      expect(world.player.onGround).toBe(false)
    })
  })

  describe('update: 溶岩', () => {
    it('溶岩が riseRate * dt だけ上昇する（lavaSurfaceGap が減少）', () => {
      const initialGap = feature.getLavaSurfaceGap()
      feature.update(world, createMockInput(), 1)
      const expected = initialGap - PLATFORMER.lavaRiseRate * 1
      expect(feature.getLavaSurfaceGap()).toBeCloseTo(expected, 1)
    })

    it('溶岩衝突で即死（modifyPlayerHp(-maxHp) が 1 回）', () => {
      // 溶岩を画面内に設定（gap = -200 → lavaScreenY = H - 200）
      feature.lavaSurfaceGap = -200
      // プレイヤー底辺が溶岩表面より下になるように設定
      // H=800, lavaScreenY=600, player.bottom=500+52=552 → 552 < 600 なのでまだ安全
      // gap を -50 にして lavaScreenY=750 に → player.bottom=552 < 750 まだ安全
      // gap を -500 にして lavaScreenY=300 に → player.bottom=552 >= 300 で死亡
      feature.lavaSurfaceGap = -500
      feature.update(world, createMockInput(), 0)
      expect(world.player.hp).toBe(0)

      // 2 回目の update で再発火しない
      const hpBefore = world.player.hp
      feature.update(world, createMockInput(), 0)
      expect(world.player.hp).toBe(hpBefore)
    })

    it('溶岩が画面外（gap >= 0）のときは死亡しない', () => {
      feature.lavaSurfaceGap = 0  // ちょうど画面下端
      const initialHp = world.player.hp
      feature.update(world, createMockInput(), 0)
      expect(world.player.hp).toBe(initialHp)
    })
  })

  describe('update: 着地固定（carry-while-standing）', () => {
    it('着地後、プラットフォームが下降してもプレイヤーが固定される', () => {
      const platform = new Hazard(100, 400, 100, 20, '#ffcc00', '#ffee88', 'rect', 1, true, 0)
      world.hazards.push(platform)

      // まず update を呼んで prevBottom を記録（横外）
      world.player.x = 1000
      world.player.y = 300
      feature.update(world, createMockInput(), 0)

      // プレイヤーをプラットフォーム上に移動して着地
      world.player.x = 100
      world.player.y = 400 - world.player.h  // bottom = 400 = top
      world.player.vy = 100
      feature.update(world, createMockInput(), 0)

      // 着地確認
      expect(world.player.onGround).toBe(true)

      // 実エンジンと同じ順序: preUpdate（重力積分）→ プラットフォーム降下 → update（着地固定）
      const dt = 0.016
      const platformDrop = 300 * dt  // ≈ 4.8px/frame（scrollSpeed=300）

      let consecutiveOnGround = 0
      for (let i = 0; i < 60; i++) {
        // preUpdate: 重力積分（接地中は vy が蓄積）
        feature.preUpdate(world, createMockInput(), dt)
        // プラットフォームが下降（実エンジン: _updateVertical が update より前に h.y += speed*dt）
        platform.y += platformDrop
        // update: 着地固定が働く（standingOn により再スナップ）
        feature.update(world, createMockInput(), dt)
        if (world.player.onGround) {
          consecutiveOnGround++
        }
      }

      // 60 フレーム連続して接地しているはず（carry が効いている）
      expect(consecutiveOnGround).toBeGreaterThanOrEqual(50)
      expect(world.player.onGround).toBe(true)

      // プレイヤーの底辺はプラットフォーム top の ±band 範囲内
      const playerBottom = world.player.y + world.player.h
      const newPlatformTop = platform.rect.y
      // STANDING_CARRY_BAND_PX = 16（feature 内定数）
      expect(Math.abs(playerBottom - newPlatformTop)).toBeLessThanOrEqual(17)
    })

    it('ジャンプすると着地固定が解除される', () => {
      const platform = new Hazard(100, 400, 100, 20, '#ffcc00', '#ffee88', 'rect', 1, true, 0)
      world.hazards.push(platform)

      // 着地
      world.player.x = 1000
      world.player.y = 300
      feature.update(world, createMockInput(), 0)
      world.player.x = 100
      world.player.y = 400 - world.player.h
      world.player.vy = 100
      feature.update(world, createMockInput(), 0)

      expect(world.player.onGround).toBe(true)

      // ジャンプ
      world.player.onGround = true
      const justPressed = new Set(['Space'])
      feature.preUpdate(world, createMockInput(justPressed), 0)

      // standingOn が解除される（ジャンプ時に null になる）
      expect((feature as unknown as { standingOn: Hazard | null }).standingOn).toBeNull()
    })
  })

  describe('update: 溶岩の猶予期間', () => {
    it('プレイヤーが画面底辺に静止している間、溶岩が gap=0 に達するまで生存する', () => {
      const H = world.canvas.height
      // プレイヤーを画面底辺に（縦モードでは画面下端でクランプ）
      world.player.y = H - world.player.h

      // 溶岩初期位置（gap = lavaStartOffset = 100）
      const initialGap = feature.getLavaSurfaceGap()
      expect(initialGap).toBe(PLATFORMER.lavaStartOffset)

      // dt=0 のときは溶岩が上昇しないため、プレイヤーは永久に生存する
      const initialHp = world.player.hp
      feature.update(world, createMockInput(), 0)
      expect(world.player.hp).toBe(initialHp)
    })

    it('dt>0 で進行すると溶岩が上昇し、gap=0 で死亡する', () => {
      const H = world.canvas.height
      world.player.y = H - world.player.h

      const dt = 0.016
      const initialGap = feature.getLavaSurfaceGap()
      // 猶予時間 = lavaStartOffset / lavaRiseRate = 100 / 15 ≈ 6.67s
      // フレーム数 = 6.67 / 0.016 ≈ 417 フレーム

      let survivedFrames = 0
      while (world.player.hp > 0) {
        feature.update(world, createMockInput(), dt)
        survivedFrames++
        if (survivedFrames > 500) break
      }

      // 約 417 フレーム後に死亡するはず
      expect(survivedFrames).toBeGreaterThanOrEqual(400)
      expect(world.player.hp).toBe(0)
    })
  })

  describe('onManualUpdated', () => {
    it('同一 player での更新では溶岩位置が保持される', () => {
      (feature as unknown as { firstInit: boolean }).firstInit = false
      // 溶岩位置を変化させる
      feature.lavaSurfaceGap = -100
      feature.onManualUpdated(world, 'v2')
      expect(feature.getLavaSurfaceGap()).toBe(-100)
    })

    it('新 player インスタンスでの更新では溶岩位置がリセットされる', () => {
      feature.lavaSurfaceGap = -100
      const newWorld = createMockWorld({
        features: ['platformer', 'double_jump', 'movement'],
        scrollAxis: 'y',
        scrollDirection: 'vertical',
      })
      feature.onManualUpdated(newWorld, 'v2')
      expect(feature.getLavaSurfaceGap()).toBe(PLATFORMER.lavaStartOffset)
    })
  })

  describe('onDisable', () => {
    it('状態がリセットされる', () => {
      feature.lavaSurfaceGap = -100
      feature.onDisable(world)
      expect(feature.getLavaSurfaceGap()).toBe(0)
      // firstInit が true になるので、次回の onManualUpdated で再初期化される
    })
  })

  describe('feature 非アクティブ', () => {
    it('preUpdate が無操作', () => {
      const inactiveWorld = createMockWorld({
        features: ['movement'], // platformer なし
        scrollAxis: 'y',
        scrollDirection: 'vertical',
      })
      inactiveWorld.player.vy = 500
      feature.preUpdate(inactiveWorld, createMockInput(), 0)
      expect(inactiveWorld.player.vy).toBe(500)
    })

    it('update が無操作', () => {
      const inactiveWorld = createMockWorld({
        features: ['movement'],
        scrollAxis: 'y',
        scrollDirection: 'vertical',
      })
      const initialGap = feature.getLavaSurfaceGap()
      feature.update(inactiveWorld, createMockInput(), 1)
      expect(feature.getLavaSurfaceGap()).toBe(initialGap)
    })

    it('render が例外を投げない', () => {
      const inactiveWorld = createMockWorld({
        features: ['movement'],
        scrollAxis: 'y',
        scrollDirection: 'vertical',
      })
      expect(() => feature.render({} as CanvasRenderingContext2D, inactiveWorld)).not.toThrow()
    })
  })

  describe('render', () => {
    it('feature 有効時・非アクティブ時ともに例外を投げない', () => {
      const mockCtx = {
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        save: () => {},
        restore: () => {},
        setTransform: () => {},
        get fillStyle() { return '' },
        set fillStyle(_v: string) {},
        fillRect: () => {},
        globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D

      expect(() => feature.render(mockCtx, world)).not.toThrow()
    })

    it('溶岩が可視範囲（gap < 0）にあるとき本体色で矩形を描画する', () => {
      const rects: Array<{ y: number; h: number; style: string }> = []
      let currentStyle = ''
      const mockCtx = {
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        save: () => {},
        restore: () => {},
        setTransform: () => {},
        get fillStyle() { return currentStyle },
        set fillStyle(v: string) { currentStyle = v },
        fillRect: (_x: number, y: number, _w: number, h: number) => {
          rects.push({ y, h, style: currentStyle })
        },
        globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D

      const H = world.canvas.height
      // 溶岩を画面下端より 200px 上（可視）に設定: gap = -200 → topY = H - 200
      feature.lavaSurfaceGap = -200
      feature.render(mockCtx, world)

      // 本体（#ff4400）が正の高度で描画されていること
      const body = rects.find(r => r.style === PLATFORMER.lavaColor && r.h > 0)
      expect(body).toBeDefined()
      // 表面明線（glow 色）も描画されていること
      expect(rects.some(r => r.style === PLATFORMER.lavaGlowColor && r.h > 0)).toBe(true)
    })

    it('溶岩がオフスクリーン（gap >= 0）のときは描画しない', () => {
      const rects: Array<{ y: number; h: number; style: string }> = []
      let currentStyle = ''
      const mockCtx = {
        getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
        save: () => {},
        restore: () => {},
        setTransform: () => {},
        get fillStyle() { return currentStyle },
        set fillStyle(v: string) { currentStyle = v },
        fillRect: (_x: number, y: number, _w: number, h: number) => {
          rects.push({ y, h, style: currentStyle })
        },
        globalAlpha: 1,
      } as unknown as CanvasRenderingContext2D

      // gap = 0 → topY = H → 描画なし
      feature.lavaSurfaceGap = 0
      feature.render(mockCtx, world)
      expect(rects).toHaveLength(0)
    })
  })
})
