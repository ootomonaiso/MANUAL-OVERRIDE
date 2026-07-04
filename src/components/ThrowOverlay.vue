<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  createThrowState, onDragStart, onDragMove, onRelease, updateThrow,
  type ThrowState,
} from '../game/throwEngine'
import type { ThrowResult } from '../domain/types'

defineProps<{
  manualVersion: string
  manualText: string[]
}>()

const emit = defineEmits<{
  (e: 'thrown', result: ThrowResult): void
}>()

const state = ref<ThrowState>(createThrowState())

// 説明書UIのDOM位置（投擲起点）
const manualRef = ref<HTMLDivElement | null>(null)
const isDragging = computed(() => state.value.phase === 'dragging')
const isFlying = computed(() => state.value.phase === 'flying')
// Canvas サイズ（ThrowEngine 用）— リサイズ時に更新
const canvasH = ref(window.innerHeight)

// アニメーションループ
let rafId = 0
let lastTime = 0

function startAnim() {
  lastTime = performance.now()
  function loop(ts: number) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05)
    lastTime = ts
    updateThrow(state.value, dt, canvasH.value)
    if (state.value.phase === 'done') {
      if (state.value.result) emit('thrown', state.value.result)
      rafId = 0
      return
    }
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

// ドラッグ操作
function onMouseDown(e: MouseEvent | TouchEvent) {
  // タッチイベントのスクロール/ズームを防止
  if ('touches' in e) {
    e.preventDefault()
  }
  const { clientX, clientY } = 'touches' in e ? e.touches[0] : e
  state.value = createThrowState()
  const el = manualRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return
  onDragStart(state.value, clientX, clientY)
  // 飛行先の初期位置 = 説明書の中心
  state.value.manualX = rect.left + rect.width / 2
  state.value.manualY = rect.top + rect.height / 2
}

function onMouseMove(e: MouseEvent | TouchEvent) {
  const { clientX, clientY } = 'touches' in e ? e.touches[0] : e
  onDragMove(state.value, clientX, clientY)
}

function onMouseUp() {
  if (state.value.phase !== 'dragging') return
  const el = manualRef.value
  if (el) {
    const rect = el.getBoundingClientRect()
    state.value.manualX = rect.left + rect.width / 2
    state.value.manualY = rect.top + rect.height / 2
  }
  onRelease(state.value)
  startAnim()
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('touchmove', onMouseMove)
  window.addEventListener('touchend', onMouseUp)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('touchmove', onMouseMove)
  window.removeEventListener('touchend', onMouseUp)
  window.removeEventListener('resize', onResize)
})

// ウィンドウリサイズ対応
function onResize() {
  canvasH.value = window.innerHeight
}

// 弧の軌跡描画（SVG）
const trailPoints = computed(() => {
  if (!isFlying.value) return ''
  const x = state.value.manualX
  const y = state.value.manualY
  return `M${state.value.startX},${state.value.startY} Q${state.value.startX},${state.value.startY - 80} ${x},${y}`
})

</script>

<template>
  <div class="throw-overlay" @mousedown="onMouseDown" @touchstart="onMouseDown">
    <!-- 説明書（ドラッグ対象） -->
    <div
      ref="manualRef"
      class="throw-manual"
      :class="{ dragging: isDragging, flying: isFlying }"
      :style="isFlying ? {
        left: state.manualX + 'px',
        top: state.manualY + 'px',
        transform: `translate(-50%, -50%) rotate(${state.airTime * 280}deg)`,
        position: 'fixed',
      } : {}"
    >
      <div class="throw-manual-header">取扱説明書 ver.{{ manualVersion }}</div>
      <div v-for="line in manualText" :key="line" class="throw-manual-line">{{ line }}</div>
    </div>

    <!-- ドラッグ中: 軌道予測線 + パワーゲージ -->
    <svg v-if="isDragging" class="throw-svg" :style="{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }">
      <line
        :x1="state.startX" :y1="state.startY"
        :x2="state.currentX" :y2="state.currentY"
        stroke="rgba(200,0,0,0.5)" stroke-width="2" stroke-dasharray="6,4"
      />
    </svg>

    <!-- パワーゲージ -->
    <div v-if="isDragging" class="power-gauge" :style="{ left: state.startX + 'px', top: state.startY - 60 + 'px' }">
      <div class="gauge-track">
        <div class="gauge-fill" :style="{ width: (state.power * 100) + '%' }" />
      </div>
      <div class="gauge-label">POWER {{ Math.round(state.power * 100) }}%</div>
    </div>

    <!-- 飛行中の軌跡 SVG -->
    <svg v-if="isFlying" class="throw-svg" :style="{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }">
      <path :d="trailPoints" fill="none" stroke="rgba(200,0,0,0.3)" stroke-width="2" />
    </svg>

    <!-- 指示テキスト -->
    <div v-if="!isDragging && !isFlying" class="throw-hint">
      <div class="throw-hint-text">説明書をドラッグして投げる</div>
      <div class="throw-hint-sub">弧を描くように投げると高スコア</div>
    </div>
  </div>
</template>

<style scoped>
.throw-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 40;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
}
.throw-overlay:active { cursor: grabbing; }

.throw-manual {
  background: #fff;
  border: 2px solid #222;
  border-radius: 4px;
  padding: 14px 18px;
  width: 220px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #111;
  box-shadow: 4px 4px 0 #222;
  user-select: none;
  cursor: grab;
  transition: box-shadow 0.1s, transform 0.1s;
}
.throw-manual:active { cursor: grabbing; }
.throw-manual.dragging {
  box-shadow: 8px 8px 0 #222;
  transform: scale(1.04) rotate(-2deg);
}
.throw-manual.flying {
  cursor: default;
  pointer-events: none;
  z-index: 50;
  box-shadow: 12px 12px 20px rgba(0,0,0,0.5);
}

.throw-manual-header {
  font-weight: bold;
  border-bottom: 1px solid #ccc;
  padding-bottom: 4px;
  margin-bottom: 8px;
  font-size: 11px;
}
.throw-manual-line { padding: 1px 0; }

/* パワーゲージ */
.power-gauge {
  position: fixed;
  transform: translate(-50%, 0);
  z-index: 50;
  text-align: center;
}
.gauge-track {
  width: 120px;
  height: 10px;
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.4);
  border-radius: 5px;
  overflow: hidden;
}
.gauge-fill {
  height: 100%;
  background: linear-gradient(90deg, #22cc44, #ffcc00, #ff4444);
  transition: width 0.05s;
  border-radius: 5px;
}
.gauge-label {
  font-size: 11px;
  color: #fff;
  margin-top: 3px;
  font-family: monospace;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.throw-hint {
  position: absolute;
  bottom: 30%;
  text-align: center;
  color: rgba(255,255,255,0.8);
}
.throw-hint-text {
  font-size: 18px;
  font-family: 'Courier New', monospace;
  margin-bottom: 6px;
}
.throw-hint-sub {
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  font-family: monospace;
}

.throw-svg { pointer-events: none; }
</style>
