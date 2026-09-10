/**
 * composables/useBattleState.ts
 * rpg ジャンル（ローグライク戦闘）の ViewModel。docs/genre/rpg/10-state.md 準拠。
 *
 * ドメインロジック（src/domain/battle/*）はプレーンなオブジェクトを受け取る純粋関数として
 * 実装されている。ここで reactive にラップし、進行の「間」（スキル名の提示 → 効果の解決）を
 * スケジューラ越しに刻む。スケジューラは差し替え可能で、既定は同期実行なので
 * テストからは1手番が即座に解決する（演出待ちのためにタイマーを進める必要がない）。
 */

import { reactive, readonly, ref, computed, type DeepReadonly } from 'vue'
import type {
  BattleState, Combatant, PlayerAction, DraftOption, EffectRequest,
  CategoryId, EffectiveStats, Element, ActiveSkillDef, GrowthStatKey,
} from '../domain/battle/types'

/** state: readonly(state) から UI へ渡る Combatant の実体型（配列も再帰的に readonly になる） */
export type CombatantView = DeepReadonly<Combatant>
import { CATEGORY_IDS, BUILTIN_SKILL_ID } from '../domain/battle/types'
import {
  initPlayer, spawnEnemyFromDef, pickEnemyDefs, resolveEffectiveStats,
  resolvePlayerFocus, useActiveSkill, useBuiltinAction, hasReplaceGuard,
  enemyTakeTurn, endOfRound, checkBattleOutcome, finishBattleOnVictory,
  buildBattleScoreVars, isTrueClearBattleIndex,
} from '../domain/battle/battleEngine'
import { buildTurnQueue, previewEnemyNextSkill } from '../domain/battle/turnQueue'
import {
  rollDraft, applyDraftChoice,
  accumulateCategoryPoints, categoryContributionsOf,
} from '../domain/battle/skillDraft'
import type { CategoryContribution } from '../domain/battle/skillDraft'
import { syncCompleteBonus } from '../domain/battle/completeBonus'
import { beginBattleStatsDebug, endBattleStatsDebug } from '../debug/battleStatsDebug'
import {
  confirmSwap as confirmSwapSkill, equipToFreeSlot, unequipActive as unequipActiveSkill,
  allocateSkillPoint as allocateSkillPointOn, deallocateSkillPoint as deallocateSkillPointOn,
  setStatAllocation as setStatAllocationOn, resetStatAllocations as resetStatAllocationsOn,
} from '../domain/battle/skillPanel'
import { pickBackgroundId } from '../domain/battle/backdrop'
import { estimateSkillDamage } from '../domain/battle/damagePreview'
import { estimateHitCount } from '../domain/battle/effectTiming'
import { BATTLE_CONTENT } from '../data/rpg/battleContent'
import { BATTLE_BACKGROUNDS } from '../data/rpg/battleBackgrounds'
import { BATTLE, ENCOUNTER_GROUPS, SKILL_POINTS } from '../data/tunables'
import { evalScoreFormula } from '../domain/scoreCalc'
import type { ScoreVars } from '../domain/types'
import { GENRES } from '../data/genres'

const RPG_SCORE_FORMULA_FALLBACK = 'battlesWon * 150 + avgStat * 4 + bossDefeated * 500 + maxSkillLevel * 100 + traitsAcquired * 80'

/**
 * 「間」の作り方の差し替え口。
 * 既定（同期実行）ではコールバックが即座に走るため、演出を挟まずに戦闘だけが進む。
 */
export interface BattleScheduler {
  set(fn: () => void, ms: number): number
  clear(id: number): void
}

const IMMEDIATE_SCHEDULER: BattleScheduler = {
  set: (fn) => { fn(); return 0 },
  clear: () => { /* 同期実行のため取り消すものがない */ },
}

/** 実時間で待つスケジューラ。App.vue（実プレイ）から渡す */
export const TIMED_SCHEDULER: BattleScheduler = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
}

/** 進行中の1手番をUIへ伝える表示専用の状態（BattleState には持たせない） */
export interface BattlePresentation {
  phase: 'idle' | 'announce' | 'impact'
  actorId: string | null
  actorIsPlayer: boolean
  skillId: string | null
  skillLabel: string
  element: Element | null
  /** 攻撃モーションを取っている参加者。スプライトを attack フレームへ切り替える */
  posingId: string | null
  /** 同じスキルを連続で使ってもアニメーションを撃ち直すための連番 */
  seq: number
}

function idlePresentation(): BattlePresentation {
  return {
    phase: 'idle', actorId: null, actorIsPlayer: false,
    skillId: null, skillLabel: '', element: null, posingId: null, seq: 0,
  }
}

function zeroCategoryPoints(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>
  for (const id of CATEGORY_IDS) out[id] = 0
  return out
}

function freshState(rng: () => number = Math.random): BattleState {
  return {
    battleIndex: 0, battlesWon: 0, bossDefeated: false, bossesDefeatedCount: 0, runOutcome: null,
    player: initPlayer(rng),
    enemies: [],
    turnQueue: [], turnIndex: 0, roundCount: 0,
    status: 'battle',
    backgroundId: null,
    draftOptions: null,
    pendingSwapSkillId: null,
    categoryPoints: zeroCategoryPoints(),
    rerollCharges: 0,
    pendingDraftRounds: 1,
    skillPoints: 0,
    statAllocations: { hp: 0, str: 0, def: 0, int: 0, ref: 0, agi: 0 },
    statPoints: 0,
    seenIds: new Set(),
    ui: { statusPanelMode: 'effective', showBuffDiff: true, statusPanelCollapsed: false, skillListCollapsed: false },
    playScore: 0,
    lastBattleEndNotices: [],
  }
}

const BUILTIN_LABEL: Record<'guard' | 'dodge' | 'pass', string> = {
  guard: '守る', dodge: '避ける', pass: '様子を見る',
}

export function useBattleState(options: { scheduler?: BattleScheduler } = {}) {
  const scheduler = options.scheduler ?? IMMEDIATE_SCHEDULER
  /**
   * 戦闘の全状態。ドメイン層(battleEngine/skillDraft)へはこの reactive オブジェクトを
   * そのまま渡す。
   *
   * 【実装時に発見した不具合】当初 toRaw(state) を渡していたが、これは誤りだった。
   * toRaw() は state から生の(非プロキシ)オブジェクトを取り出すため、ドメイン層が
   * それに対して行う push/プロパティ代入（player.actives.push(...) 等）は Vue の
   * リアクティブ Proxy の trap を一切経由せず、trigger() が呼ばれないため画面が
   * 更新されない（実機確認: ドラフトでスキルを選んでも一覧・スロットに反映されず、
   * 次の描画更新のたびに"たまたま"最新値を読むまで古い表示のまま残る不具合が発生した）。
   *
   * 10-state.md の「readonly プロキシへの書き込みが no-op になる」という注意は、
   * gameState.rules のような readonly() でラップされたプロキシに書き込もうとする
   * ケースを指しており、本コンポーザブルの state は readonly ではなく通常の
   * reactive() なので、toRaw() を通さずそのまま渡すのが正しい。
   */
  const state = reactive<BattleState>(freshState())
  const effectQueue = ref<EffectRequest[]>([])
  const presentation = reactive<BattlePresentation>(idlePresentation())
  let rng: () => number = Math.random
  let initialized = false

  // reset()/giveUp() を跨いだ古いコールバックが新しい状態を書き換えないための世代番号
  let generation = 0
  let pendingTimers: number[] = []
  let seq = 0
  /**
   * プレイヤーが選んだ行動を、行動速度キューが組み上がって実際にプレイヤーの手番が
   * 巡ってくるまで一時的に保持する（selectAction で確定 → processTurns が消費）。
   * 行動順そのものは selectAction の中で（プレイヤーが行動を決めた瞬間に）確定するため、
   * 「決めた瞬間」と「実際に処理される瞬間」がズレうる（先手を取れない相手が先攻の場合等）。
   */
  let pendingPlayerAction: { action: PlayerAction; centerEnemyIndex: number | null } | null = null

  const content = BATTLE_CONTENT
  const timing = BATTLE.presentation

  function emit(req: EffectRequest): void {
    effectQueue.value.push(req)
  }

  /**
   * 次の手番へ進むまでの待ち時間。連続攻撃(repeat)は timing.impactMs という固定値だけを
   * 待っていたため、多段ヒットの演出（multiHitIntervalMs間隔で後追い再生される）が終わる前に
   * 次の手番が始まってしまっていた。ヒット数（対象数ぶんも含む）に応じて待ち時間を伸ばす
   */
  function impactWaitMs(def: ActiveSkillDef, targetCount: number): number {
    const hitCount = estimateHitCount(def.effect) * Math.max(1, targetCount)
    return timing.impactMs + Math.max(0, hitCount - 1) * BATTLE.multiHitIntervalMs
  }

  /**
   * 演出待ちを1つ積む。世代が変わっていたら実行しない。
   * 同期スケジューラでは set() の中でコールバックが走り切るため、
   * 取り消し用のIDを控える前に完了しうる（done で見分ける）。
   */
  function after(ms: number, fn: () => void): void {
    const myGeneration = generation
    let id = -1
    let done = false
    id = scheduler.set(() => {
      done = true
      pendingTimers = pendingTimers.filter(t => t !== id)
      if (myGeneration !== generation) return
      fn()
    }, ms)
    if (!done) pendingTimers.push(id)
  }

  function cancelPending(): void {
    for (const id of pendingTimers) scheduler.clear(id)
    pendingTimers = []
  }

  // ── ライフサイクル ────────────────────────────────────────────
  function initRun(customRng: () => number = Math.random): void {
    if (initialized) return
    initialized = true
    generation++
    cancelPending()
    rng = customRng
    Object.assign(state, freshState(rng))
    effectQueue.value = []
    Object.assign(presentation, idlePresentation())
    startBattle()
  }

  function reset(): void {
    initialized = false
    generation++
    cancelPending()
    Object.assign(state, freshState())
    Object.assign(presentation, idlePresentation())
    effectQueue.value = []
  }

  // ── 戦闘開始 ──────────────────────────────────────────────────
  function startBattle(): void {
    const picks = pickEnemyDefs(content, state.battleIndex, rng)
    state.enemies = picks.map((p, i) => spawnEnemyFromDef(p.def, i, p.statsOverride))
    state.backgroundId = pickBackgroundId(
      BATTLE_BACKGROUNDS, picks.some(p => p.def.isBoss), state.backgroundId, rng,
    )
    state.status = 'battle'
    state.lastBattleEndNotices = []
    // roundCount はターン表示（turnNumber）の元。リセットしないとラン全体を通して
    // 増え続け、2戦目以降「前の戦闘の続きから始まっているように見える」（実機で確認）。
    state.roundCount = 0
    beginBattleStatsDebug(state.battleIndex, resolveEffectiveStats(state.player, content))
    startNewRound()
  }

  /**
   * 行動速度キューは「ラウンド開始時」にはまだ組み立てない（ユーザー確定仕様）。
   * プレイヤーが行動を決めた瞬間（selectAction）に、その行動の先手フラグを反映して初めて
   * 組み立てる。ここでは入力待ち状態（turnQueueが空）に戻すだけ。
   */
  function startNewRound(): void {
    state.turnQueue = []
    state.turnIndex = 0
    pendingPlayerAction = null
    clearPresentation()
  }

  // ── ターン進行 ────────────────────────────────────────────────
  function findCombatant(id: string): Combatant | undefined {
    if (state.player.id === id) return state.player
    return state.enemies.find(e => e.id === id)
  }

  /** 指定したスキルIDが alwaysActsFirst を持つか（未指定・存在しない・passive/traitはfalse） */
  function skillAlwaysActsFirst(skillId: string | null): boolean {
    if (!skillId) return false
    const def = content.skills.get(skillId)
    return !!(def && def.kind === 'active' && def.alwaysActsFirst)
  }

  /** 敵がこのラウンドで使う予定のスキル（プレビュー、消費はしない）が alwaysActsFirst を持つか */
  function enemyAlwaysActsFirst(enemy: Combatant): boolean {
    return skillAlwaysActsFirst(previewEnemyNextSkill(enemy, content, state.roundCount))
  }

  /** 次に動く参加者を探す。プレイヤーの番なら、selectAction で確定済みの行動を実行する */
  function processTurns(): void {
    for (;;) {
      if (state.turnIndex >= state.turnQueue.length) { finishRound(); return }
      const entry = state.turnQueue[state.turnIndex]
      const combatant = findCombatant(entry.combatantId)
      if (!combatant || !combatant.alive) { state.turnIndex++; continue }
      // 不意打ち等で行動をキャンセルされた対象は、1回だけ飛ばす（消費したらフラグは戻す）
      if (combatant.skipNextTurn) {
        combatant.skipNextTurn = false
        if (combatant.isPlayer) pendingPlayerAction = null
        state.turnIndex++
        continue
      }
      if (combatant.isPlayer) {
        // 行動速度キューにプレイヤーが含まれている時点で、それを組み立てた selectAction が
        // 必ず pendingPlayerAction を設定済み（同じ関数の中で行っている）
        const pending = pendingPlayerAction as { action: PlayerAction; centerEnemyIndex: number | null }
        pendingPlayerAction = null
        executePlayerAction(pending.action, pending.centerEnemyIndex)
        return
      }
      runEnemyTurn(combatant)
      return
    }
  }

  function finishRound(): void {
    endOfRound(state, content, emit)
    const outcome = checkBattleOutcome(state)
    if (outcome !== 'ongoing') { handleOutcome(outcome); return }
    startNewRound()
  }

  function announce(actor: Combatant, skillId: string | null, fallbackLabel = ''): void {
    const def = skillId ? content.skills.get(skillId) : undefined
    const active = def && def.kind === 'active' ? (def as ActiveSkillDef) : undefined
    presentation.phase = 'announce'
    presentation.actorId = actor.id
    presentation.actorIsPlayer = actor.isPlayer
    presentation.skillId = skillId
    presentation.skillLabel = def?.label ?? fallbackLabel
    presentation.element = active?.element ?? null
    presentation.posingId = actor.id
    presentation.seq = ++seq
  }

  function clearPresentation(): void {
    Object.assign(presentation, idlePresentation())
  }

  function runEnemyTurn(enemy: Combatant): void {
    const skillId = previewEnemyNextSkill(enemy, content, state.roundCount)
    announce(enemy, skillId, '様子を見ている')
    after(timing.announceMs, () => {
      presentation.phase = 'impact'
      enemyTakeTurn({ state, content, enemy, player: state.player, rng, emit })
      // 敵から見た対象は常にプレイヤー1体（味方は存在しない）なので targetCount は常に1
      const skillDef = skillId ? content.skills.get(skillId) : undefined
      const waitMs = skillDef && skillDef.kind === 'active' ? impactWaitMs(skillDef, 1) : timing.impactMs
      after(waitMs, () => { afterAction() })
    })
  }

  /** 1手番の解決が終わったあと、勝敗を見てから次の手番へ送る */
  function afterAction(): void {
    presentation.posingId = null
    state.turnIndex++
    const outcome = checkBattleOutcome(state)
    if (outcome !== 'ongoing') {
      clearPresentation()
      after(timing.battleEndMs, () => { handleOutcome(outcome) })
      return
    }
    processTurns()
  }

  function handleOutcome(outcome: 'won' | 'lost'): void {
    clearPresentation()
    endBattleStatsDebug(state.roundCount)
    if (outcome === 'won') {
      // finishBattleOnVictory が battleIndex を内部でインクリメントするため、
      // 「今終わった戦闘が何戦目だったか」は真のクリア判定に使うので先に控えておく
      const finishedBattleIndex = state.battleIndex
      finishBattleOnVictory(state, content)
      const trueClear = state.bossDefeated && isTrueClearBattleIndex(finishedBattleIndex, ENCOUNTER_GROUPS)
      if (trueClear) {
        state.runOutcome = 'won'
        state.status = 'finished'
        finalizeScore()
        return
      }
      // ボス撃破の見返り: 通常1回のところ、ボス撃破時はドラフトを bossDraftRounds 回連続で行う
      state.pendingDraftRounds = state.bossDefeated ? ENCOUNTER_GROUPS.bossDraftRounds : 1
      state.status = 'drafting'
      state.draftOptions = rollDraft(state.player, content, rng, state.battleIndex)
    } else {
      state.runOutcome = 'lost'
      state.status = 'finished'
      finalizeScore()
    }
  }

  function finalizeScore(): void {
    const battleVars = buildBattleScoreVars(state, content)
    const formula = GENRES.find(g => g.id === 'rpg')?.scoreFormula ?? RPG_SCORE_FORMULA_FALLBACK
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0, survivedSec: 0,
      accuracy: 0, maxCombo: 0, deaths: 0, itemsCollected: 0,
      bossKills: 0, stealthBonus: 0, colorTouches: 0,
      hitsOnBoss: 0, maxHitCombo: 0,
      ...battleVars,
    }
    state.playScore = Math.max(0, Math.round(evalScoreFormula(formula, vars)))
  }

  // ── プレイヤーの行動 ──────────────────────────────────────────
  /**
   * 行動速度キューが空＝まだ今ラウンドの行動を誰も決めていない（プレイヤーが決めた瞬間に
   * selectAction がキューを組み立てる）ため、「プレイヤーの入力を待つべきか」はキューの
   * 有無だけで判定できる。キューが組み上がった後は、実際にプレイヤーの番が来るまで
   * processTurns が他の参加者（先手を取った相手 等）を先に処理する。
   */
  const isPlayerTurn = computed(() =>
    state.status === 'battle'
    && presentation.phase === 'idle'
    && state.turnQueue.length === 0,
  )

  const isPresenting = computed(() => presentation.phase !== 'idle')

  const guardOrDodge = computed<'guard' | 'dodge'>(() =>
    hasReplaceGuard(state.player, content) ? 'dodge' : 'guard',
  )

  /** プレイヤーが選んだ行動に対応するスキルID（builtinはBUILTIN_SKILL_ID経由） */
  function playerActionSkillId(action: PlayerAction): string | null {
    if (action.kind === 'builtin') return BUILTIN_SKILL_ID[action.action]
    return state.player.actives.find(a => a.slotIndex === action.slotIndex)?.id ?? null
  }

  /**
   * プレイヤーの行動を確定する。ユーザー確定仕様: 行動速度キューは「ラウンド開始時」ではなく
   * 「プレイヤーが行動を決めたこの瞬間」に組み立てる。守る/避ける/不意打ち等の
   * alwaysActsFirst を持つ行動を選んだかどうかを、ここで初めてキューへ反映できる。
   */
  function selectAction(action: PlayerAction, centerEnemyIndex: number | null = null): void {
    if (!isPlayerTurn.value) return
    const player = state.player

    if (action.kind === 'active') {
      const owned = player.actives.find(a => a.slotIndex === action.slotIndex)
      if (!owned || owned.cooldown > 0) return
      const def = content.skills.get(owned.id)
      if (!def || def.kind !== 'active') return
      if (def.minRound !== undefined && state.roundCount < def.minRound) return
    }

    const playerAlwaysFirst = skillAlwaysActsFirst(playerActionSkillId(action))
    state.turnQueue = buildTurnQueue(
      [player, ...state.enemies],
      c => resolveEffectiveStats(c, content).agi,
      c => (c.isPlayer ? playerAlwaysFirst : enemyAlwaysActsFirst(c)),
    )
    state.turnIndex = 0
    pendingPlayerAction = { action, centerEnemyIndex }
    processTurns()
  }

  /** selectAction で確定済みの行動を、実際にプレイヤーの番が来た時点で実行する */
  function executePlayerAction(action: PlayerAction, centerEnemyIndex: number | null): void {
    const player = state.player

    if (action.kind === 'builtin') {
      announce(player, null, BUILTIN_LABEL[action.action])
      after(timing.announceMs, () => {
        presentation.phase = 'impact'
        useBuiltinAction(player, action.action)
        if (action.action !== 'pass') {
          emit({
            effectId: action.action === 'guard' ? 'fx_guard' : 'fx_evade',
            targetRef: 'source', combatantId: player.id,
          })
        }
        after(timing.impactMs, () => { afterAction() })
      })
      return
    }

    // selectAction 側で妥当性を確認済み（枠・CT・minRound）。ここでは実行するのみ
    const owned = player.actives.find(a => a.slotIndex === action.slotIndex)
    const def = owned && content.skills.get(owned.id)
    if (!owned || !def || def.kind !== 'active') { afterAction(); return }

    announce(player, owned.id)
    after(timing.announceMs, () => {
      presentation.phase = 'impact'
      const targets = resolvePlayerFocus(
        { side: def.defaultFocus, range: def.focusRange }, player, state.enemies, centerEnemyIndex, rng,
      )
      useActiveSkill({ state, content, source: player, skillId: owned.id, level: owned.level, targets, rng, emit })
      // transformsInto で owned.id が変化している場合があるため、クールダウンは使用後の id で改めて引く
      const usedDef = content.skills.get(owned.id)
      owned.cooldown = usedDef && usedDef.kind === 'active' ? usedDef.cooldown : 0
      after(impactWaitMs(def, targets.length), () => { afterAction() })
    })
  }

  // ── ドラフト ──────────────────────────────────────────────────
  function selectDraft(index: number): void {
    if (state.status !== 'drafting' || !state.draftOptions) return
    const option = state.draftOptions[index]
    if (!option) return
    applyDraftChoice(state, option)
    syncCompleteBonus(state.player, content)
    state.draftOptions = null
    proceedAfterDraftRound()
  }

  /**
   * 入れ替え先の枠を確定する。第7フェーズ以降、'swapping' は必ずスキルパネル
   * （selectStoredActiveToEquip）から入るため、確定後はパネルへ戻る。
   */
  function confirmSwap(targetSlotIndex: number): void {
    if (state.status !== 'swapping' || !state.pendingSwapSkillId) return
    confirmSwapSkill(state.player, state.pendingSwapSkillId, targetSlotIndex)
    state.pendingSwapSkillId = null
    state.status = 'skillPanel'
  }

  function cancelSwap(): void {
    state.pendingSwapSkillId = null
    state.status = 'skillPanel'
  }

  /**
   * 1回分のドラフトが終わった直後に呼ぶ。残りドラフト回数（ボス撃破時の3連続等）が
   * あれば次のドラフトへ。無ければ、panelIntervalBattles 戦ごとにスキルパネルを挟んでから
   * 次の戦闘へ進む（真のクリア済みならこの関数自体が呼ばれない点に注意 = handleOutcome 側で完結）
   */
  function proceedAfterDraftRound(): void {
    if (state.pendingDraftRounds > 1) {
      state.pendingDraftRounds--
      state.status = 'drafting'
      state.draftOptions = rollDraft(state.player, content, rng, state.battleIndex)
      return
    }
    state.pendingDraftRounds = 1
    if (state.battlesWon > 0 && state.battlesWon % SKILL_POINTS.panelIntervalBattles === 0) {
      const occurrence = state.battlesWon / SKILL_POINTS.panelIntervalBattles
      const cycle = SKILL_POINTS.panelSkillPointsCycle
      state.skillPoints += cycle[(occurrence - 1) % cycle.length]
      state.statPoints += SKILL_POINTS.panelStatPoints
      state.status = 'skillPanel'
      return
    }
    startBattle()
  }

  // ── スキルパネル（5戦ごとのポイント配分） ───────────────────────
  /** 倉庫中のアクティブを装備する。空き枠があれば即座に、無ければ入れ替え画面へ */
  function selectStoredActiveToEquip(activeId: string): void {
    if (state.status !== 'skillPanel') return
    if (equipToFreeSlot(state.player, activeId)) return
    state.pendingSwapSkillId = activeId
    state.status = 'swapping'
  }

  function unequipActive(activeId: string): void {
    if (state.status !== 'skillPanel') return
    unequipActiveSkill(state, activeId)
  }

  function allocateSkillPoint(activeId: string, amount = 1): void {
    if (state.status !== 'skillPanel') return
    allocateSkillPointOn(state, activeId, amount)
  }

  function deallocateSkillPoint(activeId: string, amount = 1): void {
    if (state.status !== 'skillPanel') return
    deallocateSkillPointOn(state, activeId, amount)
  }

  function setStatAllocation(stat: GrowthStatKey, amount: number): void {
    if (state.status !== 'skillPanel') return
    setStatAllocationOn(state, stat, amount)
  }

  function resetStatAllocations(): void {
    if (state.status !== 'skillPanel') return
    resetStatAllocationsOn(state)
  }

  /** パネルを閉じて次の戦闘へ進む */
  function closeSkillPanel(): void {
    if (state.status !== 'skillPanel') return
    startBattle()
  }

  /** ドラフトの3択を引き直す。リロール回数を1消費する */
  function rerollDraft(): void {
    if (state.status !== 'drafting' || state.rerollCharges <= 0) return
    state.rerollCharges--
    state.draftOptions = rollDraft(state.player, content, rng, state.battleIndex)
  }

  // ── 終了 ──────────────────────────────────────────────────────
  function giveUp(): void {
    if (state.status === 'finished') return
    generation++          // 進行中の演出が終了後の状態を書き換えないようにする
    cancelPending()
    clearPresentation()
    endBattleStatsDebug(state.roundCount)
    state.runOutcome = 'gaveup'
    state.status = 'finished'
    finalizeScore()
  }

  // ── UI ────────────────────────────────────────────────────────
  function toggleStatusMode(): void {
    state.ui.statusPanelMode = state.ui.statusPanelMode === 'base' ? 'effective' : 'base'
  }
  function toggleBuffDiff(): void {
    state.ui.showBuffDiff = !state.ui.showBuffDiff
  }
  function toggleStatusCollapsed(): void {
    state.ui.statusPanelCollapsed = !state.ui.statusPanelCollapsed
  }
  function toggleSkillListCollapsed(): void {
    state.ui.skillListCollapsed = !state.ui.skillListCollapsed
  }
  function markSeen(ids: readonly string[]): void {
    for (const id of ids) state.seenIds.add(id)
  }
  function consumeEffect(): EffectRequest | undefined {
    return effectQueue.value.shift()
  }

  // ── 表示用ヘルパー ────────────────────────────────────────────
  // readonly(state) 経由で渡ってくる Combatant は配列も含め deep readonly になる。
  //
  // 【実装時に発見した不具合】当初は toRaw(c) で素のオブジェクトへ戻してから
  // resolveEffectiveStats 等の純粋な参照関数に渡していたが、これは表示上のバグの
  // 原因だった。toRaw() は Vue のリアクティブ Proxy を完全に迂回するため、
  // その先で読む c.passives / c.traits / c.temporary への依存が一切追跡されない。
  // 結果、これらを使う computed（実効ステータスの表示など）はパッシブ/特性を
  // 取得しても再計算されず、初回評価時点の値のまま固まってしまっていた
  // （実機確認: パッシブを取ってもステータスパネル・INFO の実効値が更新されない）。
  // toRaw は元々「Combatant 型が要求する可変配列と DeepReadonly の配列の型不一致」を
  // 逃がすためだけに使っていた（これらの関数はどれも c を読むだけで書き換えない）ので、
  // リアクティビティを保ったまま型だけ迂回する `as unknown as Combatant` に置き換える。
  function effectiveOf(c: CombatantView): EffectiveStats {
    return resolveEffectiveStats(c as unknown as Combatant, content)
  }
  function nextEnemySkillPreview(e: CombatantView): string | null {
    return previewEnemyNextSkill(e as unknown as Combatant, content, state.roundCount)
  }
  /** 敵がそのスキルを使ったとき、プレイヤーがどれくらい削られるかの見積り */
  function estimateDamageToPlayer(e: CombatantView, skillId: string, level: number): number {
    const def = content.skills.get(skillId)
    if (!def) return 0
    return estimateSkillDamage({
      source: e as unknown as Combatant,
      target: state.player,
      skill: def,
      level,
      content,
      getEffective: c => resolveEffectiveStats(c, content),
    })
  }
  function draftOptionLabel(opt: DraftOption): { label: string; flavorText: string } | null {
    if (opt.isFallback) return null
    const def = opt.kind === 'trait' ? content.traits.get(opt.id) : content.skills.get(opt.id)
    if (!def) return null
    return { label: def.label, flavorText: def.flavorText }
  }
  /** 所持スキルから貯まっているカテゴリポイントを求める（カテゴリ一覧パネル用） */
  function categoryPointsOf(c: CombatantView): Record<CategoryId, number> {
    return accumulateCategoryPoints(c as unknown as Combatant, content)
  }
  /** カテゴリ1つぶんの内訳（何のスキルが何ポイント効いているか） */
  function categoryContributions(c: CombatantView, category: CategoryId): CategoryContribution[] {
    return categoryContributionsOf(c as unknown as Combatant, content, category)
  }

  /** 画面右上の通し表示。ラウンド・戦闘数はいずれも0始まりなので+1して数える */
  const turnNumber = computed(() => state.roundCount + 1)
  const battleNumber = computed(() => state.battleIndex + 1)

  return {
    state: readonly(state),
    effectQueue: readonly(effectQueue),
    presentation: readonly(presentation),
    playScore: computed(() => state.playScore),
    isPlayerTurn,
    isPresenting,
    guardOrDodge,
    turnNumber,
    battleNumber,

    initRun,
    reset,
    selectAction,
    selectDraft,
    confirmSwap,
    cancelSwap,
    rerollDraft,
    selectStoredActiveToEquip,
    unequipActive,
    allocateSkillPoint,
    deallocateSkillPoint,
    setStatAllocation,
    resetStatAllocations,
    closeSkillPanel,
    giveUp,

    toggleStatusMode,
    toggleBuffDiff,
    toggleStatusCollapsed,
    toggleSkillListCollapsed,
    markSeen,
    consumeEffect,

    effectiveOf,
    nextEnemySkillPreview,
    estimateDamageToPlayer,
    draftOptionLabel,
    categoryPointsOf,
    categoryContributions,
  }
}
