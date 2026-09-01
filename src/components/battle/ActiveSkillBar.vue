<script setup lang="ts">
export interface ActiveSlotView {
  id: string
  label: string
  level: number
  stacks: number
  stacksRequired: number
  cooldown: number
}

defineProps<{
  slots: (ActiveSlotView | null)[]
  guardOrDodge: 'guard' | 'dodge'
  guardCooldown: number
  disabled: boolean
}>()

const emit = defineEmits<{
  (e: 'select-active', slotIndex: number): void
  (e: 'select-builtin', action: 'guard' | 'pass' | 'dodge'): void
}>()
</script>

<template>
  <div class="active-skill-bar">
    <button
      v-for="(slot, i) in slots"
      :key="i"
      class="skill-slot"
      type="button"
      :disabled="disabled || !slot || slot.cooldown > 0"
      :class="{ empty: !slot }"
      @click="slot && emit('select-active', i)"
    >
      <template v-if="slot">
        <div class="slot-label">{{ slot.label }}</div>
        <div class="slot-meta">
          <span class="slot-level">Lv{{ slot.level }}</span>
          <span v-if="slot.level < 4" class="slot-stacks">{{ slot.stacks }}/{{ slot.stacksRequired }}</span>
        </div>
        <div v-if="slot.cooldown > 0" class="slot-cooldown">{{ slot.cooldown }}</div>
      </template>
      <template v-else>
        <div class="slot-empty-label">空き</div>
      </template>
    </button>

    <button
      class="skill-slot builtin"
      type="button"
      :disabled="disabled || guardCooldown > 0"
      @click="emit('select-builtin', guardOrDodge)"
    >
      <div class="slot-label">{{ guardOrDodge === 'dodge' ? '避ける' : '守る' }}</div>
      <div v-if="guardCooldown > 0" class="slot-cooldown">{{ guardCooldown }}</div>
    </button>

    <button
      class="skill-slot builtin"
      type="button"
      :disabled="disabled"
      @click="emit('select-builtin', 'pass')"
    >
      <div class="slot-label">何もしない</div>
    </button>
  </div>
</template>

<style scoped>
.active-skill-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.skill-slot {
  position: relative;
  min-width: 84px;
  padding: 8px 10px;
  background: var(--genre-bg, var(--bg-panel));
  border: 1px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-sm);
  color: var(--genre-text, var(--text));
  font-family: var(--genre-font, var(--font-main));
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);
}
.skill-slot:hover:not(:disabled) {
  transform: translateY(-2px);
  background: var(--genre-glow, var(--green-subtle));
}
.skill-slot:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.skill-slot.empty {
  opacity: 0.3;
}
.skill-slot.builtin {
  border-style: dashed;
}
.slot-label {
  font-size: 12px;
  font-weight: 600;
}
.slot-empty-label {
  font-size: 11px;
  opacity: 0.6;
}
.slot-meta {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  opacity: 0.8;
  margin-top: 2px;
}
.slot-cooldown {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--battle-diff-minus);
  color: var(--black);
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}
</style>
