import { useState, useRef } from 'react'
import type { Phase, GenreId, RuntimeRules, FinalScore } from '../../domain/types'
import { MANUAL_DECK } from '../../data/manualDeck'
import { GENRES } from '../../data/genres'
import { buildRuntimeRules, type ChoiceRecord } from '../../domain/ruleEngine'
import { resolveGenre, accumulateParams } from '../../domain/genreResolver'
import { calcThrowScore, calcFinalScore } from '../../domain/scoreCalc'
import type { ThrowResult } from '../../domain/types'
import { soundManager } from '../../plugins/SoundManager'

export function useGameState() {
  const [phase, _setPhase] = useState<Phase>('title')
  const phaseRef = useRef<Phase>('title')

  const [currentVersionKey, _setVersionKey] = useState('1.0')
  const currentVersionKeyRef = useRef('1.0')

  const [choiceHistory, _setChoiceHistory] = useState<ChoiceRecord[]>([])
  const choiceHistoryRef = useRef<ChoiceRecord[]>([])

  const [lockedGenre, _setLockedGenre] = useState<GenreId | null>(null)
  const lockedGenreRef = useRef<GenreId | null>(null)

  const [updateIndex, setUpdateIndex] = useState(0)
  const [finalScore, setFinalScore] = useState<FinalScore | null>(null)

  // Mutable rules object — same reference stable for the game engine
  const rulesRef = useRef<RuntimeRules>(buildRuntimeRules(MANUAL_DECK['1.0'], [], null))
  const [, _bumpRules] = useState(0)

  // Update both ref and state so closures in RAF loops always see latest value
  function setPhase(p: Phase) { phaseRef.current = p; _setPhase(p) }
  function setVersionKey(k: string) { currentVersionKeyRef.current = k; _setVersionKey(k) }
  function setChoiceHistory(h: ChoiceRecord[]) { choiceHistoryRef.current = h; _setChoiceHistory(h) }
  function setLockedGenre(g: GenreId | null) { lockedGenreRef.current = g; _setLockedGenre(g) }

  function _rebuildRules(
    vk = currentVersionKeyRef.current,
    hist = choiceHistoryRef.current,
    genre = lockedGenreRef.current,
  ) {
    const next = buildRuntimeRules(MANUAL_DECK[vk], hist, genre)
    Object.assign(rulesRef.current, next)
    _bumpRules(v => v + 1)
  }

  function startGame() {
    setPhase('tutorialIntro')
    _rebuildRules()
  }

  function startTutorial() {
    setPhase('tutorial')
  }

  function triggerUpdate() {
    setPhase('updating')
  }

  function choose(choiceId: string): string | undefined {
    const vk = currentVersionKeyRef.current
    const hist = choiceHistoryRef.current

    const ver = MANUAL_DECK[vk]
    const choice = ver.choices.find(c => c.id === choiceId)
    if (!choice) return undefined

    const nextVer = MANUAL_DECK[choice.next]
    if (!nextVer) {
      console.error(`[choose] invalid choice.next: ${choice.next}`)
      setPhase('playing')
      return `選択肢データが見つかりません（${choice.next}）`
    }

    soundManager.onChoiceSelect()

    const newHistory: ChoiceRecord[] = [...hist, {
      versionKey: vk,
      choiceId,
      genreParams: choice.genreParams,
    }]
    setChoiceHistory(newHistory)
    setVersionKey(choice.next)
    setUpdateIndex(i => i + 1)

    const accumulated = accumulateParams(newHistory.map(h => h.genreParams))
    const resolved = resolveGenre(accumulated, GENRES)

    if (nextVer.choices.length === 0 || resolved !== 'base') {
      const genre = resolved !== 'base' ? resolved : _forceResolve(accumulated)
      setLockedGenre(genre)
      soundManager.onGenreLock(genre)
      _rebuildRules(choice.next, newHistory, genre)
      setPhase('genreLocked')
    } else {
      _rebuildRules(choice.next, newHistory, lockedGenreRef.current)
      setPhase('playing')
    }
    return undefined
  }

  function _forceResolve(accumulated: ReturnType<typeof accumulateParams>): GenreId {
    const resolved = resolveGenre(accumulated, GENRES)
    return resolved !== 'base' ? resolved : 'runner'
  }

  function startThrowing(_playScoreRaw: number) {
    soundManager.onThrowStart()
    setPhase('throwing')
  }

  function finalizeThrowing(throwResult: ThrowResult, playScoreRaw: number) {
    soundManager.onThrowLand()
    const throwScore = calcThrowScore(throwResult)
    setFinalScore(calcFinalScore(playScoreRaw, throwScore))
    setPhase('ending')
  }

  function restart() {
    const emptyHistory: ChoiceRecord[] = []
    setPhase('title')
    setVersionKey('1.0')
    setChoiceHistory(emptyHistory)
    setLockedGenre(null)
    setUpdateIndex(0)
    setFinalScore(null)
    _rebuildRules('1.0', emptyHistory, null)
  }

  const currentManual = () => MANUAL_DECK[currentVersionKeyRef.current]
  const lockedGenreDef = () => GENRES.find(g => g.id === lockedGenreRef.current) ?? null

  return {
    phase,
    phaseRef,
    rules: rulesRef.current,
    currentVersionKey,
    choiceHistory,
    lockedGenre,
    updateIndex,
    finalScore,
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
