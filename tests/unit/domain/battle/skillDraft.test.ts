import { describe, it, expect } from 'vitest'
import {
  levelForPoints, addActivePoints, MAX_ACTIVE_LEVEL, MAX_ACTIVE_POINTS, MAX_PASSIVE_LEVEL,
  zeroCategoryPoints, subCategoryWeight,
  accumulateCategoryPoints, rollDraft, applyDraftChoice, buildCandidatePool, findFreeSlotIndex,
} from '../../../../src/domain/battle/skillDraft'
import { SKILL_POINTS, BATTLE } from '../../../../src/data/tunables'
import type { Combatant, DraftOption } from '../../../../src/domain/battle/types'
import {
  makePlayer, makeActive, makePassive, makeTrait, makeContent, makeState,
} from './_helpers'

describe('skillDraft: スキルポイント制のレベル導出', () => {
  it('pointsForLevel の閾値（既定 [0,1,3,7]）と一致する', () => {
    expect(SKILL_POINTS.pointsForLevel).toEqual([0, 1, 3, 7])
    expect(MAX_ACTIVE_LEVEL).toBe(4)
    expect(MAX_ACTIVE_POINTS).toBe(7)
  })

  it('累計ポイントから実効レベルを導出する', () => {
    expect(levelForPoints(0)).toBe(1)
    expect(levelForPoints(1)).toBe(2)
    expect(levelForPoints(2)).toBe(2)
    expect(levelForPoints(3)).toBe(3)
    expect(levelForPoints(6)).toBe(3)
    expect(levelForPoints(7)).toBe(4)
    expect(levelForPoints(100)).toBe(4)   // 上限を超えても Lv4 のまま
  })

  it('addActivePoints はポイントを加算し level を同期させる', () => {
    const owned = { id: 'a', points: 0, level: 1, cooldown: 0, slotIndex: 0 as number | null }
    addActivePoints(owned, 1)
    expect(owned).toMatchObject({ points: 1, level: 2 })
    addActivePoints(owned, 2)
    expect(owned).toMatchObject({ points: 3, level: 3 })
  })

  it('MAX_ACTIVE_POINTS で頭打ちになる（Lv4を超えて投資できない）', () => {
    const owned = { id: 'a', points: 0, level: 1, cooldown: 0, slotIndex: 0 as number | null }
    const gained = addActivePoints(owned, 999)
    expect(owned.points).toBe(MAX_ACTIVE_POINTS)
    expect(owned.level).toBe(MAX_ACTIVE_LEVEL)
    expect(gained).toBe(MAX_ACTIVE_POINTS)
    expect(addActivePoints(owned, 1)).toBe(0)   // 既に頭打ちなら加算されない
  })
})

describe('skillDraft: サブカテゴリの重み T(N) = 0.75 - 0.25(N-2)^2', () => {
  it('サブ1個なら合計 0.5、サブ2個なら合計 0.75 が最大になる', () => {
    expect(subCategoryWeight(1) * 1).toBeCloseTo(0.5, 10)
    expect(subCategoryWeight(2) * 2).toBeCloseTo(0.75, 10)
  })

  it('サブ3個では合計 0.5 まで戻る（広く取るほど薄まる）', () => {
    expect(subCategoryWeight(3) * 3).toBeCloseTo(0.5, 10)
    expect(subCategoryWeight(3)).toBeCloseTo(0.5 / 3, 10)
  })

  it('合計は N=2 で頂点を取る（原則1個・稀に2個という運用に合わせてある）', () => {
    const totals = [1, 2, 3].map(n => subCategoryWeight(n) * n)
    expect(Math.max(...totals)).toBe(totals[1])
  })

  it('1個あたりの重みはサブを増やすほど単調に下がる', () => {
    // N=4 以上は T(N) が負になるが、スキーマの maxItems: 3 で入力側が封じている
    // （この上限は battleContent.test.ts で検証する）
    const each = [1, 2, 3].map(subCategoryWeight)
    expect(each[0]).toBeGreaterThan(each[1])
    expect(each[1]).toBeGreaterThan(each[2])
  })

  it('サブ0個なら 0', () => {
    expect(subCategoryWeight(0)).toBe(0)
  })
})

describe('skillDraft: カテゴリポイントの集計', () => {
  const act = makeActive({ id: 'a', mainCategory: 'might', subCategories: ['combo'] })
  const pas = makePassive({ id: 'p', mainCategory: 'vitality', subCategories: [] })
  const content = makeContent({ skills: [act, pas] })

  it('アクティブは 3 × レベル、パッシブは 1 × レベル(常に1)を主カテゴリへ入れる', () => {
    const player = makePlayer({
      actives: [{ id: 'a', points: 1, level: 2, cooldown: 0, slotIndex: 0 }],
      passives: [{ id: 'p', level: 1 }],
    })
    const points = accumulateCategoryPoints(player, content)
    expect(points.might).toBe(6)
    expect(points.vitality).toBe(1)
  })

  it('サブカテゴリには重みを掛けた分が入る', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 0, level: 1, cooldown: 0, slotIndex: 0 }] })
    const points = accumulateCategoryPoints(player, content)
    expect(points.combo).toBeCloseTo(3 * subCategoryWeight(1), 10)
  })

  it('保管中（枠から外した）アクティブは寄与しない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 7, level: 4, cooldown: 0, slotIndex: null }] })
    expect(accumulateCategoryPoints(player, content).might).toBe(0)
  })

  it('未知のIDは無視され、全カテゴリが 0 で揃う', () => {
    const points = accumulateCategoryPoints(makePlayer({ passives: [{ id: '?', level: 1 }] }), content)
    expect(points).toEqual(zeroCategoryPoints())
  })
})

describe('skillDraft: ドラフト候補プールの構築（第7フェーズ、第13フェーズでパッシブ重複を解禁）', () => {
  const a1 = makeActive({ id: 'a1' })
  const p1 = makePassive({ id: 'p1' })

  it('未所持のアクティブは通常候補として1件だけ入る', () => {
    const pool = buildCandidatePool(makePlayer(), makeContent({ skills: [a1] }), zeroCategoryPoints(), 0)
    const entries = pool.filter(o => o.id === 'a1')
    expect(entries).toHaveLength(1)
    expect(entries[0].isDuplicate).toBeFalsy()
  })

  it('セット中（装備済み）のアクティブは duplicateDraftWeight 件ぶん重複候補として入る', () => {
    const player = makePlayer({ actives: [{ id: 'a1', points: 1, level: 2, cooldown: 0, slotIndex: 0 }] })
    const pool = buildCandidatePool(player, makeContent({ skills: [a1] }), zeroCategoryPoints(), 0)
    const entries = pool.filter(o => o.id === 'a1')
    expect(entries).toHaveLength(SKILL_POINTS.duplicateDraftWeight)
    expect(entries.every(o => o.isDuplicate)).toBe(true)
    expect(entries[0]).toMatchObject({ currentLevel: 2, currentPoints: 1 })
  })

  it('倉庫保管中（未セット）のアクティブは候補に一切出ない', () => {
    const player = makePlayer({ actives: [{ id: 'a1', points: 3, level: 3, cooldown: 0, slotIndex: null }] })
    const pool = buildCandidatePool(player, makeContent({ skills: [a1] }), zeroCategoryPoints(), 0)
    expect(pool.some(o => o.id === 'a1')).toBe(false)
  })

  it('Lv4（MAX_ACTIVE_POINTS）に達したアクティブは重複候補から外れる', () => {
    const player = makePlayer({ actives: [{ id: 'a1', points: MAX_ACTIVE_POINTS, level: MAX_ACTIVE_LEVEL, cooldown: 0, slotIndex: 0 }] })
    const pool = buildCandidatePool(player, makeContent({ skills: [a1] }), zeroCategoryPoints(), 0)
    expect(pool.some(o => o.id === 'a1')).toBe(false)
  })

  it('未所持のパッシブは通常候補として1件だけ入る', () => {
    const pool = buildCandidatePool(makePlayer(), makeContent({ skills: [p1] }), zeroCategoryPoints(), 0)
    expect(pool.filter(o => o.id === 'p1')).toHaveLength(1)
    expect(pool.find(o => o.id === 'p1')?.isDuplicate).toBeFalsy()
  })

  it('所持済みのパッシブは duplicateDraftWeight 件ぶん重複候補として入る（第13フェーズ）', () => {
    const player = makePlayer({ passives: [{ id: 'p1', level: 2 }] })
    const pool = buildCandidatePool(player, makeContent({ skills: [p1] }), zeroCategoryPoints(), 0)
    const entries = pool.filter(o => o.id === 'p1')
    expect(entries).toHaveLength(SKILL_POINTS.duplicateDraftWeight)
    expect(entries.every(o => o.isDuplicate)).toBe(true)
    expect(entries[0]).toMatchObject({ currentLevel: 2 })
  })

  it('MAX_PASSIVE_LEVEL に達したパッシブは重複候補から外れる', () => {
    const player = makePlayer({ passives: [{ id: 'p1', level: MAX_PASSIVE_LEVEL }] })
    const pool = buildCandidatePool(player, makeContent({ skills: [p1] }), zeroCategoryPoints(), 0)
    expect(pool.some(o => o.id === 'p1')).toBe(false)
  })

  it('draftMinBattle が指定されたスキルは、battleIndex が満たない間は候補に出ない', () => {
    const gated = makeActive({ id: 'gated', draftMinBattle: 5 })
    const pool0 = buildCandidatePool(makePlayer(), makeContent({ skills: [gated] }), zeroCategoryPoints(), 4)
    expect(pool0.some(o => o.id === 'gated')).toBe(false)
    const pool1 = buildCandidatePool(makePlayer(), makeContent({ skills: [gated] }), zeroCategoryPoints(), 5)
    expect(pool1.some(o => o.id === 'gated')).toBe(true)
  })
})

describe('skillDraft: ドラフト抽選', () => {
  const a1 = makeActive({ id: 'a1' })
  const a2 = makeActive({ id: 'a2' })
  const p1 = makePassive({ id: 'p1' })
  const t1 = makeTrait({ id: 't1' })
  const content = makeContent({ skills: [a1, a2, p1], traits: [t1] })

  it('常に3択が返る', () => {
    expect(rollDraft(makePlayer(), content, Math.random, 0)).toHaveLength(3)
  })

  it('同じIDが2度並ぶことはない（重複候補が複数コピー入っていても1件扱い）', () => {
    for (let i = 0; i < 30; i++) {
      const ids = rollDraft(makePlayer(), content, Math.random, 0).map(o => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('候補が足りなければステータス微増で埋められる', () => {
    const options = rollDraft(makePlayer(), makeContent(), Math.random, 0)
    expect(options).toHaveLength(3)
    expect(options.every(o => o.isFallback)).toBe(true)
    const stats = options.map(o => o.fallbackStat)
    expect(new Set(stats).size).toBe(3)   // 同じステータスが重複しない
  })

  it('既に所持している特性は候補に出ない', () => {
    const player = makePlayer({ traits: [{ id: 't1' }] })
    const ids = rollDraft(player, content, Math.random, 0).map(o => o.id)
    expect(ids).not.toContain('t1')
  })

  it('draftable: false の特性は候補に出ない', () => {
    const hidden = makeTrait({ id: 'hidden', draftable: false })
    const ids = rollDraft(makePlayer(), makeContent({ traits: [hidden] }), Math.random, 0).map(o => o.id)
    expect(ids).not.toContain('hidden')
  })

  it('draftable: false のアクティブ/パッシブスキルは候補に出ない（「守る」等の常設行動用）', () => {
    const hiddenActive = makeActive({ id: 'skill_hidden', draftable: false })
    const hiddenPassive = makePassive({ id: 'passive_hidden', draftable: false })
    const ids = rollDraft(
      makePlayer(),
      makeContent({ skills: [hiddenActive, hiddenPassive] }),
      Math.random,
      0,
    ).map(o => o.id)
    expect(ids).not.toContain('skill_hidden')
    expect(ids).not.toContain('passive_hidden')
  })

  it('解放条件を満たさないスキルは候補に出ない', () => {
    const locked = makeActive({ id: 'locked', unlockCondition: { category: 'might', points: 100 } })
    const c = makeContent({ skills: [locked] })
    const ids = rollDraft(makePlayer(), c, Math.random, 0).map(o => o.id)
    expect(ids).not.toContain('locked')
  })

  it('解放条件を満たすと候補に現れ、解放フラグが立つ', () => {
    const gate = makeActive({ id: 'gate', unlockCondition: { category: 'might', points: 3 } })
    const key = makeActive({ id: 'key', mainCategory: 'might', subCategories: [] })
    const c = makeContent({ skills: [gate, key] })
    const player = makePlayer({ actives: [{ id: 'key', points: 0, level: 1, cooldown: 0, slotIndex: 0 }] })
    const options = rollDraft(player, c, Math.random, 0)
    const found = options.find(o => o.id === 'gate')
    expect(found).toBeDefined()
    expect(found?.isUnlocked).toBe(true)
  })
})

describe('skillDraft: ドラフト選択の適用', () => {
  function apply(player: Combatant, option: DraftOption) {
    const state = makeState({ player })
    applyDraftChoice(state, option)
    return { state }
  }

  it('特性は所持リストへ追加される', () => {
    const player = makePlayer()
    apply(player, { kind: 'trait', id: 't1' })
    expect(player.traits).toEqual([{ id: 't1' }])
  })

  it('新規パッシブは追加される（level:1）', () => {
    const player = makePlayer()
    apply(player, { kind: 'passive', id: 'p1' })
    expect(player.passives).toEqual([{ id: 'p1', level: 1 }])
  })

  it('既に所持しているパッシブの重複を選ぶとLvが+1される（第13フェーズ、1:1）', () => {
    const player = makePlayer({ passives: [{ id: 'p1', level: 1 }] })
    apply(player, { kind: 'passive', id: 'p1', isDuplicate: true, currentLevel: 1 })
    expect(player.passives).toEqual([{ id: 'p1', level: 2 }])
  })

  it('パッシブのLvは MAX_PASSIVE_LEVEL で頭打ちになる', () => {
    const player = makePlayer({ passives: [{ id: 'p1', level: MAX_PASSIVE_LEVEL }] })
    apply(player, { kind: 'passive', id: 'p1', isDuplicate: true, currentLevel: MAX_PASSIVE_LEVEL })
    expect(player.passives).toEqual([{ id: 'p1', level: MAX_PASSIVE_LEVEL }])
  })

  it('新規アクティブは空いている最小の枠に入る', () => {
    const player = makePlayer({
      actives: [{ id: 'x', points: 0, level: 1, cooldown: 0, slotIndex: 1 }],
    })
    apply(player, { kind: 'active', id: 'a1' })
    expect(player.actives.find(a => a.id === 'a1')?.slotIndex).toBe(0)
  })

  it('セット中の所持アクティブを選ぶとポイントが+1され、枠は変わらない', () => {
    const player = makePlayer({ actives: [{ id: 'a1', points: 0, level: 1, cooldown: 0, slotIndex: 2 }] })
    apply(player, { kind: 'active', id: 'a1' })
    expect(player.actives).toHaveLength(1)
    expect(player.actives[0]).toEqual({ id: 'a1', points: 1, level: 2, cooldown: 0, slotIndex: 2 })
  })

  it('新規アクティブは枠が全て埋まっていれば黙って倉庫（slotIndex:null）へ保管される', () => {
    const player = makePlayer({
      actives: [0, 1, 2, 3].map(i => ({ id: `s${i}`, points: 0, level: 1, cooldown: 0, slotIndex: i })),
    })
    apply(player, { kind: 'active', id: 'a1' })
    const added = player.actives.find(a => a.id === 'a1')
    expect(added).toMatchObject({ points: 0, level: 1, slotIndex: null })
    expect(player.actives).toHaveLength(5)   // 割り込み入れ替えを迫らず、そのまま追加される
  })

  it('ステータス微増は恒常補正として積まれる', () => {
    const player = makePlayer()
    apply(player, { kind: 'passive', id: '__fallback__', isFallback: true, fallbackStat: 'str' })
    expect(player.temporary).toEqual([
      { stat: 'str', flat: BATTLE.fallbackStatBoost.other, scope: 'permanent', sourceId: 'fallback' },
    ])
  })

  it('HP のステータス微増は専用の増加量を使う', () => {
    const player = makePlayer()
    apply(player, { kind: 'passive', id: '__fallback__', isFallback: true, fallbackStat: 'hp' })
    expect(player.temporary[0].flat).toBe(BATTLE.fallbackStatBoost.hp)
  })
})

describe('skillDraft: findFreeSlotIndex', () => {
  it('空いている最小のインデックスを返す', () => {
    const player = makePlayer({ actives: [{ id: 'x', points: 0, level: 1, cooldown: 0, slotIndex: 1 }] })
    expect(findFreeSlotIndex(player)).toBe(0)
  })

  it('4枠すべて埋まっていれば null を返す', () => {
    const player = makePlayer({
      actives: [0, 1, 2, 3].map(i => ({ id: `s${i}`, points: 0, level: 1, cooldown: 0, slotIndex: i })),
    })
    expect(findFreeSlotIndex(player)).toBeNull()
  })
})

describe('skillDraft: カテゴリポイントの初期化', () => {
  it('11カテゴリが 0 で揃う', () => {
    const points = zeroCategoryPoints()
    expect(Object.values(points)).toHaveLength(11)
    expect(Object.values(points).every(v => v === 0)).toBe(true)
  })
})
