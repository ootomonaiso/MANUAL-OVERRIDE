import { reactive, ref, readonly } from 'vue'
import type { Phase, GenreId, RuntimeRules, FinalScore, BayesianState, ManualVersion } from '../domain/types'
import { BAYES_DEBUG_TOP_N } from '../domain/types'
import { MANUAL_DECK } from '../data/manualDeck'
import { GENRES } from '../data/genres'
import { buildRuntimeRules, type ChoiceRecord, accumulateWithMultiplier } from '../domain/ruleEngine'
import { resolveGenre, resolveHighestProbGenre, initBayesianState, updateBayesianState, DEFAULT_BAYES_CONFIG, selectNextManual } from '../domain/genreResolver'
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

  // プール選択で既に表示済みのエントリーキーを追跡
  const shownPoolKeys = ref(new Set<string>())

  // プールエントリーとチェーンのchoicesをマージしたバージョンをキャッシュ
  // MANUAL_DECK を直接書き換えずにローカルで管理
  const mergedPoolVersions = new Map<string, ManualVersion>()

  // 現在有効なルール（ゲームループが参照）
  const rules = reactive<RuntimeRules>(
    buildRuntimeRules(MANUAL_DECK['1.0'], [], null)
  )

  // 解決関数: マージ済みプールバージョンを考慮して ManualVersion を取得
  const resolveVersion = (key: string) => mergedPoolVersions.get(key) ?? MANUAL_DECK[key]

  function rebuildRules() {
    const next = buildRuntimeRules(
      resolveVersion(currentVersionKey.value),
      choiceHistory,
      lockedGenre.value,
    )
    // Vue 3 のリアクティビティを維持するため個別代入
    rules.controls = next.controls
    rules.hazardColors = next.hazardColors
    rules.safeColors = next.safeColors
    rules.features = next.features
    rules.genre = next.genre
    rules.scrollSpeed = next.scrollSpeed
    rules.bpm = next.bpm
    rules.gravity = next.gravity
    rules.scrollDirection = next.scrollDirection
    rules.environment = next.environment
    rules.playerMaxHp = next.playerMaxHp
    rules.timescale = next.timescale
    rules.scrollAxis = next.scrollAxis
    rules.colorTouchScore = next.colorTouchScore
  }

  // ─── フェーズ遷移 ─────────────────────────────────────────
  function startGame() {
    phase.value = 'tutorialIntro'
    const fresh = initBayesianState(GENRES)
    bayesState.converged = fresh.converged
    bayesState.convergedGenre = fresh.convergedGenre
    // 全ジャンルキーを確実に更新（古いキーの削除 + 新しいキーの追加）
    for (const genre of GENRES) {
      bayesState.posteriors[genre.id] = fresh.posteriors[genre.id] ?? 0
    }
    rebuildRules()
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
    const ver = resolveVersion(currentVersionKey.value)
    const choice = ver.choices.find(c => c.id === choiceId)
    if (!choice) return undefined

    soundManager.onChoiceSelect()

    choiceHistory.push({
      versionKey: currentVersionKey.value,
      choiceId,
      genreParams: choice.genreParams,
      genrePoints: choice.genrePoints,
      paramMultiplier: choice.paramMultiplier,
    })
    updateIndex.value++

    // 累積パラメータを計算（paramMultiplier を考慮）
    const accumulated = accumulateWithMultiplier(choiceHistory)

    // ベイズ更新
    const newState = updateBayesianState(bayesState, accumulated, GENRES)
    // posteriors を全ジャンル分更新（Vue リアクティビティ維持 + キー整合性保証）
    bayesState.converged = newState.converged
    bayesState.convergedGenre = newState.convergedGenre
    for (const genre of GENRES) {
      bayesState.posteriors[genre.id] = newState.posteriors[genre.id] ?? 0
    }

    // ── ベイズ状態デバッグログ ──────────────────────────────────
    const sorted = GENRES
      .filter(g => g.id !== 'base')
      .sort((a, b) => (newState.posteriors[b.id] ?? 0) - (newState.posteriors[a.id] ?? 0))
      .slice(0, BAYES_DEBUG_TOP_N)
      .map(g => `  ${g.id.padEnd(14)} ${(newState.posteriors[g.id] * 100).toFixed(1)}%`)
      .join('\n')

    const convergenceInfo = `minProb=${(DEFAULT_BAYES_CONFIG.minProb * 100).toFixed(0)}% ratio>=${DEFAULT_BAYES_CONFIG.dominanceRatio}x`
    console.log(`[BAYES] choice #${updateIndex.value} | choiceId=${choiceId} | accumulated=${JSON.stringify(accumulated)}`)
    console.log(`[BAYES] Top${BAYES_DEBUG_TOP_N} genres:\n${sorted}`)
    console.log(`[BAYES] converged=${newState.converged} | convergedGenre=${newState.convergedGenre ?? '—'} | criteria=${convergenceInfo}`)
    // ─────────────────────────────────────────────────────────────

    // 次のバージョンキーを決定: プール選択 → チェーンフォールバック
    const poolKey = selectNextManual(MANUAL_DECK, newState.posteriors, updateIndex.value, shownPoolKeys.value)
    if (poolKey && MANUAL_DECK[poolKey]) {
      const poolVer = MANUAL_DECK[poolKey]
      shownPoolKeys.value.add(poolKey)
      console.log(`[POOL] selected ${poolKey}`)

      // プールエントリーが chainKey を持つ場合、チェーンのchoicesを借用
      // 設計: プールエントリーはmanualText/hazardsなどのメタデータを提供し、
      // 選択肢自体はチェーンから借用する。プレイヤーが選択すると、
      // choice.next で指定されたチェーンの次のバージョンへ遷移する。
      if (poolVer.chainKey && MANUAL_DECK[poolVer.chainKey]) {
        const chainVer = MANUAL_DECK[poolVer.chainKey]
        const merged: ManualVersion = {
          ...poolVer,
          choices: chainVer.choices,
        }
        mergedPoolVersions.set(poolKey, merged)
        currentVersionKey.value = poolKey
      } else {
        currentVersionKey.value = poolKey
      }
    } else {
      const chainKey = choice.next
      const chainVer = MANUAL_DECK[chainKey]
      if (!chainVer) {
        console.error(`[choose] invalid choice.next: ${chainKey}`)
        phase.value = 'playing'
        return `選択肢データが見つかりません（${chainKey}）`
      }
      currentVersionKey.value = chainKey
    }

    const nextVer = resolveVersion(currentVersionKey.value)

    // ジャンル収束チェック（ベイズ事後確率が閾値を超えたら確定）
    if (newState.converged || nextVer.choices.length === 0) {
      if (newState.converged && newState.convergedGenre) {
        lockedGenre.value = newState.convergedGenre
      } else {
        // 末端だが未収束 → 最高確率のジャンルを強制選択
        lockedGenre.value = resolveHighestProbGenre(accumulated, GENRES)
      }
      soundManager.onGenreLock(lockedGenre.value)
      rebuildRules()
      phase.value = 'genreLocked'
    } else {
      rebuildRules()
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
    const fresh = initBayesianState(GENRES)
    bayesState.converged = fresh.converged
    bayesState.convergedGenre = fresh.convergedGenre
    // 全ジャンルキーを確実に更新（キー整合性保証）
    for (const genre of GENRES) {
      bayesState.posteriors[genre.id] = fresh.posteriors[genre.id] ?? 0
    }
    shownPoolKeys.value.clear()
    mergedPoolVersions.clear()
    rebuildRules()
  }

  // 現在バージョンの ManualVersion を返す（マージ済みプールバージョンを考慮）
  const currentManual = () => resolveVersion(currentVersionKey.value)

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
