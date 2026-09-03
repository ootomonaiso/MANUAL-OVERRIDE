import { describe, it, expect, vi, afterEach } from 'vitest'
import { computed } from 'vue'
import { useBattleState, type BattleScheduler } from '../../../src/composables/useBattleState'
import { BATTLE_CONTENT } from '../../../src/data/battleContent'
import { BATTLE } from '../../../src/data/tunables'
import { GENRES } from '../../../src/data/genres'
import { evalScoreFormula } from '../../../src/domain/scoreCalc'
import type { BattleStatus } from '../../../src/domain/battle/types'

type Battle = ReturnType<typeof useBattleState>

const MAX_TURNS = 400

/** 決定的な線形合同法。抽選（敵選定・ドラフト）に一様な乱数を供給する */
function seededPrng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * プレイヤーが必ず勝ち進む戦闘ハーネス。
 *
 * rng の返し方を3つの場面で切り替える:
 *  1. プレイヤーの行動直後の2回（命中判定・クリティカル判定）→ 0.94。
 *     プレイヤーの命中率 0.95 を下回るので必中、クリティカル率 0.05 は上回るので非クリティカル。
 *  2. 敵が生存している間のそれ以外の呼び出し（＝敵の命中判定）→ 0.99。
 *     敵の命中率は最大でも 0.95 なので必ず外れる。
 *  3. 敵が全滅した後の呼び出し（＝ドラフト抽選・次の敵の選定）→ 一様乱数。
 *     ここを固定値にすると shuffle が恒等変換になり、毎回同じ候補しか出なくなる。
 */
function winningHarness(seed = 12345): { battle: Battle; act: () => void } {
  const prng = seededPrng(seed)
  let sinceAction = Number.POSITIVE_INFINITY
  const battle = useBattleState()
  const rng = (): number => {
    if (sinceAction < 2) { sinceAction++; return 0.94 }
    return battle.state.enemies.some(e => e.alive) ? 0.99 : prng()
  }
  battle.initRun(rng)
  const act = (): void => {
    sinceAction = 0
    battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
  }
  return { battle, act }
}

/** 敵の攻撃が必ず当たるハーネス（プレイヤーは「何もしない」を選び続けて敗北する） */
function losingHarness(): { battle: Battle; pass: () => void } {
  const battle = useBattleState()
  battle.initRun(() => 0.5)
  return { battle, pass: () => battle.selectAction({ kind: 'builtin', action: 'pass' }) }
}

/** 現在の戦闘が終わる（ドラフト or 決着）まで攻撃し続ける */
function fightUntilBattleEnds(h: { battle: Battle; act: () => void }): void {
  for (let i = 0; i < MAX_TURNS && h.battle.state.status === 'battle'; i++) h.act()
}

/** 進行中に何度も変わる値なので、型の絞り込みを残さずに都度読み直す */
function statusOf(battle: Battle): BattleStatus {
  return battle.state.status
}

/** ドラフト候補から「未所持のアクティブ」を優先して選ぶ（枠を埋めるため） */
function pickNewActiveIndex(battle: Battle): number {
  const options = battle.state.draftOptions ?? []
  const idx = options.findIndex(o => o.kind === 'active' && !o.isFallback && o.currentLevel === undefined)
  return idx >= 0 ? idx : 0
}

afterEach(() => { vi.restoreAllMocks() })

describe('useBattleState: ライフサイクル', () => {
  it('initRun で戦闘が始まり、初期状態が組み上がる', () => {
    const { battle } = winningHarness()
    expect(battle.state.status).toBe('battle')
    expect(battle.state.battleIndex).toBe(0)
    expect(battle.state.battlesWon).toBe(0)
    expect(battle.state.enemies.length).toBeGreaterThan(0)
    expect(battle.state.turnQueue.length).toBeGreaterThan(0)
    expect(battle.state.player.actives).toHaveLength(1)
    expect(battle.state.player.actives[0].slotIndex).toBe(0)
    expect(battle.state.playScore).toBe(0)
  })

  it('initRun を2度呼んでも進行中の戦闘をやり直さない', () => {
    const { battle, act } = winningHarness()
    act()
    const hpAfterFirstTurn = battle.state.enemies[0].hp
    battle.initRun(() => 0.5)
    expect(battle.state.enemies[0].hp).toBe(hpAfterFirstTurn)
  })

  it('reset 後は改めて initRun できる', () => {
    const { battle, act } = winningHarness()
    act()
    battle.reset()
    expect(battle.state.enemies).toHaveLength(0)
    battle.initRun(() => 0.99)
    expect(battle.state.enemies.length).toBeGreaterThan(0)
    expect(battle.state.status).toBe('battle')
  })

  it('外部へ公開する state は読み取り専用', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { battle } = winningHarness()
    const before = battle.state.player.hp
    ;(battle.state.player as { hp: number }).hp = 1
    expect(battle.state.player.hp).toBe(before)
  })
})

describe('useBattleState: リアクティビティ', () => {
  // ドメイン層へ生オブジェクト(toRaw)を渡すと push/代入が Vue の trigger を通らず
  // 画面が更新されない不具合があった。computed が追随することで再発を検知する。
  it('攻撃で減った敵HPが computed に反映される', () => {
    const { battle, act } = winningHarness()
    const enemyHp = computed(() => battle.state.enemies[0]?.hp ?? -1)
    const before = enemyHp.value
    act()
    expect(enemyHp.value).toBeLessThan(before)
  })

  it('ドラフトで得たスキルが computed に反映される', () => {
    const h = winningHarness()
    const skillIds = computed(() => h.battle.state.player.actives.map(a => a.id).join(','))
    const passiveCount = computed(() => h.battle.state.player.passives.length)
    const traitCount = computed(() => h.battle.state.player.traits.length)
    const before = { skills: skillIds.value, passives: passiveCount.value, traits: traitCount.value }

    fightUntilBattleEnds(h)
    expect(h.battle.state.status).toBe('drafting')
    h.battle.selectDraft(pickNewActiveIndex(h.battle))

    const changed = skillIds.value !== before.skills
      || passiveCount.value !== before.passives
      || traitCount.value !== before.traits
    expect(changed).toBe(true)
  })

  it('戦闘の進行状況（ステータス・ターン）が computed に反映される', () => {
    const h = winningHarness()
    const status = computed(() => h.battle.state.status)
    expect(status.value).toBe('battle')
    fightUntilBattleEnds(h)
    expect(status.value).toBe('drafting')
  })

  it('エフェクトキューの長さが computed に反映される', () => {
    const { battle, act } = winningHarness()
    const queued = computed(() => battle.effectQueue.value.length)
    expect(queued.value).toBe(0)
    act()
    expect(queued.value).toBeGreaterThan(0)
  })

})

describe('useBattleState: プレイヤーの行動', () => {
  it('開始直後はプレイヤーの手番（AGIが敵より高い前提の初期値）', () => {
    const { battle } = winningHarness()
    expect(battle.isPlayerTurn.value).toBe(true)
  })

  it('空きスロットを選んでも何も起きない', () => {
    const { battle } = winningHarness()
    const enemyHp = battle.state.enemies[0].hp
    battle.selectAction({ kind: 'active', slotIndex: 3 }, null)
    expect(battle.state.enemies[0].hp).toBe(enemyHp)
    expect(battle.isPlayerTurn.value).toBe(true)
  })

  it('手番でないときは行動を受け付けない', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    expect(h.battle.state.status).toBe('drafting')
    expect(h.battle.isPlayerTurn.value).toBe(false)
    const hp = h.battle.state.player.hp
    h.battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
    expect(h.battle.state.player.hp).toBe(hp)
  })

  it('守るを選ぶとカット率が付きクールタイムに入る', () => {
    const { battle } = winningHarness()
    expect(battle.guardOrDodge.value).toBe('guard')
    battle.selectAction({ kind: 'builtin', action: 'guard' })
    expect(battle.state.player.builtinCooldowns.guard).toBeGreaterThan(0)
  })

  it('何もしないを選んでも手番は進む', () => {
    const { battle } = winningHarness()
    const round = battle.state.roundCount
    battle.selectAction({ kind: 'builtin', action: 'pass' })
    expect(battle.state.roundCount).toBeGreaterThan(round)
  })

  it('敵の次に使うスキルを先読みできる', () => {
    const { battle } = winningHarness()
    const id = battle.nextEnemySkillPreview(battle.state.enemies[0])
    expect(id).toBeTruthy()
    expect(BATTLE_CONTENT.skills.has(id as string)).toBe(true)
  })

  it('実効ステータスを読み取り専用の参加者から算出できる', () => {
    const { battle } = winningHarness()
    const eff = battle.effectiveOf(battle.state.player)
    expect(eff.hp).toBe(battle.state.player.baseStats.hp)
    expect(eff.str).toBeGreaterThan(0)
  })
})

describe('useBattleState: ドラフト', () => {
  it('勝利するとドラフトに移り3択が提示される', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    expect(h.battle.state.status).toBe('drafting')
    expect(h.battle.state.draftOptions).toHaveLength(3)
    expect(h.battle.state.battlesWon).toBe(1)
    expect(h.battle.state.battleIndex).toBe(1)
  })

  it('選択すると次の戦闘が始まる', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    h.battle.selectDraft(0)
    expect(h.battle.state.status).toBe('battle')
    expect(h.battle.state.draftOptions).toBeNull()
    expect(h.battle.state.enemies.every(e => e.alive)).toBe(true)
  })

  it('現在HPは次の戦闘へ持ち越される', () => {
    const h = losingHarness()
    for (let i = 0; i < 3; i++) h.pass()
    const damaged = h.battle.state.player.hp
    expect(damaged).toBeLessThan(h.battle.state.player.baseStats.hp)
  })

  it('存在しない選択肢を指定しても何も起きない', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    h.battle.selectDraft(99)
    expect(h.battle.state.status).toBe('drafting')
  })

  it('ドラフト中でなければ選択は無視される', () => {
    const h = winningHarness()
    h.battle.selectDraft(0)
    expect(h.battle.state.status).toBe('battle')
  })

  it('候補の表示名はコンテンツ定義から引ける（ステータス微増は null）', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    for (const opt of h.battle.state.draftOptions ?? []) {
      const meta = h.battle.draftOptionLabel(opt)
      if (opt.isFallback) expect(meta).toBeNull()
      else expect(meta?.label).toBeTruthy()
    }
  })
})

describe('useBattleState: ドラフトの引き直し', () => {
  it('勝利するたびリロール回数が1増える', () => {
    const h = winningHarness()
    expect(h.battle.state.rerollCharges).toBe(0)
    fightUntilBattleEnds(h)
    expect(h.battle.state.rerollCharges).toBe(1)
  })

  it('リロールすると回数が1減り、3択が引き直される', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    expect(h.battle.state.rerollCharges).toBe(1)
    h.battle.rerollDraft()
    expect(h.battle.state.rerollCharges).toBe(0)
    expect(h.battle.state.draftOptions).toHaveLength(3)
  })

  it('残り回数が0ならリロールしても何も起きない', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    h.battle.rerollDraft()
    const before = h.battle.state.draftOptions
    h.battle.rerollDraft()
    expect(h.battle.state.rerollCharges).toBe(0)
    expect(h.battle.state.draftOptions).toBe(before)
  })

  it('ドラフト中でなければリロールは無視される', () => {
    const h = winningHarness()
    h.battle.rerollDraft()
    expect(h.battle.state.rerollCharges).toBe(0)
    expect(h.battle.state.status).toBe('battle')
  })
})

describe('useBattleState: アクティブ枠の入れ替え', () => {
  /** 未所持アクティブを優先して取り続け、枠が埋まって入れ替えを要求される所まで進める */
  function advanceUntilSwapRequested(h: { battle: Battle; act: () => void }): boolean {
    for (let i = 0; i < 12; i++) {
      fightUntilBattleEnds(h)
      if (statusOf(h.battle) !== 'drafting') return false
      h.battle.selectDraft(pickNewActiveIndex(h.battle))
      if (statusOf(h.battle) === 'swapping') return true
    }
    return false
  }

  it('4枠が埋まった状態で新規アクティブを選ぶと入れ替え待ちになる', () => {
    const h = winningHarness()
    expect(advanceUntilSwapRequested(h)).toBe(true)
    expect(h.battle.state.pendingSwapSkillId).toBeTruthy()
  })

  it('キャンセルするとドラフトへ戻り、選び直せる', () => {
    const h = winningHarness()
    expect(advanceUntilSwapRequested(h)).toBe(true)
    h.battle.cancelSwap()
    expect(h.battle.state.status).toBe('drafting')
    expect(h.battle.state.pendingSwapSkillId).toBeNull()
  })

  it('枠を確定すると新スキルが入り、外れたスキルはレベルを保って保管される', () => {
    const h = winningHarness()
    expect(advanceUntilSwapRequested(h)).toBe(true)
    const incoming = h.battle.state.pendingSwapSkillId
    const outgoing = h.battle.state.player.actives.find(a => a.slotIndex === 3)
    const outgoingLevel = outgoing?.level ?? 0

    h.battle.confirmSwap(3)

    expect(h.battle.state.status).toBe('battle')
    expect(h.battle.state.pendingSwapSkillId).toBeNull()
    expect(h.battle.state.player.actives.find(a => a.slotIndex === 3)?.id).toBe(incoming)
    const stored = h.battle.state.player.actives.find(a => a.id === outgoing?.id)
    expect(stored?.slotIndex).toBeNull()
    expect(stored?.level).toBe(outgoingLevel)
  })

  it('入れ替え待ちでなければ確定操作は無視される', () => {
    const h = winningHarness()
    h.battle.confirmSwap(0)
    expect(h.battle.state.status).toBe('battle')
  })
})

describe('useBattleState: 決着とスコア', () => {
  function expectedScore(battle: Battle): number {
    const formula = GENRES.find(g => g.id === 'rpg')?.scoreFormula ?? ''
    let maxSkillLevel = 0
    for (const a of battle.state.player.actives) maxSkillLevel = Math.max(maxSkillLevel, a.level)
    for (const p of battle.state.player.passives) maxSkillLevel = Math.max(maxSkillLevel, p.level)
    return Math.max(0, Math.round(evalScoreFormula(formula, {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0, survivedSec: 0,
      accuracy: 0, maxCombo: 0, deaths: 0, itemsCollected: 0,
      bossKills: 0, stealthBonus: 0, colorTouches: 0,
      battlesWon: battle.state.battlesWon,
      bossDefeated: battle.state.bossDefeated ? 1 : 0,
      maxSkillLevel,
      traitsAcquired: battle.state.player.traits.length,
    })))
  }

  it('ギブアップで戦闘が終了しスコアが確定する', () => {
    const h = winningHarness()
    fightUntilBattleEnds(h)
    h.battle.selectDraft(0)
    h.battle.giveUp()
    expect(h.battle.state.status).toBe('finished')
    expect(h.battle.state.runOutcome).toBe('gaveup')
    expect(h.battle.playScore.value).toBe(expectedScore(h.battle))
    expect(h.battle.playScore.value).toBeGreaterThan(0)
  })

  it('終了後のギブアップは結果を上書きしない', () => {
    const h = winningHarness()
    h.battle.giveUp()
    const score = h.battle.playScore.value
    h.battle.giveUp()
    expect(h.battle.state.runOutcome).toBe('gaveup')
    expect(h.battle.playScore.value).toBe(score)
  })

  it('プレイヤーが倒れると敗北で終了する', () => {
    const h = losingHarness()
    for (let i = 0; i < MAX_TURNS && h.battle.state.status === 'battle'; i++) h.pass()
    expect(h.battle.state.status).toBe('finished')
    expect(h.battle.state.runOutcome).toBe('lost')
    expect(h.battle.state.player.alive).toBe(false)
  })

  it('ボスを倒すと勝利で終了する', () => {
    const h = winningHarness()
    for (let i = 0; i <= BATTLE.bossBattleIndex + 1; i++) {
      fightUntilBattleEnds(h)
      if (h.battle.state.status === 'finished') break
      if (h.battle.state.status === 'drafting') h.battle.selectDraft(0)
      if (h.battle.state.status === 'swapping') h.battle.confirmSwap(3)
    }
    expect(h.battle.state.bossDefeated).toBe(true)
    expect(h.battle.state.runOutcome).toBe('won')
    expect(h.battle.state.status).toBe('finished')
    expect(h.battle.playScore.value).toBe(expectedScore(h.battle))
  })

  it('ボス戦ではボスが1体だけ出現する', () => {
    const h = winningHarness()
    let sawBoss = false
    for (let i = 0; i <= BATTLE.bossBattleIndex + 1; i++) {
      if (h.battle.state.battleIndex === BATTLE.bossBattleIndex && h.battle.state.status === 'battle') {
        expect(h.battle.state.enemies).toHaveLength(1)
        expect(h.battle.state.enemies[0].isBoss).toBe(true)
        sawBoss = true
      }
      fightUntilBattleEnds(h)
      if (h.battle.state.status === 'finished') break
      if (h.battle.state.status === 'drafting') h.battle.selectDraft(0)
      if (h.battle.state.status === 'swapping') h.battle.confirmSwap(3)
    }
    expect(sawBoss).toBe(true)
  })
})

describe('useBattleState: UI 状態', () => {
  it('ステータス表示は基礎値と実効値を切り替えられる', () => {
    const { battle } = winningHarness()
    expect(battle.state.ui.statusPanelMode).toBe('effective')
    battle.toggleStatusMode()
    expect(battle.state.ui.statusPanelMode).toBe('base')
    battle.toggleStatusMode()
    expect(battle.state.ui.statusPanelMode).toBe('effective')
  })

  it('バフ差分表示・各パネルの折りたたみを切り替えられる', () => {
    const { battle } = winningHarness()
    battle.toggleBuffDiff()
    expect(battle.state.ui.showBuffDiff).toBe(false)
    battle.toggleStatusCollapsed()
    expect(battle.state.ui.statusPanelCollapsed).toBe(true)
    battle.toggleSkillListCollapsed()
    expect(battle.state.ui.skillListCollapsed).toBe(true)
  })

  it('UI 状態の変化が computed に反映される', () => {
    const { battle } = winningHarness()
    const collapsed = computed(() => battle.state.ui.skillListCollapsed)
    expect(collapsed.value).toBe(false)
    battle.toggleSkillListCollapsed()
    expect(collapsed.value).toBe(true)
  })

  it('閲覧済みスキルを記録できる', () => {
    const { battle } = winningHarness()
    battle.markSeen(['skill_strike', 'trait_stone_skin'])
    expect(battle.state.seenIds.has('skill_strike')).toBe(true)
    expect(battle.state.seenIds.has('trait_stone_skin')).toBe(true)
    expect(battle.state.seenIds.has('skill_fireball')).toBe(false)
  })

  it('エフェクトは発行順に取り出され、尽きたら undefined を返す', () => {
    const { battle, act } = winningHarness()
    act()
    const first = battle.effectQueue.value[0]?.effectId
    expect(battle.consumeEffect()?.effectId).toBe(first)
    for (let i = 0; i < 100 && battle.consumeEffect(); i++) { /* 空になるまで取り出す */ }
    expect(battle.consumeEffect()).toBeUndefined()
  })

  it('reset でエフェクトキューも空になる', () => {
    const { battle, act } = winningHarness()
    act()
    expect(battle.effectQueue.value.length).toBeGreaterThan(0)
    battle.reset()
    expect(battle.effectQueue.value).toHaveLength(0)
  })
})

describe('useBattleState: 1手番の演出', () => {
  /** set() されたコールバックを溜めておき、テストから任意の順で進めるスケジューラ */
  function manualScheduler(): {
    scheduler: BattleScheduler
    step: () => boolean
    runAll: () => void
    pending: () => number
  } {
    const queue = new Map<number, () => void>()
    let nextId = 1
    const scheduler: BattleScheduler = {
      set: (fn) => { const id = nextId++; queue.set(id, fn); return id },
      clear: (id) => { queue.delete(id) },
    }
    const step = (): boolean => {
      const first = queue.keys().next()
      if (first.done) return false
      const fn = queue.get(first.value) as () => void
      queue.delete(first.value)
      fn()
      return true
    }
    const runAll = (): void => { for (let i = 0; i < 200 && step(); i++) { /* 溜まった演出を消化する */ } }
    return { scheduler, step, runAll, pending: () => queue.size }
  }

  function pacedHarness(): { battle: Battle; sched: ReturnType<typeof manualScheduler> } {
    const sched = manualScheduler()
    const battle = useBattleState({ scheduler: sched.scheduler })
    battle.initRun(() => 0.5)
    return { battle, sched }
  }

  it('行動を選ぶとまずスキル名の提示になり、効果はまだ解決していない', () => {
    const { battle } = pacedHarness()
    const hpBefore = battle.state.enemies[0].hp
    battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
    expect(battle.presentation.phase).toBe('announce')
    expect(battle.presentation.actorIsPlayer).toBe(true)
    expect(battle.presentation.skillLabel).not.toBe('')
    expect(battle.state.enemies[0].hp).toBe(hpBefore)
  })

  it('提示中は次の行動を受け付けない', () => {
    const { battle } = pacedHarness()
    battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
    expect(battle.isPlayerTurn.value).toBe(false)
    expect(battle.isPresenting.value).toBe(true)
    const hp = battle.state.enemies[0].hp
    battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
    expect(battle.state.enemies[0].hp).toBe(hp)
  })

  it('提示が終わると効果が解決し、演出用のエフェクトが積まれる', () => {
    const { battle, sched } = pacedHarness()
    const hpBefore = battle.state.enemies[0].hp
    battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
    sched.step()
    expect(battle.presentation.phase).toBe('impact')
    expect(battle.state.enemies[0].hp).toBeLessThan(hpBefore)
    expect(battle.effectQueue.value.length).toBeGreaterThan(0)
  })

  it('敵の手番も同じ順序（提示 → 解決）で進み、攻撃者が誰か分かる', () => {
    const { battle, sched } = pacedHarness()
    battle.selectAction({ kind: 'builtin', action: 'pass' })
    sched.step()   // 提示 → 解決
    sched.step()   // 解決 → 次の手番（敵の提示）
    // 敵の方がAGIで劣る初期値なので、プレイヤーの次に敵の手番が来る
    expect(battle.presentation.phase).toBe('announce')
    expect(battle.presentation.actorIsPlayer).toBe(false)
    expect(battle.presentation.actorId).toBe(battle.state.enemies[0].id)
  })

  it('攻撃者は解決が終わるまで攻撃モーションのままになる', () => {
    const { battle, sched } = pacedHarness()
    battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
    expect(battle.presentation.posingId).toBe(battle.state.player.id)
    sched.step()
    expect(battle.presentation.posingId).toBe(battle.state.player.id)
  })

  it('ギブアップすると保留中の演出は流れず、結果を上書きしない', () => {
    const { battle, sched } = pacedHarness()
    battle.selectAction({ kind: 'active', slotIndex: 0 }, null)
    expect(sched.pending()).toBeGreaterThan(0)
    battle.giveUp()
    expect(sched.pending()).toBe(0)
    sched.runAll()
    expect(battle.state.status).toBe('finished')
    expect(battle.state.runOutcome).toBe('gaveup')
    expect(battle.presentation.phase).toBe('idle')
  })

  it('戦闘ごとに背景が決まり、直前と同じ場所は続かない', () => {
    const h = winningHarness()
    const first = h.battle.state.backgroundId
    expect(first).toBeTruthy()
    fightUntilBattleEnds(h)
    h.battle.selectDraft(0)
    expect(h.battle.state.backgroundId).toBeTruthy()
    expect(h.battle.state.backgroundId).not.toBe(first)
  })

  // effectiveOf 等の表示用ヘルパーが内部で toRaw(c) を経由していたため、その先で読む
  // passives/traits/temporary への依存が Vue のリアクティビティに一切追跡されず、
  // これらに依存する computed（ステータスパネル/INFOの実効値表示など）がパッシブ取得後も
  // 更新されない不具合があった。temporary モディファイア（避ける選択時の回避率一時バフ）を
  // 使い、ドラフトのRNGに依存しない形で再発を検知する。
  // pacedHarness で announce→impact の1段だけ進め、useBuiltinAction がバフを
  // 付けた直後（endOfRound で thisTurn スコープが消える前）の値を見る。
  it('避ける選択の一時的な回避率バフが effectiveOf の computed に反映される', () => {
    const { battle, sched } = pacedHarness()
    const evadeRate = computed(() => battle.effectiveOf(battle.state.player).evadeRate)
    const before = evadeRate.value
    battle.selectAction({ kind: 'builtin', action: 'dodge' })
    sched.step()
    expect(evadeRate.value).toBeGreaterThan(before)
  })
})
