/**
 * composables/useBattleState.ts
 * rpg ジャンル（ローグライク戦闘）の ViewModel。docs/genre/rpg/10-state.md 準拠。
 *
 * ドメインロジック（src/domain/battle/*）はプレーンなオブジェクトを受け取る純粋関数として
 * 実装されている。ここで reactive にラップし、進行の「間」（スキル名の提示 → 効果の解決）を
 * スケジューラ越しに刻む。スケジューラは差し替え可能で、既定は同期実行なので
 * テストからは1手番が即座に解決する（演出待ちのためにタイマーを進める必要がない）。
 */

import { reactive, readonly, ref, computed, toRaw, type DeepReadonly } from 'vue'
import type {
  BattleState, Combatant, PlayerAction, DraftOption, EffectRequest,
  CategoryId, EffectiveStats, Element, ActiveSkillDef,
} from '../domain/battle/types'

/** state: readonly(state) から UI へ渡る Combatant の実体型（配列も再帰的に readonly になる） */
export type CombatantView = DeepReadonly<Combatant>
import { CATEGORY_IDS } from '../domain/battle/types'
import {
  initPlayer, spawnEnemyFromDef, pickEnemyDefs, resolveEffectiveStats,
  resolvePlayerFocus, useActiveSkill, useBuiltinAction, hasReplaceGuard,
  enemyTakeTurn, endOfRound, checkBattleOutcome, finishBattleOnVictory,
  buildBattleScoreVars,
} from '../domain/battle/battleEngine'
import { buildTurnQueue, previewEnemyNextSkill } from '../domain/battle/turnQueue'
import { rollDraft, applyDraftChoice, confirmSwap as confirmSwapSkill } from '../domain/battle/skillDraft'
import { pickBackgroundId } from '../domain/battle/backdrop'
import { estimateSkillDamage } from '../domain/battle/damagePreview'
import { BATTLE_CONTENT } from '../data/battleContent'
import { BATTLE_BACKGROUNDS } from '../data/battleBackgrounds'
import { BATTLE } from '../data/tunables'
import { evalScoreFormula } from '../domain/scoreCalc'
import type { ScoreVars } from '../domain/types'
import { GENRES } from '../data/genres'

const RPG_SCORE_FORMULA_FALLBACK = 'battlesWon * 300 + bossDefeated * 3000 + maxSkillLevel * 200 + traitsAcquired * 150'

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

function freshState(): BattleState {
  return {
    battleIndex: 0, battlesWon: 0, bossDefeated: false, runOutcome: null,
    player: initPlayer(Math.random),
    enemies: [],
    turnQueue: [], turnIndex: 0, roundCount: 0,
    status: 'battle',
    backgroundId: null,
    draftOptions: null,
    pendingSwapSkillId: null,
    categoryPoints: zeroCategoryPoints(),
    seenIds: new Set(),
    ui: { statusPanelMode: 'effective', showBuffDiff: true, statusPanelCollapsed: false, skillListCollapsed: false },
    playScore: 0,
    lastBattleEndNotices: [],
  }
}

const BUILTIN_LABEL: Record<'guard' | 'dodge' | 'pass', string> = {
  guard: '守る', dodge: '様子を見る', pass: '何もしていない',
}

export function useBattleState(options: { scheduler?: BattleScheduler } = {}) {
  const scheduler = options.scheduler ?? IMMEDIATE_SCHEDULER
  const state = reactive<BattleState>(freshState())
  const effectQueue = ref<EffectRequest[]>([])
  const presentation = reactive<BattlePresentation>(idlePresentation())
  let rng: () => number = Math.random
  let initialized = false

  // reset()/giveUp() を跨いだ古いコールバックが新しい状態を書き換えないための世代番号
  let generation = 0
  let pendingTimers: number[] = []
  let seq = 0

  const content = BATTLE_CONTENT
  const timing = BATTLE.presentation

  /**
   * ドメイン層(battleEngine/skillDraft)へ渡す BattleState を返す。
   *
   * 【実装時に発見した不具合】当初 toRaw(state) を返していたが、これは誤りだった。
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
  function raw(): BattleState {
    return state
  }

  function emit(req: EffectRequest): void {
    effectQueue.value.push(req)
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
    const fresh = freshState()
    fresh.player = initPlayer(rng)
    Object.assign(state, fresh)
    state.categoryPoints = zeroCategoryPoints()
    state.seenIds = new Set()
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
    const r = raw()
    const defs = pickEnemyDefs(content, r.battleIndex, rng)
    state.enemies = defs.map((d, i) => spawnEnemyFromDef(d, i))
    state.backgroundId = pickBackgroundId(
      BATTLE_BACKGROUNDS, defs.some(d => d.isBoss), state.backgroundId, rng,
    )
    state.status = 'battle'
    state.lastBattleEndNotices = []
    startNewRound()
  }

  function startNewRound(): void {
    const r = raw()
    const queue = buildTurnQueue([r.player, ...r.enemies], c => resolveEffectiveStats(c, content).agi)
    state.turnQueue = queue
    state.turnIndex = 0
    processTurns()
  }

  // ── ターン進行 ────────────────────────────────────────────────
  function findCombatant(id: string): Combatant | undefined {
    const r = raw()
    if (r.player.id === id) return r.player
    return r.enemies.find(e => e.id === id)
  }

  /** 次に動く参加者を探す。プレイヤーなら入力待ちで抜け、敵なら演出付きで行動させる */
  function processTurns(): void {
    for (;;) {
      if (state.turnIndex >= state.turnQueue.length) { finishRound(); return }
      const entry = state.turnQueue[state.turnIndex]
      const combatant = findCombatant(entry.combatantId)
      if (!combatant || !combatant.alive) { state.turnIndex++; continue }
      if (combatant.isPlayer) { clearPresentation(); return }
      runEnemyTurn(combatant)
      return
    }
  }

  function finishRound(): void {
    endOfRound(raw())
    const outcome = checkBattleOutcome(raw())
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
    const skillId = previewEnemyNextSkill(enemy)
    announce(enemy, skillId, '様子を見ている')
    after(timing.announceMs, () => {
      presentation.phase = 'impact'
      enemyTakeTurn({ state: raw(), content, enemy, player: raw().player, rng, emit })
      after(timing.impactMs, () => { afterAction() })
    })
  }

  /** 1手番の解決が終わったあと、勝敗を見てから次の手番へ送る */
  function afterAction(): void {
    presentation.posingId = null
    state.turnIndex++
    const outcome = checkBattleOutcome(raw())
    if (outcome !== 'ongoing') {
      clearPresentation()
      after(timing.battleEndMs, () => { handleOutcome(outcome) })
      return
    }
    processTurns()
  }

  function handleOutcome(outcome: 'won' | 'lost'): void {
    const r = raw()
    clearPresentation()
    if (outcome === 'won') {
      finishBattleOnVictory(r, content)
      if (r.bossDefeated) {
        state.runOutcome = 'won'
        state.status = 'finished'
        finalizeScore()
      } else {
        state.status = 'drafting'
        state.draftOptions = rollDraft(r.player, content, rng)
      }
    } else {
      state.runOutcome = 'lost'
      state.status = 'finished'
      finalizeScore()
    }
  }

  function finalizeScore(): void {
    const r = raw()
    const battleVars = buildBattleScoreVars(r)
    const formula = GENRES.find(g => g.id === 'rpg')?.scoreFormula ?? RPG_SCORE_FORMULA_FALLBACK
    const vars: ScoreVars = {
      distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0, survivedSec: 0,
      accuracy: 0, maxCombo: 0, deaths: 0, itemsCollected: 0,
      bossKills: 0, stealthBonus: 0, colorTouches: 0,
      ...battleVars,
    }
    state.playScore = Math.max(0, Math.round(evalScoreFormula(formula, vars)))
  }

  // ── プレイヤーの行動 ──────────────────────────────────────────
  const isPlayerTurn = computed(() =>
    state.status === 'battle'
    && presentation.phase === 'idle'
    && state.turnIndex < state.turnQueue.length
    && state.turnQueue[state.turnIndex]?.combatantId === state.player.id,
  )

  const isPresenting = computed(() => presentation.phase !== 'idle')

  const guardOrDodge = computed<'guard' | 'dodge'>(() =>
    hasReplaceGuard(raw().player, content) ? 'dodge' : 'guard',
  )

  function selectAction(action: PlayerAction, centerEnemyIndex: number | null = null): void {
    if (!isPlayerTurn.value) return
    const r = raw()
    const player = r.player

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

    const owned = player.actives.find(a => a.slotIndex === action.slotIndex)
    if (!owned || owned.cooldown > 0) return
    const def = content.skills.get(owned.id)
    if (!def || def.kind !== 'active') return

    announce(player, owned.id)
    after(timing.announceMs, () => {
      presentation.phase = 'impact'
      const targets = resolvePlayerFocus(
        { side: def.defaultFocus, range: def.focusRange }, player, r.enemies, centerEnemyIndex,
      )
      useActiveSkill({ state: r, content, source: player, skillId: owned.id, level: owned.level, targets, rng, emit })
      owned.cooldown = def.cooldown
      after(timing.impactMs, () => { afterAction() })
    })
  }

  // ── ドラフト ──────────────────────────────────────────────────
  function selectDraft(index: number): void {
    const r = raw()
    if (r.status !== 'drafting' || !r.draftOptions) return
    const option = r.draftOptions[index]
    if (!option) return
    const result = applyDraftChoice(r, option)
    if (result.needsSwapSelection) {
      state.status = 'swapping'
    } else {
      state.draftOptions = null
      startBattle()
    }
  }

  function confirmSwap(targetSlotIndex: number): void {
    const r = raw()
    if (r.status !== 'swapping' || !r.pendingSwapSkillId) return
    confirmSwapSkill(r.player, r.pendingSwapSkillId, targetSlotIndex)
    state.pendingSwapSkillId = null
    state.draftOptions = null
    startBattle()
  }

  function cancelSwap(): void {
    state.pendingSwapSkillId = null
    state.status = 'drafting'
  }

  // ── 終了 ──────────────────────────────────────────────────────
  function giveUp(): void {
    if (state.status === 'finished') return
    generation++          // 進行中の演出が終了後の状態を書き換えないようにする
    cancelPending()
    clearPresentation()
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
  // toRaw() は実行時には素のオブジェクトを返すが型は保持するため、ここで明示的に戻す。
  function effectiveOf(c: CombatantView): EffectiveStats {
    return resolveEffectiveStats(toRaw(c) as Combatant, content)
  }
  function nextEnemySkillPreview(e: CombatantView): string | null {
    return previewEnemyNextSkill(toRaw(e) as Combatant)
  }
  /** 敵がそのスキルを使ったとき、プレイヤーがどれくらい削られるかの見積り */
  function estimateDamageToPlayer(e: CombatantView, skillId: string, level: number): number {
    const def = content.skills.get(skillId)
    if (!def) return 0
    return estimateSkillDamage({
      source: toRaw(e) as Combatant,
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
  }
}
