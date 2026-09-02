<script setup lang="ts">
/**
 * 戦闘背景。
 *
 * 320×180 のキャンバスへ描いてから CSS で拡大し、補間を切って1ドットを数px角の
 * ブロックとして見せる（docs/pixelart-rebuild/00-rendering-system.md の PixelArt 方針）。
 * 形の決定は domain/battle/backdrop.ts が行い、ここは描くだけ。
 *
 * 遠景（空・地形）と、キャラクターが立つ手前の床は別の平面として重ねる。
 * 床の上端＝プレイヤーの立ち位置なので、比率で決め打ちして DOM 側と合わせる。
 *
 * 雲だけ requestAnimationFrame で流す（画面に動きが無いと static な一枚絵に見えるため）。
 * 稜線・小物・地面は静止したまま、雲の x オフセットだけを時間から計算して毎フレーム描き直す。
 */
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import {
  buildBackdropScene, skyBands, glowRings, mixHex,
  SCENE_W, SCENE_H,
  type BattleBackgroundDef, type BackdropScene, type BackdropProp, type BackdropRect,
} from '../../domain/battle/backdrop'

const props = defineProps<{
  background: BattleBackgroundDef | null
  /** 床の上端（画面高に対する比）。BattleScreen のキャラ配置と共有する */
  floorTop: number
}>()

/** 雲が画面を1周するのにかかる時間。長いほど「気づいたら流れている」程度の穏やかさになる */
const CLOUD_DRIFT_LOOP_MS = 52000

const canvasRef = ref<HTMLCanvasElement | null>(null)
const sceneRef = ref<BackdropScene | null>(null)
let rafId: number | null = null
let driftStartMs = 0

const floorStyle = computed(() => {
  const f = props.background?.floor
  if (!f) return {}
  return {
    top: `${props.floorTop * 100}%`,
    background: `linear-gradient(180deg, ${f.top} 0%, ${f.bottom} 100%)`,
    '--floor-line': f.line,
  }
})

/** 小物1つを矩形の集まりとして描く。円弧を使うと輪郭がぼけるため使わない */
function drawProp(ctx: CanvasRenderingContext2D, p: BackdropProp): void {
  const s = p.size
  ctx.globalAlpha = p.opacity
  ctx.fillStyle = p.color
  switch (p.kind) {
    case 'tree':
      ctx.fillRect(Math.round(p.x - s * 0.08), Math.round(p.y - s * 0.45), Math.max(1, Math.round(s * 0.16)), Math.round(s * 0.45))
      // 三角形の樹冠を段積みの矩形で表す
      for (let i = 0; i < 4; i++) {
        const w = s * (0.75 - i * 0.16)
        const y = p.y - s * (0.45 + i * 0.15)
        ctx.fillRect(Math.round(p.x - w / 2), Math.round(y - s * 0.16), Math.max(1, Math.round(w)), Math.max(1, Math.round(s * 0.17)))
      }
      break
    case 'cactus':
      ctx.fillRect(Math.round(p.x - s * 0.1), Math.round(p.y - s), Math.max(1, Math.round(s * 0.2)), Math.round(s))
      ctx.fillRect(Math.round(p.x - s * 0.34), Math.round(p.y - s * 0.72), Math.max(1, Math.round(s * 0.24)), Math.max(1, Math.round(s * 0.12)))
      ctx.fillRect(Math.round(p.x - s * 0.34), Math.round(p.y - s * 0.72), Math.max(1, Math.round(s * 0.12)), Math.round(s * 0.34))
      ctx.fillRect(Math.round(p.x + s * 0.1), Math.round(p.y - s * 0.85), Math.max(1, Math.round(s * 0.24)), Math.max(1, Math.round(s * 0.12)))
      ctx.fillRect(Math.round(p.x + s * 0.22), Math.round(p.y - s * 0.85), Math.max(1, Math.round(s * 0.12)), Math.round(s * 0.42))
      break
    case 'pillar':
      ctx.fillRect(Math.round(p.x - s * 0.16), Math.round(p.y - s), Math.max(1, Math.round(s * 0.32)), Math.round(s))
      ctx.fillRect(Math.round(p.x - s * 0.26), Math.round(p.y - s * 0.1), Math.max(1, Math.round(s * 0.52)), Math.max(1, Math.round(s * 0.1)))
      ctx.fillRect(Math.round(p.x - s * 0.24), Math.round(p.y - s - s * 0.1), Math.max(1, Math.round(s * 0.48)), Math.max(1, Math.round(s * 0.1)))
      break
    case 'crystal':
      // 上下に尖った菱形を、行ごとの矩形で積む
      for (let i = 0; i < 6; i++) {
        const t = i / 5
        const w = s * 0.5 * (1 - Math.abs(t - 0.45) * 1.8)
        if (w <= 0) continue
        ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - s + t * s), Math.max(1, Math.round(w)), Math.max(1, Math.round(s / 6)))
      }
      break
    case 'bone':
      ctx.fillRect(Math.round(p.x - s * 0.5), Math.round(p.y - 1), Math.max(2, Math.round(s)), 2)
      ctx.fillRect(Math.round(p.x - s * 0.5), Math.round(p.y - 2), 2, 3)
      ctx.fillRect(Math.round(p.x + s * 0.5 - 2), Math.round(p.y - 2), 2, 3)
      break
    case 'tuft':
    default:
      ctx.fillRect(Math.round(p.x), Math.round(p.y - s), 1, Math.max(1, Math.round(s)))
      ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - s * 0.6), 1, Math.max(1, Math.round(s * 0.6)))
      ctx.fillRect(Math.round(p.x + 2), Math.round(p.y - s * 0.7), 1, Math.max(1, Math.round(s * 0.7)))
      break
  }
  ctx.globalAlpha = 1
}

/**
 * 雲は左右ループさせる。1回だけでなく offsetX / offsetX - SCENE_W の2回描くことで、
 * 画面端で千切れずに次の雲がすぐ続いて見える（1枚だけだと端で消えて再度端から現れるまで間が空く）。
 */
function drawClouds(ctx: CanvasRenderingContext2D, clouds: readonly BackdropRect[], offsetX: number): void {
  for (const c of clouds) {
    ctx.globalAlpha = c.opacity ?? 1
    ctx.fillStyle = c.color
    const baseX = ((c.x + offsetX) % SCENE_W + SCENE_W) % SCENE_W
    ctx.fillRect(baseX, c.y, c.w, c.h)
    if (baseX + c.w > SCENE_W) ctx.fillRect(baseX - SCENE_W, c.y, c.w, c.h)
  }
  ctx.globalAlpha = 1
}

function drawScene(ctx: CanvasRenderingContext2D, scene: BackdropScene, cloudOffsetX = 0): void {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H)
  ctx.imageSmoothingEnabled = false

  for (const band of skyBands(scene, scene.ground.y)) {
    ctx.fillStyle = band.color
    ctx.fillRect(band.x, band.y, band.w, band.h)
  }

  // 光源。四角い輪を重ねて、にじみを段階的に表す
  for (const ring of glowRings(scene)) {
    ctx.globalAlpha = ring.opacity
    ctx.fillStyle = ring.color
    ctx.fillRect(ring.cx - ring.r, ring.cy - ring.r, ring.r * 2, ring.r * 2)
  }
  ctx.globalAlpha = 1

  drawClouds(ctx, scene.clouds, cloudOffsetX)

  for (const layer of scene.layers) {
    ctx.globalAlpha = layer.opacity
    ctx.fillStyle = layer.color
    ctx.beginPath()
    layer.points.forEach((pt, i) => { if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y) })
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 地面。奥から手前へ数段の帯で塗り、遠近をつける
  const groundH = SCENE_H - scene.ground.y
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const y = scene.ground.y + (groundH * i) / steps
    ctx.fillStyle = mixHex(scene.ground.top, scene.ground.bottom, i / (steps - 1))
    ctx.fillRect(0, Math.round(y), SCENE_W, Math.ceil(groundH / steps) + 1)
  }

  for (const s of scene.speckles) {
    ctx.globalAlpha = s.opacity ?? 1
    ctx.fillStyle = s.color
    ctx.fillRect(s.x, s.y, s.w, s.h)
  }
  ctx.globalAlpha = 1

  for (const p of scene.props) drawProp(ctx, p)

  if (scene.fog) {
    ctx.globalAlpha = scene.fog.opacity
    ctx.fillStyle = scene.fog.color
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)
    ctx.globalAlpha = 1
  }
}

function stopAnimating(): void {
  if (rafId !== null && typeof window !== 'undefined') window.cancelAnimationFrame(rafId)
  rafId = null
}

function drawFrame(now: number): void {
  const canvas = canvasRef.value
  const scene = sceneRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !scene || !ctx) { rafId = null; return }   // happy-dom 等 2Dコンテキストを持たない環境では止める
  const offsetX = ((now - driftStartMs) / CLOUD_DRIFT_LOOP_MS) * SCENE_W
  drawScene(ctx, scene, offsetX)
  rafId = window.requestAnimationFrame(drawFrame)
}

/** rAF 自体が使えない環境（テスト等）では静止した1枚絵だけ描いて終える */
function startAnimating(): void {
  if (rafId !== null) return
  const canvas = canvasRef.value
  if (!canvas?.getContext('2d')) return
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return
  driftStartMs = performance.now()
  rafId = window.requestAnimationFrame(drawFrame)
}

function rebuildScene(): void {
  sceneRef.value = props.background ? buildBackdropScene(props.background) : null
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (canvas && ctx && sceneRef.value) drawScene(ctx, sceneRef.value, 0)   // rAF が動くまでの一瞬も絵を出しておく
  startAnimating()
}

onMounted(rebuildScene)
onUnmounted(stopAnimating)
watch(() => props.background?.id, rebuildScene)
</script>

<template>
  <div class="battle-backdrop">
    <canvas
      ref="canvasRef"
      class="backdrop-canvas"
      :width="SCENE_W"
      :height="SCENE_H"
      :style="{ height: `${floorTop * 100}%` }"
      aria-hidden="true"
    />
    <div class="backdrop-floor" :style="floorStyle" aria-hidden="true" />
  </div>
</template>

<style scoped>
.battle-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
  background: #000;
}
.backdrop-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: block;
  object-fit: cover;
  /* 拡大時に補間させない。1ドットをそのままブロックとして見せる */
  image-rendering: pixelated;
}
.backdrop-floor {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-top: 2px solid rgba(0, 0, 0, 0.55);
}
/* 床の模様。手前の平面であることを示す薄い格子。ごくゆっくり流して静止画に見せない */
.backdrop-floor::after {
  content: '';
  position: absolute;
  inset: -28px 0 0 0;
  opacity: 0.16;
  background-image:
    repeating-linear-gradient(60deg, transparent 0 26px, var(--floor-line) 26px 28px),
    repeating-linear-gradient(-60deg, transparent 0 26px, var(--floor-line) 26px 28px);
  animation: floor-drift 14s linear infinite;
}
@keyframes floor-drift {
  from { background-position: 0 0, 0 0; }
  to { background-position: 56px 28px, -56px 28px; }
}
</style>
