import { describe, it, expect } from 'vitest'
import {
  initPlayer, spawnEnemyFromDef, pickEnemyDefs, resolveEffectiveStats,
  resolvePlayerFocus, resolveEnemyFocus, useActiveSkill, useBuiltinAction,
  hasReplaceGuard, enemyTakeTurn, endOfRound, checkBattleOutcome,
  finishBattleOnVictory, buildBattleScoreVars, zeroCategoryPoints,
} from '../../../../src/domain/battle/battleEngine'
import { BATTLE } from '../../../../src/data/tunables'
import { CATEGORY_IDS } from '../../../../src/domain/battle/types'
import type { Combatant } from '../../../../src/domain/battle/types'
import {
  makeStats, makeCombatant, makePlayer, makeActive, makePassive, makeTrait,
  makeEnemyDef, makeContent, makeState, seqRng, constRng, captureEffects, node,
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
  const content = makeContent({ enemies: [mob, boss] })

  it('ボス戦の番号ではボスが1体だけ出る', () => {
    const picked = pickEnemyDefs(content, BATTLE.bossBattleIndex, constRng(0.5))
    expect(picked).toHaveLength(1)
    expect(picked[0].isBoss).toBe(true)
  })

  it('通常戦ではボスは出ない', () => {
    for (let i = 0; i < BATTLE.bossBattleIndex; i++) {
      const picked = pickEnemyDefs(content, i, Math.random)
      expect(picked.length).toBeGreaterThan(0)
      expect(picked.every(e => !e.isBoss)).toBe(true)
    }
  })

  it('該当プールが空なら全体から選ぶ（詰まって0体にならない）', () => {
    const onlyBoss = makeContent({ enemies: [boss] })
    const picked = pickEnemyDefs(onlyBoss, 0, constRng(0.5))
    expect(picked).toHaveLength(1)
  })

  it('敵が1体も定義されていなければ空配列', () => {
    expect(pickEnemyDefs(makeContent(), 0, constRng(0.5))).toEqual([])
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
    expect(resolvePlayerFocus({ side: 'self', range: 'single' }, player, enemies, 1)).toEqual([player])
  })

  it('味方対象は味方が存在しないためプレイヤーへフォールバックする', () => {
    expect(resolvePlayerFocus({ side: 'ally', range: 'all' }, player, enemies, null)).toEqual([player])
  })

  it('全体攻撃は生存している敵すべてを対象にする', () => {
    const withDead = [enemies[0], makeCombatant({ id: 'dead', alive: false }), enemies[2]]
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'all' }, player, withDead, null)
    expect(targets.map(t => t.id)).toEqual(['e0', 'e2'])
  })

  it('隣接3体は中心の左右を含む', () => {
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'adjacent3' }, player, enemies, 1)
    expect(targets.map(t => t.id)).toEqual(['e0', 'e1', 'e2'])
  })

  it('単体攻撃は指定した敵1体だけを対象にする', () => {
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, enemies, 2)
    expect(targets.map(t => t.id)).toEqual(['e2'])
  })

  it('指定した敵が既に倒れていれば生存中の先頭へフォールバックする', () => {
    const withDead = [makeCombatant({ id: 'dead', alive: false }), enemies[1]]
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, withDead, 0)
    expect(targets.map(t => t.id)).toEqual(['e1'])
  })

  it('対象未指定なら生存中の先頭を狙う', () => {
    const targets = resolvePlayerFocus({ side: 'enemy', range: 'single' }, player, enemies, null)
    expect(targets.map(t => t.id)).toEqual(['e0'])
  })

  it('敵から見た対象は常にプレイヤー、自分対象なら自分', () => {
    const e = enemies[0]
    expect(resolveEnemyFocus({ side: 'enemy', range: 'single' }, e, player)).toEqual([player])
    expect(resolveEnemyFocus({ side: 'self', range: 'single' }, e, player)).toEqual([e])
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
  it('クールタイムが1ずつ減り、0未満にはならない', () => {
    const player = makePlayer({
      actives: [{ id: 'a', level: 1, stacks: 0, cooldown: 2, slotIndex: 0 }],
      builtinCooldowns: { guard: 1, dodge: 0 },
    })
    const state = makeState({ player })
    endOfRound(state)
    expect(player.actives[0].cooldown).toBe(1)
    expect(player.builtinCooldowns).toEqual({ guard: 0, dodge: 0 })
    endOfRound(state)
    endOfRound(state)
    expect(player.actives[0].cooldown).toBe(0)
  })

  it('thisTurn の補正だけが失効し、他のスコープは残る', () => {
    const player = makePlayer({
      temporary: [
        { stat: 'cutRate', flat: 0.5, scope: 'thisTurn', sourceId: 'guard' },
        { stat: 'str', flat: 100, scope: 'thisBattle', sourceId: 'x' },
      ],
    })
    endOfRound(makeState({ player }))
    expect(player.temporary.map(m => m.scope)).toEqual(['thisBattle'])
  })

  it('ラウンド数が加算される', () => {
    const state = makeState()
    endOfRound(state)
    endOfRound(state)
    expect(state.roundCount).toBe(2)
  })

  it('戦闘不能の参加者は処理対象外', () => {
    const dead = makeCombatant({ id: 'e0', alive: false, builtinCooldowns: { guard: 3, dodge: 0 } })
    endOfRound(makeState({ enemies: [dead] }))
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
      battlesWon: 7, bossDefeated: true,
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
      battlesWon: 7, bossDefeated: 1, maxSkillLevel: 4, traitsAcquired: 2,
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
