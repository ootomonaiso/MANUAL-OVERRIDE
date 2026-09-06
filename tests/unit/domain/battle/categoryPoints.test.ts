/**
 * tests/unit/domain/battle/categoryPoints.test.ts
 *
 * 特性テスト（characterization test）。skillDraft.ts の
 * `categoryContributionsOf`(:97-115) / `nextCategoryThreshold`(:118-121) は直接のテストが無く、
 * docs/refactoring/02-domain.md §1-5（寄与計算式の一本化）と §2-7（categoryPoints.ts への切り出し）で
 * 両方とも影響を受けるため、統合前に現行の出力を固定しておく。
 */

import { describe, it, expect } from 'vitest'
import {
  categoryContributionsOf, nextCategoryThreshold,
  accumulateCategoryPoints, subCategoryWeight,
} from '../../../../src/domain/battle/skillDraft'
import { BATTLE } from '../../../../src/data/tunables'
import type { CategoryId } from '../../../../src/domain/battle/types'
import { makePlayer, makeActive, makePassive, makeContent } from './_helpers'

/** カテゴリ寄与の係数（skillDraft.ts に直書きされているリテラル。§4 で skill_points.json へ移設予定） */
const ACTIVE_PER_LEVEL = 3
const PASSIVE_PER_LEVEL = 1

const MIGHT: CategoryId = 'might'
const COMBO: CategoryId = 'combo'
const FATAL: CategoryId = 'fatal'

const slashing = makeActive({ id: 'a_slash', label: '斬撃', mainCategory: MIGHT, subCategories: [COMBO] })
const rushing = makeActive({ id: 'a_rush', label: '連撃', mainCategory: COMBO })
const stored = makeActive({ id: 'a_stored', label: '倉庫番', mainCategory: MIGHT })
const brawn = makePassive({ id: 'p_brawn', label: '剛力', mainCategory: MIGHT })
const content = makeContent({ skills: [slashing, rushing, stored, brawn] })

function player() {
  return makePlayer({
    actives: [
      { id: 'a_slash', points: 1, level: 2, cooldown: 0, slotIndex: 0 },
      { id: 'a_rush', points: 1, level: 2, cooldown: 0, slotIndex: 1 },
      { id: 'a_stored', points: 0, level: 1, cooldown: 0, slotIndex: null },
    ],
    passives: [{ id: 'p_brawn', level: 1 }],
  })
}

describe('categoryContributionsOf: カテゴリ内訳', () => {
  it('主カテゴリのアクティブは 3 × レベル、パッシブは 1 × レベルを寄与する', () => {
    const out = categoryContributionsOf(player(), content, MIGHT)
    expect(out).toEqual([
      { id: 'a_slash', label: '斬撃', amount: ACTIVE_PER_LEVEL * 2 },
      { id: 'p_brawn', label: '剛力', amount: PASSIVE_PER_LEVEL * 1 },
    ])
  })

  it('副カテゴリへはサブ重みを掛けた分が入る', () => {
    const out = categoryContributionsOf(player(), content, COMBO)
    const subAmount = ACTIVE_PER_LEVEL * 2 * subCategoryWeight(slashing.subCategories.length)
    expect(out.map(c => c.id)).toEqual(['a_rush', 'a_slash'])
    expect(out[0].amount).toBe(ACTIVE_PER_LEVEL * 2)
    expect(out[1].amount).toBeCloseTo(subAmount, 6)
  })

  it('寄与の大きい順に並ぶ', () => {
    const amounts = categoryContributionsOf(player(), content, COMBO).map(c => c.amount)
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
  })

  it('倉庫保管中（slotIndex === null）のアクティブは内訳に出ない', () => {
    const ids = categoryContributionsOf(player(), content, MIGHT).map(c => c.id)
    expect(ids).not.toContain('a_stored')
  })

  it('寄与が 0 のカテゴリは空配列（0 の行を並べない）', () => {
    expect(categoryContributionsOf(player(), content, FATAL)).toEqual([])
  })

  it('コンテンツに存在しないIDは黙って無視される', () => {
    const ghost = makePlayer({
      actives: [{ id: 'a_unknown', points: 0, level: 1, cooldown: 0, slotIndex: 0 }],
      passives: [{ id: 'p_unknown', level: 1 }],
    })
    expect(categoryContributionsOf(ghost, content, MIGHT)).toEqual([])
  })

  it('actives にパッシブIDが紛れていても kind 違いとして除外される', () => {
    const mixed = makePlayer({
      actives: [{ id: 'p_brawn', points: 0, level: 1, cooldown: 0, slotIndex: 0 }],
      passives: [],
    })
    expect(categoryContributionsOf(mixed, content, MIGHT)).toEqual([])
  })

  it('内訳の合計は accumulateCategoryPoints の総計と一致する（表示と総計のズレ防止）', () => {
    const p = player()
    const totals = accumulateCategoryPoints(p, content)
    for (const category of [MIGHT, COMBO, FATAL]) {
      const sum = categoryContributionsOf(p, content, category).reduce((a, c) => a + c.amount, 0)
      expect(sum, category).toBeCloseTo(totals[category], 6)
    }
  })
})

describe('nextCategoryThreshold: 次のしきい値', () => {
  const thresholds = BATTLE.categoryUnlockThresholds
  const last = thresholds[thresholds.length - 1]

  it('まだ何も超えていなければ最初のしきい値を返す', () => {
    expect(nextCategoryThreshold(0)).toBe(thresholds[0])
    expect(nextCategoryThreshold(thresholds[0] - 1)).toBe(thresholds[0])
  })

  it('しきい値ちょうどのときは次のしきい値へ進む（"より大きい" で探す）', () => {
    for (let i = 0; i < thresholds.length - 1; i++) {
      expect(nextCategoryThreshold(thresholds[i]), `threshold[${i}]`).toBe(thresholds[i + 1])
    }
  })

  it('最後のしきい値を超えた後は最後の値のまま頭打ちになる', () => {
    expect(nextCategoryThreshold(last)).toBe(last)
    expect(nextCategoryThreshold(last * 10)).toBe(last)
  })

  it('負の値でも最初のしきい値を返す', () => {
    expect(nextCategoryThreshold(-1)).toBe(thresholds[0])
  })
})
