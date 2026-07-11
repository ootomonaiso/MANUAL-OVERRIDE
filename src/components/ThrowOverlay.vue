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

const manualRef = ref<HTMLDivElement | null>(null)
const isDragging = computed(() => state.value.phase === 'dragging')
const isFlying = computed(() => state.value.phase === 'flying')
// Canvas サイズ（ThrowEngine 用）— リサイズ時に更新
const canvasH = ref(window.innerHeight)

// 演出用の状態
const shake = ref(false)          // 発射・着地時の画面シェイク
interface Spark { id: number; x: number; y: number; dx: number; dy: number; hue: number }
const sparks = ref<Spark[]>([])   // 発射・着地バースト
const impact = ref<{ x: number; y: number } | null>(null)  // 着地の衝撃リング
let sparkSeq = 0

function triggerShake() {
  shake.value = false
  // 次フレームで付け直してアニメーションを再始動
  requestAnimationFrame(() => { shake.value = true })
  window.setTimeout(() => { shake.value = false }, 360)
}

// x,y を中心に count 個の粒子を放射状に飛ばす
function burst(x: number, y: number, count: number, power: number) {
  const added: Spark[] = []
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5
    const speed = 40 + Math.random() * 120 * (0.5 + power)
    added.push({
      id: sparkSeq++, x, y,
      dx: Math.cos(a) * speed,
      dy: Math.sin(a) * speed,
      hue: 0 + Math.random() * 40,   // 赤〜オレンジ（説明書＝赤ペンのイメージ）
    })
  }
  sparks.value = [...sparks.value, ...added]
  const ids = new Set(added.map(s => s.id))
  window.setTimeout(() => {
    sparks.value = sparks.value.filter(s => !ids.has(s.id))
  }, 600)
}

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
      if (state.value.landedOnGround) {
        impact.value = { x: state.value.manualX, y: canvasH.value - 8 }
        burst(state.value.manualX, canvasH.value - 8, 22, 1)
        triggerShake()
      }
      if (state.value.result) emit('thrown', state.value.result)
      rafId = 0
      return
    }
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

// ドラッグ操作 — 画面のどこを掴んでも説明書を拾い上げる
function onMouseDown(e: MouseEvent | TouchEvent) {
  if ('touches' in e) e.preventDefault()
  if (state.value.phase === 'flying' || state.value.phase === 'done') return
  const { clientX, clientY } = 'touches' in e ? e.touches[0] : e
  state.value = createThrowState()
  onDragStart(state.value, clientX, clientY)
}

function onMouseMove(e: MouseEvent | TouchEvent) {
  if (state.value.phase !== 'dragging') return
  const { clientX, clientY } = 'touches' in e ? e.touches[0] : e
  onDragMove(state.value, clientX, clientY)
}

function onMouseUp() {
  if (state.value.phase !== 'dragging') return
  onRelease(state.value)
  // 発射の手応え: 粒子バースト + シェイク（弱い投擲では控えめ）
  if (state.value.power > 0.05) {
    burst(state.value.manualX, state.value.manualY, 14, state.value.power)
    triggerShake()
  }
  startAnim()
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('touchmove', onMouseMove, { passive: false })
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

function onResize() {
  canvasH.value = window.innerHeight
}

// 飛行中の軌跡（離した位置 → 現在位置）
const trailPoints = computed(() => {
  if (!isFlying.value) return ''
  const s = state.value
  const midX = (s.startX + s.manualX) / 2
  const midY = Math.min(s.startY, s.manualY, s.peakY) - 40
  return `M${s.startX},${s.startY} Q${midX},${midY} ${s.manualX},${s.manualY}`
})

// 説明書の回転角（飛行中）
const spinDeg = computed(() => state.value.airTime * state.value.spin)
</script>

<template>
  <div
    class="throw-overlay"
    :class="{ shake }"
    @mousedown="onMouseDown"
    @touchstart="onMouseDown"
  >
    <!-- 飛行中の軌跡 SVG（太く光らせる） -->
    <svg v-if="isFlying" class="throw-svg">
      <path :d="trailPoints" class="trail-glow" />
      <path :d="trailPoints" class="trail-core" />
    </svg>

    <!-- ドラッグ中: 投擲方向ガイド + パワーゲージ -->
    <svg v-if="isDragging" class="throw-svg">
      <line
        :x1="state.startX" :y1="state.startY"
        :x2="state.currentX" :y2="state.currentY"
        class="aim-line"
      />
    </svg>

    <!-- 説明書（ドラッグ対象。掴むと指へ追従し、離すとその方向へ飛ぶ） -->
    <div
      ref="manualRef"
      class="throw-manual"
      :class="{ dragging: isDragging, flying: isFlying }"
      :style="(isDragging || isFlying) ? {
        left: state.manualX + 'px',
        top: state.manualY + 'px',
        transform: `translate(-50%, -50%) rotate(${isFlying ? spinDeg : 0}deg) scale(${isDragging ? 1.06 : 1})`,
      } : {}"
    >
      <div class="throw-manual-header">取扱説明書 ver.{{ manualVersion }}</div>
      <div v-for="line in manualText" :key="line" class="throw-manual-line">{{ line }}</div>
    </div>

    <!-- パワーゲージ（掴んだ位置の上に表示） -->
    <div v-if="isDragging" class="power-gauge" :style="{ left: state.startX + 'px', top: state.startY - 64 + 'px' }">
      <div class="gauge-track">
        <div class="gauge-fill" :style="{ width: (state.power * 100) + '%' }" />
      </div>
      <div class="gauge-label">POWER {{ Math.round(state.power * 100) }}%</div>
    </div>

    <!-- 粒子バースト -->
    <div
      v-for="s in sparks" :key="s.id"
      class="spark"
      :style="{
        left: s.x + 'px', top: s.y + 'px',
        '--dx': s.dx + 'px', '--dy': s.dy + 'px',
        background: `hsl(${s.hue}, 90%, 55%)`,
      }"
    />

    <!-- 着地の衝撃リング -->
    <div v-if="impact" class="impact-ring" :style="{ left: impact.x + 'px', top: impact.y + 'px' }" />

    <!-- 指示テキスト（最小限） -->
    <div v-if="!isDragging && !isFlying" class="throw-hint">
      <div class="throw-hint-text">説明書をドラッグして投げ捨てる</div>
      <div class="throw-hint-sub">上に大きく振るほど高スコア</div>
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
  overflow: hidden;
}
.throw-overlay:active { cursor: grabbing; }
.throw-overlay.shake { animation: overlay-shake 0.36s ease-out; }
@keyframes overlay-shake {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-6px, 4px); }
  40% { transform: translate(5px, -5px); }
  60% { transform: translate(-4px, -3px); }
  80% { transform: translate(3px, 4px); }
}

.throw-manual {
  position: fixed;
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
  /* 初期位置は画面中央 */
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  transition: box-shadow 0.1s;
}
.throw-manual:active { cursor: grabbing; }
.throw-manual.dragging {
  box-shadow: 8px 8px 0 #222;
  transition: none;
}
.throw-manual.flying {
  cursor: default;
  pointer-events: none;
  z-index: 50;
  transition: none;
  box-shadow: 10px 14px 24px rgba(0,0,0,0.55);
}

.throw-manual-header {
  font-weight: bold;
  border-bottom: 1px solid #ccc;
  padding-bottom: 4px;
  margin-bottom: 8px;
  font-size: 11px;
}
.throw-manual-line { padding: 1px 0; }

/* SVG レイヤ */
.throw-svg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.aim-line {
  stroke: rgba(255,90,60,0.85);
  stroke-width: 3;
  stroke-dasharray: 8,5;
  stroke-linecap: round;
}
.trail-glow {
  fill: none;
  stroke: rgba(255,80,50,0.35);
  stroke-width: 14;
  stroke-linecap: round;
  filter: blur(3px);
}
.trail-core {
  fill: none;
  stroke: rgba(255,180,120,0.9);
  stroke-width: 4;
  stroke-linecap: round;
}

/* パワーゲージ */
.power-gauge {
  position: fixed;
  transform: translate(-50%, 0);
  z-index: 50;
  text-align: center;
  pointer-events: none;
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
  border-radius: 5px;
}
.gauge-label {
  font-size: 11px;
  color: #fff;
  margin-top: 3px;
  font-family: monospace;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

/* 粒子 */
.spark {
  position: fixed;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 55;
  transform: translate(-50%, -50%);
  animation: spark-fly 0.6s ease-out forwards;
}
@keyframes spark-fly {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.2);
    opacity: 0;
  }
}

/* 着地の衝撃リング */
.impact-ring {
  position: fixed;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 3px solid rgba(255,120,80,0.9);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 54;
  animation: impact-expand 0.5s ease-out forwards;
}
@keyframes impact-expand {
  0% { width: 12px; height: 12px; opacity: 0.9; }
  100% { width: 220px; height: 220px; opacity: 0; }
}

.throw-hint {
  position: absolute;
  left: 0; right: 0;
  bottom: 24%;
  text-align: center;
  color: rgba(255,255,255,0.85);
  pointer-events: none;
}
.throw-hint-text {
  font-size: 18px;
  font-family: 'Courier New', monospace;
  margin-bottom: 6px;
}
.throw-hint-sub {
  font-size: 13px;
  color: rgba(255,255,255,0.55);
  font-family: monospace;
}
</style>
