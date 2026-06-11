import { reactive, ref, readonly } from 'vue'
import type { Phase, GenreId, RuntimeRules, FinalScore } from '../domain/types'
import { MANUAL_DECK } from '../data/manualDeck'
import { GENRES } from '../data/genres'
import { buildRuntimeRules, type ChoiceRecord } from '../domain/ruleEngine'
import { resolveGenre, accumulateParams } from '../domain/genreResolver'
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
    })
    currentVersionKey.value = choice.next
    updateIndex.value++

    // ジャンル収束チェック
    const accumulated = accumulateParams(choiceHistory.map(h => h.genreParams))
    const resolved = resolveGenre(accumulated, GENRES)

    if (nextVer.choices.length === 0 || resolved !== 'base') {
      lockedGenre.value = resolved !== 'base' ? resolved : _forceResolve(accumulated)
      soundManager.onGenreLock(lockedGenre.value)
      _rebuildRules()
      phase.value = 'genreLocked'
    } else {
      _rebuildRules()
      phase.value = 'playing'
    }
    return undefined
  }

  // choices が空の末端 or 3回目更新でジャンルを強制決定
  function _forceResolve(accumulated: ReturnType<typeof accumulateParams>): GenreId {
    const resolved = resolveGenre(accumulated, GENRES)
    return resolved !== 'base' ? resolved : 'runner'  // どこにも収束しなければランナー
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
