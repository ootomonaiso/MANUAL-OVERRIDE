<script setup lang="ts">
import { ref } from 'vue'
import SkillText from './SkillText.vue'
import type { SkillTextToken } from '../../domain/battle/skillText'

export interface SkillListItemView {
  id: string
  kind: 'active' | 'passive' | 'trait'
  label: string
  visibility: 'unseen' | 'seen' | 'owned'
  level?: number
  stacks?: number
  stacksRequired?: number
  stored?: boolean
  flavorText?: string
  effectTokens?: SkillTextToken[]
}

defineProps<{
  collapsed: boolean
  ownedActives: SkillListItemView[]
  ownedPassives: SkillListItemView[]
  ownedTraits: SkillListItemView[]
  unownedActives: SkillListItemView[]
  unownedPassives: SkillListItemView[]
  unownedTraits: SkillListItemView[]
}>()

const emit = defineEmits<{
  (e: 'toggle-collapsed'): void
}>()

const pinnedId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)
function toggle(id: string) {
  pinnedId.value = pinnedId.value === id ? null : id
}
function expandedId(): string | null {
  return pinnedId.value ?? hoveredId.value
}
</script>

<template>
  <div class="skill-list-panel" :class="{ collapsed }">
    <button type="button" class="panel-toggle" @click="emit('toggle-collapsed')">
      スキル一覧 {{ collapsed ? '▸' : '▾' }}
    </button>
    <div v-if="!collapsed" class="panel-body">
      <template v-for="group in [
        { title: '所持: アクティブ', items: ownedActives },
        { title: '所持: パッシブ', items: ownedPassives },
        { title: '所持: 特性', items: ownedTraits },
        { title: '未入手: アクティブ', items: unownedActives },
        { title: '未入手: パッシブ', items: unownedPassives },
        { title: '未入手: 特性', items: unownedTraits },
      ]" :key="group.title">
        <div v-if="group.items.length > 0" class="group">
          <div class="group-title">{{ group.title }}</div>
          <div
            v-for="item in group.items"
            :key="item.id"
            class="skill-item"
            :class="[item.visibility, { stored: item.stored }]"
            @click="toggle(item.id)"
            @mouseenter="hoveredId = item.id"
            @mouseleave="hoveredId = null"
          >
            <div class="item-row">
              <span class="item-label">{{ item.visibility === 'unseen' ? '？？？' : item.label }}</span>
              <span v-if="item.stored" class="item-badge">保管中</span>
              <span v-if="item.level" class="item-level">Lv{{ item.level }}</span>
            </div>
            <div v-if="expandedId() === item.id && item.visibility !== 'unseen'" class="item-detail">
              <SkillText v-if="item.effectTokens" :tokens="item.effectTokens" />
              <div v-if="item.flavorText" class="item-flavor">「{{ item.flavorText }}」</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.skill-list-panel {
  background: var(--genre-bg, var(--bg-panel));
  border: 1px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-md);
  color: var(--genre-text, var(--text));
  font-family: var(--genre-font, var(--font-main));
  min-width: 180px;
  max-height: 60vh;
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
.panel-body {
  padding: 0 8px 8px;
}
.group-title {
  font-size: 9px;
  opacity: 0.6;
  margin: 6px 0 2px;
  letter-spacing: 0.5px;
}
.skill-item {
  padding: 4px 6px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.skill-item:hover {
  background: var(--genre-glow, var(--green-subtle));
}
.skill-item.unseen .item-label,
.skill-item.seen .item-label {
  opacity: 0.5;
}
.item-row {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11px;
}
.item-badge {
  font-size: 8px;
  opacity: 0.6;
  border: 1px solid currentColor;
  padding: 0 3px;
  border-radius: var(--radius-sm);
}
.item-level {
  font-size: 9px;
  opacity: 0.7;
  margin-left: auto;
}
.item-detail {
  font-size: 10px;
  opacity: 0.9;
  padding: 4px 0 2px 4px;
  border-left: 2px solid var(--genre-border, var(--green-dim));
  margin-left: 2px;
}
.item-flavor {
  opacity: 0.6;
  font-style: italic;
  margin-top: 2px;
}
</style>
