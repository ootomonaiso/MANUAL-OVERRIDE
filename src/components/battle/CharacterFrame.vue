<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  hp: number
  maxHp: number
  shield: number
  alive: boolean
  isBoss?: boolean
  defeated?: boolean
}>()

const emit = defineEmits<{
  (e: 'open-detail'): void
}>()

const hpRatio = computed(() => props.maxHp > 0 ? Math.max(0, Math.min(1, props.hp / props.maxHp)) : 0)
</script>

<template>
  <button
    class="char-frame"
    :class="{ 'is-boss': isBoss, defeated: defeated || !alive }"
    type="button"
    @click="emit('open-detail')"
  >
    <div class="char-label">{{ label }}</div>
    <div class="hp-bar-track">
      <div class="hp-bar-fill" :style="{ width: `${hpRatio * 100}%` }" />
      <div v-if="shield > 0" class="shield-badge">🛡{{ Math.floor(shield) }}</div>
    </div>
    <div class="hp-numbers">{{ Math.max(0, Math.floor(hp)) }} / {{ Math.floor(maxHp) }}</div>
  </button>
</template>

<style scoped>
.char-frame {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 4px;
  cursor: pointer;
  font-family: var(--genre-font, var(--font-main));
  color: var(--genre-text, var(--text));
  min-width: 120px;
}
.char-frame.is-boss .char-label {
  color: var(--battle-diff-minus);
  font-weight: 700;
}
.char-frame.defeated {
  opacity: 0.35;
  filter: grayscale(1);
}
.char-label {
  font-size: 12px;
  text-align: center;
}
.hp-bar-track {
  position: relative;
  height: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.hp-bar-fill {
  height: 100%;
  background: var(--battle-diff-plus);
  transition: width var(--transition-med);
}
.shield-badge {
  position: absolute;
  top: -2px;
  right: 2px;
  font-size: 9px;
  color: var(--battle-category-aegis);
}
.hp-numbers {
  font-size: 10px;
  text-align: center;
  opacity: 0.85;
}
</style>
