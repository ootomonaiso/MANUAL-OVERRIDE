import { ref } from 'vue'
import type { ManualVersion } from '../domain/types'

export type DiffLine = { text: string; type: 'added' | 'removed' | 'unchanged' }

/**
 * LCS (Longest Common Subsequence) ベースの行単位差分計算。
 * 重複行を正しく扱う。
 * 差分がない場合は空配列を返す。
 */
export function computeLineDiff(prevLines: string[], nextLines: string[]): DiffLine[] {
  const m = prevLines.length
  const n = nextLines.length

  // LCS テーブル構築
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (prevLines[i - 1] === nextLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // バックトラックで差分を抽出
  let i = m
  let j = n
  const result: DiffLine[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && prevLines[i - 1] === nextLines[j - 1]) {
      result.push({ text: prevLines[i - 1], type: 'unchanged' })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ text: nextLines[j - 1], type: 'added' })
      j--
    } else if (i > 0) {
      result.push({ text: prevLines[i - 1], type: 'removed' })
      i--
    } else {
      break
    }
  }

  result.reverse()

  // 差分がない場合は空配列
  const hasDiff = result.some(r => r.type !== 'unchanged')
  return hasDiff ? result : []
}

export function useManual(_currentManual: () => ManualVersion) {
  const history = ref<ManualVersion[]>([])
  const diffLines = ref<DiffLine[]>([])
  const isAnimating = ref(false)
  const isCentered = ref(false)

  // タイマーIDの追跡（連続更新時に前のタイマーをクリア）
  let animTimer: ReturnType<typeof setTimeout> | null = null
  let centerTimer: ReturnType<typeof setTimeout> | null = null

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

    // 差分計算
    diffLines.value = computeLineDiff(prev.manualText, nextManual.manualText)

    const ANIM_DURATION_MS = 1500
    const CENTER_DURATION_MS = 2800

    // 既存タイマーをクリア（連続更新時のアニメーション破綻防止）
    if (animTimer !== null) clearTimeout(animTimer)
    if (centerTimer !== null) clearTimeout(centerTimer)

    isAnimating.value = true
    isCentered.value = true

    animTimer = setTimeout(() => { isAnimating.value = false }, ANIM_DURATION_MS)
    centerTimer = setTimeout(() => { isCentered.value = false }, CENTER_DURATION_MS)
  }

  return { history, diffLines, isAnimating, isCentered, recordUpdate }
}
