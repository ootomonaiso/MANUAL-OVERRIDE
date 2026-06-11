import { useState, useEffect, useMemo } from 'react'
import type { FinalScore, GenreId } from '../domain/types'
import { GENRES } from '../data/genres'

interface EndingPanelProps {
  finalScore: FinalScore
  genre: GenreId
  choiceCount: number
  onRestart: () => void
}

function grade(total: number): string {
  if (total >= 8000) return 'S'
  if (total >= 5000) return 'A'
  if (total >= 2500) return 'B'
  if (total >= 1000) return 'C'
  return 'D'
}

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3) }

function animateCount(target: number, setter: (v: number) => void, delay: number, duration = 900) {
  setTimeout(() => {
    const start = performance.now()
    function step(now: number) {
      const t = Math.min((now - start) / duration, 1)
      setter(Math.round(easeOut(t) * target))
      if (t < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, delay)
}

export default function EndingPanel({ finalScore, genre, choiceCount, onRestart }: EndingPanelProps) {
  const [displayPlay, setDisplayPlay] = useState(0)
  const [displayThrow, setDisplayThrow] = useState(0)
  const [displayTotal, setDisplayTotal] = useState(0)
  const [gradeVisible, setGradeVisible] = useState(false)
  const [altVisible, setAltVisible] = useState(false)

  const genreDef = GENRES.find(g => g.id === genre)
  const genreLabel = genreDef?.label ?? 'ゲーム'
  const endingFlavor = genreDef?.endingFlavor ?? ''
  const otherGenres = GENRES.filter(g => g.id !== genre && g.id !== 'base')
  const gradeStr = grade(finalScore.total)

  const accentColors: Record<string, string> = {
    runner: '#4488ff', stg: '#44aaff', rpg: '#aa8844', puzzle: '#444444', rhythm: '#cc44ff',
  }
  const accentColor = accentColors[genre] ?? '#cc2222'

  useEffect(() => {
    animateCount(finalScore.play,  setDisplayPlay,  400)
    animateCount(finalScore.throw, setDisplayThrow, 900)
    animateCount(finalScore.total, setDisplayTotal, 1400, 600)
    setTimeout(() => setGradeVisible(true), 2200)
    setTimeout(() => setAltVisible(true),   2700)
  }, [])

  return (
    <div className="ending-overlay">
      <div className="ending-card">
        <div className="ending-genre-section">
          <div className="ending-genre-label">ゲームが完成しました</div>
          <div className="ending-genre-name" style={{ color: accentColor }}>{genreLabel}</div>
          <div className="ending-genre-sub">{choiceCount} 回の選択で作りました</div>
        </div>

        <div className="ending-score-box">
          <div className="score-row">
            <span className="score-label">プレイスコア</span>
            <span className="score-value">{displayPlay.toLocaleString()}</span>
          </div>
          <div className="score-row">
            <span className="score-label">投擲スコア</span>
            <span className="score-value">{displayThrow.toLocaleString()}</span>
          </div>
          <div className="score-divider" />
          <div className="score-row total">
            <span className="score-label">合計</span>
            <span className="score-value">{displayTotal.toLocaleString()}</span>
          </div>
        </div>

        {gradeVisible && (
          <div className="ending-grade">{gradeStr}</div>
        )}

        {altVisible && (
          <div className="ending-alt">
            <div className="alt-label">別の選択をしていたら…</div>
            <div className="alt-routes">
              {otherGenres.map(g => (
                <span key={g.id} className="alt-chip">{g.label}</span>
              ))}
            </div>
            <div className="alt-hint">になっていたかもしれません。</div>
          </div>
        )}

        {altVisible && endingFlavor && (
          <div className="ending-flavor">{endingFlavor}</div>
        )}

        <button className="restart-btn" onClick={onRestart}>もう一度遊ぶ</button>
      </div>
    </div>
  )
}
