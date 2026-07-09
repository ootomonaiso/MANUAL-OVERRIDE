import { describe, it, expect, vi } from 'vitest'
import { ShootFeature } from '../../../src/game/systems/ShootFeature'
import { Player, Bullet } from '../../../src/game/entities'
import type { MutableWorld, InputSnapshot } from '../../../src/engine/types'

// getActiveSystems は未登録でも空配列を返すため実装のまま使う。
// getGenre は destroyedHazards が空なら呼ばれないが、安全のためスタブ化する。
vi.mock('../../../src/engine/GameRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/engine/GameRegistry')>()
  return {
    ...actual,
    getGenre: () => ({ onHazardDestroyed: () => {} }),
  }
})

/**
 * tower_def ジャンルを模した最小 World。
 * enableFeatures = ["tower", "enemy_hp", "item_pickup"] で 'shoot' を含まない。
 * ShootFeature は handles に 'enemy_hp' を含むため、この構成でも getActiveSystems で
 * アクティブ扱いになり update() が毎フレーム実行される。
 */
function createTowerDefWorld(): MutableWorld {
  const player = new Player(100, 500)
  const bullets: Bullet[] = []
  const world = {
    player,
    hazards: [],
    items: [],
    bullets,
    cameraX: 0,
    distance: 0,
    canvas: { width: 800, height: 600 },
    // SpecialFeature（tower）が既に敵を倒してスコア変数を積んだ状態を表す
    gameStats: { kills: 5, combo: 3 },
    rules: {
      genre: 'tower_def',
      // 'shoot' なし。'enemy_hp' があるので ShootFeature がアクティブになる
      features: new Set(['tower', 'enemy_hp', 'item_pickup']),
      controls: { shoot: 'z' },
      scrollAxis: 'x',
    },
    addScore: () => {},
    addScorePopup: () => {},
    addScoreVarsHit: () => {},
    setKills: (n: number) => { (world.gameStats as { kills: number }).kills = n },
    setCombo: (n: number) => { (world.gameStats as { combo: number }).combo = n },
  } as unknown as MutableWorld
  return world
}

function emptyInput(): InputSnapshot {
  return { keys: new Set(), justPressed: new Set(), justReleased: new Set() } as InputSnapshot
}

describe('ShootFeature: enemy_hp のみ有効なジャンル（tower_def）での kills/combo 上書き', () => {
  it('shoot 未有効でも update() が world の kills/combo を 0 に上書きする（tower の加算を打ち消す）', () => {
    const feature = new ShootFeature()
    const world = createTowerDefWorld()
    feature.onInit()

    // 事前条件: tower が積んだ想定のスコア変数
    expect(world.gameStats.kills).toBe(5)
    expect(world.gameStats.combo).toBe(3)

    // ShootFeature.update を1フレーム走らせる（弾は発射されない = 内部 kills/combo は 0 のまま）
    feature.update(world, emptyInput(), 0.016)

    // バグ: _syncWorldStats が無条件に setKills(0)/setCombo(0) を呼び、
    // tower（SpecialFeature）が積んだ kills=5 / combo=3 が消える。
    // scoreFormula "kills * 90 + combo * 110 + survivedSec * 8" の
    // kills 項・combo 項が常時 0 になることを示す。
    expect(world.gameStats.kills).toBe(0)
    expect(world.gameStats.combo).toBe(0)
  })
})
