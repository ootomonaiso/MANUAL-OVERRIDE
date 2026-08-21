<script setup lang="ts">
/**
 * src/components/SkinSelector.vue
 *
 * タイトル画面のスキン選択 UI。
 * 解放済みスキンはクリックで選択、未解放はグレイアウト + ロックアイコン。
 */

import { computed } from 'vue'
import type { SkinDef } from '../domain/types'

const props = defineProps<{
  skins: readonly SkinDef[]
  selectedId: string | null
  unlocked: Set<string>
  records: { playCount: number; totalDistance: number; overallBest: { total: number } | null; totalPlayTime: number }
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

function getUnlockHint(skin: SkinDef): string | null {
  if (skin.unlock.type === 'free') return null
  if (skin.unlock.type === 'record') {
    const u = skin.unlock
    switch (u.metric) {
      case 'totalDistance': return `総距離 ${u.threshold}m で解放`
      case 'overallBestTotal': return `ベスト ${u.threshold} で解放`
      case 'playCount': return `プレイ ${u.threshold} 回で解放`
      case 'totalPlayTime': return `総プレイ ${Math.round(u.threshold / 60)} 分で解放`
    }
  }
  return null
}

function getUnlockValue(skin: SkinDef): number {
  if (skin.unlock.type !== 'record') return 0
  const u = skin.unlock
  switch (u.metric) {
    case 'totalDistance': return props.records.totalDistance
    case 'overallBestTotal': return props.records.overallBest?.total ?? 0
    case 'playCount': return props.records.playCount
    case 'totalPlayTime': return props.records.totalPlayTime
  }
  return 0
}

const skinItems = computed(() =>
  props.skins.map(skin => ({
    skin,
    unlocked: props.unlocked.has(skin.id),
    selected: skin.id === props.selectedId,
    hint: getUnlockHint(skin),
    value: getUnlockValue(skin),
  })),
)
</script>

<template>
  <div class="skin-selector">
    <div class="skin-label">スキン</div>
    <div class="skin-grid">
      <button
        v-for="item in skinItems"
        :key="item.skin.id"
        class="skin-item"
        :class="{
          selected: item.selected,
          locked: !item.unlocked,
        }"
        :disabled="!item.unlocked"
        @click="emit('select', item.skin.id)"
      >
        <!-- ミニプレビュー -->
        <div class="skin-preview" :style="{ backgroundColor: item.skin.body }">
          <div class="skin-preview-head" :style="{ backgroundColor: item.skin.head }" />
          <div class="skin-preview-eye" :style="{ backgroundColor: item.skin.eye }" />
        </div>
        <span class="skin-name">{{ item.skin.name }}</span>
        <!-- ロックアイコン / 解放条件 -->
        <div v-if="!item.unlocked" class="skin-lock">
          <span class="skin-lock-icon">&#128274;</span>
          <span class="skin-lock-hint">{{ item.hint }}</span>
        </div>
        <div v-else-if="item.selected" class="skin-selected-badge">✓</div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.skin-selector {
  margin-top: 18px;
}

.skin-label {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--green-dim);
  text-transform: uppercase;
  font-family: var(--font-mono);
  margin-bottom: 8px;
}

.skin-grid {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.skin-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1.5px solid var(--green-dim);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  min-width: 72px;
}

.skin-item:hover:not(.locked) {
  border-color: var(--green);
  background: var(--green-dark);
}

.skin-item.selected {
  border-color: var(--green);
  box-shadow: 0 0 10px var(--green-glow);
  background: var(--green-dark);
}

.skin-item.locked {
  opacity: 0.35;
  cursor: not-allowed;
}

.skin-preview {
  width: var(--skin-preview-size, 40px);
  height: var(--skin-preview-size, 40px);
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.skin-preview-head {
  position: absolute;
  top: 2px;
  right: 3px;
  width: 50%;
  height: 40%;
  border-radius: 50%;
}

.skin-preview-eye {
  position: absolute;
  top: 8px;
  right: 6px;
  width: 25%;
  height: 25%;
  border-radius: 50%;
}

.skin-name {
  font-size: 9px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
}

.skin-lock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.skin-lock-icon {
  font-size: 10px;
}

.skin-lock-hint {
  font-size: 7.5px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  max-width: 70px;
  line-height: 1.2;
  text-align: center;
}

.skin-selected-badge {
  font-size: 11px;
  color: var(--green);
  font-weight: bold;
}
</style>
