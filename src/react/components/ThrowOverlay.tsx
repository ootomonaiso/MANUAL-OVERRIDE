import { useRef, useEffect, useState } from 'react'
import {
  createThrowState, onDragStart, onDragMove, onRelease, updateThrow,
} from '../../game/throwEngine'
import type { ThrowResult } from '../../domain/types'

interface ThrowOverlayProps {
  manualVersion: string
  manualText: string[]
  onThrown: (result: ThrowResult) => void
}

export default function ThrowOverlay({ manualVersion, manualText, onThrown }: ThrowOverlayProps) {
  const stateRef = useRef(createThrowState())
  const [, bump] = useState(0)
  const manualRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)
  const CANVAS_H = window.innerHeight

  const s = stateRef.current
  const isDragging = s.phase === 'dragging'
  const isFlying = s.phase === 'flying'

  function startAnim() {
    lastTimeRef.current = performance.now()
    function loop(ts: number) {
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = ts
      updateThrow(stateRef.current, dt, CANVAS_H)
      if (stateRef.current.phase === 'done') {
        onThrown(stateRef.current.result!)
        return
      }
      bump(v => v + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : e
    stateRef.current = createThrowState()
    const el = manualRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return
    onDragStart(stateRef.current, clientX, clientY)
    stateRef.current.manualX = rect.left + rect.width / 2
    stateRef.current.manualY = rect.top + rect.height / 2
    bump(v => v + 1)
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const { clientX, clientY } = e
      onDragMove(stateRef.current, clientX, clientY)
      bump(v => v + 1)
    }
    function onTouchMove(e: TouchEvent) {
      const { clientX, clientY } = e.touches[0]
      onDragMove(stateRef.current, clientX, clientY)
      bump(v => v + 1)
    }
    function onUp() {
      if (stateRef.current.phase !== 'dragging') return
      const el = manualRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        stateRef.current.manualX = rect.left + rect.width / 2
        stateRef.current.manualY = rect.top + rect.height / 2
      }
      onRelease(stateRef.current)
      startAnim()
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', onUp)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  const trailPoints = isFlying
    ? `M${s.startX},${s.startY} Q${s.startX},${s.startY - 80} ${s.manualX},${s.manualY}`
    : ''

  const flyStyle: React.CSSProperties = isFlying ? {
    left: s.manualX + 'px',
    top: s.manualY + 'px',
    transform: `translate(-50%, -50%) rotate(${s.airTime * 280}deg)`,
    position: 'fixed',
  } : {}

  return (
    <div
      className="throw-overlay"
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      <div
        ref={manualRef}
        className={['throw-manual', isDragging ? 'dragging' : '', isFlying ? 'flying' : ''].filter(Boolean).join(' ')}
        style={flyStyle}
      >
        <div className="throw-manual-header">取扱説明書 ver.{manualVersion}</div>
        {manualText.map(line => (
          <div key={line} className="throw-manual-line">{line}</div>
        ))}
      </div>

      {isDragging && (
        <svg
          className="throw-svg"
          style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <line
            x1={s.startX} y1={s.startY}
            x2={s.currentX} y2={s.currentY}
            stroke="rgba(200,0,0,0.5)" strokeWidth="2" strokeDasharray="6,4"
          />
        </svg>
      )}

      {isDragging && (
        <div className="power-gauge" style={{ left: s.startX + 'px', top: s.startY - 60 + 'px' }}>
          <div className="gauge-track">
            <div className="gauge-fill" style={{ width: (s.power * 100) + '%' }} />
          </div>
          <div className="gauge-label">POWER {Math.round(s.power * 100)}%</div>
        </div>
      )}

      {isFlying && (
        <svg
          className="throw-svg"
          style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <path d={trailPoints} fill="none" stroke="rgba(200,0,0,0.3)" strokeWidth="2" />
        </svg>
      )}

      {!isDragging && !isFlying && (
        <div className="throw-hint">
          <div className="throw-hint-text">説明書をドラッグして投げる</div>
          <div className="throw-hint-sub">弧を描くように投げると高スコア</div>
        </div>
      )}
    </div>
  )
}
