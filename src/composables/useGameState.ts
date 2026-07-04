import { reactive, ref, readonly } from 'vue'
import type { Phase, GenreId, RuntimeRules, FinalScore, ManualVersion, ManualCard, GenreParam, BayesianState } from '../domain/types'
import { BAYES_DEBUG_TOP_N } from '../domain/types'
import { MANUAL_DECK } from '../data/manualDeck'
import { GENRES } from '../data/genres'
import { buildRuntimeRules, type ChoiceRecord, accumulateWithMultiplier } from '../domain/ruleEngine'
import {
  resolveHighestProbGenre,
  initBayesianState,
  updateBayesianState,
  DEFAULT_BAYES_CONFIG,
} from '../domain/genreResolver'
import { calcThrowScore, calcFinalScore } from '../domain/scoreCalc'
import type { ThrowResult } from '../domain/types'
import { soundManager } from '../plugins/SoundManager'
import { sampleCards, CARD_POOL } from '../data/cardPool'
import { MAX_ROUNDS, DEFAULT_FALLBACK_GENRE } from '../data/gameBalance'
import { DEBUG_MODE } from '../debug/const'

// genreParams のジッター幅（±20%）
const PARAM_JITTER_RANGE = 0.4

export function useGameState() {
  const phase = ref<Phase>('title')
  const lockedGenre = ref<GenreId | null>(null)
  const finalScore = ref<FinalScore | null>(null)

  // カードラウンド管理
  const roundCount = ref(0)
  const activeCards = ref<ManualCard[]>([])
  const lastShownCardIds = ref(new Set<string>())

  // 選択履歴（genreResolver に渡す）
  const choiceHistory = reactive<ChoiceRecord[]>([])

  // 説明書本文（選択のたびに追記される）
  const accumulatedManualText = ref<string[]>([...MANUAL_DECK['1.0'].manualText])

  // 現在の障害物設定（カードで上書き可能）
  const currentHazards = ref({ ...MANUAL_DECK['1.0'].hazards })

  // 最後に選んだカードの runtimeConfig（buildRuntimeRules に渡す）
  const lastRuntimeConfig = ref<ManualVersion['runtimeConfig']>(undefined)

  // ベイズ状態（事後確率分布を追跡）
  const bayesState = reactive<BayesianState>(initBayesianState(GENRES))

  // 現在有効なルール（ゲームループが参照）
  const rules = reactive<RuntimeRules>(
    buildRuntimeRules(MANUAL_DECK['1.0'], [], null)
  )

  function _buildFakeManual(): ManualVersion {
    return {
      version: `${roundCount.value}/${MAX_ROUNDS}`,
      manualText: accumulatedManualText.value,
      choices: [],
      hazards: currentHazards.value,
      runtimeConfig: lastRuntimeConfig.value,
      learningRules: MANUAL_DECK['1.0'].learningRules,
    }
  }

  function _rebuildRules() {
    const next = buildRuntimeRules(
      _buildFakeManual(),
      choiceHistory,
      lockedGenre.value,
    )
    Object.assign(rules, next)
  }

  function _syncBayesState(newState: BayesianState) {
    bayesState.converged = newState.converged
    bayesState.convergedGenre = newState.convergedGenre
    bayesState.updateCount = newState.updateCount
    for (const genre of GENRES) {
      bayesState.posteriors[genre.id] = newState.posteriors[genre.id] ?? 0
    }
  }

  // ─── フェーズ遷移 ─────────────────────────────────────────
  function startGame() {
    phase.value = 'tutorialIntro'
    _syncBayesState(initBayesianState(GENRES))
    _rebuildRules()
  }

  function startTutorial() {
    phase.value = 'tutorial'
  }

  // 説明書更新トリガー: カードをサンプリングして updating フェーズへ。
  // カードが1枚も取れなかった場合は false を返す。
  function triggerUpdate(): boolean {
    const cards = sampleCards(2, lastShownCardIds.value, bayesState.posteriors)
    if (cards.length === 0) return false
    activeCards.value = cards
    lastShownCardIds.value = new Set(cards.map(c => c.id))
    phase.value = 'updating'
    return true
  }

  // genreParams のジッター（±PARAM_JITTER_RANGE の幅でランダムブレ）
  function _jitteredParams(card: ManualCard): Partial<Record<GenreParam, number>> {
    const jitter = 1 + (Math.random() - 0.5) * PARAM_JITTER_RANGE
    const params: Partial<Record<GenreParam, number>> = {}
    for (const [k, v] of Object.entries(card.genreParams ?? {}) as [GenreParam, number][]) {
      params[k] = v * jitter
    }
    return params
  }

  // 矛盾カード: 過去に選ばれた矛盾相手の説明書行を取り消し線化
  function _applyConflicts(card: ManualCard) {
    for (const conflictId of card.conflictsWith ?? []) {
      if (!choiceHistory.some(h => h.choiceId === conflictId)) continue
      const conflictedCard = CARD_POOL.find(c => c.id === conflictId)
      if (!conflictedCard) continue
      for (const line of conflictedCard.manualText) {
        const idx = accumulatedManualText.value.indexOf(line)
        if (idx >= 0) accumulatedManualText.value[idx] = `~~${line}~~`
      }
    }
  }

  function _appendManualText(card: ManualCard) {
    for (const line of card.manualText) {
      if (!accumulatedManualText.value.includes(line) && !accumulatedManualText.value.includes(`~~${line}~~`)) {
        accumulatedManualText.value.push(line)
      }
    }
  }

  function _logBayesDebug(state: BayesianState, cardId: string) {
    if (!DEBUG_MODE) return
    const top = GENRES
      .filter(g => g.id !== 'base')
      .sort((a, b) => (state.posteriors[b.id] ?? 0) - (state.posteriors[a.id] ?? 0))
      .slice(0, BAYES_DEBUG_TOP_N)
      .map(g => `  ${g.id.padEnd(14)} ${((state.posteriors[g.id] ?? 0) * 100).toFixed(1)}%`)
      .join('\n')
    console.warn(`[BAYES] round #${roundCount.value} | cardId=${cardId}`)
    console.warn(`[BAYES] Top${BAYES_DEBUG_TOP_N}:\n${top}`)
    console.warn(`[BAYES] converged=${state.converged} | genre=${state.convergedGenre ?? '—'} | criteria=minProb${(DEFAULT_BAYES_CONFIG.minProb * 100).toFixed(0)}% ratio>=${DEFAULT_BAYES_CONFIG.dominanceRatio}x`)
  }

  // ジャンル確定: base 収束はフォールバックへ振り替え、確定文追記と効果音を伴う
  function _lockGenre(genreId: GenreId) {
    lockedGenre.value = genreId === 'base' ? DEFAULT_FALLBACK_GENRE : genreId
    const genreDef = GENRES.find(g => g.id === lockedGenre.value)
    if (genreDef?.manualReveal) {
      accumulatedManualText.value.push('', genreDef.manualReveal)
    }
    soundManager.onGenreLock(lockedGenre.value)
  }

  // プレイヤーがカードを選んだとき
  function choose(cardId: string): string | undefined {
    const card = activeCards.value.find(c => c.id === cardId)
    if (!card) return 'カードが見つかりません'

    soundManager.onChoiceSelect()

    choiceHistory.push({
      choiceId: cardId,
      genreParams: _jitteredParams(card),
      paramMultiplier: card.paramMultiplier,
    })

    _applyConflicts(card)
    _appendManualText(card)
    if (card.hazards) currentHazards.value = { ...card.hazards }
    if (card.runtimeConfig) lastRuntimeConfig.value = card.runtimeConfig

    roundCount.value++

    const accumulated = accumulateWithMultiplier(choiceHistory)
    const newState = updateBayesianState(bayesState, accumulated, GENRES)
    _syncBayesState(newState)
    _logBayesDebug(newState, cardId)

    const shouldLock = lockedGenre.value === null &&
      (roundCount.value >= MAX_ROUNDS || newState.converged)
    if (shouldLock) {
      _lockGenre(newState.convergedGenre ?? resolveHighestProbGenre(accumulated, GENRES))
    }

    _rebuildRules()
    phase.value = lockedGenre.value !== null ? 'genreLocked' : 'playing'
    return undefined
  }

  // デバッグ専用: ジャンルを強制確定する（収束判定を飛ばす）
  function debugForceGenre(genreId: GenreId) {
    lockedGenre.value = genreId
    _rebuildRules()
    phase.value = 'genreLocked'
  }

  function startThrowing() {
    soundManager.onThrowStart()
    phase.value = 'throwing'
  }

  function finalizeThrowing(throwResult: ThrowResult, playScoreRaw: number) {
    soundManager.onThrowLand()
    const throwScore = calcThrowScore(throwResult)
    finalScore.value = calcFinalScore(playScoreRaw, throwScore)
    phase.value = 'ending'
  }

  function restart() {
    phase.value = 'title'
    roundCount.value = 0
    activeCards.value = []
    lastShownCardIds.value = new Set()
    choiceHistory.splice(0)
    lockedGenre.value = null
    finalScore.value = null
    accumulatedManualText.value = [...MANUAL_DECK['1.0'].manualText]
    currentHazards.value = { ...MANUAL_DECK['1.0'].hazards }
    lastRuntimeConfig.value = undefined
    _syncBayesState(initBayesianState(GENRES))
    _rebuildRules()
  }

  // ManualPanel / ThrowOverlay に渡す表示用オブジェクト
  const currentManual = () => _buildFakeManual()

  const lockedGenreDef = () => GENRES.find(g => g.id === lockedGenre.value) ?? null

  return {
    phase: readonly(phase),
    rules: readonly(rules) as RuntimeRules,
    choiceHistory: readonly(choiceHistory),
    lockedGenre: readonly(lockedGenre),
    finalScore: readonly(finalScore),
    activeCards: readonly(activeCards),
    roundCount: readonly(roundCount),
    maxRounds: MAX_ROUNDS,
    bayesState: readonly(bayesState) as BayesianState,
    currentManual,
    lockedGenreDef,
    startGame,
    startTutorial,
    triggerUpdate,
    choose,
    debugForceGenre,
    startThrowing,
    finalizeThrowing,
    restart,
  }
}
