<script setup lang="ts">
export interface FocusEnemyView {
  index: number
  label: string
  alive: boolean
}

defineProps<{
  enemies: FocusEnemyView[]
  rangeLabel: string
}>()

const emit = defineEmits<{
  (e: 'select', enemyIndex: number): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div class="focus-selector">
    <div class="focus-hint">対象を選択（{{ rangeLabel }}）</div>
    <div class="focus-targets">
      <button
        v-for="e in enemies"
        :key="e.index"
        type="button"
        class="focus-target"
        :disabled="!e.alive"
        @click="emit('select', e.index)"
      >
        {{ e.label }}
      </button>
    </div>
    <button type="button" class="focus-cancel" @click="emit('cancel')">キャンセル</button>
  </div>
</template>

<style scoped>
.focus-selector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: var(--genre-bg, var(--bg-panel));
  border: 1px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-md);
}
.focus-hint {
  font-size: 12px;
  color: var(--genre-text, var(--text));
}
.focus-targets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.focus-target {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--genre-accent, var(--green));
  border-radius: var(--radius-sm);
  color: var(--genre-text, var(--text));
  cursor: pointer;
}
.focus-target:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.focus-cancel {
  font-size: 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  text-decoration: underline;
}
</style>
