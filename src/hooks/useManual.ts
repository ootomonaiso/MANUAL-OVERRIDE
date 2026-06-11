import { useState, useRef } from 'react'
import type { ManualVersion } from '../domain/types'

export type DiffLine = { text: string; type: 'added' | 'removed' | 'unchanged' }

export function useManual(_currentManual: () => ManualVersion) {
  const [history, setHistoryState] = useState<ManualVersion[]>([])
  const historyRef = useRef<ManualVersion[]>([])

  const [diffLines, setDiffLines] = useState<DiffLine[]>([])
  const [isAnimating, setIsAnimating] = useState(false)
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function recordUpdate(nextManual: ManualVersion) {
    const prev = historyRef.current[historyRef.current.length - 1]
    const newHistory = [...historyRef.current, nextManual]
    if (newHistory.length > 4) newHistory.shift()
    historyRef.current = newHistory
    setHistoryState(newHistory)

    if (!prev) {
      setDiffLines([])
      setIsAnimating(false)
      return
    }

    const prevLines = prev.manualText
    const nextLines = nextManual.manualText
    const diff: DiffLine[] = []

    const prevSet = new Set(prevLines)
    const nextSet = new Set(nextLines)

    for (const line of prevLines) {
      if (!nextSet.has(line)) diff.push({ text: line, type: 'removed' })
    }
    for (const line of nextLines) {
      if (!prevSet.has(line)) diff.push({ text: line, type: 'added' })
    }
    for (const line of nextLines) {
      if (prevSet.has(line)) diff.push({ text: line, type: 'unchanged' })
    }

    setDiffLines(diff)
    setIsAnimating(true)
    if (animTimerRef.current !== null) clearTimeout(animTimerRef.current)
    animTimerRef.current = setTimeout(() => setIsAnimating(false), 1500)
  }

  return { history, diffLines, isAnimating, recordUpdate }
}
