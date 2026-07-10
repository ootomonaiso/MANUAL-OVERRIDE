import { reactive, ref, readonly } from 'vue'
import type { Phase, GenreId, RuntimeRules, FinalScore, ManualVersion, ManualCard, GenreParam, BayesianState,
  ActionStats, PlayStyleResult, ContradictionState, SurpriseEnding } from '../domain/types'
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
import { MAX_ROUNDS, DEFAULT_FALLBACK_GENRE, PARAM_JITTER_RANGE } from '../data/gameBalance'
import { DEBUG_MODE } from '../debug/const'
import { detectPlayStyle } from '../domain/playStyleDetector'
import { trackContradictions, shouldTriggerGlitchEnd } from '../domain/contradictionTracker'

// genreParams のジッター幅（±20%）
// gameBalance.ts からインポート済み

// ─────────────────────────────────────────────────────────────
// プレイスタイル・矛盾・サプライズエンド（Issue #24）
// ─────────────────────────────────────────────────────────────

/** プレイスタイル検出結果（ゲーム終了時に計算） */
export function computePlayStyle(stats: ActionStats): PlayStyleResult {
  return detectPlayStyle(stats)
}

/** 矛盾状態を計算（選択履歴から） */
export function computeContradiction(history: ChoiceRecord[]): ContradictionState {
  return trackContradictions(history)
}

/** サプライズエンドを判定（矛盾・プレイスタイルから） */
export function computeSurpriseEnding(
  contradiction: ContradictionState,
  _playStyle: PlayStyleResult,
): SurpriseEnding | null {
  // 矛盾スコアが閾値を超えていれば glitch エンド
  if (shouldTriggerGlitchEnd(contradiction)) {
    return {
      type: 'glitch',
      title: 'ゲームが壊れました',
      description: 'あなたが選んだ矛盾が、ゲームそのものを壊しました。これは誰も予想しなかった結末です。',
      forcedGenre: 'glitch',
    }
  }
  // TODO: hidden_genre / bad_ending / narrative_twist の判定ロジックを実装
  return null
}

export function useGameState() {
  const phase = ref<Phase>('title')
  const lockedGenre = ref<GenreId | null>(null)
  const finalScore = ref<FinalScore | null>(null)

  // サプライズエンド関連（Issue #24）
  const playStyle = ref<PlayStyleResult | null>(null)
  const contradiction = ref<ContradictionState>({ pairs: [], score: 0, hasEffect: false })
  const surpriseEnding = ref<SurpriseEnding | null>(null)

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
      // ジャンル確定後も choose() は続くため roundCount は MAX_ROUNDS を超えうる。
      // 表示上は上限でクランプし ver.7/5 のような破綻表示を防ぐ。
      version: `${Math.min(roundCount.value, MAX_ROUNDS)}/${MAX_ROUNDS}`,
      // accumulatedManualText.value をそのまま渡すと、以降の選択で同じ配列を
      // push/書き換えするため、useManual の履歴エントリが全て同一参照を共有し
      // 差分計算（prev vs next）が常に「変化なし」になる。呼び出し時点の
      // スナップショットとして独立したコピーを返す。
      manualText: [...accumulatedManualText.value],
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

    // 矛盾の蓄積をリアルタイム監視: ジャンル確定後も選択は続くため、
    // 度重なる矛盾が閾値を超えたらここで「壊れたゲーム」へ強制上書きする
    // （投擲時の computeSurpriseEnding は選択を続けず即ギブアップした場合の保険として残す）
    // このラウンドで通常ロックした直後は上書きしない（同一 choose 内で _lockGenre が
    // 二重発火し、確定文の重複追記と効果音の二重再生が起きるのを防ぐ。glitch 化は
    // 確定後さらに矛盾が積み増した後続ラウンドで発火する）。
    const contradictionState = computeContradiction(choiceHistory)
    contradiction.value = contradictionState
    if (!shouldLock && shouldTriggerGlitchEnd(contradictionState) && lockedGenre.value !== 'glitch') {
      _lockGenre('glitch')
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

  function finalizeThrowing(throwResult: ThrowResult, playScoreRaw: number, gameStats?: ActionStats) {
    soundManager.onThrowLand()

    // 矛盾状態を計算
    const contradictionState = computeContradiction(choiceHistory)
    contradiction.value = contradictionState

    // プレイスタイル検出（ゲーム統計が渡された場合）
    if (gameStats) {
      playStyle.value = computePlayStyle(gameStats)
    }

    // サプライズエンド判定
    const ending = computeSurpriseEnding(contradictionState, playStyle.value ?? {
      style: 'balanced',
      confidence: 0,
      scores: { aggressive: 0, defensive: 0, explorer: 0, balanced: 0, chaotic: 0, passive: 0 },
    })
    surpriseEnding.value = ending

    // glitch エンドがトリガーされたらジャンルを強制書き換え
    if (ending?.forcedGenre) {
      lockedGenre.value = ending.forcedGenre as GenreId
    }

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
    playStyle.value = null
    contradiction.value = { pairs: [], score: 0, hasEffect: false }
    surpriseEnding.value = null
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
    // Issue #24: サプライズエンド関連
    playStyle: readonly(playStyle),
    contradiction: readonly(contradiction),
    surpriseEnding: readonly(surpriseEnding),
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
