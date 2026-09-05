import { describe, it, expect } from 'vitest'
import {
  initPlayer, spawnEnemyFromDef, pickEnemyDefs, resolveEffectiveStats,
  resolvePlayerFocus, resolveEnemyFocus, useActiveSkill, useBuiltinAction,
  hasReplaceGuard, enemyTakeTurn, endOfRound, checkBattleOutcome,
  finishBattleOnVictory, buildBattleScoreVars, zeroCategoryPoints,
} from '../../../../src/domain/battle/battleEngine'
import { BATTLE } from '../../../../src/data/tunables'
import type { EncounterGroupsConfig } from '../../../../src/framework/config-types'
import { CATEGORY_IDS } from '../../../../src/domain/battle/types'
import type { Combatant } from '../../../../src/domain/battle/types'
import {
  makeStats, makeCombatant, makePlayer, makeActive, makePassive, makeTrait,
  makeEnemyDef, makeEnemySet, makeContent, makeState, seqRng, constRng, captureEffects, node,
} from './_helpers'

/** initPlayer は rng を「初期スキル → str/def/int/ref/agi → hp」の順に7回引く */
function playerRng(skillPick: number, statRolls: number[], hpRoll: number): () => number {
  return seqRng([skillPick, ...statRolls, hpRoll])
}

describe('battleEngine: プレイヤーの初期化', () => {
  it('初期スキルは2種類からランダムに1つ選ばれ、スロット0に入る', () => {
    const a = initPlayer(playerRng(0, [0, 0, 0, 0, 0], 0))
    const b = initPlayer(playerRng(0.99, [0, 0, 0, 0, 0], 0))
    expect(a.actives).toHaveLength(1)
    expect(a.actives[0]).toMatchObject({ level: 1, stacks: 0, cooldown: 0, slotIndex: 0 })
    expect([a.actives[0].id, b.actives[0].id].sort()).toEqual(['skill_fireball', 'skill_strike'])
  })

  it('物理の初期スキルなら STR が、魔法の初期スキルなら INT が優遇される', () => {
    const phys = initPlayer(playerRng(0, [0, 0, 0, 0, 0], 0))
    const magic = initPlayer(playerRng(0.99, [0, 0, 0, 0, 0], 0))
    expect(phys.actives[0].id).toBe('skill_strike')
    expect(phys.baseStats.str).toBe(BATTLE.initialStats.favoredMin)
    expect(phys.baseStats.int).toBe(BATTLE.initialStats.baseMin)
    expect(magic.actives[0].id).toBe('skill_fireball')
    expect(magic.baseStats.int).toBe(BATTLE.initialStats.favoredMin)
    expect(magic.baseStats.str).toBe(BATTLE.initialStats.baseMin)
  })

  it('ステータスは設定の範囲内で振られる', () => {
    const p = initPlayer(playerRng(0, [0.999, 0.999, 0.999, 0.999, 0.999], 0.999))
    const s = BATTLE.initialStats
    for (const key of ['str', 'def', 'int', 'ref', 'agi'] as const) {
      expect(p.baseStats[key]).toBeGreaterThanOrEqual(s.baseMin)
      expect(p.baseStats[key]).toBeLessThanOrEqual(s.favoredMax)
    }
    expect(p.baseStats.hp).toBeGreaterThanOrEqual(s.hpMin)
    expect(p.baseStats.hp).toBeLessThanOrEqual(s.hpMax)
  })

  it('固定ステータスは設定値がそのまま入り、現在HPは満タンで始まる', () => {
    const p = initPlayer(playerRng(0, [0, 0, 0, 0, 0], 0))
    expect(p.baseStats.hitRate).toBe(BATTLE.initialStats.hitRate)
    expect(p.baseStats.critRate).toBe(BATTLE.initialStats.critRate)
    expect(p.baseStats.critDamageMultiplier).toBe(BATTLE.initialStats.critDamageMultiplier)
    expect(p.hp).toBe(p.baseStats.hp)
    expect(p.isPlayer).toBe(true)
    expect(p.alive).toBe(true)
  })

  it('100回振っても常に妥当なプレイヤーが生成される', () => {
    for (let i = 0; i < 100; i++) {
      const p = initPlayer(Math.random)
      expect(p.actives).toHaveLength(1)
      expect(p.hp).toBeGreaterThan(0)
      expect(['skill_strike', 'skill_fireball']).toContain(p.actives[0].id)
    }
  })
})

describe('battleEngine: 敵の生成', () => {
  const def = makeEnemyDef({
    id: 'slime', label: 'スライム',
    stats: makeStats({ hp: 2000, str: 350 }),
    traits: ['t_weak'],
    activeSkills: [{ id: 'bite', level: 2 }],
    passiveSkills: [{ id: 'tough', level: 3 }],
    actionPattern: ['bite', 'bite'],
    isBoss: true,
  })

  it('定義から所持スキル・特性・行動パターンが移される', () => {
    const e = spawnEnemyFromDef(def, 1)
    expect(e.id).toBe('slime#1')
    expect(e.label).toBe('スライム')
    expect(e.formationIndex).toBe(1)
    expect(e.isBoss).toBe(true)
    expect(e.traits).toEqual([{ id: 't_weak' }])
    expect(e.passives).toEqual([{ id: 'tough', level: 3, stacks: 0 }])
    expect(e.actives).toEqual([{ id: 'bite', level: 2, stacks: 0, cooldown: 0, slotIndex: null }])
    expect(e.actionPattern).toEqual(['bite', 'bite'])
    expect(e.hp).toBe(2000)
    expect(e.isPlayer).toBe(false)
  })

  it('ステータスは定義から複製される（同じ敵を2体出しても影響し合わない）', () => {
    const a = spawnEnemyFromDef(def, 0)
    const b = spawnEnemyFromDef(def, 1)
    a.baseStats.str = 9999
    expect(b.baseStats.str).toBe(350)
    expect(def.stats.str).toBe(350)
  })
})

describe('battleEngine: 出現する敵の選定', () => {
  const mob = makeEnemyDef({ id: 'mob' })
  const boss = makeEnemyDef({ id: 'boss', isBoss: true })
  const mobSet = makeEnemySet({ id: 'set_mob', members: [{ enemyId: 'mob' }] })
  const bossSet = makeEnemySet({ id: 'set_boss', members: [{ enemyId: 'boss' }] })
  const content = makeContent({ enemies: [mob, boss], enemySets: [mobSet, bossSet] })
  const eg: EncounterGroupsConfig = {
    groupOrder: ['A'],
    lapsForTrueClear: 1,
    bossIntervalBattles: 3,
    bossDraftRounds: 1,
    groups: { A: ['set_mob', 'set_boss'] },
    spawnWeightTiers: [{ minBattleIndex: 0, weights: { A: 1 } }],
  }
  const bossBattleIndex = eg.bossIntervalBattles - 1

  it('ボス戦の番号ではボスが1体だけ出る', () => {
    const picked = pickEnemyDefs(content, bossBattleIndex, constRng(0.5), eg)
    expect(picked).toHaveLength(1)
    expect(picked[0].def.isBoss).toBe(true)
  })

  it('通常戦ではボスは出ない', () => {
    for (let i = 0; i < bossBattleIndex; i++) {
      const picked = pickEnemyDefs(content, i, Math.random, eg)
      expect(picked.length).toBeGreaterThan(0)
      expect(picked.every(p => !p.def.isBoss)).toBe(true)
    }
  })

  it('該当グループが空なら他グループから選ぶ（詰まって0体にならない）', () => {
    const egSparse: EncounterGroupsConfig = {
      ...eg,
      groups: { A: [], B: ['set_mob'] },
    }
    const picked = pickEnemyDefs(content, 0, constRng(0.5), egSparse)
    expect(picked).toHaveLength(1)
    expect(picked[0].def.isBoss).toBe(false)
  })

  it('敵が1体も定義されていなければ空配列', () => {
    expect(pickEnemyDefs(makeContent(), 0, constRng(0.5), eg)).toEqual([])
  })
})

describe('battleEngine: 実効ステータスの解決', () => {
  const passive = makePassive({ id: 'brawn', effect: [node('statBoost', { stat: 'str', amount: 100 })] })
  const trait = makeTrait({ id: 'stone', effect: [node('statBoost', { stat: 'def', rate: 0.5 })] })
  const content = makeContent({ skills: [passive], traits: [trait] })

  it('パッシブ・特性・一時効果がすべて合算される', () => {
    const c = makeCombatant({
      baseStats: makeStats({ str: 1000, def: 1000 }),
      passives: [{ id: 'brawn', level: 2, stacks: 0 }],   // 100 × 3
      traits: [{ id: 'stone' }],
      temporary: [{ stat: 'str', rate: 0.1, scope: 'thisTurn', sourceId: 'x' }],
    })
    const eff = resolveEffectiveStats(c, content)
    expect(eff.str).toBeCloseTo((1000 + 300) * 1.1, 6)
    expect(eff.def).toBeCloseTo(1500, 6)
  })

  it('未知のスキル・特性IDは無視される', () => {
    const c = makeCombatant({ passives: [{ id: '?', level: 1, stacks: 0 }], traits: [{ id: '?' }] })
    expect(resolveEffectiveStats(c, content).str).toBe(1000)
  })
})

describe('battleEngine: フォーカスの解決', () => {
  const player = makePlayer()
  const enemies: Combatant[] = [
    makeCombatant({ id: 'e0', formationIndex: 0 }),
    makeCombatant({ id: 'e1', formationIndex: 1 }),
    makeCombatant({ id: 'e2', formationIndex: 2 }),
  ]

  it('自分対象のスキルはプレイヤーを返す', () => {
    expect(resolvePlayerFocus({ side: 'self', range: 'single' }, player, enemies, 1, constRng(0))).toEqual([player])
  })

  it('味方対象は味方が存在しないためプレイヤーへフォールバックする', () => {
    expect(resolvePlayerFocus({ side: 'ally', range: 'all' }, player, enemies, null, constRng(0))).toEqual([player])
  })

  it('全体攻撃は生存している敵すべてを対象にする', () => {
    const withDead = [enemies[0], makeCombatant({ id: 'dead', alive: false }), enemies[2]]
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'all' }, player, withDead, null, constRng(0))
    expect(targets.map(t => t.id)).toEqual(['e0', 'e2'])
  })

  it('隣接3体は中心の左右を含む', () => {
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'adjacent3' }, player, enemies, 1, constRng(0))
    expect(targets.map(t => t.id)).toEqual(['e0', 'e1', 'e2'])
  })

  it('単体攻撃は指定した敵1体だけを対象にする', () => {
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, enemies, 2, constRng(0))
    expect(targets.map(t => t.id)).toEqual(['e2'])
  })

  it('指定した敵が既に倒れていれば生存中の先頭へフォールバックする', () => {
    const withDead = [makeCombatant({ id: 'dead', alive: false }), enemies[1]]
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, withDead, 0, constRng(0))
    expect(targets.map(t => t.id)).toEqual(['e1'])
  })

  it('対象未指定なら生存中の先頭を狙う', () => {
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, enemies, null, constRng(0))
    expect(targets.map(t => t.id)).toEqual(['e0'])
  })

  it('ランダム対象は rng の値に応じて生存中の敵から1体だけ選ぶ', () => {
    expect(resolvePlayerFocus({ side: 'enemy', range: 'random' }, player, enemies, null, constRng(0)).map(t => t.id)).toEqual(['e0'])
    expect(resolvePlayerFocus({ side: 'enemy', range: 'random' }, player, enemies, null, constRng(0.99)).map(t => t.id)).toEqual(['e2'])
    const withDead = [makeCombatant({ id: 'dead', alive: false }), enemies[1]]
    expect(resolvePlayerFocus({ side: 'enemy', range: 'random' }, player, withDead, null, constRng(0.4)).map(t => t.id)).toEqual(['e1'])
  })

  it('ランダム対象で生存中の敵が0体なら空配列を返す', () => {
    const allDead = [makeCombatant({ id: 'dead0', alive: false }), makeCombatant({ id: 'dead1', alive: false })]
    expect(resolvePlayerFocus({ side: 'enemy', range: 'random' }, player, allDead, null, constRng(0))).toEqual([])
  })

  it('敵から見た対象は常にプレイヤー、自分対象なら自分', () => {
    const e = enemies[0]
    expect(resolveEnemyFocus({ side: 'enemy', range: 'single' }, e, player)).toEqual([player])
    expect(resolveEnemyFocus({ side: 'self', range: 'single' }, e, player)).toEqual([e])
  })
})

/**
 * 敵セット導入により最大5体編成が起こりうるようになったため（CLAUDE_TASKS.md 第6フェーズ X-7）、
 * 上の3体編成の確認に加えて、上限の5体編成でも single/adjacent3/all/random が壊れていないことを確認する。
 */
describe('battleEngine: フォーカスの解決（5体編成の回帰確認）', () => {
  const player = makePlayer()
  const enemies5: Combatant[] = [0, 1, 2, 3, 4].map(i => makeCombatant({ id: `e${i}`, formationIndex: i }))

  it('単体攻撃は5体編成でも指定した1体だけを対象にする（両端含む）', () => {
    expect(resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, enemies5, 0, constRng(0)).map(t => t.id)).toEqual(['e0'])
    expect(resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, enemies5, 4, constRng(0)).map(t => t.id)).toEqual(['e4'])
  })

  it('隣接3体は編成の両端では中心の片側だけになる（範囲外へはみ出さない）', () => {
    expect(resolvePlayerFocus({ side: 'enemy', range: 'adjacent3' }, player, enemies5, 0, constRng(0)).map(t => t.id)).toEqual(['e0', 'e1'])
    expect(resolvePlayerFocus({ side: 'enemy', range: 'adjacent3' }, player, enemies5, 4, constRng(0)).map(t => t.id)).toEqual(['e3', 'e4'])
    expect(resolvePlayerFocus({ side: 'enemy', range: 'adjacent3' }, player, enemies5, 2, constRng(0)).map(t => t.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('全体攻撃は5体編成の生存者すべてを対象にする', () => {
    const withDead = enemies5.map((e, i) => (i === 2 ? makeCombatant({ id: e.id, alive: false }) : e))
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'all' }, player, withDead, null, constRng(0))
    expect(targets.map(t => t.id)).toEqual(['e0', 'e1', 'e3', 'e4'])
  })

  it('ランダム対象は5体編成の両端を含めて選べる', () => {
    expect(resolvePlayerFocus({ side: 'enemy', range: 'random' }, player, enemies5, null, constRng(0)).map(t => t.id)).toEqual(['e0'])
    expect(resolvePlayerFocus({ side: 'enemy', range: 'random' }, player, enemies5, null, constRng(0.999)).map(t => t.id)).toEqual(['e4'])
  })
})

describe('battleEngine: スキル使用', () => {
  const strike = makeActive({
    id: 'strike', effects: ['fx_slash', 'fx_hit_physical'],
    effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })],
  })
  const content = makeContent({ skills: [strike] })

  function use(skillId: string, target: Combatant) {
    const state = makeState()
    const fx = captureEffects()
    useActiveSkill({
      state, content, source: state.player, skillId, level: 1,
      targets: [target], rng: constRng(0.5), emit: fx.emit,
    })
    return fx
  }

  it('スキル定義のエフェクトが発動時に発行される', () => {
    const fx = use('strike', makeCombatant({ hp: 100000, baseStats: makeStats({ hp: 100000 }) }))
    expect(fx.ids().slice(0, 2)).toEqual(['fx_slash', 'fx_hit_physical'])
  })

  it('効果が対象に適用される', () => {
    const target = makeCombatant({ hp: 100000, baseStats: makeStats({ hp: 100000 }) })
    use('strike', target)
    expect(target.hp).toBeLessThan(100000)
  })

  it('未知のスキルIDでは何も起きない', () => {
    const target = makeCombatant({ hp: 5000 })
    expect(use('nope', target).list).toEqual([])
    expect(target.hp).toBe(5000)
  })

  it('パッシブスキルIDを渡してもアクティブとしては発動しない', () => {
    const passive = makePassive({ id: 'p', effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })] })
    const target = makeCombatant({ hp: 5000 })
    const state = makeState()
    useActiveSkill({
      state, content: makeContent({ skills: [passive] }), source: state.player, skillId: 'p',
      level: 1, targets: [target], rng: constRng(0.5), emit: () => {},
    })
    expect(target.hp).toBe(5000)
  })
})

describe('battleEngine: transformsInto によるスキルの自己変化（立直⇔自摸 想定）', () => {
  const riichi = makeActive({
    id: 'skill_riichi', cooldown: 0, transformsInto: 'skill_tsumo',
    grantsBonusOnTransformUse: { stat: 'critRate', amount: 1 },
    effect: [node('modifier', { stat: 'cutRate', amount: 0.1, scope: 'thisTurn' })],
  })
  const tsumo = makeActive({
    id: 'skill_tsumo', cooldown: 0, transformsInto: 'skill_riichi',
    effect: [node('damage', { element: 'none', scale: { stat: 'str', rate: 2 } })],
  })
  const content = makeContent({ skills: [riichi, tsumo] })

  it('使用後、所持スキルの id が transformsInto の指す先へ変わる（レベル・スロットは維持）', () => {
    const state = makeState()
    const player = state.player
    player.actives = [{ id: 'skill_riichi', level: 3, stacks: 2, cooldown: 0, slotIndex: 1 }]
    const fx = captureEffects()
    useActiveSkill({ state, content, source: player, skillId: 'skill_riichi', level: 3, targets: [player], rng: constRng(0), emit: fx.emit })
    expect(player.actives).toEqual([{ id: 'skill_tsumo', level: 3, stacks: 2, cooldown: 0, slotIndex: 1 }])
  })

  it('相互に変化させれば、使うたびに元へ戻る（立直→自摸→立直）', () => {
    const state = makeState()
    const player = state.player
    player.actives = [{ id: 'skill_riichi', level: 1, stacks: 0, cooldown: 0, slotIndex: 0 }]
    const fx = captureEffects()
    useActiveSkill({ state, content, source: player, skillId: 'skill_riichi', level: 1, targets: [player], rng: constRng(0), emit: fx.emit })
    expect(player.actives[0].id).toBe('skill_tsumo')
    useActiveSkill({ state, content, source: player, skillId: 'skill_tsumo', level: 1, targets: [player], rng: constRng(0), emit: fx.emit })
    expect(player.actives[0].id).toBe('skill_riichi')
  })

  it('transformsInto が無いスキルは id が変わらない', () => {
    const plain = makeActive({ id: 'skill_plain', effect: [node('noop', {})] })
    const state = makeState()
    const player = state.player
    player.actives = [{ id: 'skill_plain', level: 1, stacks: 0, cooldown: 0, slotIndex: 0 }]
    const fx = captureEffects()
    useActiveSkill({
      state, content: makeContent({ skills: [plain] }), source: player, skillId: 'skill_plain',
      level: 1, targets: [player], rng: constRng(0), emit: fx.emit,
    })
    expect(player.actives[0].id).toBe('skill_plain')
  })

  describe('grantsBonusOnTransformUse（一発ツモ 想定）', () => {
    function setup() {
      const state = makeState()
      const player = state.player
      player.baseStats = makeStats({ str: 1000, critRate: 0, critDamageMultiplier: 2, hitRate: 1 })
      player.actives = [{ id: 'skill_riichi', level: 1, stacks: 0, cooldown: 0, slotIndex: 0 }]
      const target = makeCombatant({ id: 'foe', baseStats: makeStats({ hp: 100000 }), hp: 100000 })
      return { state, player, target, fx: captureEffects() }
    }

    it('立直を使うと、変化先(自摸)専用の一時ボーナスが仕込まれる', () => {
      const { state, player, fx } = setup()
      useActiveSkill({ state, content, source: player, skillId: 'skill_riichi', level: 1, targets: [player], rng: constRng(0), emit: fx.emit })
      expect(player.pendingTransformBonus).toEqual({ targetSkillId: 'skill_tsumo', stat: 'critRate', amount: 1, roundsRemaining: 2 })
    })

    it('直後に自摸を使うと会心が保証され、使用後にボーナスは消費される', () => {
      const { state, player, target, fx } = setup()
      useActiveSkill({ state, content, source: player, skillId: 'skill_riichi', level: 1, targets: [player], rng: constRng(0), emit: fx.emit })
      // rng=0.99 は critRate=0 なら非クリティカルになる値だが、ボーナスで critRate が1(保証)になるため
      // crit倍率(既定2倍)が乗ったダメージになる: str(1000) × rate(2) × critMult(2) = 4000
      useActiveSkill({ state, content, source: player, skillId: 'skill_tsumo', level: 1, targets: [target], rng: constRng(0.99), emit: fx.emit })
      expect(100000 - target.hp).toBe(4000)
      expect(player.pendingTransformBonus).toBeNull()
    })

    it('自摸以外のスキルにはボーナスが効かず、消費もされない', () => {
      const other = makeActive({ id: 'skill_other', cooldown: 0, effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 2 } })] })
      const localContent = makeContent({ skills: [riichi, tsumo, other] })
      const { state, player, target, fx } = setup()
      player.actives.push({ id: 'skill_other', level: 1, stacks: 0, cooldown: 0, slotIndex: 1 })

      useActiveSkill({ state, content: localContent, source: player, skillId: 'skill_riichi', level: 1, targets: [player], rng: constRng(0), emit: fx.emit })
      useActiveSkill({ state, content: localContent, source: player, skillId: 'skill_other', level: 1, targets: [target], rng: constRng(0.99), emit: fx.emit })

      expect(100000 - target.hp).toBe(2000)   // str(1000) × rate(2)、非対象スキルなのでクリティカルは乗らない
      expect(player.pendingTransformBonus).not.toBeNull()   // 消費されず、まだ自摸を待っている
    })

    it('未消費のまま2ラウンド経過すると失効する（nextRoundスコープと同じ寿命）', () => {
      const { state, player, fx } = setup()
      useActiveSkill({ state, content, source: player, skillId: 'skill_riichi', level: 1, targets: [player], rng: constRng(0), emit: fx.emit })
      expect(player.pendingTransformBonus).not.toBeNull()
      endOfRound(state, content, () => {})
      expect(player.pendingTransformBonus).not.toBeNull()   // 付与ラウンドの残りではまだ失効しない
      endOfRound(state, content, () => {})
      expect(player.pendingTransformBonus).toBeNull()   // 次のラウンドの終わりで失効する
    })

    it('戦闘勝利時にリセットされる（戦闘間へ持ち越さない）', () => {
      const { state, player, fx } = setup()
      useActiveSkill({ state, content, source: player, skillId: 'skill_riichi', level: 1, targets: [player], rng: constRng(0), emit: fx.emit })
      expect(player.pendingTransformBonus).not.toBeNull()
      finishBattleOnVictory(state, content)
      expect(player.pendingTransformBonus).toBeNull()
    })
  })
})

describe('battleEngine: カウンター/反射板の反撃（統合）', () => {
  const attackerSkill = makeActive({
    id: 'skill_attack', defaultFocus: 'enemy', focusRange: 'single',
    effect: [node('repeat', {
      times: 3,
      body: [{ op: 'damage', element: 'physical', scale: { stat: 'str', rate: 0.5 } }],
    })],
  })
  const counterSkill = makeActive({
    id: 'skill_counter', defaultFocus: 'self', focusRange: 'single', cooldown: 5,
    effect: [node('counterStance', { scaleStat: 'def', rate: 1, element: 'physical' })],
  })
  const content = makeContent({ skills: [attackerSkill, counterSkill] })

  it('多段ヒットは全て終わってから、命中回数ぶんまとめて反撃する（1回の被カウンターで使い切り）', () => {
    const state = makeState()
    const attacker = state.player   // 既定: str/def=1000, hp=5000
    const holder = makeCombatant({ id: 'holder' })   // 既定: def=1000, hp=5000
    const fx = captureEffects()

    useActiveSkill({ state, content, source: holder, skillId: 'skill_counter', level: 1, targets: [holder], rng: constRng(0), emit: fx.emit })
    expect(holder.pendingCounter).not.toBeNull()

    useActiveSkill({ state, content, source: attacker, skillId: 'skill_attack', level: 1, targets: [holder], rng: constRng(0), emit: fx.emit })

    // holder: 攻撃側str1000×0.5 を3回被弾 = 1500ダメージ。attacker: holder def1000×1 を3回反撃 = 3000ダメージ
    // （互いに def=1000＝カット率アンカーのためカット率0%で式そのものの値になる）
    expect(holder.hp).toBe(5000 - 1500)
    expect(attacker.hp).toBe(5000 - 3000)
    expect(holder.pendingCounter).toBeNull()
    expect(holder.queuedCounterHits).toBe(0)
  })

  it('反撃態勢に入っていなければ反撃は発生しない', () => {
    const state = makeState()
    const attacker = state.player
    const holder = makeCombatant({ id: 'holder' })
    const fx = captureEffects()
    useActiveSkill({ state, content, source: attacker, skillId: 'skill_attack', level: 1, targets: [holder], rng: constRng(0), emit: fx.emit })
    expect(attacker.hp).toBe(5000)
  })
})

describe('battleEngine: 組み込み行動（守る・避ける・様子を見る）', () => {
  it('守るとカット率の一時効果が付きクールタイムに入る', () => {
    const c = makePlayer()
    useBuiltinAction(c, 'guard')
    expect(c.temporary).toEqual([
      { stat: 'cutRate', flat: BATTLE.guard.cutRate, scope: 'thisTurn', sourceId: 'guard' },
    ])
    expect(c.builtinCooldowns.guard).toBe(BATTLE.guard.cooldown)
  })

  it('避けると回避率の一時効果が付きクールタイムに入る', () => {
    const c = makePlayer()
    useBuiltinAction(c, 'dodge')
    expect(c.temporary).toEqual([
      { stat: 'evadeRate', flat: BATTLE.dodge.evadeBonus, scope: 'thisTurn', sourceId: 'dodge' },
    ])
    expect(c.builtinCooldowns.dodge).toBe(BATTLE.dodge.cooldown)
  })

  it('様子を見るは状態を変えない', () => {
    const c = makePlayer()
    useBuiltinAction(c, 'pass')
    expect(c.temporary).toEqual([])
    expect(c.builtinCooldowns).toEqual({ guard: 0, dodge: 0 })
  })

  it('replaceGuard 特性を持つかどうかを判定できる', () => {
    const evasive = makeTrait({ id: 'evasive', effect: [node('replaceGuard')] })
    const other = makeTrait({ id: 'other', effect: [node('cutRate', { amount: 0.1 })] })
    const content = makeContent({ traits: [evasive, other] })
    expect(hasReplaceGuard(makePlayer({ traits: [{ id: 'evasive' }] }), content)).toBe(true)
    expect(hasReplaceGuard(makePlayer({ traits: [{ id: 'other' }] }), content)).toBe(false)
    expect(hasReplaceGuard(makePlayer(), content)).toBe(false)
  })
})

describe('battleEngine: 敵の行動', () => {
  const bite = makeActive({
    id: 'bite', cooldown: 2,
    effect: [node('damage', { element: 'physical', scale: { stat: 'str', rate: 1 } })],
  })
  const content = makeContent({ skills: [bite] })

  function setup(): { state: ReturnType<typeof makeState>; enemy: Combatant } {
    const enemy = makeCombatant({
      id: 'e0',
      actives: [{ id: 'bite', level: 1, stacks: 0, cooldown: 0, slotIndex: null }],
      actionPattern: ['bite'],
    })
    const state = makeState({
      player: makePlayer({ baseStats: makeStats({ hp: 100000, agi: BATTLE.evade.anchor }), hp: 100000 }),
      enemies: [enemy],
    })
    return { state, enemy }
  }

  it('パターンどおりにスキルを使い、クールタイムが設定される', () => {
    const { state, enemy } = setup()
    enemyTakeTurn({ state, content, enemy, player: state.player, rng: constRng(0.5), emit: () => {} })
    expect(state.player.hp).toBeLessThan(100000)
    expect(enemy.actives[0].cooldown).toBe(2)
  })

  it('全スキルがクールタイム中なら何もしない', () => {
    const { state, enemy } = setup()
    enemy.actives[0].cooldown = 2
    enemyTakeTurn({ state, content, enemy, player: state.player, rng: constRng(0.5), emit: () => {} })
    expect(state.player.hp).toBe(100000)
  })

  it('行動パターンが空の敵は何もしない', () => {
    const { state, enemy } = setup()
    enemy.actionPattern = []
    enemyTakeTurn({ state, content, enemy, player: state.player, rng: constRng(0.5), emit: () => {} })
    expect(state.player.hp).toBe(100000)
  })
})

describe('battleEngine: ラウンド終了処理', () => {
  const content = makeContent()
  const noop = (): void => {}

  it('クールタイムが1ずつ減り、0未満にはならない', () => {
    const player = makePlayer({
      actives: [{ id: 'a', level: 1, stacks: 0, cooldown: 2, slotIndex: 0 }],
      builtinCooldowns: { guard: 1, dodge: 0 },
    })
    const state = makeState({ player })
    endOfRound(state, content, noop)
    expect(player.actives[0].cooldown).toBe(1)
    expect(player.builtinCooldowns).toEqual({ guard: 0, dodge: 0 })
    endOfRound(state, content, noop)
    endOfRound(state, content, noop)
    expect(player.actives[0].cooldown).toBe(0)
  })

  it('thisTurn の補正だけが失効し、他のスコープは残る', () => {
    const player = makePlayer({
      temporary: [
        { stat: 'cutRate', flat: 0.5, scope: 'thisTurn', sourceId: 'guard' },
        { stat: 'str', flat: 100, scope: 'thisBattle', sourceId: 'x' },
      ],
    })
    endOfRound(makeState({ player }), content, noop)
    expect(player.temporary.map(m => m.scope)).toEqual(['thisBattle'])
  })

  it('nextRound は付与ラウンドの残り＋次のラウンド丸ごとで失効する（2ラウンド分保つ）', () => {
    const player = makePlayer({
      temporary: [
        { stat: 'def', flat: -50, scope: 'nextRound', sourceId: 'skill_wild_swing' },
        { stat: 'str', flat: 100, scope: 'thisBattle', sourceId: 'x' },
      ],
    })
    const state = makeState({ player })
    // 付与されたラウンドの endOfRound: nextRound はまだ失効しない(thisTurnへ格下げされるだけ)
    endOfRound(state, content, noop)
    expect(player.temporary.map(m => ({ stat: m.stat, scope: m.scope }))).toEqual([
      { stat: 'def', scope: 'thisTurn' },
      { stat: 'str', scope: 'thisBattle' },
    ])
    // 次のラウンドの endOfRound で、格下げされた thisTurn として失効する
    endOfRound(state, content, noop)
    expect(player.temporary.map(m => m.stat)).toEqual(['str'])
  })

  it('継続ダメージ（periodicSelfEffects）は実効最大HPの割合ぶん、シールドを無視して直接減る（龍鱗 想定）', () => {
    const player = makePlayer({
      hp: 5000, shield: 9999,
      baseStats: makeStats({ hp: 5000 }),
      periodicSelfEffects: [{ kind: 'trueDamagePercentMaxHp', ratio: 0.15, sourceId: 'skill_dragon_scale' }],
    })
    const fx = captureEffects()
    endOfRound(makeState({ player }), content, fx.emit)
    expect(player.hp).toBe(4250)   // 5000 - (5000 × 0.15) = 4250、シールドは無関係
    expect(player.shield).toBe(9999)   // シールドは一切消費されない
    expect(fx.ids()).toContain('fx_debuff')
  })

  it('継続ダメージは自滅（戦闘不能）を許容する', () => {
    const player = makePlayer({
      hp: 100,
      baseStats: makeStats({ hp: 100 }),
      periodicSelfEffects: [{ kind: 'trueDamagePercentMaxHp', ratio: 0.99, sourceId: 'skill_dragon_scale' }],
    })
    const fx = captureEffects()
    endOfRound(makeState({ player }), content, fx.emit)
    expect(player.hp).toBe(1)
    expect(player.alive).toBe(true)
    endOfRound(makeState({ player }), content, fx.emit)
    expect(player.hp).toBe(0)
    expect(player.alive).toBe(false)
    expect(fx.ids()).toContain('fx_defeat')
  })

  it('ラウンド数が加算される', () => {
    const state = makeState()
    endOfRound(state, content, noop)
    endOfRound(state, content, noop)
    expect(state.roundCount).toBe(2)
  })

  it('戦闘不能の参加者は処理対象外', () => {
    const dead = makeCombatant({ id: 'e0', alive: false, builtinCooldowns: { guard: 3, dodge: 0 } })
    endOfRound(makeState({ enemies: [dead] }), content, noop)
    expect(dead.builtinCooldowns.guard).toBe(3)
  })
})

describe('battleEngine: 勝敗判定', () => {
  it('敵が残っていれば継続', () => {
    const state = makeState({ enemies: [makeCombatant({ id: 'e0' })] })
    expect(checkBattleOutcome(state)).toBe('ongoing')
  })

  it('敵が全滅したら勝利', () => {
    const state = makeState({ enemies: [makeCombatant({ id: 'e0', alive: false })] })
    expect(checkBattleOutcome(state)).toBe('won')
  })

  it('プレイヤーが倒れたら敗北（敵の生死より優先）', () => {
    const state = makeState({
      player: makePlayer({ alive: false }),
      enemies: [makeCombatant({ id: 'e0', alive: false })],
    })
    expect(checkBattleOutcome(state)).toBe('lost')
  })
})

describe('battleEngine: 勝利時の後処理', () => {
  const content = makeContent()

  function wonState(over: Parameters<typeof makePlayer>[0] = {}) {
    const player = makePlayer({ baseStats: makeStats({ hp: 10000 }), hp: 4000, shield: 250, ...over })
    return { state: makeState({ player, enemies: [makeCombatant({ id: 'e0', alive: false })] }), player }
  }

  it('現在HPとシールドは次の戦闘へ持ち越される（無条件回復ぶんは加算される）', () => {
    const { state, player } = wonState()
    finishBattleOnVictory(state, content)
    expect(player.hp).toBe(6000)   // 4000 + 無条件回復(10000 × postBattleHealRate)
    expect(player.shield).toBe(250)
  })

  it('特性がなくても戦闘終了時に無条件で最大HPの一定割合を回復し、記録される', () => {
    const { state, player } = wonState()
    finishBattleOnVictory(state, content)
    expect(player.hp).toBe(4000 + Math.floor(BATTLE.postBattleHealRate * 10000))
    expect(state.lastBattleEndNotices).toHaveLength(1)
    expect(state.lastBattleEndNotices[0]).toContain('戦闘後の回復')
  })

  it('無条件回復は最大HPを超えない（既に満タンなら通知も出ない）', () => {
    const { state, player } = wonState({ hp: 10000 })
    finishBattleOnVictory(state, content)
    expect(player.hp).toBe(10000)
    expect(state.lastBattleEndNotices).toEqual([])
  })

  it('クールタイムはすべてリセットされる', () => {
    const { state, player } = wonState({
      actives: [{ id: 'a', level: 1, stacks: 0, cooldown: 3, slotIndex: 0 }],
      builtinCooldowns: { guard: 2, dodge: 1 },
    })
    finishBattleOnVictory(state, content)
    expect(player.actives[0].cooldown).toBe(0)
    expect(player.builtinCooldowns).toEqual({ guard: 0, dodge: 0 })
  })

  it('戦闘中のバフ・デバフは消え、恒常補正だけが残る', () => {
    const { state, player } = wonState({
      temporary: [
        { stat: 'str', flat: 100, scope: 'thisBattle', sourceId: 'x' },
        { stat: 'str', flat: 50, scope: 'thisTurn', sourceId: 'y' },
        { stat: 'hp', flat: 400, scope: 'permanent', sourceId: 'fallback' },
      ],
    })
    finishBattleOnVictory(state, content)
    expect(player.temporary.map(m => m.scope)).toEqual(['permanent'])
  })

  it('撃破数と戦闘番号が進む', () => {
    const { state } = wonState()
    finishBattleOnVictory(state, content)
    expect(state.battlesWon).toBe(1)
    expect(state.battleIndex).toBe(1)
    expect(state.bossDefeated).toBe(false)
  })

  it('勝利するたびリロール回数が1増える', () => {
    const { state } = wonState()
    expect(state.rerollCharges).toBe(0)
    finishBattleOnVictory(state, content)
    expect(state.rerollCharges).toBe(1)
    finishBattleOnVictory(state, content)
    expect(state.rerollCharges).toBe(2)
  })

  it('ボスを倒したら bossDefeated が立つ', () => {
    const { state } = wonState()
    state.enemies = [makeCombatant({ id: 'boss', alive: false, isBoss: true })]
    finishBattleOnVictory(state, content)
    expect(state.bossDefeated).toBe(true)
  })

  it('healBetweenBattles 特性で戦闘間に回復し、その旨が記録される（無条件回復と加算される）', () => {
    const medic = makeTrait({ id: 'medic', effect: [node('healBetweenBattles', { rate: 0.2 })] })
    const c = makeContent({ traits: [medic] })
    const { state, player } = wonState({ traits: [{ id: 'medic' }] })
    finishBattleOnVictory(state, c)
    // 4000 + 無条件回復(10000×postBattleHealRate) + 特性回復(10000×0.2)
    expect(player.hp).toBe(4000 + Math.floor(BATTLE.postBattleHealRate * 10000) + 2000)
    expect(state.lastBattleEndNotices).toHaveLength(2)
    expect(state.lastBattleEndNotices.join(' ')).toContain('2000')
  })

  it('戦闘間回復は最大HPを超えない', () => {
    const medic = makeTrait({ id: 'medic', effect: [node('healBetweenBattles', { amount: 99999 })] })
    const c = makeContent({ traits: [medic] })
    const { state, player } = wonState({ traits: [{ id: 'medic' }] })
    finishBattleOnVictory(state, c)
    expect(player.hp).toBe(10000)
  })

  it('回復が何も発生しなければ（満タンなら）通知は空のまま', () => {
    const { state } = wonState({ hp: 10000 })
    state.lastBattleEndNotices = ['前回の残骸']
    finishBattleOnVictory(state, content)
    expect(state.lastBattleEndNotices).toEqual([])
  })
})

describe('battleEngine: スコア変数', () => {
  it('勝利数・ボス撃破・最大スキルレベル・特性数を集計する', () => {
    const state = makeState({
      battlesWon: 7, bossesDefeatedCount: 3,
      player: makePlayer({
        actives: [
          { id: 'a', level: 2, stacks: 0, cooldown: 0, slotIndex: 0 },
          { id: 'b', level: 4, stacks: 0, cooldown: 0, slotIndex: 1 },
        ],
        passives: [{ id: 'p', level: 3, stacks: 0 }],
        traits: [{ id: 't1' }, { id: 't2' }],
      }),
    })
    expect(buildBattleScoreVars(state)).toEqual({
      battlesWon: 7, bossDefeated: 3, maxSkillLevel: 4, traitsAcquired: 2,
    })
  })

  it('何も所持していなければ最大スキルレベルは 0', () => {
    const state = makeState({ player: makePlayer({ actives: [], passives: [] }) })
    expect(buildBattleScoreVars(state).maxSkillLevel).toBe(0)
    expect(buildBattleScoreVars(state).bossDefeated).toBe(0)
  })
})

describe('battleEngine: カテゴリポイントの初期化', () => {
  it('11カテゴリすべてが 0 で初期化される', () => {
    const points = zeroCategoryPoints()
    expect(Object.keys(points).sort()).toEqual([...CATEGORY_IDS].sort())
    expect(Object.values(points).every(v => v === 0)).toBe(true)
  })
})
