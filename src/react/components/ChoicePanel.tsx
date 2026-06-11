import { useState, useEffect } from 'react'
import type { Choice } from '../../domain/types'

interface ChoicePanelProps {
  choices: Choice[]
  version: string
  onChoose: (choiceId: string) => void
}

export default function ChoicePanel({ choices, version, onChoose }: ChoicePanelProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [staggered, setStaggered] = useState(false)

  useEffect(() => {
    setStaggered(true)
  }, [])

  function pick(choiceId: string) {
    if (selected) return
    setSelected(choiceId)
    setTimeout(() => onChoose(choiceId), 150)
  }

  return (
    <div className="choice-overlay">
      <div className="scanline-overlay" />
      <div className="choice-card">
        <div className="choice-header">
          <div className="choice-stamp">UPDATE</div>
          <div className="choice-ver">ver.{version} → ?</div>
          <div className="choice-prompt">説明書の内容を選んでください</div>
        </div>

        <div className="choice-options">
          {choices.map((c, idx) => (
            <button
              key={c.id}
              className={[
                'choice-btn',
                staggered ? 'staggered' : '',
                selected === c.id ? 'selected' : '',
                selected !== null && selected !== c.id ? 'faded' : '',
              ].filter(Boolean).join(' ')}
              data-choice-id={c.id}
              style={{ '--delay': idx * 80 + 'ms' } as React.CSSProperties}
              onClick={() => pick(c.id)}
            >
              <span className="choice-index">{String.fromCharCode(65 + idx)}</span>
              <span className="choice-label">{c.label}</span>
              <span className="choice-arrow">→</span>
            </button>
          ))}
        </div>

        <div className="choice-footnote">選んだ内容によってゲームが変わります</div>
      </div>
    </div>
  )
}
