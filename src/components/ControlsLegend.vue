<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Controls } from '../domain/types'

const props = defineProps<{
  controls: Controls
  features: Set<string> | ReadonlySet<string>
  scrollAxis: 'x' | 'y'
}>()

// 変更（新規追加 or キー再割当）を赤で注記しておく時間
const NEW_HIGHLIGHT_MS = 4500

function keyLabel(key: string): string {
  const map: Record<string, string> = {
    Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  }
  return map[key] ?? key.toUpperCase()
}

interface Entry { id: string; key: string; action: string }

// フィーチャーが実際に読むキー（未設定時のデフォルト）に合わせて表示する。
// 例: ShootFeature は controls.shoot ?? 'z'、dash は controls.dash ?? 'Shift'、
// slide は controls.moveDown ?? 'ArrowDown' を参照する。
const entries = computed<Entry[]>(() => {
  const c = props.controls
  const f = props.features
  const has = (id: string) => f?.has(id) ?? false
  const list: Entry[] = []
  list.push({ id: 'jump', key: keyLabel(c.jump), action: 'ジャンプ' })
  if (!has('auto_run')) {
    list.push({ id: 'moveLeft', key: keyLabel(c.moveLeft), action: '左移動' })
    list.push({ id: 'moveRight', key: keyLabel(c.moveRight), action: '右移動' })
  }
  // 上下移動は縦スクロール時のみ実際に効く。判定は vertical_scroll フィーチャーではなく
  // scrollAxis を見る（aquatic は scrollDirection:vertical だが vertical_scroll を持たない）。
  if (props.scrollAxis === 'y') {
    list.push({ id: 'moveUp',   key: keyLabel(c.moveUp   ?? 'ArrowUp'),   action: '上移動' })
    list.push({ id: 'moveDown', key: keyLabel(c.moveDown ?? 'ArrowDown'), action: '下移動' })
  }
  if (has('shoot')) list.push({ id: 'shoot', key: keyLabel(c.shoot ?? 'z'),          action: 'ショット' })
  if (has('dash'))  list.push({ id: 'dash',  key: keyLabel(c.dash ?? 'Shift'),       action: 'ダッシュ' })
  if (has('slide')) list.push({ id: 'slide', key: keyLabel(c.moveDown ?? 'ArrowDown'), action: 'スライド' })
  return list
})

// ── 変更検知: 前回から増えた/キーが変わったエントリを赤注記 ──
const newIds = ref<Set<string>>(new Set())
let prevMap = new Map<string, string>()
let seeded = false
const activeTimers: ReturnType<typeof setTimeout>[] = []

function flagNew(id: string) {
  const add = new Set(newIds.value)
  add.add(id)
  newIds.value = add
  const t = setTimeout(() => {
    const rm = new Set(newIds.value)
    rm.delete(id)
    newIds.value = rm
  }, NEW_HIGHLIGHT_MS)
  activeTimers.push(t)
}

watch(entries, (list) => {
  // 初回（ゲーム開始時の初期操作）は注記しない
  if (seeded) {
    for (const e of list) {
      if (!prevMap.has(e.id) || prevMap.get(e.id) !== e.key) flagNew(e.id)
    }
  }
  prevMap = new Map(list.map(e => [e.id, e.key]))
  seeded = true
}, { immediate: true })

onUnmounted(() => { activeTimers.forEach(clearTimeout) })
</script>

<template>
  <div class="controls-legend">
    <!-- 操作キー -->
    <span
      v-for="e in entries"
      :key="e.id"
      class="legend-chip"
      :class="{ 'is-new': newIds.has(e.id) }"
    >
      <span class="legend-key">{{ e.key }}</span>
      <span class="legend-action">{{ e.action }}</span>
      <span v-if="newIds.has(e.id)" class="legend-new-tag">NEW</span>
    </span>

    <span class="legend-sep" />

    <!-- 色ルール -->
    <span class="legend-color">
      <span class="legend-dot danger" />触れると失敗
    </span>
    <span class="legend-color">
      <span class="legend-dot safe" />安全
    </span>

    <span class="legend-sep" />

    <!-- 一時停止して説明書を確認 -->
    <span class="legend-pause">
      <span class="legend-key">P</span>一時停止して説明書を確認
    </span>
  </div>
</template>

<style scoped>
.controls-legend {
  position: absolute;
  top: 46px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px 10px;
  max-width: min(92vw, 760px);
  padding: 5px 12px;
  background: var(--genre-bg, rgba(0, 20, 6, 0.55));
  border: 1px solid var(--genre-border, rgba(0, 255, 65, 0.18));
  border-radius: var(--radius-sm, 4px);
  backdrop-filter: blur(4px);
  font-family: var(--genre-font, var(--font-mono));
  font-size: 11px;
  color: var(--genre-text, var(--text-dim));
  pointer-events: none;
  z-index: 11;
  /* 邪魔にならないよう平常時は控えめ、変更時に色が立つ */
  opacity: 0.82;
  transition: opacity 0.3s;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  position: relative;
}

.legend-key {
  display: inline-block;
  min-width: 22px;
  padding: 1px 6px;
  text-align: center;
  border-radius: 2px;
  border: 1px solid var(--genre-border, rgba(0, 255, 65, 0.3));
  background: var(--genre-glow, rgba(0, 255, 65, 0.08));
  color: var(--genre-accent, var(--green));
  font-weight: 600;
  letter-spacing: 0.5px;
}
.legend-action { color: var(--genre-text, var(--text-dim)); }

/* ── 変更注記（赤） ── */
.legend-chip.is-new .legend-key {
  border-color: var(--danger, #ff3333);
  color: var(--danger, #ff5555);
  background: rgba(255, 51, 51, 0.12);
  animation: legendNewPulse 1s ease-in-out infinite;
}
.legend-chip.is-new .legend-action { color: #ff8888; }
.legend-new-tag {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #ff5555;
  border: 1px solid rgba(255, 51, 51, 0.6);
  border-radius: 2px;
  padding: 0 3px;
  animation: legendNewPulse 1s ease-in-out infinite;
}
@keyframes legendNewPulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 51, 51, 0); }
  50%      { box-shadow: 0 0 8px rgba(255, 51, 51, 0.5); }
}

.legend-sep {
  width: 1px;
  height: 12px;
  background: var(--genre-border, rgba(0, 255, 65, 0.2));
}

.legend-color {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--genre-text, var(--text-muted));
}
.legend-dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.legend-dot.danger { background: #ff3333; box-shadow: 0 0 6px #ff3333; }
.legend-dot.safe   { background: #00ff41; box-shadow: 0 0 6px #00ff41; }

.legend-pause {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--genre-text, var(--text-muted));
}
</style>
