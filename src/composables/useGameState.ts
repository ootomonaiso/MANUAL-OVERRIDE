import { reactive, ref, readonly } from 'vue'
import type { Phase, GenreId, RuntimeRules, FinalScore, ManualVersion, ManualCard } from '../domain/types'
import { MANUAL_DECK } from '../data/manualDeck'
import { GENRES } from '../data/genres'
import { buildRuntimeRules, type ChoiceRecord } from '../domain/ruleEngine'
import { resolveGenre, accumulateParams } from '../domain/genreResolver'
import { calcThrowScore, calcFinalScore } from '../domain/scoreCalc'
import type { ThrowResult } from '../domain/types'
import { soundManager } from '../plugins/SoundManager'
import { sampleCards } from '../data/cardPool'
import { MAX_ROUNDS } from '../data/gameBalance'

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

  // ─── フェーズ遷移 ─────────────────────────────────────────
  function startGame() {
    phase.value = 'tutorialIntro'
    _rebuildRules()
  }

  function startTutorial() {
    phase.value = 'tutorial'
  }

  // 説明書更新トリガー: カードをランダムサンプリングして updating フェーズへ
  function triggerUpdate() {
    activeCards.value = sampleCards(2, lastShownCardIds.value)
    lastShownCardIds.value = new Set(activeCards.value.map(c => c.id))
    phase.value = 'updating'
  }

  // プレイヤーがカードを選んだとき
  function choose(cardId: string): string | undefined {
    const card = activeCards.value.find(c => c.id === cardId)
    if (!card) return undefined

    soundManager.onChoiceSelect()

    // 選択履歴に積む
    choiceHistory.push({
      choiceId: cardId,
      genreParams: card.genreParams ?? {},
      paramMultiplier: card.paramMultiplier,
      genrePoints: card.genrePoints,
    })

    // 説明書本文に追記
    for (const line of card.manualText) {
      if (!accumulatedManualText.value.includes(line)) {
        accumulatedManualText.value.push(line)
      }
    }

    // 障害物設定を上書き（カードが持つ場合のみ）
    if (card.hazards) {
      currentHazards.value = { ...card.hazards }
    }

    // runtimeConfig を更新
    if (card.runtimeConfig) {
      lastRuntimeConfig.value = card.runtimeConfig
    }

    roundCount.value++

    // すでにジャンル確定済みなら説明書更新のみ（ジャンルは変えない）
    if (lockedGenre.value !== null) {
      _rebuildRules()
      phase.value = 'genreLocked'
      return undefined
    }

    // 初回ジャンル収束チェック（最終ラウンド以降は強制確定）
    const accumulated = accumulateParams(choiceHistory.map(h => h.genreParams))
    const genrePointsAcc: Record<string, number> = {}
    for (const h of choiceHistory) {
      if (!h.genrePoints) continue
      for (const [g, pts] of Object.entries(h.genrePoints)) {
        genrePointsAcc[g] = (genrePointsAcc[g] ?? 0) + pts
      }
    }
    const selectedIds = choiceHistory.map(h => h.choiceId)
    const resolved = resolveGenre(accumulated, GENRES, genrePointsAcc, selectedIds)

    if (roundCount.value >= MAX_ROUNDS || resolved !== 'base') {
      lockedGenre.value = resolved !== 'base' ? resolved : _forceResolve(accumulated)
      // ジャンル確定文を説明書本文に追記
      const genreDef = GENRES.find(g => g.id === lockedGenre.value)
      if (genreDef?.manualReveal) {
        accumulatedManualText.value.push('', genreDef.manualReveal)
      }
      soundManager.onGenreLock(lockedGenre.value)
      _rebuildRules()
      phase.value = 'genreLocked'
    } else {
      _rebuildRules()
      phase.value = 'playing'
    }
    return undefined
  }

  function _forceResolve(accumulated: ReturnType<typeof accumulateParams>): GenreId {
    const resolved = resolveGenre(accumulated, GENRES)
    return resolved !== 'base' ? resolved : 'runner'
  }

  function startThrowing(_playScoreRaw: number) {
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
    currentManual,
    lockedGenreDef,
    startGame,
    startTutorial,
    triggerUpdate,
    choose,
    startThrowing,
    finalizeThrowing,
    restart,
  }
}
