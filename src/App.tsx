import { useRef, useState, useEffect, useMemo } from 'react'
import { useGameState } from './hooks/useGameState'
import { useManual } from './hooks/useManual'
import { SideScroller, type GameSnapshot } from './game/sideScroller'
import Hud from './components/Hud'
import ManualPanel from './components/ManualPanel'
import ChoicePanel from './components/ChoicePanel'
import ThrowOverlay from './components/ThrowOverlay'
import EndingPanel from './components/EndingPanel'
import TutorialHints from './components/TutorialHints'
import PluginLoader from './components/PluginLoader'
import TutorialScreen from './TutorialScreen'
import { GENRES } from './data/genres'
import type { ThrowResult } from './domain/types'
import { TUTORIAL_ENABLED } from './tutorial/const'

const INITIAL_SNAPSHOT: GameSnapshot = {
  distance: 0, playScore: 0, combo: 0, kills: 0, exp: 0,
  beatHits: 0, survivedSec: 0, hp: 3, maxHp: 3, dead: false, shouldUpdate: null,
  statJumps: 0, statMoveLeft: 0, statMoveRight: 0, firstJumpDone: false,
  learningNotification: null, scoreFormulaError: null,
}

export default function App() {
  const gameState = useGameState()
  const manualCtl = useManual(gameState.currentManual)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollerRef = useRef<SideScroller | null>(null)
  const snapRafRef = useRef(0)

  const [snapshot, setSnapshot] = useState<GameSnapshot>(INITIAL_SNAPSHOT)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable refs for values accessed inside RAF callbacks
  const phaseRef = gameState.phaseRef  // already exposed from hook

  function showToast(msg: string) {
    setToastMessage(msg)
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 3500)
  }

  function resizeCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    scrollerRef.current?.onResize()
  }

  function startGame() {
    gameState.startGame()
    const canvas = canvasRef.current!
    resizeCanvas()
    scrollerRef.current = new SideScroller(canvas, gameState.rules)
    manualCtl.recordUpdate(gameState.currentManual())
    scrollerRef.current.start()
    if (TUTORIAL_ENABLED) {
      scrollerRef.current.setPaused(true)
    }
    beginSnapshotLoop()
  }

  function startTutorial() {
    if (TUTORIAL_ENABLED) {
      gameState.startTutorial()
      scrollerRef.current?.setPaused(false)
    }
  }

  function beginSnapshotLoop() {
    function loop() {
      if (!scrollerRef.current) return
      const snap = scrollerRef.current.getSnapshot()
      setSnapshot(snap)

      const activePlay = ['playing', 'tutorial'].includes(phaseRef.current)
      if (snap.shouldUpdate !== null && snap.firstJumpDone && activePlay) {
        scrollerRef.current.setPaused(true)
        gameState.triggerUpdate()
      }

      const p = phaseRef.current
      if (snap.dead && p !== 'throwing' && p !== 'ending' && p !== 'updating') {
        gameState.startThrowing(snap.playScore)
      }

      if (snap.learningNotification) {
        showToast(`🎯 ${snap.learningNotification}`)
      }

      if (import.meta.env.DEV && snap.scoreFormulaError) {
        showToast(`⚠ スコア式エラー: ${snap.scoreFormulaError}`)
      }

      snapRafRef.current = requestAnimationFrame(loop)
    }
    snapRafRef.current = requestAnimationFrame(loop)
  }

  function onChoose(choiceId: string) {
    if (!scrollerRef.current) {
      showToast('エラー: ゲームが初期化されていません')
      return
    }
    const idx = snapshot.shouldUpdate ?? 0
    const chooseError = gameState.choose(choiceId)
    if (chooseError) {
      showToast(`エラー: ${chooseError}`)
      return
    }
    const currentManual = gameState.currentManual()
    manualCtl.recordUpdate(currentManual)
    scrollerRef.current.updateRules(gameState.rules, currentManual)
    scrollerRef.current.markUpdated(idx)
  }

  function giveUp() {
    scrollerRef.current?.setPaused(true)
    gameState.startThrowing(snapshot.playScore)
  }

  function onThrown(result: ThrowResult) {
    gameState.finalizeThrowing(result, snapshot.playScore)
  }

  function restart() {
    cancelAnimationFrame(snapRafRef.current)
    scrollerRef.current?.stop()
    scrollerRef.current = null
    gameState.restart()
    setSnapshot(INITIAL_SNAPSHOT)
  }

  // Phase change → pause/resume scroller
  useEffect(() => {
    const phase = gameState.phase
    if (phase === 'updating') {
      scrollerRef.current?.setPaused(true)
    } else if (['playing', 'tutorial', 'genreLocked'].includes(phase)) {
      scrollerRef.current?.setPaused(false)
    }
  }, [gameState.phase])

  // Genre lock → temporary speed boost
  useEffect(() => {
    const genre = gameState.lockedGenre
    if (!genre || !scrollerRef.current) return
    const rules = gameState.rules
    const originalSpeed = rules.scrollSpeed
    rules.scrollSpeed = originalSpeed * 1.35
    scrollerRef.current.updateRules(rules, gameState.currentManual())

    const timer = window.setTimeout(() => {
      rules.scrollSpeed = originalSpeed
      scrollerRef.current?.updateRules(rules, gameState.currentManual())
    }, 800)
    return () => clearTimeout(timer)
  }, [gameState.lockedGenre])

  useEffect(() => {
    window.addEventListener('resize', resizeCanvas)
    return () => {
      cancelAnimationFrame(snapRafRef.current)
      scrollerRef.current?.stop()
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  const currentTheme = useMemo(() => {
    const genre = gameState.lockedGenre
    if (!genre) return 'plain' as const
    return GENRES.find(g => g.id === genre)?.theme ?? 'plain' as const
  }, [gameState.lockedGenre])

  const { phase, lockedGenre, finalScore } = gameState
  const isPlaying = phase !== 'title' && phase !== 'ending' && phase !== 'tutorialIntro'

  return (
    <div className="app-root">
      <canvas ref={canvasRef} className="game-canvas" />

      {/* ─── タイトル ─── */}
      {phase === 'title' && (
        <div className="title-screen">
          <div className="title-scanlines" />
          <div className="title-grid-bg" />
          <div className="title-card">
            <div className="title-doc-header">
              <span className="title-doc-tag">GAME MANUAL</span>
              <span className="title-doc-tag">ver.1.0</span>
            </div>
            <div className="title-rule" />
            <div className="title-main">MANUAL<br />OVERRIDE</div>
            <div className="title-sub">
              説明書が更新されるたびにゲームが変わる。<br />
              あなたはどんなゲームを作りますか？<span className="title-cursor">|</span>
            </div>
            <button className="title-btn" onClick={startGame}>
              <span className="title-btn-bracket">[</span>
              &nbsp;はじめる&nbsp;
              <span className="title-btn-bracket">]</span>
            </button>
            <div className="title-controls">
              <span className="ctrl-group">
                <kbd className="ctrl-key">←</kbd><kbd className="ctrl-key">→</kbd>
                <span className="ctrl-desc">移動</span>
              </span>
              <span className="ctrl-sep">/</span>
              <span className="ctrl-group">
                <kbd className="ctrl-key">SPACE</kbd>
                <span className="ctrl-desc">ジャンプ</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── チュートリアル ─── */}
      {phase === 'tutorialIntro' && (
        <TutorialScreen onStart={startTutorial} />
      )}

      {/* ─── ゲームプレイ中 ─── */}
      {isPlaying && (
        <>
          <Hud
            distance={snapshot.distance}
            playScore={snapshot.playScore}
            kills={snapshot.kills}
            combo={snapshot.combo}
            hp={snapshot.hp}
            maxHp={snapshot.maxHp}
            beatHits={snapshot.beatHits}
            genre={gameState.rules.genre}
            features={gameState.rules.features}
          />

          {phase !== 'throwing' && (
            <ManualPanel
              manual={gameState.currentManual()}
              theme={currentTheme}
              diffLines={manualCtl.diffLines}
              isAnimating={manualCtl.isAnimating}
              history={manualCtl.history}
              features={gameState.rules.features}
              highlight={phase === 'tutorial'}
            />
          )}

          {phase === 'tutorial' && (
            <TutorialHints
              survivedSec={snapshot.survivedSec}
              jumps={snapshot.statJumps}
              movesLeft={snapshot.statMoveLeft}
              movesRight={snapshot.statMoveRight}
              distance={snapshot.distance}
            />
          )}

          {['playing', 'genreLocked'].includes(phase) && !snapshot.dead && (
            <div className="giveup-area">
              <button className="giveup-btn" tabIndex={-1} onClick={giveUp}>
                説明書を投げてゲームを終わらせる
              </button>
              <div className="giveup-hint">ドラッグして投げると高スコア</div>
            </div>
          )}

          {phase === 'genreLocked' && (
            <div className="genre-locked-effect">
              <div className="genre-ink-bleed" />
              <div className="genre-locked-banner">
                <div className="genre-locked-text">
                  {gameState.lockedGenreDef()?.manualReveal}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── 2択選択 ─── */}
      {phase === 'updating' && (
        <ChoicePanel
          choices={gameState.currentManual().choices}
          version={gameState.currentManual().version}
          onChoose={onChoose}
        />
      )}

      {/* ─── 投擲 ─── */}
      {phase === 'throwing' && (
        <ThrowOverlay
          manualVersion={gameState.currentManual().version}
          manualText={gameState.currentManual().manualText}
          onThrown={onThrown}
        />
      )}

      {/* ─── エンディング ─── */}
      {phase === 'ending' && finalScore && (
        <EndingPanel
          finalScore={finalScore}
          genre={lockedGenre ?? 'runner'}
          choiceCount={gameState.choiceHistory.length}
          onRestart={restart}
        />
      )}

      <PluginLoader />

      {toastMessage && (
        <div className="error-toast">
          <span className="toast-icon">⚠</span>
          {toastMessage}
        </div>
      )}
    </div>
  )
}
