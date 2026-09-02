<script setup lang="ts">
/**
 * スキル一覧パネルの下に置く、11カテゴリの所持ポイント一覧。
 * カテゴリ名を押すと右上のヘルプ（GlossaryTerm経由）が開き、
 * 「現在値/次のしきい値」の数字を押すとこのパネル内で内訳（何が効いているか）が開閉する。
 */
import { ref } from 'vue'
import GlossaryTerm from './GlossaryTerm.vue'
import type { CategoryId } from '../../domain/battle/types'

export interface CategoryContributionView {
  id: string
  label: string
  amount: number
}

export interface CategoryRowView {
  id: CategoryId
  label: string
  color: string
  current: number
  threshold: number
  maxed: boolean
  contributions: CategoryContributionView[]
}

defineProps<{
  collapsed: boolean
  rows: CategoryRowView[]
}>()

const emit = defineEmits<{
  (e: 'toggle-collapsed'): void
}>()

const openId = ref<CategoryId | null>(null)
function toggleBreakdown(id: CategoryId): void {
  openId.value = openId.value === id ? null : id
}
</script>

<template>
  <div class="category-list-panel" :class="{ collapsed }">
    <button type="button" class="panel-toggle" @click="emit('toggle-collapsed')">
      カテゴリ一覧 {{ collapsed ? '▸' : '▾' }}
    </button>
    <div class="panel-collapse">
      <div class="panel-collapse-inner">
        <div class="panel-body">
          <div v-for="row in rows" :key="row.id" class="category-row">
            <div class="row-head">
              <span class="row-mark" :style="{ background: row.color }" />
              <span class="row-label">
                <GlossaryTerm :term-id="row.id">{{ row.label }}</GlossaryTerm>
              </span>
              <button
                type="button"
                class="row-frac"
                :class="{ maxed: row.maxed, open: openId === row.id }"
                @click="toggleBreakdown(row.id)"
              >{{ Math.floor(row.current) }}/{{ row.threshold }}</button>
            </div>
            <div v-if="openId === row.id" class="row-breakdown">
              <div v-if="row.contributions.length === 0" class="breakdown-empty">まだ何も貢献していません</div>
              <div v-for="c in row.contributions" :key="c.id" class="breakdown-item">
                <span class="breakdown-label">{{ c.label }}</span>
                <span class="breakdown-amount">+{{ Math.floor(c.amount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-list-panel {
  background: color-mix(in srgb, var(--battle-panel) 84%, transparent);
  border: 1px solid var(--battle-frame-border);
  border-radius: var(--radius-md);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  min-width: 180px;
  max-height: 32vh;
  overflow-y: auto;
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
/* 開閉アニメーションは SkillListPanel.vue と同じ grid-template-rows の手法に揃える */
.panel-collapse {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 220ms ease;
}
.category-list-panel.collapsed .panel-collapse {
  grid-template-rows: 0fr;
}
.panel-collapse-inner {
  overflow: hidden;
}
.panel-body {
  padding: 0 8px 8px;
}
.category-row {
  padding: 3px 4px;
  border-radius: var(--radius-sm);
}
.row-head {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
}
.row-mark {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.row-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-frac {
  flex-shrink: 0;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  background: color-mix(in srgb, var(--battle-accent) 18%, transparent);
  border: 1px solid var(--battle-frame-border);
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
}
.row-frac.maxed {
  color: var(--battle-diff-plus);
  border-color: var(--battle-diff-plus);
}
.row-frac.open {
  background: color-mix(in srgb, var(--battle-accent) 34%, transparent);
}
.row-breakdown {
  margin: 3px 0 5px 13px;
  padding-left: 6px;
  border-left: 2px solid var(--battle-frame-border);
  font-size: 9px;
}
.breakdown-empty {
  opacity: 0.6;
  font-style: italic;
}
.breakdown-item {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  opacity: 0.9;
}
.breakdown-amount {
  flex-shrink: 0;
  color: var(--battle-diff-plus);
}
</style>
