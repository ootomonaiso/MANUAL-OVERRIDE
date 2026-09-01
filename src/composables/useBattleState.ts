/**
 * composables/useBattleState.ts
 * rpg ジャンル（ローグライク戦闘）の ViewModel。docs/genre/rpg/10-state.md 準拠。
 *
 * ドメインロジック（src/domain/battle/*）はプレーンなオブジェクトを受け取る純粋関数として
 * 実装されている。ここで reactive にラップし、ロジックへ渡す際は toRaw() で素のオブジェクトに
 * 戻す（readonly プロキシへの書き込みが no-op になる過去の不具合を避けるため）。
 */

import { reactive, readonly, ref, computed, toRaw } from 'vue'
import type {
  BattleState, Combatant, PlayerAction, DraftOption, EffectRequest,
  CategoryId, EffectiveStats,
} from '../domain/battle/types'
import { CATEGORY_IDS } from '../domain/battle/types'
import {
  initPlayer, spawnEnemyFromDef, pickEnemyDefs, resolveEffectiveStats,
  resolvePlayerFocus, useActiveSkill, useBuiltinAction, hasReplaceGuard,
  enemyTakeTurn, endOfRound, checkBattleOutcome, finishBattleOnVictory,
  buildBattleScoreVars,
} from '../domain/battle/battleEngine'
import { buildTurnQueue, previewEnemyNextSkill } from '../domain/battle/turnQueue'
import { rollDraft, applyDraftChoice, confirmSwap as confirmSwapSkill } from '../domain/battle/skillDraft'
import { BATTLE_CONTENT } from '../data/battleContent'
import { evalScoreFormula } from '../domain/scoreCalc'
import type { ScoreVars } from '../domain/types'
import { GENRES } from '../data/genres'

const RPG_SCORE_FORMULA_FALLBACK = 'battlesWon * 300 + bossDefeated * 3000 + maxSkillLevel * 200 + traitsAcquired * 150'

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
    draftOptions: null,
    pendingSwapSkillId: null,
    categoryPoints: zeroCategoryPoints(),
    seenIds: new Set(),
    ui: { statusPanelMode: 'effective', showBuffDiff: true, statusPanelCollapsed: false, skillListCollapsed: false },
    playScore: 0,
    lastBattleEndNotices: [],
  }
}

export function useBattleState() {
  const state = reactive<BattleState>(freshState())
  const effectQueue = ref<EffectRequest[]>([])
  let rng: () => number = Math.random
  let initialized = false

  const content = BATTLE_CONTENT

  function raw(): BattleState {
    return toRaw(state)
  }

  function emit(req: EffectRequest): void {
    effectQueue.value.push(req)
  }

  // ── ライフサイクル ────────────────────────────────────────────
  function initRun(customRng: () => number = Math.random): void {
    if (initialized) return
    initialized = true
    rng = customRng
    const fresh = freshState()
    fresh.player = initPlayer(rng)
    Object.assign(state, fresh)
    state.categoryPoints = zeroCategoryPoints()
    state.seenIds = new Set()
    effectQueue.value = []
    startBattle()
  }

  function reset(): void {
    initialized = false
    Object.assign(state, freshState())
    effectQueue.value = []
  }

  // ── 戦闘開始 ──────────────────────────────────────────────────
  function startBattle(): void {
    const r = raw()
    const defs = pickEnemyDefs(content, r.battleIndex, rng)
    state.enemies = defs.map((d, i) => spawnEnemyFromDef(d, i))
    state.status = 'battle'
    state.lastBattleEndNotices = []
    startNewRound()
  }

  function startNewRound(): void {
    const r = raw()
    const queue = buildTurnQueue([r.player, ...r.enemies], c => resolveEffectiveStats(c, content).agi)
    state.turnQueue = queue
    state.turnIndex = 0
    processUntilPlayerTurn()
  }

  // ── ターン進行 ────────────────────────────────────────────────
  function findCombatant(id: string): Combatant | undefined {
    const r = raw()
    if (r.player.id === id) return r.player
    return r.enemies.find(e => e.id === id)
  }

  function processUntilPlayerTurn(): void {
    for (;;) {
      const r = raw()
      if (state.turnIndex >= state.turnQueue.length) break
      const entry = state.turnQueue[state.turnIndex]
      const combatant = findCombatant(entry.combatantId)
      if (!combatant || !combatant.alive) { state.turnIndex++; continue }
      if (combatant.isPlayer) return   // プレイヤーの入力待ち

      enemyTakeTurn({ state: r, content, enemy: combatant, player: r.player, rng, emit })
      state.turnIndex++
      const outcome = checkBattleOutcome(r)
      if (outcome !== 'ongoing') { handleOutcome(outcome); return }
    }
    endOfRound(raw())
    const outcome = checkBattleOutcome(raw())
    if (outcome !== 'ongoing') { handleOutcome(outcome); return }
    startNewRound()
  }

  function handleOutcome(outcome: 'won' | 'lost'): void {
    const r = raw()
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
    && state.turnIndex < state.turnQueue.length
    && state.turnQueue[state.turnIndex]?.combatantId === state.player.id,
  )

  const guardOrDodge = computed<'guard' | 'dodge'>(() =>
    hasReplaceGuard(raw().player, content) ? 'dodge' : 'guard',
  )

  function selectAction(action: PlayerAction, centerEnemyIndex: number | null = null): void {
    if (!isPlayerTurn.value) return
    const r = raw()
    const player = r.player

    if (action.kind === 'builtin') {
      useBuiltinAction(player, action.action)
    } else {
      const owned = player.actives.find(a => a.slotIndex === action.slotIndex)
      if (!owned || owned.cooldown > 0) return
      const def = content.skills.get(owned.id)
      if (!def || def.kind !== 'active') return
      const targets = resolvePlayerFocus({ side: def.defaultFocus, range: def.focusRange }, player, r.enemies, centerEnemyIndex)
      useActiveSkill({ state: r, content, source: player, skillId: owned.id, level: owned.level, targets, rng, emit })
      owned.cooldown = def.cooldown
    }

    state.turnIndex++
    const outcome = checkBattleOutcome(r)
    if (outcome !== 'ongoing') { handleOutcome(outcome); return }
    processUntilPlayerTurn()
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
  function effectiveOf(c: Combatant): EffectiveStats {
    return resolveEffectiveStats(toRaw(c), content)
  }
  function nextEnemySkillPreview(e: Combatant): string | null {
    return previewEnemyNextSkill(toRaw(e))
  }
  function draftOptionLabel(opt: DraftOption): { label: string; flavorText: string } | null {
    if (opt.isFallback) return null
    const def = opt.kind === 'trait' ? content.traits.get(opt.id) : content.skills.get(opt.id)
    if (!def) return null
    return { label: def.label, flavorText: def.flavorText }
  }

  return {
    state: readonly(state),
    effectQueue: readonly(effectQueue),
    playScore: computed(() => state.playScore),
    isPlayerTurn,
    guardOrDodge,

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
    draftOptionLabel,
  }
}
