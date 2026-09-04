import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getOp, allOpIds, runEffects, KNOWN_OP_IDS,
  clearThisHitModifiers, clearThisTurnModifiers, clearThisBattleModifiers,
} from '../../../../src/domain/battle/effectOps'
import { shieldCutRateFor } from '../../../../src/domain/battle/effectOps/damage'
import { BATTLE } from '../../../../src/data/tunables'
import type { BattleStats, Combatant, TemporaryModifier } from '../../../../src/domain/battle/types'
import {
  makeStats, makeCombatant, makePlayer, makeActive, makePassive, makeTrait,
  makeContent, makeCtx, captureEffects, constRng, node,
} from './_helpers'

afterEach(() => { vi.restoreAllMocks() })

// AGI = evade.anchor なら回避率 0。命中率 1 と組み合わせると必中になる。
// 他のステータスを上書きしないよう Partial で持つ。
const NEVER_EVADES: Partial<BattleStats> = { agi: BATTLE.evade.anchor }

describe('effectOps: レジストリ', () => {
  it('KNOWN_OP_IDS のすべてが登録済み', () => {
    for (const id of KNOWN_OP_IDS) expect(getOp(id), id).toBeDefined()
  })

  it('登録済みの op 一覧と KNOWN_OP_IDS が一致する（片方だけの追加を防ぐ）', () => {
    expect([...allOpIds()].sort()).toEqual([...KNOWN_OP_IDS].sort())
  })

  it('未登録の op は警告を出してスキップされ、後続の op は実行される', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const skill = makeActive({ id: 's' })
    const source = makePlayer()
    const target = makeCombatant({ hp: 5000 })
    const ctx = makeCtx({ source, targets: [target], skill, content: makeContent({ skills: [skill] }) })

    runEffects([
      node('no_such_op'),
      node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } }),
    ], ctx)

    expect(warn).toHaveBeenCalled()
    expect(target.hp).toBeLessThan(5000)
  })

  it('runEffects の終了時に thisHit スコープの補正が発動元・対象の双方から消える', () => {
    const skill = makeActive({ id: 's' })
    const source = makePlayer({ temporary: [{ stat: 'str', flat: 1, scope: 'thisHit', sourceId: 's' }] })
    const target = makeCombatant({ temporary: [{ stat: 'def', flat: 1, scope: 'thisHit', sourceId: 's' }] })
    runEffects([], makeCtx({ source, targets: [target], skill, content: makeContent({ skills: [skill] }) }))
    expect(source.temporary).toEqual([])
    expect(target.temporary).toEqual([])
  })

  it('宣言的op は runEffects から呼ばれても警告のみで例外を投げない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const skill = makePassive({ id: 'p' })
    const ctx = makeCtx({ source: makePlayer(), targets: [], skill, content: makeContent({ skills: [skill] }) })
    const declarative = ['statBoost', 'elementAffinity', 'cutRate', 'replaceGuard',
      'healBetweenBattles', 'effectBoost', 'healTaken']
    expect(() => runEffects(declarative.map(op => node(op)), ctx)).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(declarative.length)
  })
})

describe('effectOps: 補正スコープの失効', () => {
  function combatantWithAllScopes(): Combatant {
    const temporary: TemporaryModifier[] = [
      { stat: 'str', flat: 1, scope: 'thisHit', sourceId: 'x' },
      { stat: 'str', flat: 2, scope: 'thisTurn', sourceId: 'x' },
      { stat: 'str', flat: 3, scope: 'thisBattle', sourceId: 'x' },
      { stat: 'str', flat: 4, scope: 'permanent', sourceId: 'x' },
    ]
    return makeCombatant({ temporary })
  }

  it('thisHit の失効では thisHit だけが消える', () => {
    const c = combatantWithAllScopes()
    clearThisHitModifiers(c)
    expect(c.temporary.map(m => m.scope)).toEqual(['thisTurn', 'thisBattle', 'permanent'])
  })

  it('thisTurn の失効では thisTurn だけが消える', () => {
    const c = combatantWithAllScopes()
    clearThisTurnModifiers(c)
    expect(c.temporary.map(m => m.scope)).toEqual(['thisHit', 'thisBattle', 'permanent'])
  })

  it('戦闘終了時は thisBattle と thisTurn の両方が消え、permanent は残る', () => {
    const c = combatantWithAllScopes()
    clearThisBattleModifiers(c)
    expect(c.temporary.map(m => m.scope)).toEqual(['thisHit', 'permanent'])
  })
})

describe('effectOps: damage', () => {
  const strike = makeActive({
    id: 'strike', element: 'physical',
    effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })],
  })

  function run(parts: {
    source?: Combatant; target?: Combatant; level?: number
    content?: ReturnType<typeof makeContent>; rng?: () => number
  } = {}) {
    const content = parts.content ?? makeContent({ skills: [strike] })
    const source = parts.source ?? makePlayer()
    const target = parts.target ?? makeCombatant({ id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const fx = captureEffects()
    const ctx = makeCtx({
      source, targets: [target], skill: strike, content,
      level: parts.level ?? 1, rng: parts.rng ?? constRng(0.5), emit: fx.emit,
    })
    getOp('damage')?.execute(strike.effect[0], ctx)
    return { source, target, fx }
  }

  it('設計書の計算例（03-damage-calc.md）どおりの最終ダメージになる', () => {
    // STR基礎1000 / パッシブ +300 と +5% / 特性「物理+50%」/ 対象は物理弱点・DEF2000
    const pFlat = makePassive({ id: 'p_flat', effect: [node('statBoost', { stat: 'str', amount: 300 })] })
    const pRate = makePassive({ id: 'p_rate', effect: [node('statBoost', { stat: 'str', rate: 0.05 })] })
    const tBoost = makeTrait({ id: 't_boost', effect: [node('effectBoost', { element: 'physical', rate: 0.5 })] })
    const tWeak = makeTrait({ id: 't_weak', effect: [node('elementAffinity', { element: 'physical', affinity: 'weak' })] })
    const content = makeContent({ skills: [strike, pFlat, pRate], traits: [tBoost, tWeak] })

    const source = makePlayer({
      baseStats: makeStats({ str: 1000, hitRate: 1, critRate: 0 }),
      passives: [{ id: 'p_flat', level: 1, stacks: 0 }, { id: 'p_rate', level: 1, stacks: 0 }],
      traits: [{ id: 't_boost' }],
    })
    const target = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 10000, def: 2000, ...NEVER_EVADES }), hp: 10000,
      traits: [{ id: 't_weak' }],
    })

    const r = run({ source, target, content })
    expect(r.target.hp).toBe(10000 - 3890)
  })

  it('命中しなければダメージは入らず fx_miss だけが出る', () => {
    const evasive = makeCombatant({
      id: 'foe', hp: 5000,
      baseStats: makeStats({ hp: 5000, agi: 1000000 }),   // 回避率は上限まで上がる
    })
    const r = run({ target: evasive, rng: constRng(0.99) })
    expect(r.target.hp).toBe(5000)
    expect(r.fx.ids()).toEqual(['fx_miss'])
  })

  it('クリティカル時はクリティカルダメージ倍率が乗る', () => {
    const base = run({ source: makePlayer({ baseStats: makeStats({ critRate: 0 }) }) })
    const crit = run({ source: makePlayer({ baseStats: makeStats({ critRate: 1, critDamageMultiplier: 2 }) }) })
    const baseDealt = 100000 - base.target.hp
    const critDealt = 100000 - crit.target.hp
    expect(critDealt).toBe(baseDealt * 2)
    expect(crit.fx.ids()).toContain('fx_critical')
  })

  it('効果倍率（特性の attackBoost）が実際にダメージへ反映される', () => {
    const tBoost = makeTrait({ id: 't_boost', effect: [node('effectBoost', { element: 'physical', rate: 0.5 })] })
    const content = makeContent({ skills: [strike], traits: [tBoost] })
    const plain = run()
    const boosted = run({ source: makePlayer({ traits: [{ id: 't_boost' }] }), content })
    expect(100000 - boosted.target.hp).toBe(Math.floor((100000 - plain.target.hp) * 1.5))
  })

  it('スキルレベルの倍率が参照割合に掛かる', () => {
    const lv1 = run({ level: 1 })
    const lv2 = run({ level: 2 })
    expect(100000 - lv2.target.hp).toBe((100000 - lv1.target.hp) * 3)
  })

  it('対象の特性カット率が軽減として効く', () => {
    const stone = makeTrait({ id: 'stone', effect: [node('cutRate', { amount: 0.5 })] })
    const content = makeContent({ skills: [strike], traits: [stone] })
    const target = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000,
      traits: [{ id: 'stone' }],
    })
    const plain = run()
    const armored = run({ target, content })
    expect(100000 - armored.target.hp).toBe((100000 - plain.target.hp) * 0.5)
  })

  it('「守る」で積んだ cutRate の一時効果が軽減として効く', () => {
    const guarded = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000,
      temporary: [{ stat: 'cutRate', flat: BATTLE.guard.cutRate, scope: 'thisTurn', sourceId: 'guard' }],
    })
    const plain = run()
    const r = run({ target: guarded })
    expect(100000 - r.target.hp).toBe((100000 - plain.target.hp) * (1 - BATTLE.guard.cutRate))
  })

  it('シールドを張っている間は追加のカット率が乗る', () => {
    const shielded = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000, shield: 100000,
    })
    const r = run({ target: shielded })
    const expected = Math.floor(1000 * (1 - BATTLE.shield.cutRate))
    expect(shielded.shield).toBe(100000 - expected)
    expect(r.target.hp).toBe(100000)
  })

  it('シールドのカット率は特殊属性に対してだけ高い', () => {
    expect(shieldCutRateFor('physical')).toBe(BATTLE.shield.cutRate)
    expect(shieldCutRateFor('magical')).toBe(BATTLE.shield.cutRate)
    expect(shieldCutRateFor('special')).toBe(BATTLE.shield.cutRateVsSpecial)
  })

  it('弱点・耐性・シールド破壊・撃破のエフェクトが状況に応じて出る', () => {
    const tWeak = makeTrait({ id: 't_weak', effect: [node('elementAffinity', { element: 'physical', affinity: 'weak' })] })
    const content = makeContent({ skills: [strike], traits: [tWeak] })
    const frail = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100, ...NEVER_EVADES }), hp: 100, shield: 10,
      traits: [{ id: 't_weak' }],
    })
    const r = run({ target: frail, content })
    expect(r.fx.ids()).toContain('fx_hit_physical')
    expect(r.fx.ids()).toContain('fx_weakness')
    expect(r.fx.ids()).toContain('fx_shield_break')
    expect(r.fx.ids()).toContain('fx_defeat')
    expect(r.target.alive).toBe(false)
  })

  it('耐性持ちには fx_resisted が出てダメージが半減する', () => {
    const tResist = makeTrait({ id: 't_res', effect: [node('elementAffinity', { element: 'physical', affinity: 'resist' })] })
    const content = makeContent({ skills: [strike], traits: [tResist] })
    const target = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000, traits: [{ id: 't_res' }],
    })
    const plain = run()
    const r = run({ target, content })
    expect(r.fx.ids()).toContain('fx_resisted')
    expect(100000 - r.target.hp).toBe((100000 - plain.target.hp) * 0.5)
  })

  it('戦闘不能の対象は攻撃対象から外れる', () => {
    const dead = makeCombatant({ id: 'foe', hp: 0, alive: false })
    const r = run({ target: dead })
    expect(r.fx.list).toEqual([])
  })
})

describe('effectOps: heal', () => {
  const healSkill = makeActive({
    id: 'heal_light', element: 'special',
    effect: [node('heal', { element: 'special', scale: { stat: 'int', rate: 0.8 } })],
  })

  function run(parts: { target: Combatant; source?: Combatant; content?: ReturnType<typeof makeContent>; rng?: () => number }) {
    const content = parts.content ?? makeContent({ skills: [healSkill] })
    const source = parts.source ?? makePlayer({ baseStats: makeStats({ int: 1000, critRate: 0 }) })
    const fx = captureEffects()
    const ctx = makeCtx({
      source, targets: [parts.target], skill: healSkill, content,
      rng: parts.rng ?? constRng(0.5), emit: fx.emit,
    })
    getOp('heal')?.execute(healSkill.effect[0], ctx)
    return { fx }
  }

  it('参照ステータスの割合ぶん回復する', () => {
    const target = makeCombatant({ hp: 1000 })
    run({ target })
    expect(target.hp).toBe(1800)
  })

  it('回復では命中判定を行わない（回避率が高い対象でも必ず回復する）', () => {
    const target = makeCombatant({ hp: 1000, baseStats: makeStats({ agi: 1000000 }) })
    run({ target, rng: constRng(0.99) })
    expect(target.hp).toBe(1800)
  })

  it('最大HPを超えては回復しない', () => {
    const target = makeCombatant({ hp: 4900 })
    run({ target })
    expect(target.hp).toBe(5000)
  })

  it('回復にもクリティカルが乗る', () => {
    const target = makeCombatant({ hp: 0, alive: true, baseStats: makeStats({ hp: 100000 }) })
    const source = makePlayer({ baseStats: makeStats({ int: 1000, critRate: 1, critDamageMultiplier: 2 }) })
    const r = run({ target, source })
    expect(target.hp).toBe(1600)
    expect(r.fx.ids()).toContain('fx_critical')
  })

  it('対象の被回復倍率（healTaken）が乗る', () => {
    const medic = makeTrait({ id: 'medic', effect: [node('healTaken', { rate: 0.5 })] })
    const content = makeContent({ skills: [healSkill], traits: [medic] })
    const target = makeCombatant({ hp: 0, alive: true, baseStats: makeStats({ hp: 100000 }), traits: [{ id: 'medic' }] })
    run({ target, content })
    expect(target.hp).toBe(1200)
  })

  it('戦闘不能の対象は回復されない', () => {
    const target = makeCombatant({ hp: 0, alive: false })
    run({ target })
    expect(target.hp).toBe(0)
  })
})

describe('effectOps: shield', () => {
  const shieldSkill = makeActive({
    id: 'guard_shield', element: 'special',
    effect: [node('shield', { element: 'special', scale: { stat: 'def', rate: 0.5 } })],
  })

  function run(target: Combatant, source = makePlayer({ baseStats: makeStats({ def: 1000, critRate: 0 }) })) {
    const content = makeContent({ skills: [shieldSkill] })
    const fx = captureEffects()
    const ctx = makeCtx({ source, targets: [target], skill: shieldSkill, content, rng: constRng(0.5), emit: fx.emit })
    getOp('shield')?.execute(shieldSkill.effect[0], ctx)
    return { fx }
  }

  it('参照ステータスの割合ぶんシールドを張る', () => {
    const target = makePlayer()
    run(target)
    expect(target.shield).toBe(500)
  })

  it('重ねて張ると加算される（上書きではない）', () => {
    const target = makePlayer()
    run(target)
    run(target)
    expect(target.shield).toBe(1000)
  })

  it('シールドにもクリティカルが乗る', () => {
    const target = makePlayer()
    run(target, makePlayer({ baseStats: makeStats({ def: 1000, critRate: 1, critDamageMultiplier: 2 }) }))
    expect(target.shield).toBe(1000)
  })

  it('付与時に fx_shield_gain が出る', () => {
    const target = makePlayer()
    expect(run(target).fx.ids()).toContain('fx_shield_gain')
  })
})

describe('effectOps: repeat', () => {
  const tripleStrike = makeActive({
    id: 'triple', element: 'physical',
    effect: [node('repeat', {
      times: 3,
      body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 0.8 } })],
      onLastIteration: [node('modifier', { stat: 'critRate', amount: 1, scope: 'thisHit' })],
    })],
  })

  function runTriple() {
    const content = makeContent({ skills: [tripleStrike] })
    const source = makePlayer({ baseStats: makeStats({ str: 1000, critRate: 0, critDamageMultiplier: 2 }) })
    const target = makeCombatant({ id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const fx = captureEffects()
    const ctx = makeCtx({ source, targets: [target], skill: tripleStrike, content, rng: constRng(0.5), emit: fx.emit })
    getOp('repeat')?.execute(tripleStrike.effect[0], ctx)
    return { source, target, fx }
  }

  it('指定回数ぶん内側の効果が実行される', () => {
    const r = runTriple()
    expect(r.fx.ids().filter(id => id === 'fx_hit_physical')).toHaveLength(3)
  })

  it('最後の1回だけクリティカル率上昇が適用される（3連撃の仕様）', () => {
    const r = runTriple()
    // 800 + 800 + (800 × 2) = 3200
    expect(100000 - r.target.hp).toBe(3200)
    expect(r.fx.ids().filter(id => id === 'fx_critical')).toHaveLength(1)
  })

  it('thisHit の補正は反復をまたいで持ち越されない', () => {
    const r = runTriple()
    expect(r.source.temporary).toEqual([])
  })

  it('onFirstIteration は最初の1回の前にだけ実行される', () => {
    const skill = makeActive({
      id: 'first', element: 'physical',
      effect: [node('repeat', {
        times: 3,
        body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 0.8 } })],
        onFirstIteration: [node('modifier', { stat: 'critRate', amount: 1, scope: 'thisHit' })],
      })],
    })
    const content = makeContent({ skills: [skill] })
    const source = makePlayer({ baseStats: makeStats({ str: 1000, critRate: 0, critDamageMultiplier: 2 }) })
    const target = makeCombatant({ id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const fx = captureEffects()
    getOp('repeat')?.execute(skill.effect[0], makeCtx({
      source, targets: [target], skill, content, rng: constRng(0.5), emit: fx.emit,
    }))
    expect(100000 - target.hp).toBe(3200)   // 1600 + 800 + 800
    expect(fx.ids().filter(id => id === 'fx_critical')).toHaveLength(1)
  })

  it('repeat 内の未登録 op は警告のみでスキップされる', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const skill = makeActive({ id: 'r', effect: [node('repeat', { times: 2, body: [node('nope')] })] })
    const content = makeContent({ skills: [skill] })
    expect(() => getOp('repeat')?.execute(skill.effect[0], makeCtx({
      source: makePlayer(), targets: [], skill, content,
    }))).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('times が 0 なら何も起きない', () => {
    const skill = makeActive({
      id: 'zero',
      effect: [node('repeat', { times: 0, body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })] })],
    })
    const content = makeContent({ skills: [skill] })
    const target = makeCombatant({ hp: 5000 })
    getOp('repeat')?.execute(skill.effect[0], makeCtx({ source: makePlayer(), targets: [target], skill, content }))
    expect(target.hp).toBe(5000)
  })
})

describe('effectOps: modifier', () => {
  const skill = makeActive({ id: 'buffer' })
  const content = makeContent({ skills: [skill] })

  function run(n: Parameters<typeof node>[1] & { stat: string }, level = 1) {
    const source = makePlayer()
    const target = makeCombatant({ id: 'foe' })
    const fx = captureEffects()
    getOp('modifier')?.execute(node('modifier', n), makeCtx({
      source, targets: [target], skill, content, level, emit: fx.emit,
    }))
    return { source, target, fx }
  }

  it('applyTo 省略時は発動元に付与される（自己バフが既定）', () => {
    const r = run({ stat: 'critRate', amount: 0.5, scope: 'thisHit' })
    expect(r.source.temporary).toHaveLength(1)
    expect(r.target.temporary).toHaveLength(0)
  })

  it('applyTo: "target" では対象に付与される（デバフ）', () => {
    const r = run({ stat: 'def', rate: -0.2, scope: 'thisBattle', applyTo: 'target' })
    expect(r.source.temporary).toHaveLength(0)
    expect(r.target.temporary[0]).toMatchObject({ stat: 'def', rate: -0.2, scope: 'thisBattle' })
  })

  it('効果量にスキルレベルの倍率が掛かる', () => {
    const r = run({ stat: 'str', amount: 100, scope: 'thisTurn' }, 3)
    expect(r.source.temporary[0].flat).toBe(700)   // 100 × (2^3-1)
  })

  it('割合ステータス（critRate等）にはレベル倍率を掛けない（常に等倍）', () => {
    // レベル倍率を掛けると、レベルアップのたびに確率自体が指数的に膨張し、
    // スーパークリティカルと絡んで際限なく暴走する不具合が実際にあった
    // （三連撃/見切り撃ちで確認。PERCENT_STAT_KEYS参照）。
    const r = run({ stat: 'critRate', amount: 0.5, scope: 'thisHit' }, 4)
    expect(r.source.temporary[0].flat).toBe(0.5)   // (2^4-1)=15 が掛かっていれば 7.5 になってしまう
  })

  it('cutRateも割合ステータス扱いでレベル倍率を掛けない', () => {
    const r = run({ stat: 'cutRate', amount: 0.5, scope: 'thisTurn' }, 4)
    expect(r.source.temporary[0].flat).toBe(0.5)
  })

  it('付与元スキルIDが記録される', () => {
    const r = run({ stat: 'str', amount: 1, scope: 'thisTurn' })
    expect(r.source.temporary[0].sourceId).toBe('buffer')
  })

  it('上昇はバフ、低下はデバフのエフェクトになる', () => {
    expect(run({ stat: 'str', amount: 100, scope: 'thisTurn' }).fx.ids()).toEqual(['fx_buff'])
    expect(run({ stat: 'str', amount: -100, scope: 'thisTurn' }).fx.ids()).toEqual(['fx_debuff'])
  })

  it('戦闘不能の対象には付与されない', () => {
    const source = makePlayer()
    const dead = makeCombatant({ id: 'foe', alive: false })
    getOp('modifier')?.execute(node('modifier', { stat: 'def', rate: -0.2, scope: 'thisBattle', applyTo: 'target' }),
      makeCtx({ source, targets: [dead], skill, content }))
    expect(dead.temporary).toHaveLength(0)
  })
})
