import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShootFeature } from '../../src/game/systems/ShootFeature'
import { Bullet, Hazard, rectsOverlap } from '../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../src/engine/types'
import type { RuntimeRules } from '../../src/domain/types'
import { soundManager } from '../../src/plugins/SoundManager'
import * as GameRegistry from '../../src/engine/GameRegistry'

/** ShootFeature の private state にアクセスするための型 */
interface ShootFeatureState {
  bullets: Bullet[]
  kills: number
  combo: number
  comboTimer: number
  shotCooldown: number
}

/**
 * ShootFeature 回帰テスト
 * - Major 1: 死亡済みハザードの除外漏れによる多重カウント防止
 */

function _makeRules(features: string[]): RuntimeRules {
  return {
    controls: { jump: ' ', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
    hazardColors: new Set(),
    safeColors: new Set(),
    features: new Set(features),
    genre: 'base',
    scrollSpeed: 300,
    bpm: 120,
    gravity: 1600,
    scrollDirection: 'horizontal',
    scrollAxis: 'x',
    environment: 'default',
    playerMaxHp: 3,
    timescale: 1,
    colorTouchScore: 200,
    bossDefeatScore: 5000,
    maxComboForScore: 50,
    scorePerKill: 100,
    scorePerDistance: 0.5,
    longAirScoreRate: 1.5,
    distanceScoreRate: 1,
  } as unknown as RuntimeRules
}

function _makeWorld(
  hazards: Hazard[],
  bullets: Bullet[],
  features: string[] = ['shoot', 'enemy_hp'],
): MutableWorld {
  let kills = 0
  let combo = 0
  const rules = _makeRules(features)

  return {
    player: {
      x: 100, y: 300, w: 20, h: 30,
      vx: 0, vy: 0,
      hp: 3, maxHp: 3,
      isGrounded: true,
      facing: 'right',
      invincible: false,
      invincibleTimer: 0,
      color: '#333',
      glowColor: '#aaa',
    },
    hazards,
    items: [],
    bullets,
    rules,
    distance: 0,
    survivedSec: 0,
    canvas: {} as HTMLCanvasElement,
    ctx: {} as CanvasRenderingContext2D,
    cameraX: 0,
    gameStats: { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false },
    scrollMode: 'x',
    addScore: () => { },
    addScorePopup: () => { },
    triggerShake: () => { },
    addParticle: () => { },
    spawnHazard: () => { },
    spawnItem: () => { },
    removeHazardById: () => { },
    modifyPlayerHp: () => { },
    resetCombo: () => { },
    setTimescale: () => { },
    getHazardScreenX: (h: Hazard) => h.x - 0,
    getPlayerWorldX: () => 100,
    setKills: (n: number) => { kills = n },
    setCombo: (n: number) => { combo = n },
    addBeatHit: () => { },
    setBeatHazardInverted: () => { },
    addScoreVarsHit: () => { },
    addScoreVarsItemCollected: () => { },
    addScoreVarsBossKill: () => { },
    addScoreVarsStealthBonus: () => { },
    addScoreVarsColorTouch: () => { },
  } as unknown as MutableWorld
}

function _makeInput(): InputSnapshot {
  return {
    keys: {},
    justPressed: new Set(),
    justReleased: new Set(),
    mouse: { x: 0, y: 0, down: false },
    touch: null,
  }
}

describe('ShootFeature regression', () => {
  let onEnemyDestroyedSpy: ReturnType<typeof vi.spyOn>
  let onEnemyHitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    onEnemyDestroyedSpy = vi.spyOn(soundManager, 'onEnemyDestroyed' as never)
    onEnemyHitSpy = vi.spyOn(soundManager, 'onEnemyHit' as never)
    // getGenre が "base" 等を要求するので、no-op の GenrePlugin を返すようにモック
    vi.spyOn(GameRegistry, 'getGenre').mockImplementation(() => ({
      onHazardDestroyed: () => { /* no-op */ },
    }))
  })

  afterEach(() => {
    onEnemyDestroyedSpy.mockRestore()
    onEnemyHitSpy.mockRestore()
    GameRegistry.getGenre.mockRestore()
  })

  // Major 1: 複数弾が同一フレームで同一ハザードに命中しても onEnemyDestroyed が 1 回のみ
  it('複数弾が同一フレームで同一ハザードに命中しても onEnemyDestroyed は 1 回のみ呼ばれる', () => {
    // hp=1 のハザードを配置（弾と確実に重なる位置）
    const hazard = new Hazard(380, 200, 40, 40, '#f00', '#f66', 'rect', 1, false)

    // 弾を配置（feature state に直接追加する必要がある）
    const bullets: Bullet[] = [
      new Bullet(380, 205, 500, 0),
      new Bullet(380, 205, 500, 0),
      new Bullet(380, 205, 500, 0),
    ]

    // 弾とハザードの衝突を確認
    for (const b of bullets) {
      expect(rectsOverlap(b.rect, hazard.rect, 0)).toBe(true)
    }

    const world = _makeWorld([hazard], bullets, ['shoot', 'enemy_hp'])
    const feature = new ShootFeature()
    feature.onInit()

    // feature state の bullets に弾を追加（_resolveBulletHazardCollisions は s.bullets を参照する）
    const featureState = feature as unknown as { state: ShootFeatureState }
    featureState.state.bullets = bullets

    feature.update(world, _makeInput(), 1 / 60)

    // onEnemyDestroyed は 1 回のみ（2 回目以降の弾は死亡済みハザードをスキップする）
    expect(onEnemyDestroyedSpy).toHaveBeenCalledTimes(1)
    // onEnemyHit は呼ばれていない（hp=1 で即死のため）
    expect(onEnemyHitSpy).toHaveBeenCalledTimes(0)
  })

  // 死亡済みハザードが cleanup 前に複数弾で叩かれても安全
  it('hp=2 のハザードに 3 発命中: 1 発目=Hit, 2 発目=Destroy (1 回のみ), 3 発目=スキップ', () => {
    const hazard = new Hazard(380, 200, 40, 40, '#f00', '#f66', 'rect', 2, false)

    const bullets: Bullet[] = [
      new Bullet(380, 205, 500, 0),
      new Bullet(380, 205, 500, 0),
      new Bullet(380, 205, 500, 0),
    ]

    const world = _makeWorld([hazard], bullets, ['shoot', 'enemy_hp'])
    const feature = new ShootFeature()
    feature.onInit()
    ;(feature as unknown as { state: ShootFeatureState }).state.bullets = bullets

    feature.update(world, _makeInput(), 1 / 60)

    // onEnemyHit: 1 回（hp が 2→1）
    expect(onEnemyHitSpy).toHaveBeenCalledTimes(1)
    // onEnemyDestroyed: 1 回（hp が 1→0）
    expect(onEnemyDestroyedSpy).toHaveBeenCalledTimes(1)
  })

  // isSafe ハザードは弾が透過する
  it('isSafe ハザードには弾が命中しない', () => {
    const hazard = new Hazard(380, 200, 40, 40, '#0f0', '#6f6', 'rect', 1, true)

    const bullets: Bullet[] = [
      new Bullet(380, 205, 500, 0),
    ]

    const world = _makeWorld([hazard], [], ['shoot', 'enemy_hp'])
    const feature = new ShootFeature()
    feature.onInit()
    ;(feature as unknown as { state: ShootFeatureState }).state.bullets = bullets

    feature.update(world, _makeInput(), 1 / 60)

    // isSafe なので一切ヒットしない
    expect(onEnemyHitSpy).toHaveBeenCalledTimes(0)
    expect(onEnemyDestroyedSpy).toHaveBeenCalledTimes(0)
    // 弾は alive のまま（命中して dead にならない）
    expect(bullets[0].alive).toBe(true)
  })
})
