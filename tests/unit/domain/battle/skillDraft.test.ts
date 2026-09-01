import { describe, it, expect } from 'vitest'
import {
  STACKS_REQUIRED, addStack, zeroCategoryPoints, subCategoryWeight,
  accumulateCategoryPoints, rollDraft, applyDraftChoice, confirmSwap,
} from '../../../../src/domain/battle/skillDraft'
import { BATTLE } from '../../../../src/data/tunables'
import type { Combatant, DraftOption } from '../../../../src/domain/battle/types'
import {
  makePlayer, makeActive, makePassive, makeTrait, makeContent, makeState,
} from './_helpers'

describe('skillDraft: スキルレベルアップ', () => {
  it('必要な重複数は Lv1→2 が1個、Lv2→3 が3個、Lv3→4 が5個', () => {
    expect(STACKS_REQUIRED).toEqual([0, 1, 3, 5])
  })

  it('必要数に達したらレベルが上がりスタックが繰り越される', () => {
    const owned = { level: 1, stacks: 0 }
    addStack(owned)
    expect(owned).toEqual({ level: 2, stacks: 0 })
    addStack(owned)
    addStack(owned)
    expect(owned).toEqual({ level: 2, stacks: 2 })
    addStack(owned)
    expect(owned).toEqual({ level: 3, stacks: 0 })
  })

  it('Lv1 から Lv4 までに合計9個の重複が必要', () => {
    const owned = { level: 1, stacks: 0 }
    for (let i = 0; i < 9; i++) addStack(owned)
    expect(owned.level).toBe(4)
  })

  it('Lv4 で頭打ちになり、それ以上スタックも増えない', () => {
    const owned = { level: 4, stacks: 0 }
    addStack(owned)
    addStack(owned)
    expect(owned).toEqual({ level: 4, stacks: 0 })
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

  it('合計は N=2 で頂点を取る（原剙1個・稀に2個という運用に合わせてある）', () => {
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

  it('アクティブは 3 × レベル、パッシブは 1 × レベルを主カテゴリへ入れる', () => {
    const player = makePlayer({
      actives: [{ id: 'a', level: 2, stacks: 0, cooldown: 0, slotIndex: 0 }],
      passives: [{ id: 'p', level: 3, stacks: 0 }],
    })
    const points = accumulateCategoryPoints(player, content)
    expect(points.might).toBe(6)
    expect(points.vitality).toBe(3)
  })

  it('サブカテゴリには重みを掛けた分が入る', () => {
    const player = makePlayer({ actives: [{ id: 'a', level: 1, stacks: 0, cooldown: 0, slotIndex: 0 }] })
    const points = accumulateCategoryPoints(player, content)
    expect(points.combo).toBeCloseTo(3 * subCategoryWeight(1), 10)
  })

  it('保管中（枠から外した）アクティブは寄与しない', () => {
    const player = makePlayer({ actives: [{ id: 'a', level: 4, stacks: 0, cooldown: 0, slotIndex: null }] })
    expect(accumulateCategoryPoints(player, content).might).toBe(0)
  })

  it('未知のIDは無視され、全カテゴリが 0 で揃う', () => {
    const points = accumulateCategoryPoints(makePlayer({ passives: [{ id: '?', level: 1, stacks: 0 }] }), content)
    expect(points).toEqual(zeroCategoryPoints())
  })
})

describe('skillDraft: ドラフト抽選', () => {
  const a1 = makeActive({ id: 'a1' })
  const a2 = makeActive({ id: 'a2' })
  const p1 = makePassive({ id: 'p1' })
  const t1 = makeTrait({ id: 't1' })
  const content = makeContent({ skills: [a1, a2, p1], traits: [t1] })

  it('常に3択が返る', () => {
    expect(rollDraft(makePlayer(), content, Math.random)).toHaveLength(3)
  })

  it('同じIDが2度並ぶことはない', () => {
    for (let i = 0; i < 30; i++) {
      const ids = rollDraft(makePlayer(), content, Math.random).map(o => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('候補が足りなければステータス微増で埋められる', () => {
    const options = rollDraft(makePlayer(), makeContent(), Math.random)
    expect(options).toHaveLength(3)
    expect(options.every(o => o.isFallback)).toBe(true)
    const stats = options.map(o => o.fallbackStat)
    expect(new Set(stats).size).toBe(3)   // 同じステータスが重複しない
  })

  it('既に所持している特性は候補に出ない', () => {
    const player = makePlayer({ traits: [{ id: 't1' }] })
    const ids = rollDraft(player, content, Math.random).map(o => o.id)
    expect(ids).not.toContain('t1')
  })

  it('draftable: false の特性は候補に出ない', () => {
    const hidden = makeTrait({ id: 'hidden', draftable: false })
    const ids = rollDraft(makePlayer(), makeContent({ traits: [hidden] }), Math.random).map(o => o.id)
    expect(ids).not.toContain('hidden')
  })

  it('Lv4 に達したスキルは候補から外れる', () => {
    const player = makePlayer({
      actives: [{ id: 'a1', level: 4, stacks: 0, cooldown: 0, slotIndex: 0 }],
      passives: [{ id: 'p1', level: 4, stacks: 0 }],
    })
    for (let i = 0; i < 20; i++) {
      const ids = rollDraft(player, content, Math.random).map(o => o.id)
      expect(ids).not.toContain('a1')
      expect(ids).not.toContain('p1')
    }
  })

  it('解放条件を満たさないスキルは候補に出ない', () => {
    const locked = makeActive({ id: 'locked', unlockCondition: { category: 'might', points: 100 } })
    const c = makeContent({ skills: [locked] })
    const ids = rollDraft(makePlayer(), c, Math.random).map(o => o.id)
    expect(ids).not.toContain('locked')
  })

  it('解放条件を満たすと候補に現れ、解放フラグが立つ', () => {
    const gate = makeActive({ id: 'gate', unlockCondition: { category: 'might', points: 3 } })
    const key = makeActive({ id: 'key', mainCategory: 'might', subCategories: [] })
    const c = makeContent({ skills: [gate, key] })
    const player = makePlayer({ actives: [{ id: 'key', level: 1, stacks: 0, cooldown: 0, slotIndex: 0 }] })
    const options = rollDraft(player, c, Math.random)
    const found = options.find(o => o.id === 'gate')
    expect(found).toBeDefined()
    expect(found?.isUnlocked).toBe(true)
  })

  it('所持済みスキルの候補には現在のレベルとスタックが載る', () => {
    const player = makePlayer({ actives: [{ id: 'a1', level: 2, stacks: 1, cooldown: 0, slotIndex: 0 }] })
    const options = rollDraft(player, content, Math.random)
    const found = options.find(o => o.id === 'a1')
    expect(found).toMatchObject({ currentLevel: 2, currentStacks: 1 })
  })

  it('アクティブ枠が埋まっていれば新規アクティブに入れ替えフラグが立つ', () => {
    const player = makePlayer({
      actives: [0, 1, 2, 3].map(i => ({ id: `slot${i}`, level: 1, stacks: 0, cooldown: 0, slotIndex: i })),
    })
    const options = rollDraft(player, content, Math.random)
    const newActive = options.find(o => o.kind === 'active' && !o.isFallback)
    expect(newActive?.requiresSwap).toBe(true)
  })
})

describe('skillDraft: ドラフト選択の適用', () => {
  const a1 = makeActive({ id: 'a1' })
  const p1 = makePassive({ id: 'p1' })
  const t1 = makeTrait({ id: 't1' })
  const content = makeContent({ skills: [a1, p1], traits: [t1] })

  function apply(player: Combatant, option: DraftOption) {
    const state = makeState({ player })
    const result = applyDraftChoice(state, option)
    return { state, result }
  }

  it('特性は所持リストへ追加される', () => {
    const player = makePlayer()
    const { result } = apply(player, { kind: 'trait', id: 't1' })
    expect(player.traits).toEqual([{ id: 't1' }])
    expect(result.needsSwapSelection).toBe(false)
  })

  it('新規パッシブは Lv1 で追加される', () => {
    const player = makePlayer()
    apply(player, { kind: 'passive', id: 'p1' })
    expect(player.passives).toEqual([{ id: 'p1', level: 1, stacks: 0 }])
  })

  it('所持済みパッシブを選ぶとスタックが積まれる', () => {
    const player = makePlayer({ passives: [{ id: 'p1', level: 1, stacks: 0 }] })
    apply(player, { kind: 'passive', id: 'p1' })
    expect(player.passives).toEqual([{ id: 'p1', level: 2, stacks: 0 }])
  })

  it('新規アクティブは空いている最小の枠に入る', () => {
    const player = makePlayer({
      actives: [{ id: 'x', level: 1, stacks: 0, cooldown: 0, slotIndex: 1 }],
    })
    apply(player, { kind: 'active', id: 'a1' })
    expect(player.actives.find(a => a.id === 'a1')?.slotIndex).toBe(0)
  })

  it('所持済みアクティブを選ぶとスタックが積まれ、枠は変わらない', () => {
    const player = makePlayer({ actives: [{ id: 'a1', level: 1, stacks: 0, cooldown: 0, slotIndex: 2 }] })
    const { result } = apply(player, { kind: 'active', id: 'a1' })
    expect(player.actives).toHaveLength(1)
    expect(player.actives[0]).toEqual({ id: 'a1', level: 2, stacks: 0, cooldown: 0, slotIndex: 2 })
    expect(result.needsSwapSelection).toBe(false)
  })

  it('保管中のアクティブは枠を占有しないため新規スキルが入れる', () => {
    const player = makePlayer({
      actives: [
        { id: 'stored', level: 3, stacks: 0, cooldown: 0, slotIndex: null },
        ...[0, 1, 2].map(i => ({ id: `s${i}`, level: 1, stacks: 0, cooldown: 0, slotIndex: i })),
      ],
    })
    const { result } = apply(player, { kind: 'active', id: 'a1' })
    expect(result.needsSwapSelection).toBe(false)
    expect(player.actives.find(a => a.id === 'a1')?.slotIndex).toBe(3)
  })

  it('4枠すべて埋まっていれば入れ替え待ちになる', () => {
    const player = makePlayer({
      actives: [0, 1, 2, 3].map(i => ({ id: `s${i}`, level: 1, stacks: 0, cooldown: 0, slotIndex: i })),
    })
    const { state, result } = apply(player, { kind: 'active', id: 'a1' })
    expect(result.needsSwapSelection).toBe(true)
    expect(state.pendingSwapSkillId).toBe('a1')
    expect(player.actives).toHaveLength(4)   // まだ追加されていない
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

describe('skillDraft: アクティブ枠の入れ替え', () => {
  it('外れたスキルはレベルとスタックを保ったまま保管中になる', () => {
    const player = makePlayer({
      actives: [{ id: 'old', level: 3, stacks: 2, cooldown: 0, slotIndex: 1 }],
    })
    confirmSwap(player, 'new', 1)
    const old = player.actives.find(a => a.id === 'old')
    expect(old).toEqual({ id: 'old', level: 3, stacks: 2, cooldown: 0, slotIndex: null })
  })

  it('新しいスキルが指定した枠に Lv1 で入る', () => {
    const player = makePlayer({
      actives: [{ id: 'old', level: 3, stacks: 2, cooldown: 0, slotIndex: 1 }],
    })
    confirmSwap(player, 'new', 1)
    expect(player.actives.find(a => a.id === 'new')).toEqual({
      id: 'new', level: 1, stacks: 0, cooldown: 0, slotIndex: 1,
    })
  })

  it('空き枠を指定した場合は追い出されるスキルがない', () => {
    const player = makePlayer({ actives: [] })
    confirmSwap(player, 'new', 0)
    expect(player.actives).toHaveLength(1)
    expect(player.actives[0].slotIndex).toBe(0)
  })

  it('保管したスキルは同じIDで戻したときも別枠として扱われない', () => {
    const player = makePlayer({
      actives: [{ id: 'old', level: 3, stacks: 2, cooldown: 0, slotIndex: 0 }],
    })
    confirmSwap(player, 'new', 0)
    expect(player.actives.filter(a => a.slotIndex === 0)).toHaveLength(1)
  })
})

describe('skillDraft: カテゴリポイントの初期化', () => {
  it('11カテゴリが 0 で揃う', () => {
    const points = zeroCategoryPoints()
    expect(Object.values(points)).toHaveLength(11)
    expect(Object.values(points).every(v => v === 0)).toBe(true)
  })
})
