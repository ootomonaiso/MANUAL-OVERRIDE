<script setup lang="ts">
/**
 * 戦闘背景。src/data/battle-backgrounds/*.json を domain/battle/backdrop.ts が
 * SVG プリミティブへ変換した結果を描くだけの層（形の決定はこのファイルでは行わない）。
 */
import { computed } from 'vue'
import { buildBackdropScene, SCENE_W, SCENE_H, type BattleBackgroundDef, type BackdropProp } from '../../domain/battle/backdrop'

const props = defineProps<{ background: BattleBackgroundDef | null }>()

const scene = computed(() => props.background ? buildBackdropScene(props.background) : null)
const gradientId = computed(() => `bd-sky-${props.background?.id ?? 'none'}`)
const groundId = computed(() => `bd-ground-${props.background?.id ?? 'none'}`)
const glowId = computed(() => `bd-glow-${props.background?.id ?? 'none'}`)

/** 小物1つぶんの形。種類ごとに数個の矩形・多角形へ落とす */
interface PropPart { kind: 'rect' | 'poly' | 'ellipse'; d: Record<string, number | string> }

function partsOf(p: BackdropProp): PropPart[] {
  const s = p.size
  const half = s * 0.5
  switch (p.kind) {
    case 'tree':
      return [
        { kind: 'rect', d: { x: p.x - s * 0.06, y: p.y - s * 0.45, width: s * 0.12, height: s * 0.45 } },
        { kind: 'poly', d: { points: `${p.x},${p.y - s} ${p.x - half * 0.7},${p.y - s * 0.35} ${p.x + half * 0.7},${p.y - s * 0.35}` } },
      ]
    case 'cactus':
      return [
        { kind: 'rect', d: { x: p.x - s * 0.1, y: p.y - s, width: s * 0.2, height: s } },
        { kind: 'rect', d: { x: p.x - s * 0.34, y: p.y - s * 0.72, width: s * 0.24, height: s * 0.12 } },
        { kind: 'rect', d: { x: p.x - s * 0.34, y: p.y - s * 0.72, width: s * 0.12, height: s * 0.34 } },
        { kind: 'rect', d: { x: p.x + s * 0.1, y: p.y - s * 0.85, width: s * 0.24, height: s * 0.12 } },
        { kind: 'rect', d: { x: p.x + s * 0.22, y: p.y - s * 0.85, width: s * 0.12, height: s * 0.42 } },
      ]
    case 'pillar':
      return [
        { kind: 'rect', d: { x: p.x - s * 0.16, y: p.y - s, width: s * 0.32, height: s } },
        { kind: 'rect', d: { x: p.x - s * 0.26, y: p.y - s * 0.08, width: s * 0.52, height: s * 0.08 } },
        { kind: 'rect', d: { x: p.x - s * 0.24, y: p.y - s - s * 0.08, width: s * 0.48, height: s * 0.08 } },
      ]
    case 'crystal':
      return [
        { kind: 'poly', d: { points: `${p.x},${p.y - s} ${p.x + half * 0.5},${p.y - s * 0.45} ${p.x},${p.y} ${p.x - half * 0.5},${p.y - s * 0.45}` } },
      ]
    case 'bone':
      return [
        { kind: 'ellipse', d: { cx: p.x, cy: p.y, rx: s * 0.5, ry: s * 0.16 } },
      ]
    case 'tuft':
    default:
      return [
        { kind: 'poly', d: { points: `${p.x},${p.y - s} ${p.x - s * 0.4},${p.y} ${p.x + s * 0.4},${p.y}` } },
      ]
  }
}

const propShapes = computed(() => (scene.value?.props ?? []).map(p => ({ prop: p, parts: partsOf(p) })))
</script>

<template>
  <div class="battle-backdrop">
    <svg
      v-if="scene"
      class="backdrop-svg"
      :viewBox="`0 0 ${SCENE_W} ${SCENE_H}`"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="scene.sky.top" />
          <stop offset="100%" :stop-color="scene.sky.bottom" />
        </linearGradient>
        <linearGradient :id="groundId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="scene.ground.top" />
          <stop offset="100%" :stop-color="scene.ground.bottom" />
        </linearGradient>
        <radialGradient v-if="scene.glow" :id="glowId">
          <stop offset="0%" :stop-color="scene.glow.color" stop-opacity="0.95" />
          <stop offset="100%" :stop-color="scene.glow.color" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" :width="SCENE_W" :height="SCENE_H" :fill="`url(#${gradientId})`" />

      <circle
        v-if="scene.glow"
        :cx="scene.glow.cx"
        :cy="scene.glow.cy"
        :r="scene.glow.r * 3"
        :fill="`url(#${glowId})`"
      />

      <polygon
        v-for="(layer, i) in scene.layers"
        :key="i"
        :points="layer.points"
        :fill="layer.color"
        :opacity="layer.opacity"
      />

      <rect
        x="0"
        :y="scene.ground.y"
        :width="SCENE_W"
        :height="SCENE_H - scene.ground.y"
        :fill="`url(#${groundId})`"
      />

      <g v-for="(sp, i) in propShapes" :key="`p${i}`" :opacity="sp.prop.opacity">
        <template v-for="(part, j) in sp.parts" :key="j">
          <rect v-if="part.kind === 'rect'" v-bind="part.d" :fill="sp.prop.color" />
          <polygon v-else-if="part.kind === 'poly'" v-bind="part.d" :fill="sp.prop.color" />
          <ellipse v-else v-bind="part.d" :fill="sp.prop.color" />
        </template>
      </g>

      <rect
        v-if="scene.fog"
        x="0"
        y="0"
        :width="SCENE_W"
        :height="SCENE_H"
        :fill="scene.fog.color"
        :opacity="scene.fog.opacity"
      />
    </svg>
  </div>
</template>

<style scoped>
.battle-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}
.backdrop-svg {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
