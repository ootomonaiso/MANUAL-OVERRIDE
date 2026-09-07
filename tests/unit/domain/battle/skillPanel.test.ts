import { describe, it, expect } from 'vitest'
import {
  unequipActive, equipToFreeSlot, confirmSwap,
  allocateSkillPoint, deallocateSkillPoint, setStatAllocation, resetStatAllocations,
} from '../../../../src/domain/battle/skillPanel'
import { BATTLE } from '../../../../src/data/tunables'
import { makePlayer, makeState } from './_helpers'

describe('skillPanel: unequipActive', () => {
  it('装備中のアクティブを外し、投資済みポイントを全額 state.skillPoints へ還元する', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 5, level: 3, cooldown: 0, slotIndex: 1 }] })
    const state = makeState({ player, skillPoints: 2 })
    unequipActive(state, 'a')
    const owned = player.actives.find(a => a.id === 'a')
    expect(owned).toMatchObject({ points: 0, level: 1, slotIndex: null })
    expect(state.skillPoints).toBe(7)
  })

  it('未所持／既に倉庫中のIDを渡しても何も起きない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 5, level: 3, cooldown: 0, slotIndex: null }] })
    const state = makeState({ player, skillPoints: 2 })
    unequipActive(state, 'a')
    unequipActive(state, 'nope')
    expect(state.skillPoints).toBe(2)
    expect(player.actives[0].points).toBe(5)
  })
})

describe('skillPanel: equipToFreeSlot', () => {
  it('空き枠があれば装備して true を返す。ポイント・レベルは維持される', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 3, level: 3, cooldown: 0, slotIndex: null }] })
    expect(equipToFreeSlot(player, 'a')).toBe(true)
    expect(player.actives[0]).toMatchObject({ points: 3, level: 3, slotIndex: 0 })
  })

  it('4枠すべて埋まっていれば false を返し、何も変更しない', () => {
    const player = makePlayer({
      actives: [
        { id: 'stored', points: 0, level: 1, cooldown: 0, slotIndex: null },
        ...[0, 1, 2, 3].map(i => ({ id: `s${i}`, points: 0, level: 1, cooldown: 0, slotIndex: i })),
      ],
    })
    expect(equipToFreeSlot(player, 'stored')).toBe(false)
    expect(player.actives.find(a => a.id === 'stored')?.slotIndex).toBeNull()
  })
})

describe('skillPanel: confirmSwap（既存の所持アクティブ同士を入れ替える）', () => {
  it('倉庫中のスキルを枠へ装備し、元いたスキルは倉庫へ戻る。両者ともポイント/レベルを保つ', () => {
    const player = makePlayer({
      actives: [
        { id: 'old', points: 5, level: 3, cooldown: 0, slotIndex: 1 },
        { id: 'new', points: 2, level: 2, cooldown: 0, slotIndex: null },
      ],
    })
    confirmSwap(player, 'new', 1)
    expect(player.actives.find(a => a.id === 'old')).toMatchObject({ points: 5, level: 3, slotIndex: null })
    expect(player.actives.find(a => a.id === 'new')).toMatchObject({ points: 2, level: 2, slotIndex: 1 })
  })

  it('空き枠を指定した場合は追い出されるスキルがない', () => {
    const player = makePlayer({
      actives: [{ id: 'new', points: 0, level: 1, cooldown: 0, slotIndex: null }],
    })
    confirmSwap(player, 'new', 0)
    expect(player.actives.find(a => a.id === 'new')?.slotIndex).toBe(0)
  })

  it('存在しないIDを渡しても何も起きない', () => {
    const player = makePlayer({ actives: [{ id: 'old', points: 0, level: 1, cooldown: 0, slotIndex: 0 }] })
    confirmSwap(player, 'nope', 0)
    expect(player.actives.find(a => a.id === 'old')?.slotIndex).toBe(0)
  })
})

describe('skillPanel: allocateSkillPoint', () => {
  it('装備中のアクティブへ配分し、未配分プールから減算する', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 0, level: 1, cooldown: 0, slotIndex: 0 }] })
    const state = makeState({ player, skillPoints: 3 })
    const spent = allocateSkillPoint(state, 'a', 2)
    expect(spent).toBe(2)
    expect(player.actives[0]).toMatchObject({ points: 2, level: 2 })
    expect(state.skillPoints).toBe(1)
  })

  it('未配分プールの残量までしか配分できない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 0, level: 1, cooldown: 0, slotIndex: 0 }] })
    const state = makeState({ player, skillPoints: 1 })
    expect(allocateSkillPoint(state, 'a', 5)).toBe(1)
    expect(state.skillPoints).toBe(0)
    expect(player.actives[0].points).toBe(1)
  })

  it('倉庫中（未セット）のアクティブへは配分できない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 0, level: 1, cooldown: 0, slotIndex: null }] })
    const state = makeState({ player, skillPoints: 5 })
    expect(allocateSkillPoint(state, 'a', 1)).toBe(0)
    expect(state.skillPoints).toBe(5)
  })

  it('Lv4上限（MAX_ACTIVE_POINTS）を超えて配分できない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 6, level: 3, cooldown: 0, slotIndex: 0 }] })
    const state = makeState({ player, skillPoints: 10 })
    expect(allocateSkillPoint(state, 'a', 10)).toBe(1)
    expect(player.actives[0]).toMatchObject({ points: 7, level: 4 })
    expect(state.skillPoints).toBe(9)
  })
})

describe('skillPanel: deallocateSkillPoint', () => {
  it('投資済みポイントを引き戻し、未配分プールへ戻す。levelも再計算される', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 3, level: 2, cooldown: 0, slotIndex: 0 }] })
    const state = makeState({ player, skillPoints: 1 })
    const refunded = deallocateSkillPoint(state, 'a', 3)
    expect(refunded).toBe(3)
    expect(player.actives[0]).toMatchObject({ points: 0, level: 1 })
    expect(state.skillPoints).toBe(4)
  })

  it('投資済み量を超えては引き戻せない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 2, level: 1, cooldown: 0, slotIndex: 0 }] })
    const state = makeState({ player, skillPoints: 0 })
    expect(deallocateSkillPoint(state, 'a', 5)).toBe(2)
    expect(player.actives[0].points).toBe(0)
    expect(state.skillPoints).toBe(2)
  })

  it('未投資（points:0）なら何も起きない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 0, level: 1, cooldown: 0, slotIndex: 0 }] })
    const state = makeState({ player, skillPoints: 0 })
    expect(deallocateSkillPoint(state, 'a', 1)).toBe(0)
    expect(state.skillPoints).toBe(0)
  })

  it('倉庫中（未セット）のアクティブからは引き戻せない', () => {
    const player = makePlayer({ actives: [{ id: 'a', points: 3, level: 2, cooldown: 0, slotIndex: null }] })
    const state = makeState({ player, skillPoints: 0 })
    expect(deallocateSkillPoint(state, 'a', 1)).toBe(0)
    expect(player.actives[0].points).toBe(3)
  })
})

describe('skillPanel: setStatAllocation / resetStatAllocations', () => {
  it('未配分プールから配分し、player.temporary へ permanent スコープの補正が積まれる', () => {
    const state = makeState({ statPoints: 3 })
    setStatAllocation(state, 'str', 2)
    expect(state.statAllocations.str).toBe(2)
    expect(state.statPoints).toBe(1)
    expect(state.player.temporary).toContainEqual({
      stat: 'str', flat: BATTLE.fallbackStatBoost.other * 2, scope: 'permanent', sourceId: 'statPanel:str',
    })
  })

  it('hp は専用の増加量を使う', () => {
    const state = makeState({ statPoints: 1 })
    setStatAllocation(state, 'hp', 1)
    expect(state.player.temporary[0].flat).toBe(BATTLE.fallbackStatBoost.hp)
  })

  it('増やす量が未配分プールを超える場合は残量分だけ配分する', () => {
    const state = makeState({ statPoints: 1 })
    setStatAllocation(state, 'str', 5)
    expect(state.statAllocations.str).toBe(1)
    expect(state.statPoints).toBe(0)
  })

  it('配分を減らすと未配分プールへ戻り、補正も減る', () => {
    const state = makeState({ statPoints: 3 })
    setStatAllocation(state, 'str', 3)
    setStatAllocation(state, 'str', 1)
    expect(state.statAllocations.str).toBe(1)
    expect(state.statPoints).toBe(2)
    expect(state.player.temporary[0].flat).toBe(BATTLE.fallbackStatBoost.other * 1)
  })

  it('0まで減らすと補正そのものが消える', () => {
    const state = makeState({ statPoints: 3 })
    setStatAllocation(state, 'str', 2)
    setStatAllocation(state, 'str', 0)
    expect(state.player.temporary).toHaveLength(0)
    expect(state.statPoints).toBe(3)
  })

  it('resetStatAllocations は全ステータスの配分をプールへ戻し、補正も消える', () => {
    const state = makeState({ statPoints: 5 })
    setStatAllocation(state, 'str', 2)
    setStatAllocation(state, 'agi', 1)
    resetStatAllocations(state)
    expect(state.statPoints).toBe(5)
    expect(Object.values(state.statAllocations).every(v => v === 0)).toBe(true)
    expect(state.player.temporary).toHaveLength(0)
  })
})
