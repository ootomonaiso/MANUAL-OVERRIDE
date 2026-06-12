import { ref } from 'vue'
import type { ManualVersion } from '../domain/types'

export function useManual(_currentManual: () => ManualVersion) {
  const history = ref<ManualVersion[]>([])
  const diffLines = ref<Array<{ text: string; type: 'added' | 'removed' | 'unchanged' }>>([])
  const isAnimating = ref(false)
  const isCentered = ref(false)

  function recordUpdate(nextManual: ManualVersion) {
    const prev = history.value[history.value.length - 1]
    history.value.push(nextManual)
    if (history.value.length > 4) history.value.shift()

    // 初回（prev なし）は差分アニメーション不要
    if (!prev) {
      diffLines.value = []
      isAnimating.value = false
      isCentered.value = false
      return
    }

    const prevLines = prev.manualText
    const nextLines = nextManual.manualText
    const diff: typeof diffLines.value = []

    const prevSet = new Set(prevLines)
    const nextSet = new Set(nextLines)

    // 削除行（prev にあって next にない）
    for (const line of prevLines) {
      if (!nextSet.has(line)) diff.push({ text: line, type: 'removed' })
    }
    // 追加行（next にあって prev にない）
    for (const line of nextLines) {
      if (!prevSet.has(line)) diff.push({ text: line, type: 'added' })
    }
    // 不変行（next の順序に合わせて末尾に）
    for (const line of nextLines) {
      if (prevSet.has(line)) diff.push({ text: line, type: 'unchanged' })
    }

    const ANIM_DURATION_MS = 1500
    const CENTER_DURATION_MS = 2800

    diffLines.value = diff
    isAnimating.value = true
    isCentered.value = true

    setTimeout(() => { isAnimating.value = false }, ANIM_DURATION_MS)
    setTimeout(() => { isCentered.value = false }, CENTER_DURATION_MS)
  }

  return { history, diffLines, isAnimating, isCentered, recordUpdate }
}
