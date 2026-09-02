<script setup lang="ts">
/**
 * src/data/sprites/*.json のドット絵を DOM 上に描く。
 *
 * Canvas ではなく SVG の矩形として描くのは、
 *  - 被弾時の単色シルエット（tint）を再描画なしで差し替えられる
 *  - 拡大しても輪郭が滲まない（shape-rendering="crispEdges"）
 *  - happy-dom（2Dコンテキストを持たない）でもそのまま検証できる
 * ため。横に連続する同色セルは1つの矩形へまとめてから出力する。
 */
import { computed } from 'vue'
import { SPRITES } from '../../data/sprites'

const props = withDefaults(defineProps<{
  spriteId: string
  frame?: string
  /** 指定するとすべてのセルをこの色で塗る（被弾フラッシュのシルエット表現） */
  tint?: string | null
  flipX?: boolean
}>(), { frame: 'idle', tint: null, flipX: false })

interface Run { x: number; y: number; w: number; color: string }

/** 同じスプライト・同じフレームの矩形分解は使い回す（毎フレームの再計算を避ける） */
const runCache = new Map<string, Run[]>()

function buildRuns(spriteId: string, frame: string): Run[] {
  const def = SPRITES[spriteId]
  if (!def) return []
  const rows = def.frames[frame] ?? def.frames.idle
  if (!rows) return []

  const runs: Run[] = []
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      const raw = ch === '.' ? undefined : def.palette[ch]
      // 動的色スロット(@)は戦闘スプライトでは使わない。未解決は透明として飛ばす
      if (!raw || raw.startsWith('@')) { x++; continue }
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      runs.push({ x, y, w: end - x, color: raw })
      x = end
    }
  }
  return runs
}

const def = computed(() => SPRITES[props.spriteId])

const runs = computed<Run[]>(() => {
  const key = `${props.spriteId}|${props.frame}`
  const cached = runCache.get(key)
  if (cached) return cached
  const built = buildRuns(props.spriteId, props.frame)
  runCache.set(key, built)
  return built
})
</script>

<template>
  <svg
    v-if="def"
    class="pixel-sprite"
    :class="{ tinted: tint !== null }"
    :viewBox="`0 0 ${def.w} ${def.h}`"
    :style="{ transform: flipX ? 'scaleX(-1)' : undefined }"
    preserveAspectRatio="xMidYMax meet"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <rect
      v-for="(r, i) in runs"
      :key="i"
      :x="r.x"
      :y="r.y"
      :width="r.w"
      height="1"
      :fill="tint ?? r.color"
    />
  </svg>
</template>

<style scoped>
.pixel-sprite {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
