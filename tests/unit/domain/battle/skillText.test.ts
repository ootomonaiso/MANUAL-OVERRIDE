import { describe, it, expect } from 'vitest'
import {
  buildSkillText, describeTemporaryModifier, STAT_LABEL, ELEMENT_LABEL, CATEGORY_LABEL,
  type SkillTextToken,
} from '../../../../src/domain/battle/skillText'
import { STAT_KEYS, CATEGORY_IDS } from '../../../../src/domain/battle/types'
import { makeActive, makePassive, makeTrait, node } from './_helpers'

function text(tokens: readonly SkillTextToken[]): string {
  return tokens.map(t => t.text).join('')
}

describe('skillText: ラベル表', () => {
  it('全ステータスに表示名がある', () => {
    for (const key of STAT_KEYS) expect(STAT_LABEL[key], key).toBeTruthy()
  })

  it('全カテゴリに表示名がある', () => {
    for (const id of CATEGORY_IDS) expect(CATEGORY_LABEL[id], id).toBeTruthy()
  })

  it('全属性に表示名がある', () => {
    expect(Object.keys(ELEMENT_LABEL).sort()).toEqual(['magical', 'physical', 'special'])
  })
})

describe('skillText: バフ・デバフ表示', () => {
  it('正の増減はバフ、負の増減はデバフとして扱う', () => {
    expect(describeTemporaryModifier({ stat: 'str', flat: 100, scope: 'thisBattle', sourceId: 'x' }).isBuff).toBe(true)
    expect(describeTemporaryModifier({ stat: 'def', rate: -0.15, scope: 'thisBattle', sourceId: 'y' }).isBuff).toBe(false)
  })

  it('守る・避けるは専用ラベルになる', () => {
    expect(describeTemporaryModifier({ stat: 'cutRate', flat: 0.5, scope: 'thisTurn', sourceId: 'guard' }).label).toBe('防御態勢')
    expect(describeTemporaryModifier({ stat: 'evadeRate', flat: 0.5, scope: 'thisTurn', sourceId: 'dodge' }).label).toBe('回避態勢')
  })

  it('スコープごとに継続表示が変わる', () => {
    expect(describeTemporaryModifier({ stat: 'str', flat: 1, scope: 'thisTurn', sourceId: 'x' }).scopeLabel).toBe('このターンのみ')
    expect(describeTemporaryModifier({ stat: 'str', flat: 1, scope: 'thisBattle', sourceId: 'x' }).scopeLabel).toBe('この戦闘中')
    expect(describeTemporaryModifier({ stat: 'str', flat: 1, scope: 'permanent', sourceId: 'x' }).scopeLabel).toBe('永続')
  })
})

describe('skillText: 効果文の生成', () => {
  it('ダメージは属性・参照ステータス・割合を並べる', () => {
    const skill = makeActive({
      id: 's', effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 0.8 } })],
    })
    expect(text(buildSkillText(skill, 1))).toBe('物理属性ダメージ: STRの80%分。')
  })

  it('表示される数値にはスキルレベルの倍率が反映される', () => {
    const skill = makeActive({
      id: 's', effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 0.8 } })],
    })
    expect(text(buildSkillText(skill, 2))).toContain('240%')   // 0.8 × (2^2-1)
    expect(text(buildSkillText(skill, 4))).toContain('1200%')  // 0.8 × 15
  })

  it('特性はレベル倍率を掛けない', () => {
    const trait = makeTrait({ id: 't', effect: [node('cutRate', { amount: 0.15 })] })
    expect(text(buildSkillText(trait, 4))).toBe('被ダメージを15%軽減する。')
  })

  it('属性トークンには色分け用の属性が載る', () => {
    const skill = makeActive({
      id: 's', effect: [node('damage', { element: 'magical', scale: { stat: 'int', rate: 1 } })],
    })
    const elem = buildSkillText(skill, 1).find(t => t.type === 'element')
    expect(elem).toMatchObject({ type: 'element', text: '魔法', element: 'magical' })
  })

  it('参照ステータスと数値はそれぞれ別種のトークンになる', () => {
    const skill = makeActive({
      id: 's', effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })],
    })
    const tokens = buildSkillText(skill, 1)
    expect(tokens.some(t => t.type === 'stat' && t.text === 'STR')).toBe(true)
    expect(tokens.some(t => t.type === 'number' && t.text === '100%')).toBe(true)
  })

  it('回復・シールドも同じ形で書き出される', () => {
    const heal = makeActive({ id: 'h', effect: [node('heal', { element: 'special', scale: { stat: 'int', rate: 0.8 } })] })
    const shield = makeActive({ id: 'g', effect: [node('shield', { element: 'special', scale: { stat: 'def', rate: 0.5 } })] })
    expect(text(buildSkillText(heal, 1))).toBe('回復: INTの80%分。')
    expect(text(buildSkillText(shield, 1))).toBe('シールド付与: DEFの50%分。')
  })

  it('複数の効果は句点で区切られる', () => {
    const skill = makeActive({
      id: 's',
      effect: [
        node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } }),
        node('heal', { element: 'special', scale: { stat: 'int', rate: 0.2 } }),
      ],
    })
    expect(text(buildSkillText(skill, 1))).toBe('物理属性ダメージ: STRの100%分。回復: INTの20%分。')
  })
})

describe('skillText: repeat の表記', () => {
  const triple = makeActive({
    id: 'triple',
    effect: [node('repeat', {
      times: 3,
      body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 0.8 } })],
      onLastIteration: [node('modifier', { stat: 'critRate', amount: 0.5, scope: 'thisHit' })],
    })],
  })

  it('繰り返し回数と内側の効果、最後の1回の特例が書き出される', () => {
    expect(text(buildSkillText(triple, 1)))
      .toBe('3回繰り返す（物理属性ダメージ: STRの80%分。）最後の1回のみ: 自分のクリティカル率を50%変化させる。')
  })

  it('末尾が句点で終わっているときに句点を重ねない', () => {
    const out = text(buildSkillText(triple, 1))
    expect(out).not.toContain('。。')
  })

  it('最後の1回の特例がない場合は末尾に句点が1つだけ付く', () => {
    const skill = makeActive({
      id: 'r',
      effect: [node('repeat', {
        times: 2,
        body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })],
      })],
    })
    const out = text(buildSkillText(skill, 1))
    expect(out.endsWith('）。')).toBe(true)
    expect(out).not.toContain('。。')
  })

  it('repeat の後ろに別の効果が続いても句点が重ならない', () => {
    const skill = makeActive({
      id: 'r2',
      effect: [
        node('repeat', {
          times: 2,
          body: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })],
          onLastIteration: [node('modifier', { stat: 'critRate', amount: 0.5, scope: 'thisHit' })],
        }),
        node('heal', { element: 'special', scale: { stat: 'int', rate: 0.1 } }),
      ],
    })
    expect(text(buildSkillText(skill, 1))).not.toContain('。。')
  })
})

describe('skillText: 補正・宣言的opの表記', () => {
  it('modifier は既定で自分への効果として書かれる', () => {
    const skill = makeActive({ id: 's', effect: [node('modifier', { stat: 'str', amount: 100, scope: 'thisTurn' })] })
    expect(text(buildSkillText(skill, 1))).toBe('自分のSTRを+100変化させる。')
  })

  it('applyTo: "target" は対象への効果として書かれる', () => {
    const skill = makeActive({ id: 's', effect: [node('modifier', { stat: 'def', rate: -0.2, scope: 'thisBattle', applyTo: 'target' })] })
    expect(text(buildSkillText(skill, 1))).toBe('対象のDEFを-20%変化させる。')
  })

  it('cutRate 指定は「カット率」と表示され、amountでも%表示になる', () => {
    const skill = makeActive({ id: 's', effect: [node('modifier', { stat: 'cutRate', amount: 0.2, scope: 'thisTurn' })] })
    expect(text(buildSkillText(skill, 1))).toBe('自分のカット率を20%変化させる。')
  })

  it('critRate等の割合ステータスは amount 指定でも%表示になる（生の小数のまま出さない）', () => {
    const skill = makeActive({ id: 's', effect: [node('modifier', { stat: 'critRate', amount: 0.5, scope: 'thisHit' })] })
    expect(text(buildSkillText(skill, 1))).toBe('自分のクリティカル率を50%変化させる。')
  })

  it('statBoost は上昇として書かれる。割合ステータスは amount 指定でも%表示になる', () => {
    const flat = makePassive({ id: 'p1', effect: [node('statBoost', { stat: 'def', amount: 800 })] })
    const rate = makePassive({ id: 'p2', effect: [node('statBoost', { stat: 'agi', rate: 0.15 })] })
    const critFlat = makePassive({ id: 'p3', effect: [node('statBoost', { stat: 'critRate', amount: 0.05 })] })
    expect(text(buildSkillText(flat, 1))).toBe('DEFを+800上昇させる。')
    expect(text(buildSkillText(rate, 1))).toBe('AGIを15%上昇させる。')
    expect(text(buildSkillText(critFlat, 1))).toBe('クリティカル率を5%上昇させる。')
  })

  it('弱点・耐性の特性が読める文になる', () => {
    const weak = makeTrait({ id: 'w', effect: [node('elementAffinity', { element: 'physical', affinity: 'weak' })] })
    const resist = makeTrait({ id: 'r', effect: [node('elementAffinity', { element: 'magical', affinity: 'resist' })] })
    expect(text(buildSkillText(weak, 1))).toBe('物理属性を弱点とする。')
    expect(text(buildSkillText(resist, 1))).toBe('魔法属性を耐性とする。')
  })

  it('replaceGuard と healBetweenBattles も文になる', () => {
    const guard = makeTrait({ id: 'g', effect: [node('replaceGuard')] })
    const medicRate = makeTrait({ id: 'm1', effect: [node('healBetweenBattles', { rate: 0.15 })] })
    const medicFlat = makeTrait({ id: 'm2', effect: [node('healBetweenBattles', { amount: 500 })] })
    expect(text(buildSkillText(guard, 1))).toBe('「守る」が「避ける」に変化する。')
    expect(text(buildSkillText(medicRate, 1))).toBe('戦闘終了時にHPを15%回復する。')
    expect(text(buildSkillText(medicFlat, 1))).toBe('戦闘終了時にHPを500回復する。')
  })

  it('効果倍率の特性は属性つきの文になる', () => {
    const savage = makeTrait({ id: 's', effect: [node('effectBoost', { element: 'physical', rate: 0.5 })] })
    expect(text(buildSkillText(savage, 1))).toBe('物理の効果量を50%上昇させる。')
  })

  it('全属性の効果倍率は「全属性」と表示される', () => {
    const any = makeTrait({ id: 'a', effect: [node('effectBoost', { element: 'any', rate: 0.1 })] })
    expect(text(buildSkillText(any, 1))).toBe('全属性の効果量を10%上昇させる。')
  })

  it('被回復倍率も文になる', () => {
    const medic = makeTrait({ id: 'm', effect: [node('healTaken', { rate: 0.3 })] })
    expect(text(buildSkillText(medic, 1))).toBe('受ける回復量を30%上昇させる。')
  })

  it('未知の op はop名を括弧で示すだけで壊れない', () => {
    const skill = makeActive({ id: 's', effect: [node('mystery')] })
    expect(text(buildSkillText(skill, 1))).toBe('(mystery)。')
  })

  it('効果が空でも例外を投げない（実データではスキーマの minItems: 1 で封じている）', () => {
    expect(() => buildSkillText(makeActive({ id: 's', effect: [] }), 1)).not.toThrow()
  })
})
