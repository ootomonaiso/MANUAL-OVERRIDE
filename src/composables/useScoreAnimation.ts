import { ref, watch, onUnmounted, type Ref } from 'vue'

const SMALL_DIFF_THRESHOLD = 50   // これ以下の差分はアニメーションせず即更新
const ANIMATION_DURATION_MS = 600 // カウントアップアニメーションの所要時間

/**
 * スコアの数値変化をアニメーションする ViewModel ロジック。
 * 小さな増分（距離スコア等）は即反映、大きなジャンプ（死亡時スコア確定等）は
 * 600ms かけてカウントアップする。
 *
 * アニメーション中に新しいスコアが来た場合、現在のアニメーション途中の値ではなく
 * 最後に確定した source 値を起点に再計算することで振動を防止する。
 */
export function useScoreAnimation(source: Ref<number>) {
  const displayScore = ref(0)
  // 最後に確定した source 値を保持（アニメーション中の rapid update 対策）
  let lastCommittedSource = 0
  let rafId = 0

  watch(source, (next) => {
    const target = Math.round(next)
    const diff = target - lastCommittedSource

    cancelAnimationFrame(rafId)

    if (Math.abs(diff) <= SMALL_DIFF_THRESHOLD) {
      displayScore.value = target
      lastCommittedSource = target
      return
    }

    const start = lastCommittedSource
    lastCommittedSource = target
    const t0 = performance.now()

    function tick(now: number) {
      const progress = Math.min(1, (now - t0) / ANIMATION_DURATION_MS)
      displayScore.value = Math.round(start + diff * progress)
      if (progress < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  })

  onUnmounted(() => cancelAnimationFrame(rafId))

  return displayScore
}
