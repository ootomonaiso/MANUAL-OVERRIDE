import { reactive, ref, readonly } from 'vue'
import type { Phase, GenreId, RuntimeRules, FinalScore, BayesianState } from '../domain/types'
import { BAYES_DEBUG_TOP_N } from '../domain/types'
import { MANUAL_DECK } from '../data/manualDeck'
import { GENRES } from '../data/genres'
import { buildRuntimeRules, type ChoiceRecord } from '../domain/ruleEngine'
import { resolveGenre, resolveHighestProbGenre, accumulateParams, initBayesianState, updateBayesianState, DEFAULT_BAYES_CONFIG } from '../domain/genreResolver'
import { calcThrowScore, calcFinalScore } from '../domain/scoreCalc'
import type { ThrowResult } from '../domain/types'
import { soundManager } from '../plugins/SoundManager'

// ゲームの全体状態を一元管理する composable
export function useGameState() {
  const phase = ref<Phase>('title')
  const currentVersionKey = ref('1.0')
  const choiceHistory = reactive<ChoiceRecord[]>([])
  const lockedGenre = ref<GenreId | null>(null)
  const updateIndex = ref(0)          // 何回目の更新か（0-indexed）
  const finalScore = ref<FinalScore | null>(null)

  // ベイズ状態（事後確率分布を追跡）
  const bayesState = reactive<BayesianState>(initBayesianState(GENRES))

  // 現在有効なルール（ゲームループが参照）
  const rules = reactive<RuntimeRules>(
    buildRuntimeRules(MANUAL_DECK['1.0'], [], null)
  )

  function _rebuildRules() {
    const next = buildRuntimeRules(
      MANUAL_DECK[currentVersionKey.value],
      choiceHistory,
      lockedGenre.value,
    )
    Object.assign(rules, next)
  }

  // ─── フェーズ遷移 ─────────────────────────────────────────
  function startGame() {
    phase.value = 'tutorialIntro'
    Object.assign(bayesState, initBayesianState(GENRES))
    _rebuildRules()
  }

  // チュートリアル画面からゲームプレイへ移行
  function startTutorial() {
    phase.value = 'tutorial'
  }

  // 説明書更新が来たとき（sideScroller の snapshot.shouldUpdate が非 null）
  function triggerUpdate() {
    phase.value = 'updating'
  }

  // プレイヤーが2択を選んだとき。エラーがあればエラーメッセージ文字列を返す（正常時は undefined）
  function choose(choiceId: string): string | undefined {
    const ver = MANUAL_DECK[currentVersionKey.value]
    const choice = ver.choices.find(c => c.id === choiceId)
    if (!choice) return undefined

    // 状態を変更する前に次バージョンの存在を確認
    const nextVer = MANUAL_DECK[choice.next]
    if (!nextVer) {
      console.error(`[choose] invalid choice.next: ${choice.next}`)
      phase.value = 'playing'
      return `選択肢データが見つかりません（${choice.next}）`
    }

    soundManager.onChoiceSelect()

    choiceHistory.push({
      versionKey: currentVersionKey.value,
      choiceId,
      genreParams: choice.genreParams,
      genrePoints: choice.genrePoints,
    })
    currentVersionKey.value = choice.next
    updateIndex.value++

    // 累積パラメータを計算
    const accumulated = accumulateParams(choiceHistory.map(h => h.genreParams))

    // ベイズ更新
    const newState = updateBayesianState(bayesState, accumulated, GENRES)
    Object.assign(bayesState, newState)

    // ── ベイズ状態デバッグログ ──────────────────────────────────
    const sorted = GENRES
      .filter(g => g.id !== 'base')
      .sort((a, b) => (newState.posteriors[b.id] ?? 0) - (newState.posteriors[a.id] ?? 0))
      .slice(0, BAYES_DEBUG_TOP_N)
      .map(g => `  ${g.id.padEnd(14)} ${(newState.posteriors[g.id] * 100).toFixed(1)}%`)
      .join('\n')

    const thresholdStr = `${(DEFAULT_BAYES_CONFIG.convergenceThreshold * 100).toFixed(0)}%`
    console.log(`[BAYES] choice #${updateIndex.value} | choiceId=${choiceId} | accumulated=${JSON.stringify(accumulated)}`)
    console.log(`[BAYES] Top${BAYES_DEBUG_TOP_N} genres:\n${sorted}`)
    console.log(`[BAYES] converged=${newState.converged} | convergedGenre=${newState.convergedGenre ?? '—'} | threshold=${thresholdStr}`)
    // ─────────────────────────────────────────────────────────────

    // ジャンル収束チェック（ベイズ事後確率が閾値を超えたら確定）
    if (newState.converged || nextVer.choices.length === 0) {
      if (newState.converged && newState.convergedGenre) {
        lockedGenre.value = newState.convergedGenre
      } else {
        // 末端だが未収束 → 最高確率のジャンルを強制選択
        lockedGenre.value = resolveHighestProbGenre(accumulated, GENRES)
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

  // ゲームオーバー or ギブアップ → 投擲フェーズへ
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
    currentVersionKey.value = '1.0'
    choiceHistory.splice(0)
    lockedGenre.value = null
    updateIndex.value = 0
    finalScore.value = null
    Object.assign(bayesState, initBayesianState(GENRES))
    _rebuildRules()
  }

  // 現在バージョンの ManualVersion を返す
  const currentManual = () => MANUAL_DECK[currentVersionKey.value]

  // 確定ジャンルの定義
  const lockedGenreDef = () => GENRES.find(g => g.id === lockedGenre.value) ?? null

  return {
    phase: readonly(phase),
    rules: readonly(rules) as RuntimeRules,
    currentVersionKey: readonly(currentVersionKey),
    choiceHistory: readonly(choiceHistory),
    lockedGenre: readonly(lockedGenre),
    finalScore: readonly(finalScore),
    bayesState: readonly(bayesState) as BayesianState,
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
