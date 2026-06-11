import { useState, useEffect } from 'react'

interface TutorialHintsProps {
  survivedSec: number
  jumps: number
  movesLeft: number
  movesRight: number
  distance: number
}

export default function TutorialHints({ survivedSec, jumps, movesLeft, movesRight, distance }: TutorialHintsProps) {
  const [movedDone, setMovedDone] = useState(false)
  const [jumpedDone, setJumpedDone] = useState(false)
  const [manualDone, setManualDone] = useState(false)
  const [allDone, setAllDone] = useState(false)

  useEffect(() => { if (movesLeft + movesRight > 0) setMovedDone(true) }, [movesLeft, movesRight])
  useEffect(() => { if (jumps > 0) setJumpedDone(true) }, [jumps])
  useEffect(() => {
    if (distance > 300) setManualDone(true)
    if (distance > 500) setAllDone(true)
  }, [distance])
  useEffect(() => { if (survivedSec > 8) setAllDone(true) }, [survivedSec])

  if (allDone) return null

  return (
    <div className="tutorial-hints-wrap">
      {!movedDone && (
        <div className="hint hint-move hint-appear">
          <div className="hint-step">① 移動</div>
          <div className="hint-keys">
            <kbd className="hint-key">← ArrowLeft</kbd>
            <kbd className="hint-key">→ ArrowRight</kbd>
          </div>
          <div className="hint-pulse" />
        </div>
      )}

      {!jumpedDone && (
        <div className="hint hint-jump hint-appear">
          <div className="hint-step">② ジャンプ</div>
          <div className="hint-keys">
            <kbd className="hint-key hint-key-wide">SPACE キー</kbd>
          </div>
          <div className="hint-pulse" />
        </div>
      )}

      {!manualDone && (
        <div className="hint hint-manual hint-appear">
          <div className="hint-manual-text">
            <span className="hint-manual-icon">📋</span>
            右下の説明書を読んでください
          </div>
          <div className="hint-manual-sub">選択でゲームが変わります</div>
          <div className="hint-manual-arrow">↘</div>
        </div>
      )}

      <div className="hint-colors">
        <span className="color-dot-hint danger" />
        <span className="hint-color-label">触れると失敗</span>
        <span className="hint-color-sep">/</span>
        <span className="color-dot-hint safe" />
        <span className="hint-color-label">安全</span>
      </div>
    </div>
  )
}
