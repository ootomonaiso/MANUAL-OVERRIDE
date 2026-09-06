/**
 * tests/unit/domain/battle/encounter.test.ts
 *
 * 特性テスト（characterization test）。battleEngine.ts:104-222 の「敵グループ/難易度スケーリング」
 * （ボス周期・真のクリア判定・出現重みティア）は直接のテストが無く、
 * docs/refactoring/02-domain.md §2-4 で encounter.ts へ切り出す予定のため、
 * 移設前に現行の挙動を固定しておく。
 *
 * 重み・周期の値は src/data/config/encounter_groups.json（ENCOUNTER_GROUPS）から読み、
 * テスト側に数値を書き写さない（設定を変えたら期待値も追随する）。
 */

import { describe, it, expect } from 'vitest'
import {
  isBossBattleIndex, bossOccurrenceNumber, bossGroupFor,
  isTrueClearOccurrence, isTrueClearBattleIndex, pickEnemyDefs,
} from '../../../../src/domain/battle/battleEngine'
import { ENCOUNTER_GROUPS } from '../../../../src/data/tunables'
import type { EncounterGroupsConfig } from '../../../../src/framework/config-types'
import { makeEnemyDef, makeEnemySet, makeContent, constRng } from './_helpers'

const INTERVAL = ENCOUNTER_GROUPS.bossIntervalBattles
const GROUP_ORDER = ENCOUNTER_GROUPS.groupOrder
const LAPS = ENCOUNTER_GROUPS.lapsForTrueClear

/** battleIndex は 0 始まり。n 回目（1始まり）のボス戦の index */
function bossIndexOf(occurrence: number): number {
  return occurrence * INTERVAL - 1
}

describe('encounter: ボス戦の周期判定', () => {
  it('index 0（1戦目）はボス戦ではない', () => {
    expect(isBossBattleIndex(0, INTERVAL)).toBe(false)
  })

  it('bossIntervalBattles 戦目ちょうど（index = interval - 1）が最初のボス戦', () => {
    expect(isBossBattleIndex(INTERVAL - 2, INTERVAL)).toBe(false)
    expect(isBossBattleIndex(INTERVAL - 1, INTERVAL)).toBe(true)
    expect(isBossBattleIndex(INTERVAL, INTERVAL)).toBe(false)
  })

  it('以降も interval ごとにボス戦が来る', () => {
    for (let occurrence = 1; occurrence <= GROUP_ORDER.length * 2; occurrence++) {
      expect(isBossBattleIndex(bossIndexOf(occurrence), INTERVAL), `occurrence=${occurrence}`).toBe(true)
    }
  })
})

describe('encounter: ボスの出現回数とグループ巡回', () => {
  it('ボス戦の index から 1始まりの出現回数を導く', () => {
    expect(bossOccurrenceNumber(bossIndexOf(1), INTERVAL)).toBe(1)
    expect(bossOccurrenceNumber(bossIndexOf(2), INTERVAL)).toBe(2)
    expect(bossOccurrenceNumber(bossIndexOf(7), INTERVAL)).toBe(7)
  })

  it('ボス戦でない index でも計算自体は通る（同じ区間はすべて同じ回数）', () => {
    // 意味を持たない値だが例外にはならない、という現状を固定する
    expect(bossOccurrenceNumber(0, INTERVAL)).toBe(1)
    expect(bossOccurrenceNumber(INTERVAL - 2, INTERVAL)).toBe(1)
    expect(bossOccurrenceNumber(INTERVAL, INTERVAL)).toBe(2)
  })

  it('ボスは groupOrder を先頭から順に巡回する', () => {
    for (let i = 0; i < GROUP_ORDER.length; i++) {
      expect(bossGroupFor(i + 1, GROUP_ORDER)).toBe(GROUP_ORDER[i])
    }
  })

  it('最後のグループの次は先頭へ戻る（A→…→E→A）', () => {
    expect(bossGroupFor(GROUP_ORDER.length + 1, GROUP_ORDER)).toBe(GROUP_ORDER[0])
    expect(bossGroupFor(GROUP_ORDER.length * 2, GROUP_ORDER)).toBe(GROUP_ORDER[GROUP_ORDER.length - 1])
  })
})

describe('encounter: 真のクリア判定', () => {
  const trueClearOccurrence = GROUP_ORDER.length * LAPS

  it('groupOrder を lapsForTrueClear 周した回のボス撃破だけが真のクリア', () => {
    expect(isTrueClearOccurrence(trueClearOccurrence - 1, GROUP_ORDER, LAPS)).toBe(false)
    expect(isTrueClearOccurrence(trueClearOccurrence, GROUP_ORDER, LAPS)).toBe(true)
    // 周回数を超えた先は「ちょうど一致」でないので false に戻る
    expect(isTrueClearOccurrence(trueClearOccurrence + 1, GROUP_ORDER, LAPS)).toBe(false)
  })

  it('battleIndex 版はボス戦かつ規定周回目のときだけ true', () => {
    const eg = ENCOUNTER_GROUPS
    expect(isTrueClearBattleIndex(bossIndexOf(trueClearOccurrence), eg)).toBe(true)
    expect(isTrueClearBattleIndex(bossIndexOf(trueClearOccurrence - 1), eg)).toBe(false)
    expect(isTrueClearBattleIndex(bossIndexOf(trueClearOccurrence + 1), eg)).toBe(false)
  })

  it('ボス戦でない index は真のクリアにならない', () => {
    const eg = ENCOUNTER_GROUPS
    const trueClearIndex = bossIndexOf(trueClearOccurrence)
    expect(isTrueClearBattleIndex(trueClearIndex - 1, eg)).toBe(false)
    expect(isTrueClearBattleIndex(trueClearIndex + 1, eg)).toBe(false)
    expect(isTrueClearBattleIndex(0, eg)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// spawnWeightTiers / weightedPick（private。pickEnemyDefs 経由で確かめる）
// ─────────────────────────────────────────────────────────────

/** 実設定のグループ構成を「1グループ = 通常セット1つ + ボスセット1つ」に置き換えたテスト用コンテンツ */
const testEnemies = GROUP_ORDER.flatMap(g => [
  makeEnemyDef({ id: `mob_${g}` }),
  makeEnemyDef({ id: `boss_${g}`, isBoss: true }),
])
const testSets = GROUP_ORDER.flatMap(g => [
  makeEnemySet({ id: `set_${g}`, members: [{ enemyId: `mob_${g}` }] }),
  makeEnemySet({ id: `set_boss_${g}`, members: [{ enemyId: `boss_${g}` }] }),
])
const content = makeContent({ enemies: testEnemies, enemySets: testSets })

const eg: EncounterGroupsConfig = {
  ...ENCOUNTER_GROUPS,
  groups: Object.fromEntries(GROUP_ORDER.map(g => [g, [`set_${g}`, `set_boss_${g}`]])),
}

/** 選ばれたグループ名を返す。グループごとの候補セットは1つなので set 抽選の乱数は結果に影響しない */
function groupPickedAt(battleIndex: number, roll: number): string {
  const picked = pickEnemyDefs(content, battleIndex, constRng(roll), eg)
  expect(picked, `battleIndex=${battleIndex}`).toHaveLength(1)
  return picked[0].def.id.replace(/^(mob|boss)_/, '')
}

/** weightedPick は先頭 entry から重みを引くため、roll=0 は必ず先頭キーになる */
const ROLL_FIRST = 0
/** 合計重みぎりぎりまで引くと最後の entry が残る */
const ROLL_LAST = 0.999999

describe('encounter: spawnWeightTiers の境界切り替え', () => {
  const tiers = ENCOUNTER_GROUPS.spawnWeightTiers

  /** ボス戦は重み表を参照しないため、境界直前の「通常戦の」index まで下がる */
  function normalBattleIndexBelow(boundary: number): number {
    let i = boundary - 1
    while (i > 0 && isBossBattleIndex(i, INTERVAL)) i--
    return i
  }

  it('各ティアの minBattleIndex を跨いだ瞬間に重み表が入れ替わる', () => {
    for (let i = 1; i < tiers.length; i++) {
      const boundary = tiers[i].minBattleIndex
      const before = normalBattleIndexBelow(boundary)
      // 境界そのものがボス戦だと通常戦の抽選経路に入らないため、前提として確認する
      expect(isBossBattleIndex(boundary, INTERVAL), `boundary=${boundary}`).toBe(false)
      expect(before, `boundary=${boundary}`).toBeGreaterThanOrEqual(tiers[i - 1].minBattleIndex)

      const prevFirst = Object.keys(tiers[i - 1].weights)[0]
      const currFirst = Object.keys(tiers[i].weights)[0]
      expect(groupPickedAt(before, ROLL_FIRST), `tier[${i - 1}] (index=${before})`).toBe(prevFirst)
      expect(groupPickedAt(boundary, ROLL_FIRST), `tier[${i}] (index=${boundary})`).toBe(currFirst)
    }
  })

  it('重み表の末尾グループは抽選の上端で選ばれる', () => {
    for (const tier of tiers) {
      const battleIndex = tier.minBattleIndex
      if (isBossBattleIndex(battleIndex, INTERVAL)) continue
      const last = Object.keys(tier.weights).slice(-1)[0]
      expect(groupPickedAt(battleIndex, ROLL_LAST), `minBattleIndex=${battleIndex}`).toBe(last)
    }
  })

  it('minBattleIndex 以下で最も新しいティアが選ばれる（間の index は前のティアを引き継ぐ）', () => {
    const first = tiers[0]
    const second = tiers[1]
    const midway = Math.floor((first.minBattleIndex + second.minBattleIndex) / 2)
    expect(isBossBattleIndex(midway, INTERVAL)).toBe(false)
    expect(groupPickedAt(midway, ROLL_FIRST)).toBe(Object.keys(first.weights)[0])
  })

  it('通常戦ではボス入りセットは選ばれない', () => {
    for (const tier of tiers) {
      if (isBossBattleIndex(tier.minBattleIndex, INTERVAL)) continue
      const picked = pickEnemyDefs(content, tier.minBattleIndex, constRng(ROLL_FIRST), eg)
      expect(picked.every(p => !p.def.isBoss), `minBattleIndex=${tier.minBattleIndex}`).toBe(true)
    }
  })

  it('ボス戦では周回中のグループのボスが出る（重み表は参照しない）', () => {
    for (let occurrence = 1; occurrence <= GROUP_ORDER.length + 1; occurrence++) {
      const expected = bossGroupFor(occurrence, GROUP_ORDER)
      const picked = pickEnemyDefs(content, bossIndexOf(occurrence), constRng(ROLL_FIRST), eg)
      expect(picked, `occurrence=${occurrence}`).toHaveLength(1)
      expect(picked[0].def.isBoss).toBe(true)
      expect(picked[0].def.id, `occurrence=${occurrence}`).toBe(`boss_${expected}`)
    }
  })
})

describe('encounter: 重みが引けないときのフォールバック', () => {
  it('どのティアにも該当しない battleIndex は重みが空になり、全グループ横断で選ぶ', () => {
    const egLate: EncounterGroupsConfig = {
      ...eg,
      spawnWeightTiers: [{ minBattleIndex: 1, weights: { [GROUP_ORDER[1]]: 1 } }],
    }
    const picked = pickEnemyDefs(content, 0, constRng(0), egLate)
    expect(picked).toHaveLength(1)
    // 重み抽選は null を返し、eg.groups の定義順の先頭にある非ボスセットへ落ちる
    expect(picked[0].def.id).toBe(`mob_${GROUP_ORDER[0]}`)
  })

  it('重みの合計が 0 でも同じフォールバックへ落ちる', () => {
    const egZero: EncounterGroupsConfig = {
      ...eg,
      spawnWeightTiers: [{ minBattleIndex: 0, weights: Object.fromEntries(GROUP_ORDER.map(g => [g, 0])) }],
    }
    const picked = pickEnemyDefs(content, 0, constRng(0), egZero)
    expect(picked).toHaveLength(1)
    expect(picked[0].def.id).toBe(`mob_${GROUP_ORDER[0]}`)
  })

  it('負の重みは 0 として扱われ、抽選対象から外れる', () => {
    const egNegative: EncounterGroupsConfig = {
      ...eg,
      spawnWeightTiers: [{
        minBattleIndex: 0,
        weights: { [GROUP_ORDER[0]]: -5, [GROUP_ORDER[1]]: 1 },
      }],
    }
    const picked = pickEnemyDefs(content, 0, constRng(0.5), egNegative)
    expect(picked[0].def.id).toBe(`mob_${GROUP_ORDER[1]}`)
  })

  it('roll がちょうど 0 でも、重み 0 の先頭グループは抽選対象から外れる', () => {
    // weightedPick は重み > 0 の entry だけを対象に roll を消費する。
    // 重み0のグループは roll を一切減らさずスキップされるため、
    // roll=0 でも次の正の重みを持つグループ（ここでは GROUP_ORDER[1]）が選ばれる。
    const egZeroFirst: EncounterGroupsConfig = {
      ...eg,
      spawnWeightTiers: [{
        minBattleIndex: 0,
        weights: { [GROUP_ORDER[0]]: 0, [GROUP_ORDER[1]]: 1 },
      }],
    }
    const picked = pickEnemyDefs(content, 0, constRng(0), egZeroFirst)
    expect(picked[0].def.id).toBe(`mob_${GROUP_ORDER[1]}`)
  })
})
