/**
 * tests/unit/domain/battle/damagePreview.test.ts
 *
 * 特性テスト（characterization test）。docs/refactoring/02-domain.md §1-3 の統合
 * （damagePreview と effectOps/damage のパイプライン共通化）に着手する前に、
 * 現行の出力を golden として固定するために書いてある。
 * 「あるべき挙動」ではなく「今そうなっている挙動」を写しているため、
 * 期待値を変えるときは必ず仕様変更として扱うこと。
 */

import { describe, it, expect } from 'vitest'
import { estimateSkillDamage, damageMagnitude, MAGNITUDE_LABEL } from '../../../../src/domain/battle/damagePreview'
import { resolveEffectiveStats } from '../../../../src/domain/battle/battleEngine'
import { levelMultiplier } from '../../../../src/domain/battle/stats'
import { BATTLE } from '../../../../src/data/tunables'
import type {
  BattleContent, Combatant, EffectNode, SkillDef, StatKey,
} from '../../../../src/domain/battle/types'
import {
  makeStats, makeCombatant, makePlayer, makeActive, makePassive, makeTrait, makeContent, node,
} from './_helpers'

/** makeStats の既定は補正ゼロ点（def/ref = cut.anchor）なので、カット率も回避率も 0 になる */
const REF_STAT = 1000

function damageNode(over: { element?: string; stat?: StatKey; rate: number } ): EffectNode {
  return node('damage', {
    element: over.element ?? 'physical',
    scale: { stat: over.stat ?? 'str', rate: over.rate },
  })
}

function estimate(params: {
  skill: SkillDef
  level?: number
  source?: Combatant
  target?: Combatant
  content?: BattleContent
}): number {
  const content = params.content ?? makeContent()
  const source = params.source ?? makePlayer()
  const target = params.target ?? makeCombatant()
  return estimateSkillDamage({
    source, target, skill: params.skill, level: params.level ?? 1, content,
    getEffective: c => resolveEffectiveStats(c, content),
  })
}

describe('damagePreview: estimateSkillDamage の基本式', () => {
  it('damage ノード1つは 参照ステータス × rate になる（補正ゼロ点）', () => {
    const skill = makeActive({ id: 'a', effect: [damageNode({ rate: 2 })] })
    expect(estimate({ skill })).toBe(REF_STAT * 2)
  })

  it('アクティブスキルにはレベル倍率が掛かる', () => {
    const skill = makeActive({ id: 'a', effect: [damageNode({ rate: 2 })] })
    expect(estimate({ skill, level: 3 })).toBeCloseTo(REF_STAT * 2 * levelMultiplier(3), 6)
  })

  it('パッシブスキルにはレベル倍率が掛からない（kind === "active" のみ倍率を適用）', () => {
    const skill = makePassive({ id: 'p', effect: [damageNode({ rate: 2 })] })
    expect(estimate({ skill, level: 3 })).toBe(REF_STAT * 2)
  })

  it('参照ステータスは scale.stat で切り替わる', () => {
    const skill = makeActive({ id: 'a', effect: [damageNode({ stat: 'int', rate: 1 })] })
    const source = makePlayer({ baseStats: makeStats({ int: 2000 }) })
    expect(estimate({ skill, source })).toBe(2000)
  })

  it('damage ノードが1つも無ければ 0', () => {
    const skill = makeActive({ id: 'a', effect: [node('heal', { scale: { stat: 'int', rate: 1 } })] })
    expect(estimate({ skill })).toBe(0)
  })

  it('scale を持たない damage ノードは黙って読み飛ばされる', () => {
    const skill = makeActive({ id: 'a', effect: [node('damage', { element: 'physical' }), damageNode({ rate: 1 })] })
    expect(estimate({ skill })).toBe(REF_STAT)
  })

  it('damage ノードが複数あれば単純に足し合わせる', () => {
    const skill = makeActive({ id: 'a', effect: [damageNode({ rate: 1 }), damageNode({ rate: 0.5 })] })
    expect(estimate({ skill })).toBeCloseTo(REF_STAT * 1.5, 6)
  })
})

describe('damagePreview: repeat ノードの積み上げ', () => {
  it('repeat の body は times 倍される', () => {
    const skill = makeActive({
      id: 'a',
      effect: [node('repeat', { times: 3, body: [damageNode({ rate: 1 })] })],
    })
    expect(estimate({ skill })).toBe(REF_STAT * 3)
  })

  it('times が未指定なら1回として扱う', () => {
    const skill = makeActive({ id: 'a', effect: [node('repeat', { body: [damageNode({ rate: 1 })] })] })
    expect(estimate({ skill })).toBe(REF_STAT)
  })

  it('onFirstIteration / onLastIteration は times に関わらず1回ぶんだけ足される', () => {
    const skill = makeActive({
      id: 'a',
      effect: [node('repeat', {
        times: 4,
        body: [damageNode({ rate: 1 })],
        onFirstIteration: [damageNode({ rate: 2 })],
        onLastIteration: [damageNode({ rate: 3 })],
      })],
    })
    expect(estimate({ skill })).toBe(REF_STAT * (4 + 2 + 3))
  })

  it('repeat の入れ子も再帰的に数える', () => {
    const skill = makeActive({
      id: 'a',
      effect: [node('repeat', {
        times: 2,
        body: [node('repeat', { times: 3, body: [damageNode({ rate: 1 })] })],
      })],
    })
    expect(estimate({ skill })).toBe(REF_STAT * 6)
  })

  it('body が配列でなければ 0 として扱う', () => {
    const skill = makeActive({ id: 'a', effect: [node('repeat', { times: 5 })] })
    expect(estimate({ skill })).toBe(0)
  })
})

describe('damagePreview: 対象側の軽減', () => {
  const skill = makeActive({ id: 'a', effect: [damageNode({ rate: 1 })] })

  it('特性の cutRate は加算で効く', () => {
    const tough = makeTrait({ id: 'tough', effect: [node('cutRate', { amount: 0.1 })] })
    const content = makeContent({ traits: [tough] })
    const target = makeCombatant({ traits: [{ id: 'tough' }] })
    expect(estimate({ skill, target, content })).toBeCloseTo(REF_STAT * 0.9, 6)
  })

  it('カット率は BATTLE.cut.max でクランプされる', () => {
    const wall = makeTrait({ id: 'wall', effect: [node('cutRate', { amount: 0.9 })] })
    const content = makeContent({ traits: [wall] })
    const target = makeCombatant({ traits: [{ id: 'wall' }] })
    expect(estimate({ skill, target, content })).toBeCloseTo(REF_STAT * (1 - BATTLE.cut.max), 6)
  })

  it('シールドがあると属性ごとのシールドカット率が乗る', () => {
    const target = makeCombatant({ shield: 10 })
    expect(estimate({ skill, target })).toBeCloseTo(REF_STAT * (1 - BATTLE.shield.cutRate), 6)
  })

  it('special 属性のシールドカット率は専用値を使う', () => {
    const special = makeActive({ id: 'a', effect: [damageNode({ element: 'special', rate: 1 })] })
    const target = makeCombatant({ shield: 10 })
    // special の防御参照は (def + ref) / 4 = 500 で anchor 未満のため、ステータス由来のカットは 0
    expect(estimate({ skill: special, target })).toBeCloseTo(REF_STAT * (1 - BATTLE.shield.cutRateVsSpecial), 6)
  })

  it('「守る」由来の一時カット率（temporary の cutRate）が乗る', () => {
    const target = makeCombatant({
      temporary: [{ stat: 'cutRate', flat: BATTLE.guard.cutRate, scope: 'thisTurn', sourceId: 'guard' }],
    })
    expect(estimate({ skill, target })).toBeCloseTo(REF_STAT * (1 - BATTLE.guard.cutRate), 6)
  })

  it('弱点特性があれば相性段階ぶんの倍率が乗る', () => {
    const weak = makeTrait({
      id: 'weak_phys',
      effect: [node('elementAffinity', { element: 'physical', affinity: 'weak' })],
    })
    const content = makeContent({ traits: [weak] })
    const target = makeCombatant({ traits: [{ id: 'weak_phys' }] })
    expect(estimate({ skill, target, content })).toBe(REF_STAT * 2 ** BATTLE.affinity.weakStage)
  })

  it('DEF が高い相手にはステータス由来のカット率が効く', () => {
    const target = makeCombatant({ baseStats: makeStats({ def: BATTLE.cut.anchor + BATTLE.cut.divisor * 0.5 }) })
    expect(estimate({ skill, target })).toBeCloseTo(REF_STAT * 0.5, 6)
  })
})

describe('damagePreview: 攻撃側の効果倍率', () => {
  it('effectBoost 特性は倍率として乗る', () => {
    const boost = makeTrait({ id: 'boost', effect: [node('effectBoost', { element: 'physical', rate: 0.5 })] })
    const content = makeContent({ traits: [boost] })
    const source = makePlayer({ traits: [{ id: 'boost' }] })
    const skill = makeActive({ id: 'a', effect: [damageNode({ rate: 1 })] })
    expect(estimate({ skill, source, content })).toBeCloseTo(REF_STAT * 1.5, 6)
  })

  it('属性が一致しない effectBoost は乗らない', () => {
    const boost = makeTrait({ id: 'boost', effect: [node('effectBoost', { element: 'magical', rate: 0.5 })] })
    const content = makeContent({ traits: [boost] })
    const source = makePlayer({ traits: [{ id: 'boost' }] })
    const skill = makeActive({ id: 'a', effect: [damageNode({ rate: 1 })] })
    expect(estimate({ skill, source, content })).toBe(REF_STAT)
  })
})

describe('damagePreview: 既知の欠陥（scale.statOptions 未対応）', () => {
  // 【既知の欠陥・意図的に現状を固定】
  // damagePreview.ts:65 は node.scale を { stat, rate } としか読まないため、
  // effectOps/damage.ts:36-41 が対応している scale.statOptions（実データ: skill_tsumo.json）では
  // sourceStats[undefined] → NaN になる。プレビュー専用の経路であり実ダメージには影響しない。
  // 修正は docs/refactoring/07-deferred.md §A-1 に分離されているため、ここでは直さず現行値を固定する。
  const tsumoLike = makeActive({
    id: 'skill_tsumo_like',
    effect: [node('damage', { element: 'none', scale: { statOptions: ['str', 'int'], rate: 2 } })],
  })

  it('statOptions を使うノードの見積りは NaN になる（07-deferred.md §A-1）', () => {
    expect(estimate({ skill: tsumoLike })).toBeNaN()
  })

  it('NaN の見積りは段階判定を素通りして「致命傷」になる（07-deferred.md §A-1）', () => {
    const dmg = estimate({ skill: tsumoLike })
    expect(damageMagnitude(dmg, makeStats().hp)).toBe('lethal')
  })

  it('statOptions ノードが1つでも混ざると合計全体が NaN に汚染される（07-deferred.md §A-1）', () => {
    const mixed = makeActive({
      id: 'mixed',
      effect: [damageNode({ rate: 1 }), ...tsumoLike.effect],
    })
    expect(estimate({ skill: mixed })).toBeNaN()
  })
})

describe('damagePreview: damageMagnitude の段階分け', () => {
  const MAX_HP = 1000
  // MAGNITUDE_THRESHOLDS は damagePreview.ts のモジュール private かつ未 JSON 化
  // （docs/refactoring/02-domain.md §4「damagePreview.ts:22-27」）。現行のリテラルをここに写して固定する
  const THRESHOLDS = { none: 0.001, small: 0.12, medium: 0.3, large: 0.6 }

  it('しきい値未満は下の段階に入る（境界は「未満」判定）', () => {
    expect(damageMagnitude(0, MAX_HP)).toBe('none')
    expect(damageMagnitude(THRESHOLDS.none * MAX_HP - 0.001, MAX_HP)).toBe('none')
    expect(damageMagnitude(THRESHOLDS.none * MAX_HP, MAX_HP)).toBe('small')
    expect(damageMagnitude(THRESHOLDS.small * MAX_HP - 0.001, MAX_HP)).toBe('small')
    expect(damageMagnitude(THRESHOLDS.small * MAX_HP, MAX_HP)).toBe('medium')
    expect(damageMagnitude(THRESHOLDS.medium * MAX_HP - 0.001, MAX_HP)).toBe('medium')
    expect(damageMagnitude(THRESHOLDS.medium * MAX_HP, MAX_HP)).toBe('large')
    expect(damageMagnitude(THRESHOLDS.large * MAX_HP - 0.001, MAX_HP)).toBe('large')
    expect(damageMagnitude(THRESHOLDS.large * MAX_HP, MAX_HP)).toBe('lethal')
  })

  it('最大HPを超えるダメージも「致命傷」', () => {
    expect(damageMagnitude(MAX_HP * 10, MAX_HP)).toBe('lethal')
  })

  it('最大HPが 0 以下なら常に「無傷」（ゼロ除算を避けるための早期リターン）', () => {
    expect(damageMagnitude(9999, 0)).toBe('none')
    expect(damageMagnitude(9999, -1)).toBe('none')
  })

  it('負のダメージは「無傷」', () => {
    expect(damageMagnitude(-100, MAX_HP)).toBe('none')
  })

  it('MAGNITUDE_LABEL は全段階ぶんのラベルを持つ', () => {
    expect(Object.keys(MAGNITUDE_LABEL).sort()).toEqual(['large', 'lethal', 'medium', 'none', 'small'])
    for (const label of Object.values(MAGNITUDE_LABEL)) expect(label.length).toBeGreaterThan(0)
  })
})
