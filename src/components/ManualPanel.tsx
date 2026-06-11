import { useState, useMemo } from 'react'
import type { ManualVersion, ManualTheme } from '../domain/types'
import type { DiffLine } from '../hooks/useManual'

interface ManualPanelProps {
  manual: ManualVersion
  theme: ManualTheme
  diffLines: DiffLine[]
  isAnimating: boolean
  history: ManualVersion[]
  features?: Set<string>
  highlight?: boolean
}

const KEY_MAP: Record<string, string> = {
  Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
}

function keyLabel(key: string) {
  return KEY_MAP[key] ?? key.toUpperCase()
}

export default function ManualPanel({ manual, theme, diffLines, isAnimating, history, features, highlight }: ManualPanelProps) {
  const [showHistory, setShowHistory] = useState(false)

  const filteredManualText = useMemo(() => {
    if (!features?.has('auto_run')) return manual.manualText
    return manual.manualText.filter(l => !l.includes('←') && !l.includes('→') && !l.includes('左右'))
  }, [manual.manualText, features])

  const filteredDiffLines = useMemo(() => {
    if (!features?.has('auto_run')) return diffLines
    return diffLines.filter(l => !l.text.includes('←') && !l.text.includes('→') && !l.text.includes('左右'))
  }, [diffLines, features])

  const panelClass = [
    'manual-panel',
    `theme-${theme}`,
    highlight ? 'manual-highlight' : '',
  ].filter(Boolean).join(' ')

  const showDiff = isAnimating && filteredDiffLines.length > 0

  return (
    <div className={panelClass}>
      <div className="manual-header">
        <div className="manual-ver-badge">
          <span className="manual-ver-dot" />
          ver.{manual.version}
        </div>
        <button
          className="history-btn"
          tabIndex={-1}
          onClick={() => setShowHistory(v => !v)}
        >
          {showHistory ? '▲' : '▼ 履歴'}
        </button>
      </div>

      <div className={`manual-history${showHistory ? ' open' : ''}`}>
        {history.length <= 1 ? (
          <div className="history-empty">まだ更新はありません</div>
        ) : (
          [...history].reverse().slice(1).map(h => (
            <div key={h.version} className="history-item">
              <div className="history-ver">ver.{h.version}</div>
              {h.manualText.map(line => (
                <div key={line} className="history-line">{line}</div>
              ))}
            </div>
          ))
        )}
      </div>

      {manual.image && (
        <div className="manual-image-wrap">
          <img
            src={manual.image}
            alt={manual.imageAlt ?? '説明書のイラスト'}
            className="manual-image"
            loading="lazy"
          />
        </div>
      )}

      <div className="manual-body">
        {showDiff ? (
          filteredDiffLines.map((line, i) => (
            <div
              key={i}
              className="manual-line"
              style={line.type === 'added' ? { animationDelay: (i * 40) + 'ms' } : undefined}
            >
              {line.type === 'removed' && <span className="line-removed">{line.text}</span>}
              {line.type === 'added'   && <span className="line-added">{line.text}</span>}
              {line.type === 'unchanged' && <span className="line-unchanged">{line.text}</span>}
            </div>
          ))
        ) : (
          filteredManualText.map(line => (
            <div key={line} className="manual-line line-unchanged">
              <span>{line}</span>
            </div>
          ))
        )}
      </div>

      <div className="manual-controls">
        <div className="controls-title">操作</div>
        <div className="controls-grid">
          {!features?.has('auto_run') && (
            <>
              <span className="key-badge">{keyLabel(manual.controls.moveLeft)}</span>
              <span className="key-action">左移動</span>
              <span className="key-badge">{keyLabel(manual.controls.moveRight)}</span>
              <span className="key-action">右移動</span>
            </>
          )}
          <span className="key-badge">{keyLabel(manual.controls.jump)}</span>
          <span className="key-action">ジャンプ</span>
          {manual.controls.shoot && (
            <>
              <span className="key-badge">{keyLabel(manual.controls.shoot)}</span>
              <span className="key-action">ショット</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
