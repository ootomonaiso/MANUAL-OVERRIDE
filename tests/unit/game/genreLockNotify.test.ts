import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SideScroller } from '../../../src/game/sideScroller'
import { SurvivalPlugin } from '../../../src/genres/SurvivalPlugin'
import { BasePlugin } from '../../../src/genres/BasePlugin'
import { resetRegistry, registerGenre } from '../../../src/engine/GameRegistry'
import { SURVIVAL } from '../../../src/data/tunables'

/** happy-dom は Canvas 2D context をサポートしないためモック */
const mockCtx = {
  save: () => {}, restore: () => {},
  fillRect: () => {}, fillText: () => {},
  beginPath: () => {}, arc: () => {}, fill: () => {},
  stroke: () => {}, moveTo: () => {}, lineTo: () => {},
  closePath: () => {},
  setTransform: () => {}, translate: () => {}, scale: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  clearRect: () => {},
  strokeRect: () => {},
  measureText: () => ({ width: 0 }),
  font: '', textAlign: '', fillStyle: '', strokeStyle: '',
  lineWidth: 0, lineCap: '', lineJoin: '',
  shadowBlur: 0, shadowColor: '',
  globalAlpha: 1,
} as unknown as CanvasRenderingContext2D

/** Canvas 2D context をモック */
vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
  .mockImplementation((type: string) => type === '2d' ? mockCtx : null)

/** SurvivalPlugin が呼ぶ soundManager のメソッドをモック */
vi.mock('../../../src/plugins/SoundManager', () => ({
  soundManager: {
    onJump: () => {}, onLand: () => {}, onShoot: () => {},
    onEnemyDestroyed: () => {}, onEnemyHit: () => {},
    onHit: () => {}, onDeath: () => {}, onManualUpdate: () => {},
    onPauseToggle: () => {}, onItemPickup: () => {},
    onMeleeAttack: () => {}, onMeleeHit: () => {},
    onShieldAbsorb: () => {}, onHungerDamage: () => {},
    onLevelUp: () => {}, onLearningEffect: () => {},
    playBgm: () => {}, stopBgm: () => {},
  },
}))

/**
 * SideScroller.notifyGenreLocked() の動作を検証する。
 *
 * Issue #255: App.vue の lockedGenre watch で notifyGenreLocked() が呼ばれておらず、
 * genreLocked が false のままになっていた。本テストで修正後の動作を確認する。
 */
describe('SideScroller.notifyGenreLocked', () => {
  beforeEach(() => {
    resetRegistry()
    registerGenre(new BasePlugin())
    registerGenre(new SurvivalPlugin())
  })

  it('notifyGenreLocked() 呼び出し後、genreLocked === true になる', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const rules = {
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      features: new Set(['survival_hunger', 'survival_melee', 'survival_level', 'exp', 'item_pickup']),
      genre: 'survival' as const,
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal' as const,
      scrollAxis: 'x' as const,
      environment: 'forest' as const,
      playerMaxHp: 3,
      timescale: 1,
      colorTouchScore: 200,
    }

    const scroller = new SideScroller(canvas, rules)

    // 初期状態: genreLocked は false
    expect(scroller['genreLocked']).toBe(false)

    // notifyGenreLocked() を呼ぶ
    scroller.notifyGenreLocked()

    // genreLocked が true になる
    expect(scroller['genreLocked']).toBe(true)
  })

  it('survival ジャンルで notifyGenreLocked() 後、プレイヤーの hunger/level/weaponDamage が初期化される', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const rules = {
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      features: new Set(['survival_hunger', 'survival_melee', 'survival_level', 'exp', 'item_pickup']),
      genre: 'survival' as const,
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal' as const,
      scrollAxis: 'x' as const,
      environment: 'forest' as const,
      playerMaxHp: 3,
      timescale: 1,
      colorTouchScore: 200,
    }

    const scroller = new SideScroller(canvas, rules)
    const player = scroller['player']

    // プレイヤーの状態を意図的に汚染（hunger=0, level=10, weaponDamage=99）
    player.hunger = 0
    player.level = 10
    player.weaponDamage = 99

    // notifyGenreLocked() で初期化される
    scroller.notifyGenreLocked()

    expect(player.hunger).toBe(SURVIVAL.maxHunger)
    expect(player.level).toBe(1)
    expect(player.weaponDamage).toBe(SURVIVAL.meleeDamage)
  })

  it('survival 以外では onGenreLocked は呼ばれない（hunger 等が変更不要）', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const rules = {
      controls: { shoot: 'z', jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight' },
      hazardColors: new Set(),
      safeColors: new Set(),
      features: new Set(['exp', 'item_pickup']),
      genre: 'runner' as const,
      scrollSpeed: 300,
      bpm: 120,
      gravity: 1600,
      scrollDirection: 'horizontal' as const,
      scrollAxis: 'x' as const,
      environment: 'sky' as const,
      playerMaxHp: 3,
      timescale: 1,
      colorTouchScore: 200,
    }

    const scroller = new SideScroller(canvas, rules)
    const player = scroller['player']

    // runner ジャンル: onGenreLocked は undefined（BasePlugin 等に委譲）
    scroller.notifyGenreLocked()

    // genreLocked は true になるが、hunger/level/weaponDamage は初期値のまま
    expect(scroller['genreLocked']).toBe(true)
    // player.hunger は初期値 100（Player クラスのデフォルト）
    expect(player.hunger).toBe(100)
  })
})
