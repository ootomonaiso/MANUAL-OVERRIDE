import { describe, it, expect } from 'vitest'
import {
  buildTurnQueue, resolveAdjacent3, buildEnemyActivesFromPattern,
  pickEnemySkill, previewEnemyNextSkill,
} from '../../../../src/domain/battle/turnQueue'
import type { Combatant } from '../../../../src/domain/battle/types'
import { makeCombatant, makePlayer, makeStats, makeEnemyDef } from './_helpers'

const agiOf = (c: Combatant): number => c.baseStats.agi

function enemy(id: string, agi: number, formationIndex: number, alive = true): Combatant {
  return makeCombatant({ id, formationIndex, alive, baseStats: makeStats({ agi }) })
}

describe('turnQueue: 行動順キューの構築', () => {
  it('AGI の高い順に並ぶ', () => {
    const q = buildTurnQueue([enemy('slow', 100, 0), enemy('fast', 900, 1)], agiOf)
    expect(q.map(e => e.combatantId)).toEqual(['fast', 'slow'])
  })

  it('AGI が同値ならプレイヤーが先に行動する', () => {
    const p = makePlayer({ baseStats: makeStats({ agi: 500 }) })
    const q = buildTurnQueue([enemy('e0', 500, 0), p], agiOf)
    expect(q[0].combatantId).toBe('player')
  })

  it('敵同士が同値なら隊列の左（formationIndex 昇順）から行動する', () => {
    const q = buildTurnQueue([enemy('right', 500, 2), enemy('left', 500, 0), enemy('mid', 500, 1)], agiOf)
    expect(q.map(e => e.combatantId)).toEqual(['left', 'mid', 'right'])
  })

  it('戦闘不能の参加者はキューに含まれない', () => {
    const q = buildTurnQueue([enemy('dead', 900, 0, false), enemy('alive', 100, 1)], agiOf)
    expect(q.map(e => e.combatantId)).toEqual(['alive'])
  })

  it('キューには算出済みの AGI が記録される', () => {
    const q = buildTurnQueue([enemy('e0', 777, 0)], agiOf)
    expect(q[0].agi).toBe(777)
    expect(q[0].priority).toBe(777)
  })

  it('全員戦闘不能なら空のキューになる', () => {
    expect(buildTurnQueue([enemy('a', 100, 0, false)], agiOf)).toEqual([])
  })
})

describe('turnQueue: 隣接3体の解決', () => {
  const line = [enemy('e0', 1, 0), enemy('e1', 1, 1), enemy('e2', 1, 2), enemy('e3', 1, 3)]

  it('中央を指定すると左右を含む3体になる', () => {
    expect(resolveAdjacent3(line, 1).map(c => c.id)).toEqual(['e0', 'e1', 'e2'])
  })

  it('左端では2体になる（空きを埋めない）', () => {
    expect(resolveAdjacent3(line, 0).map(c => c.id)).toEqual(['e0', 'e1'])
  })

  it('右端でも2体になる', () => {
    expect(resolveAdjacent3(line, 3).map(c => c.id)).toEqual(['e2', 'e3'])
  })

  it('範囲内でも戦闘不能の敵は対象から外れる', () => {
    const withDead = [enemy('e0', 1, 0), enemy('e1', 1, 1, false), enemy('e2', 1, 2)]
    expect(resolveAdjacent3(withDead, 1).map(c => c.id)).toEqual(['e0', 'e2'])
  })
})

describe('turnQueue: 敵のアクティブ構築と行動パターン', () => {
  it('CT管理用の actives はスキルIDごとに一意化される', () => {
    const def = makeEnemyDef({
      id: 'e',
      activeSkills: [{ id: 'bite', level: 2 }, { id: 'roar', level: 1 }],
      actionPattern: ['bite', 'bite', 'roar'],
    })
    const built = buildEnemyActivesFromPattern(def)
    expect(built.actives.map(a => a.id)).toEqual(['bite', 'roar'])
  })

  it('actionPattern は繰り返しを保ったまま複製される（一意化で潰さない）', () => {
    const def = makeEnemyDef({
      id: 'e',
      activeSkills: [{ id: 'bite', level: 1 }, { id: 'roar', level: 1 }],
      actionPattern: ['bite', 'bite', 'roar'],
    })
    const built = buildEnemyActivesFromPattern(def)
    expect(built.actionPattern).toEqual(['bite', 'bite', 'roar'])
    expect(built.actionPattern).not.toBe(def.actionPattern)   // 元定義を共有しない
  })

  it('activeSkills にレベル指定があれば actives に反映される', () => {
    const def = makeEnemyDef({
      id: 'e', activeSkills: [{ id: 'bite', level: 3 }], actionPattern: ['bite'],
    })
    expect(buildEnemyActivesFromPattern(def).actives[0].level).toBe(3)
  })

  it('レベル指定がなければ Lv1 として扱う', () => {
    const def = makeEnemyDef({ id: 'e', activeSkills: [], actionPattern: ['bite'] })
    expect(buildEnemyActivesFromPattern(def).actives[0].level).toBe(1)
  })
})

describe('turnQueue: 敵のスキル選択', () => {
  function patternEnemy(pattern: string[]): Combatant {
    const built = buildEnemyActivesFromPattern(makeEnemyDef({
      id: 'e',
      activeSkills: [...new Set(pattern)].map(id => ({ id, level: 1 })),
      actionPattern: pattern,
    }))
    return makeCombatant({ id: 'e', actives: built.actives, actionPattern: built.actionPattern })
  }

  it('パターン中の連続した同一スキルがそのまま連続で選ばれる', () => {
    const e = patternEnemy(['bite', 'bite', 'roar'])
    expect([pickEnemySkill(e), pickEnemySkill(e), pickEnemySkill(e)]).toEqual(['bite', 'bite', 'roar'])
  })

  it('パターンは末尾まで進んだら先頭へ戻る', () => {
    const e = patternEnemy(['a', 'b'])
    expect([pickEnemySkill(e), pickEnemySkill(e), pickEnemySkill(e)]).toEqual(['a', 'b', 'a'])
  })

  it('クールタイム中のスキルは飛ばして次の使用可能なものを選ぶ', () => {
    const e = patternEnemy(['a', 'b'])
    const a = e.actives.find(x => x.id === 'a')
    if (a) a.cooldown = 2
    expect(pickEnemySkill(e)).toBe('b')
  })

  it('全スキルがクールタイム中なら null（何もしない）', () => {
    const e = patternEnemy(['a', 'b'])
    for (const act of e.actives) act.cooldown = 1
    expect(pickEnemySkill(e)).toBeNull()
  })

  it('行動パターンが空なら null', () => {
    expect(pickEnemySkill(makeCombatant())).toBeNull()
  })

  it('プレビューはパターン位置を消費しない', () => {
    const e = patternEnemy(['a', 'b'])
    expect(previewEnemyNextSkill(e)).toBe('a')
    expect(previewEnemyNextSkill(e)).toBe('a')
    expect(e.patternIndex).toBe(0)
  })

  it('プレビューは実際に選ばれるスキルと一致する', () => {
    const e = patternEnemy(['a', 'a', 'b'])
    for (let i = 0; i < 5; i++) {
      const preview = previewEnemyNextSkill(e)
      expect(pickEnemySkill(e)).toBe(preview)
    }
  })

  it('全スキルCT中のときはプレビューも null', () => {
    const e = patternEnemy(['a'])
    e.actives[0].cooldown = 3
    expect(previewEnemyNextSkill(e)).toBeNull()
  })
})
