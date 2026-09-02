<script setup lang="ts">
import { computed } from 'vue'

export interface StatRowView {
  key: string
  label: string
  base: number
  effective: number
  isPercent: boolean
}

const props = defineProps<{
  collapsed: boolean
  mode: 'base' | 'effective'
  showDiff: boolean
  stats: StatRowView[]
}>()

const emit = defineEmits<{
  (e: 'toggle-collapsed'): void
  (e: 'toggle-mode'): void
  (e: 'toggle-diff'): void
}>()

function fmt(v: number, isPercent: boolean): string {
  if (isPercent) return `${Math.round(v * 1000) / 10}%`
  return `${Math.round(v)}`
}

const rows = computed(() => props.stats.map(s => {
  const primary = props.mode === 'base' ? s.base : s.effective
  const diff = s.effective - s.base
  return {
    ...s,
    primaryText: fmt(primary, s.isPercent),
    diffText: diff === 0 ? null : `${diff > 0 ? '+' : ''}${fmt(diff, s.isPercent)}`,
    diffPositive: diff >= 0,
  }
}))
</script>

<template>
  <div class="status-panel" :class="{ collapsed }">
    <button type="button" class="panel-toggle" @click="emit('toggle-collapsed')">
      ステータス {{ collapsed ? '▸' : '▾' }}
    </button>
    <div v-if="!collapsed" class="panel-body">
      <div class="panel-controls">
        <button type="button" @click="emit('toggle-mode')">{{ mode === 'base' ? '基礎値' : '実効値' }}</button>
        <button type="button" @click="emit('toggle-diff')">バフ{{ showDiff ? 'オン' : 'オフ' }}</button>
      </div>
      <div class="stat-row" v-for="r in rows" :key="r.key">
        <span class="stat-name">{{ r.label }}</span>
        <span class="stat-value">
          {{ r.primaryText }}
          <span
            v-if="showDiff && r.diffText"
            class="stat-diff"
            :class="mode === 'effective' ? 'muted' : (r.diffPositive ? 'plus' : 'minus')"
          >{{ r.diffText }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-panel {
  background: color-mix(in srgb, var(--battle-panel) 84%, transparent);
  border: 1px solid var(--battle-frame-border);
  border-radius: var(--radius-md);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  min-width: 160px;
}
.panel-toggle {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  font-size: 12px;
}
.panel-body {
  padding: 0 10px 10px;
}
.panel-controls {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.panel-controls button {
  font-size: 9px;
  padding: 2px 6px;
  background: transparent;
  border: 1px solid var(--battle-frame-border);
  color: inherit;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 2px 0;
}
.stat-name {
  opacity: 0.85;
}
.stat-diff {
  font-size: 9px;
  margin-left: 4px;
}
.stat-diff.plus { color: var(--battle-diff-plus); }
.stat-diff.minus { color: var(--battle-diff-minus); }
.stat-diff.muted { color: var(--battle-diff-muted); }
</style>
