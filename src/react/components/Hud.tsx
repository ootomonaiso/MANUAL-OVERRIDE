import { useRef, useEffect, useState } from 'react'
import { GENRES } from '../../data/genres'

interface HudProps {
  distance: number
  playScore: number
  kills: number
  combo: number
  hp: number
  maxHp: number
  beatHits: number
  genre: string
  features: Set<string>
}

export default function Hud({ distance, playScore, kills, combo, hp, maxHp, beatHits, genre, features }: HudProps) {
  const [displayScore, setDisplayScore] = useState(0)
  const rafRef = useRef(0)
  const prevScoreRef = useRef(playScore)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    const start = prevScoreRef.current
    const end = playScore
    prevScoreRef.current = playScore
    const duration = 180
    const t0 = performance.now()
    function tick(t: number) {
      const p = Math.min(1, (t - t0) / duration)
      setDisplayScore(Math.round(start + (end - start) * p))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playScore])

  const genreLabel = GENRES.find(g => g.id === genre)?.label ?? ''
  const distBar = Math.min(100, (distance / 4000) * 100)
  const comboColor = combo >= 10 ? '#00ff41' : combo >= 5 ? '#33aa55' : '#88ff44'

  return (
    <div className="hud">
      <div className="hud-score-block">
        <div className="hud-score">{displayScore.toLocaleString()}</div>
        <div className="hud-dist">
          <div className="hud-dist-bar">
            <div className="hud-dist-fill" style={{ width: distBar + '%' }} />
          </div>
          <span className="hud-dist-text">{Math.floor(distance)}m</span>
        </div>
      </div>

      {genre !== 'base' && (
        <div className="hud-genre-badge">{genreLabel}</div>
      )}

      <div className="hud-right">
        {features.has('hp') && (
          <div className="hud-hp-row">
            {Array.from({ length: maxHp }, (_, i) => (
              <span key={i} className={`hud-hp-heart${i >= hp ? ' empty' : ''}`}>♥</span>
            ))}
          </div>
        )}
        {(features.has('shoot') || features.has('enemy_hp')) && (
          <div className="hud-stat">
            <span className="hud-stat-label">KILLS</span>
            <span className="hud-stat-val">{kills}</span>
          </div>
        )}
        {features.has('beat_hazard') && (
          <div className="hud-stat">
            <span className="hud-stat-label">JUST</span>
            <span className="hud-stat-val">{beatHits}</span>
          </div>
        )}
      </div>

      {combo >= 2 && (
        <div className="hud-combo" style={{ color: comboColor }}>
          <span className="hud-combo-num">×{combo}</span>
          <span className="hud-combo-label">COMBO</span>
        </div>
      )}
    </div>
  )
}
