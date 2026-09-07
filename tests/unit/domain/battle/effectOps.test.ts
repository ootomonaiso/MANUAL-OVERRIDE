import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getOp, allOpIds, runEffects, KNOWN_OP_IDS,
  clearThisHitModifiers, clearThisTurnModifiers, clearThisBattleModifiers, downgradeNextRoundModifiers,
  decrementRoundsModifiers,
} from '../../../../src/domain/battle/effectOps'
import { shieldCutRateFor } from '../../../../src/domain/battle/effectOps/damage'
import { BATTLE } from '../../../../src/data/tunables'
import type { BattleStats, Combatant, TemporaryModifier } from '../../../../src/domain/battle/types'
import {
  makeStats, makeCombatant, makePlayer, makeActive, makePassive, makeTrait,
  makeContent, makeCtx, makeState, captureEffects, constRng, node,
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
      { stat: 'str', flat: 5, scope: 'nextRound', sourceId: 'x' },
      { stat: 'str', flat: 3, scope: 'thisBattle', sourceId: 'x' },
      { stat: 'str', flat: 4, scope: 'permanent', sourceId: 'x' },
    ]
    return makeCombatant({ temporary })
  }

  it('thisHit の失効では thisHit だけが消える', () => {
    const c = combatantWithAllScopes()
    clearThisHitModifiers(c)
    expect(c.temporary.map(m => m.scope)).toEqual(['thisTurn', 'nextRound', 'thisBattle', 'permanent'])
  })

  it('thisTurn の失効では thisTurn だけが消え、nextRound は残る', () => {
    const c = combatantWithAllScopes()
    clearThisTurnModifiers(c)
    expect(c.temporary.map(m => m.scope)).toEqual(['thisHit', 'nextRound', 'thisBattle', 'permanent'])
  })

  it('nextRound の格下げでは nextRound だけが thisTurn に変わり、他は影響しない', () => {
    const c = combatantWithAllScopes()
    downgradeNextRoundModifiers(c)
    expect(c.temporary.map(m => m.scope)).toEqual(['thisHit', 'thisTurn', 'thisTurn', 'thisBattle', 'permanent'])
  })

  it('戦闘終了時は thisBattle・thisTurn・nextRound が消え、permanent は残る', () => {
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
    expect(100000 - lv2.target.hp).toBe((100000 - lv1.target.hp) * 1.25)
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

  it('scale.statOptions は指定したステータスのうち実効値が最も高いものを参照する（自摸 想定）', () => {
    const tsumo = makeActive({
      id: 'tsumo', element: 'none',
      effect: [node('damage', { element: 'none', scale: { statOptions: ['str', 'int'], rate: 2 } })],
    })
    const content = makeContent({ skills: [tsumo] })
    const target = makeCombatant({ id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })

    // int(1000) > str(500) のケース: int基準で計算される
    const intHigher = makePlayer({ baseStats: makeStats({ str: 500, int: 1000, hitRate: 1, critRate: 0 }) })
    const ctxA = makeCtx({ source: intHigher, targets: [target], skill: tsumo, content, rng: constRng(0.5), emit: () => {} })
    getOp('damage')?.execute(tsumo.effect[0], ctxA)
    expect(100000 - target.hp).toBe(2000)   // int(1000) × rate(2)

    // str(1500) > int(1000) のケース: str基準に切り替わる
    const target2 = makeCombatant({ id: 'foe2', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const strHigher = makePlayer({ baseStats: makeStats({ str: 1500, int: 1000, hitRate: 1, critRate: 0 }) })
    const ctxB = makeCtx({ source: strHigher, targets: [target2], skill: tsumo, content, rng: constRng(0.5), emit: () => {} })
    getOp('damage')?.execute(tsumo.effect[0], ctxB)
    expect(100000 - target2.hp).toBe(3000)   // str(1500) × rate(2)
  })

  it('反撃態勢中の対象への命中は queuedCounterHits を積むだけで、即時反撃はしない（カウンター想定）', () => {
    const target = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000,
      pendingCounter: { scaleStat: 'def', rate: 1, element: 'physical', sourceId: 'skill_counter' },
    })
    const r = run({ target })
    expect(r.target.queuedCounterHits).toBe(1)
    expect(r.source.hp).toBe(r.source.baseStats.hp)   // damage.ts 単体では反撃は実行されない（battleEngine側でまとめて処理）
  })

  it('反撃態勢の属性と一致しない攻撃（例: 反射板=magicalのところへphysicalが着弾）では発動しない', () => {
    const target = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000,
      pendingCounter: { scaleStat: 'ref', rate: 1, element: 'magical', sourceId: 'skill_reflect_plate' },
    })
    const r = run({ target })   // run() の strike は element: 'physical'
    expect(r.target.queuedCounterHits).toBe(0)
  })

  it('反撃態勢を持たない対象への命中では queuedCounterHits は増えない', () => {
    const r = run()
    expect(r.target.queuedCounterHits).toBe(0)
  })

  it('外れた攻撃は反撃態勢のキューを増やさない', () => {
    // evadeRate は導出値のため baseStats に直接書いても効かない（types.ts参照）。
    // 発動元の hitRate を0にして必ず外れるようにする
    const source = makePlayer({ baseStats: makeStats({ hitRate: 0 }) })
    const target = makeCombatant({
      id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000,
      pendingCounter: { scaleStat: 'def', rate: 1, element: 'physical', sourceId: 'skill_counter' },
    })
    const r = run({ source, target, rng: constRng(0) })
    expect(r.target.queuedCounterHits).toBe(0)
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

  it('flat 指定（無参照の固定値回復）ではステータスを参照せず、固定値をそのまま回復する（小さな薬草 想定）', () => {
    const flatSkill = makeActive({
      id: 'small_herb', element: 'none',
      effect: [node('heal', { element: 'none', flat: 150 })],
    })
    const content = makeContent({ skills: [flatSkill] })
    const target = makeCombatant({ hp: 0, alive: true, baseStats: makeStats({ hp: 100000 }) })
    // int を極端に振っても flat 回復量は変わらないことを確認する
    const source = makePlayer({ baseStats: makeStats({ int: 999999, critRate: 0 }) })
    const fx = captureEffects()
    const ctx = makeCtx({ source, targets: [target], skill: flatSkill, content, rng: constRng(0.5), emit: fx.emit })
    getOp('heal')?.execute(flatSkill.effect[0], ctx)
    expect(target.hp).toBe(150)
  })

  it('flat 指定でもスキルレベルの倍率は掛かる', () => {
    const flatSkill = makeActive({
      id: 'large_herb', element: 'none',
      effect: [node('heal', { element: 'none', flat: 150 })],
    })
    const content = makeContent({ skills: [flatSkill] })
    const target = makeCombatant({ hp: 0, alive: true, baseStats: makeStats({ hp: 100000 }) })
    const source = makePlayer({ baseStats: makeStats({ critRate: 0 }) })
    const fx = captureEffects()
    const ctx = makeCtx({ source, targets: [target], skill: flatSkill, content, level: 2, rng: constRng(0.5), emit: fx.emit })
    getOp('heal')?.execute(flatSkill.effect[0], ctx)
    expect(target.hp).toBe(187)   // floor(150 × 1.25)
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
    expect(r.source.temporary[0].flat).toBe(150)   // 100 × 1.5（Lv3）
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

  it('scale は発動元の実効ステータス×rateをamountとして加算する（棘を纏う想定）', () => {
    // makePlayer() の既定 str は 1000（_helpers.ts）
    const r = run({ stat: 'def', scale: { stat: 'str', rate: 0.3 }, scope: 'thisBattle' })
    expect(r.source.temporary[0].flat).toBe(300)   // 1000 × 0.3
  })

  it('scale は固定値の amount と併用でき、加算される', () => {
    const r = run({ stat: 'def', amount: 50, scale: { stat: 'str', rate: 0.3 }, scope: 'thisBattle' })
    expect(r.source.temporary[0].flat).toBe(350)   // 50 + (1000 × 0.3)
  })

  it('scale は applyTo:"target" でも発動元(source)自身のステータスを参照する', () => {
    const source = makePlayer({ baseStats: { ...makePlayer().baseStats, str: 2000 } })
    const target = makeCombatant({ id: 'foe', baseStats: { ...makeCombatant().baseStats, str: 1 } })
    const fx = captureEffects()
    getOp('modifier')?.execute(node('modifier', { stat: 'def', scale: { stat: 'str', rate: 0.1 }, scope: 'thisBattle', applyTo: 'target' }),
      makeCtx({ source, targets: [target], skill, content, emit: fx.emit }))
    expect(target.temporary[0].flat).toBe(200)   // 発動元の str=2000 × 0.1（対象のstr=1は無関係）
  })

  it('scaleにもスキルレベルの倍率が掛かる', () => {
    const r = run({ stat: 'def', scale: { stat: 'str', rate: 0.3 }, scope: 'thisBattle' }, 3)
    expect(r.source.temporary[0].flat).toBe(450)   // (1000 × 0.3) × 1.5（Lv3）
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

describe('effectOps: 自己命中率デバフを damage より前に置くと、その一撃自体の命中判定へ即座に反映される（大振り 想定）', () => {
  const skill = makeActive({
    id: 'skill_wild_swing',
    effect: [
      node('modifier', { stat: 'hitRate', rate: -0.75, scope: 'thisHit' }),
      node('damage', { element: 'physical', scale: { stat: 'str', rate: 3.5 } }),
    ],
  })

  it('命中率が事前に75%減った状態でその場のdamageの命中判定が行われる', () => {
    const source = makePlayer({ baseStats: makeStats({ str: 1000, hitRate: 1, critRate: 0 }) })
    const target = makeCombatant({ id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const content = makeContent({ skills: [skill] })
    const state = makeState({ player: source, enemies: [target] })
    // rng=0.3: 素の命中率1.0なら命中(0.3<1.0)だが、-75%後の命中率0.25では外れる(0.3<0.25は偽)
    const ctx = makeCtx({ source, targets: [target], skill, content, state, rng: constRng(0.3) })

    runEffects(skill.effect, ctx)

    expect(target.hp).toBe(100000)   // 外れてダメージが通らない
  })

  it('runEffects終了後は thisHit スコープが失効し、次の行動の命中率には影響しない', () => {
    const source = makePlayer({ baseStats: makeStats({ str: 1000, hitRate: 1, critRate: 0 }) })
    const target = makeCombatant({ id: 'foe', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const content = makeContent({ skills: [skill] })
    const state = makeState({ player: source, enemies: [target] })
    const ctx = makeCtx({ source, targets: [target], skill, content, state, rng: constRng(0.3) })

    runEffects(skill.effect, ctx)
    expect(source.temporary).toHaveLength(0)
  })
})

describe('effectOps: periodicSelfDamage', () => {
  it('継続ダメージを自身の periodicSelfEffects へ登録する（龍鱗 想定）', () => {
    const skill = makeActive({ id: 'skill_dragon_scale' })
    const content = makeContent({ skills: [skill] })
    const source = makePlayer()
    getOp('periodicSelfDamage')?.execute(
      node('periodicSelfDamage', { ratio: 0.15 }),
      makeCtx({ source, targets: [source], skill, content }),
    )
    expect(source.periodicSelfEffects).toEqual([
      { kind: 'trueDamagePercentMaxHp', ratio: 0.15, sourceId: 'skill_dragon_scale' },
    ])
  })
})

describe('effectOps: counterStance', () => {
  it('反撃態勢を設定し、キューをリセットする(カウンター/反射板 想定)', () => {
    const skill = makeActive({ id: 'skill_counter' })
    const content = makeContent({ skills: [skill] })
    const source = makePlayer({ queuedCounterHits: 3 })
    getOp('counterStance')?.execute(
      node('counterStance', { scaleStat: 'def', rate: 1, element: 'physical' }),
      makeCtx({ source, targets: [source], skill, content }),
    )
    expect(source.pendingCounter).toEqual({ scaleStat: 'def', rate: 1, element: 'physical', sourceId: 'skill_counter' })
    expect(source.queuedCounterHits).toBe(0)
  })
})

describe('effectOps: periodicTargetDamage', () => {
  const skill = makeActive({ id: 'skill_wind_wrap' })
  const content = makeContent({ skills: [skill] })

  it('継続ダメージ（相手側向け）を自身の periodicTargetEffects へ登録する（風の剣 想定）', () => {
    const source = makePlayer()
    getOp('periodicTargetDamage')?.execute(
      node('periodicTargetDamage', { element: 'none', scale: { stat: 'agi', rate: 0.5 }, duration: 3 }),
      makeCtx({ source, targets: [source], skill, content }),
    )
    expect(source.periodicTargetEffects).toEqual([
      { element: 'none', scaleStat: 'agi', rate: 0.5, roundsRemaining: 3, sourceId: 'skill_wind_wrap' },
    ])
  })

  it('同一スキル由来の効果が重複した場合、新規に増やさず残存ラウンド数を延長する', () => {
    const source = makePlayer()
    const n = node('periodicTargetDamage', { element: 'none', scale: { stat: 'agi', rate: 0.5 }, duration: 3 })
    getOp('periodicTargetDamage')?.execute(n, makeCtx({ source, targets: [source], skill, content }))
    getOp('periodicTargetDamage')?.execute(n, makeCtx({ source, targets: [source], skill, content }))
    expect(source.periodicTargetEffects).toHaveLength(1)
    expect(source.periodicTargetEffects[0].roundsRemaining).toBe(6)
  })

  it('スキルレベルの倍率が rate に掛かった状態で保存される', () => {
    const source = makePlayer()
    getOp('periodicTargetDamage')?.execute(
      node('periodicTargetDamage', { element: 'none', scale: { stat: 'agi', rate: 0.5 }, duration: 3 }),
      makeCtx({ source, targets: [source], skill, content, level: 2 }),
    )
    expect(source.periodicTargetEffects[0].rate).toBe(0.625)   // 0.5 × 1.25（Lv2）
  })
})

describe('effectOps: modifier の scope:"rounds"', () => {
  it('decrementRoundsModifiers は rounds のみ1減らし、0になったら失効する。他のscopeには影響しない', () => {
    const c = makeCombatant({
      temporary: [
        { stat: 'str', rate: -0.2, scope: 'rounds', roundsRemaining: 2, sourceId: 'x' },
        { stat: 'int', flat: 1, scope: 'permanent', sourceId: 'x' },
      ],
    })
    decrementRoundsModifiers(c)
    expect(c.temporary).toEqual([
      { stat: 'str', rate: -0.2, scope: 'rounds', roundsRemaining: 1, sourceId: 'x' },
      { stat: 'int', flat: 1, scope: 'permanent', sourceId: 'x' },
    ])
    decrementRoundsModifiers(c)
    expect(c.temporary).toEqual([
      { stat: 'int', flat: 1, scope: 'permanent', sourceId: 'x' },
    ])
  })

  it('modifierOp は scope:"rounds" のとき rounds を roundsRemaining として保存する（オーバーライド 想定）', () => {
    const skill = makeActive({ id: 'skill_override' })
    const content = makeContent({ skills: [skill] })
    const source = makePlayer()
    const target = makeCombatant({ id: 'foe' })
    getOp('modifier')?.execute(
      node('modifier', { stat: 'str', rate: -0.2, scope: 'rounds', rounds: 3, applyTo: 'target' }),
      makeCtx({ source, targets: [target], skill, content }),
    )
    expect(target.temporary[0]).toMatchObject({ stat: 'str', rate: -0.2, scope: 'rounds', roundsRemaining: 3 })
  })

  it('clearThisBattleModifiers は rounds も thisBattle 等と一緒に消す', () => {
    const c = makeCombatant({
      temporary: [
        { stat: 'str', rate: -0.2, scope: 'rounds', roundsRemaining: 2, sourceId: 'x' },
        { stat: 'int', flat: 1, scope: 'permanent', sourceId: 'x' },
      ],
    })
    clearThisBattleModifiers(c)
    expect(c.temporary).toEqual([{ stat: 'int', flat: 1, scope: 'permanent', sourceId: 'x' }])
  })
})

describe('effectOps: selfDamageFromDealt', () => {
  const skill = makeActive({
    id: 'skill_meteor', element: 'magical', focusRange: 'all',
    effect: [
      node('damage', { element: 'magical', scale: { stat: 'int', rate: 1 } }),
      node('selfDamageFromDealt', { rate: 0.5 }),
    ],
  })

  it('範囲攻撃で与えた合計ダメージ（複数対象の合計）の割合を自傷する（烙天 想定）', () => {
    const source = makePlayer({ baseStats: makeStats({ int: 1000, hp: 100000, hitRate: 1, critRate: 0 }) })
    const t1 = makeCombatant({ id: 'foe1', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const t2 = makeCombatant({ id: 'foe2', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const content = makeContent({ skills: [skill] })
    const state = makeState({ player: source, enemies: [t1, t2] })
    const ctx = makeCtx({ source, targets: [t1, t2], skill, content, state, rng: constRng(0.5) })

    runEffects(skill.effect, ctx)

    expect(100000 - t1.hp).toBe(1000)
    expect(100000 - t2.hp).toBe(1000)
    expect(100000 - source.hp).toBe(1000)   // (1000+1000) × 0.5
  })

  it('この一撃で相手側が全滅した場合は自傷ダメージを受けない', () => {
    const source = makePlayer({ baseStats: makeStats({ int: 1000, hp: 100000, hitRate: 1, critRate: 0 }) })
    const t1 = makeCombatant({ id: 'foe1', baseStats: makeStats({ hp: 500, ...NEVER_EVADES }), hp: 500 })
    const content = makeContent({ skills: [skill] })
    const state = makeState({ player: source, enemies: [t1] })
    const ctx = makeCtx({ source, targets: [t1], skill, content, state, rng: constRng(0.5) })

    runEffects(skill.effect, ctx)

    expect(t1.alive).toBe(false)
    expect(source.hp).toBe(100000)
  })

  it('生き残りが1体でもいれば自傷ダメージを受ける', () => {
    const source = makePlayer({ baseStats: makeStats({ int: 1000, hp: 100000, hitRate: 1, critRate: 0 }) })
    const t1 = makeCombatant({ id: 'foe1', baseStats: makeStats({ hp: 500, ...NEVER_EVADES }), hp: 500 })
    const t2 = makeCombatant({ id: 'foe2', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const content = makeContent({ skills: [skill] })
    const state = makeState({ player: source, enemies: [t1, t2] })
    const ctx = makeCtx({ source, targets: [t1, t2], skill, content, state, rng: constRng(0.5) })

    runEffects(skill.effect, ctx)

    expect(t1.alive).toBe(false)
    expect(t2.alive).toBe(true)
    expect(100000 - source.hp).toBe(1000)   // 全滅していないので自傷が発生する
  })

  it('外れた対象の分も、クリティカルなし想定のダメージとして自傷計算に加算される（内部仕様: 外して自傷を避けることはできない）', () => {
    const source = makePlayer({ baseStats: makeStats({ int: 1000, hp: 100000, hitRate: 0, critRate: 0 }) })
    const t1 = makeCombatant({ id: 'foe1', baseStats: makeStats({ hp: 100000, ...NEVER_EVADES }), hp: 100000 })
    const content = makeContent({ skills: [skill] })
    const state = makeState({ player: source, enemies: [t1] })
    const ctx = makeCtx({ source, targets: [t1], skill, content, state, rng: constRng(0.5) })

    runEffects(skill.effect, ctx)

    expect(t1.hp).toBe(100000)   // 命中率0のため完全に外れる
    expect(100000 - source.hp).toBe(500)   // 外れた分の想定ダメージ1000 × 0.5
  })

  it('rate にはスキルレベルの倍率が掛からない（既にレベル倍率込みのdealtDamageへ掛けると二重補正になるため）', () => {
    const source = makePlayer({ baseStats: makeStats({ int: 1000, hp: 1000000, hitRate: 1, critRate: 0 }) })
    const t1 = makeCombatant({ id: 'foe1', baseStats: makeStats({ hp: 1000000, ...NEVER_EVADES }), hp: 1000000 })
    const content = makeContent({ skills: [skill] })
    const state = makeState({ player: source, enemies: [t1] })
    const ctx = makeCtx({ source, targets: [t1], skill, content, state, level: 2, rng: constRng(0.5) })

    runEffects(skill.effect, ctx)

    const dealt = 1000000 - t1.hp
    const selfDamage = 1000000 - source.hp
    expect(selfDamage).toBe(Math.floor(dealt * 0.5))   // レベル2でも比率は常にちょうど50%
  })
})
