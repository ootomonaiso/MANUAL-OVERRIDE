<script setup lang="ts">
import { ref } from 'vue'
import { GENRES } from '../data/genres'
import type { GenreId } from '../domain/types'
import type { DebugSettings } from './types'

const emit = defineEmits<{
  (e: 'apply', settings: DebugSettings): void
}>()

const forceGenre = ref<GenreId | null>(null)
const showManual = ref(true)

function onOk() {
  emit('apply', {
    forceGenre: forceGenre.value,
    showManual: showManual.value,
  })
}
</script>

<template>
  <div class="debug-panel">
    <div class="debug-title">// DEBUG</div>

    <label class="debug-row">
      <span class="debug-label">force genre</span>
      <select v-model="forceGenre" class="debug-select">
        <option :value="null">通常（収束させる）</option>
        <option v-for="g in GENRES" :key="g.id" :value="g.id">
          {{ g.id }} — {{ g.label }}
        </option>
      </select>
    </label>

    <label class="debug-row debug-check">
      <input v-model="showManual" type="checkbox" />
      <span class="debug-label">説明書を表示する</span>
    </label>

    <button class="debug-ok" @click="onOk">OK</button>
  </div>
</template>

<style scoped>
.debug-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  background: rgba(0, 0, 0, 0.82);
  border: 1px solid #555;
  border-radius: 4px;
  padding: 16px 18px;
  min-width: 280px;
  font-family: 'Courier New', 'Consolas', monospace;
  font-size: 12px;
  color: #d0d0d0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
}

.debug-title {
  font-size: 11px;
  letter-spacing: 2px;
  color: #8a8a8a;
}

.debug-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.debug-label {
  color: #b0b0b0;
}

.debug-select {
  background: #111;
  color: #e0e0e0;
  border: 1px solid #555;
  border-radius: 3px;
  padding: 5px 6px;
  font-family: inherit;
  font-size: 12px;
}

.debug-check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.debug-ok {
  align-self: flex-end;
  background: #1a1a1a;
  color: #e0e0e0;
  border: 1px solid #666;
  border-radius: 3px;
  padding: 6px 22px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.debug-ok:hover {
  background: #2a2a2a;
  border-color: #999;
}
</style>
