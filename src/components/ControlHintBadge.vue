<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Controls } from '../domain/types'
import type { HudLayout } from '../domain/hudLayout'
import { GENRES } from '../data/genres'

const props = defineProps<{
  controls: Controls
  features: Set<string> | ReadonlySet<string>
  scrollAxis: 'x' | 'y'
  genre: string
  layout: HudLayout
}>()

// 操作変更（新規追加 or キー再割当）を赤で注記しておく時間
const NEW_HIGHLIGHT_MS = 4500

const genreLabel = computed(() => GENRES.find(g => g.id === props.genre)?.label ?? '')
const showGenreBadge = computed(() => props.genre !== 'base' && genreLabel.value !== '')

// 配置クラス（常時表示・スコア=右上／説明書=各ゾーンと非重複）
// 横STGは普通の横スクロールと同じ配置に統一（上部中央）。
// 縦STG=左帯の上部（下寄せの説明書の上）。それ以外=上部中央。
const posClass = computed(() => {
  switch (props.layout) {
    case 'vstg': return 'pos-leftcol'  // 左帯: 縦積み（狭い・高い）
    default:     return 'pos-top'      // hbase / hstg / other: 上部中央
  }
})

function keyLabel(key: string): string {
  const map: Record<string, string> = {
    Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  }
  return map[key] ?? key.toUpperCase()
}

interface Entry { id: string; key: string; action: string }

// フィーチャーが実際に読むキー（未設定時のデフォルト）に合わせて表示する。
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
  if (props.scrollAxis === 'y') {
    list.push({ id: 'moveUp',   key: keyLabel(c.moveUp   ?? 'ArrowUp'),   action: '上移動' })
    list.push({ id: 'moveDown', key: keyLabel(c.moveDown ?? 'ArrowDown'), action: '下移動' })
  }
  if (has('shoot')) list.push({ id: 'shoot', key: keyLabel(c.shoot ?? 'z'),            action: 'ショット' })
  if (has('dash'))  list.push({ id: 'dash',  key: keyLabel(c.dash ?? 'Shift'),         action: 'ダッシュ' })
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
  <div class="control-legend" :class="posClass">
    <!-- ジャンルバッジ（中央上部浮遊を廃止しこのゾーンへ統合・仕様 2-G） -->
    <span v-if="showGenreBadge" class="cl-genre">{{ genreLabel }}</span>

    <!-- 操作キー（常時表示） -->
    <span
      v-for="e in entries"
      :key="e.id"
      class="cl-chip"
      :class="{ 'is-new': newIds.has(e.id) }"
    >
      <span class="cl-key">{{ e.key }}</span>
      <span class="cl-action">{{ e.action }}</span>
      <span v-if="newIds.has(e.id)" class="cl-new-tag">NEW</span>
    </span>

    <span class="cl-sep" />

    <!-- 色ルール -->
    <span class="cl-color"><span class="cl-dot danger" />触れると失敗</span>
    <span class="cl-color"><span class="cl-dot safe" />安全</span>

    <span class="cl-sep" />

    <!-- 一時停止ヒント -->
    <span class="cl-pause"><span class="cl-key">P</span>一時停止して説明書を確認</span>
  </div>
</template>

<style scoped>
.control-legend {
  position: absolute;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 5px 12px;
  background: var(--genre-bg, rgba(0, 20, 6, 0.55));
  border: 1px solid var(--genre-border, rgba(0, 255, 65, 0.18));
  border-radius: var(--radius-sm, 4px);
  backdrop-filter: blur(4px);
  font-family: var(--genre-font, var(--font-mono));
  font-size: 12px;
  color: var(--genre-text, var(--text-dim));
  pointer-events: none;
  z-index: 12;
  opacity: 0.9;
}

/* ── 配置バリアント ── */
.pos-top {
  top: 12px; left: 50%;
  transform: translateX(-50%);
  justify-content: center;
  max-width: min(94vw, 820px);
}
/* 縦STG: 左帯の上（縦積み） */
.pos-leftcol {
  top: 14px; left: 12px;
  flex-direction: column;
  align-items: flex-start;
  max-width: min(22vw, 260px);
}

/* ── ジャンルバッジ ── */
.cl-genre {
  background: var(--genre-glow, rgba(0, 255, 65, 0.1));
  border: 1px solid var(--genre-border, var(--green-dim));
  color: var(--genre-accent, var(--green));
  font-size: 11px;
  padding: 1px 10px;
  border-radius: var(--radius-sm, 4px);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-weight: 700;
}

/* ── キー ── */
.cl-chip { display: inline-flex; align-items: center; gap: 5px; position: relative; }
.cl-key {
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
.cl-action { color: var(--genre-text, var(--text-dim)); }
.cl-chip.is-new .cl-key {
  border-color: var(--danger, #ff3333);
  color: var(--danger, #ff5555);
  background: rgba(255, 51, 51, 0.12);
  animation: clNewPulse 1s ease-in-out infinite;
}
.cl-chip.is-new .cl-action { color: #ff8888; }
.cl-new-tag {
  font-size: 8px; font-weight: 700; letter-spacing: 1px;
  color: #ff5555;
  border: 1px solid rgba(255, 51, 51, 0.6);
  border-radius: 2px;
  padding: 0 3px;
  animation: clNewPulse 1s ease-in-out infinite;
}
@keyframes clNewPulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 51, 51, 0); }
  50%      { box-shadow: 0 0 8px rgba(255, 51, 51, 0.5); }
}

.cl-sep {
  width: 1px; height: 12px;
  background: var(--genre-border, rgba(0, 255, 65, 0.2));
}
.cl-color { display: inline-flex; align-items: center; gap: 4px; }
.cl-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.cl-dot.danger { background: #ff3333; box-shadow: 0 0 6px #ff3333; }
.cl-dot.safe   { background: #00ff41; box-shadow: 0 0 6px #00ff41; }
.cl-pause { display: inline-flex; align-items: center; gap: 5px; }

/* 縦積み時（縦STG左帯）は区切り線を横いっぱいに */
.pos-leftcol .cl-sep { width: 100%; height: 1px; }
</style>
