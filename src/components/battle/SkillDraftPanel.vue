<script setup lang="ts">
import SkillText from './SkillText.vue'
import type { SkillTextToken } from '../../domain/battle/skillText'

export interface DraftCardView {
  index: number
  kind: 'active' | 'passive' | 'trait'
  label: string
  flavorText: string
  effectTokens: SkillTextToken[]
  categoryLabel: string
  levelTransition?: string
  isUnlocked?: boolean
}

export interface SwapSlotView {
  index: number
  label: string
}

defineProps<{
  options: DraftCardView[]
  swapping: boolean
  swapSlots: SwapSlotView[]
}>()

const emit = defineEmits<{
  (e: 'select', index: number): void
  (e: 'confirm-swap', slotIndex: number): void
  (e: 'cancel-swap'): void
}>()
</script>

<template>
  <div class="draft-overlay">
    <div v-if="!swapping" class="draft-cards">
      <button
        v-for="opt in options"
        :key="opt.index"
        type="button"
        class="draft-card"
        :class="{ unlocked: opt.isUnlocked }"
        @click="emit('select', opt.index)"
      >
        <div v-if="opt.isUnlocked" class="unlock-badge">解放</div>
        <div class="card-kind">{{ opt.kind === 'active' ? 'アクティブ' : opt.kind === 'passive' ? 'パッシブ' : '特性' }}</div>
        <div class="card-label">{{ opt.label }}</div>
        <div class="card-category">{{ opt.categoryLabel }}</div>
        <div v-if="opt.levelTransition" class="card-level">{{ opt.levelTransition }}</div>
        <div class="card-effect"><SkillText :tokens="opt.effectTokens" /></div>
        <div class="card-flavor">「{{ opt.flavorText }}」</div>
      </button>
    </div>

    <div v-else class="swap-picker">
      <div class="swap-hint">アクティブ枠が埋まっています。入れ替える枠を選んでください</div>
      <div class="swap-slots">
        <button
          v-for="s in swapSlots"
          :key="s.index"
          type="button"
          class="swap-slot"
          @click="emit('confirm-swap', s.index)"
        >{{ s.label }}</button>
      </div>
      <button type="button" class="swap-cancel" @click="emit('cancel-swap')">キャンセル</button>
    </div>
  </div>
</template>

<style scoped>
.draft-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 35;
}
.draft-cards {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 900px;
  padding: 20px;
}
.draft-card {
  position: relative;
  width: 220px;
  padding: 14px;
  background: var(--genre-bg, var(--bg-panel));
  border: 2px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-md);
  color: var(--genre-text, var(--text));
  font-family: var(--genre-font, var(--font-main));
  text-align: left;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.draft-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px var(--genre-glow, var(--green-glow));
}
.draft-card.unlocked {
  border-color: var(--battle-diff-plus);
}
.unlock-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: var(--battle-diff-plus);
  color: var(--black);
  font-size: 9px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 700;
}
.card-kind {
  font-size: 9px;
  opacity: 0.6;
}
.card-label {
  font-size: 15px;
  font-weight: 700;
  margin: 2px 0;
}
.card-category {
  font-size: 9px;
  opacity: 0.7;
  margin-bottom: 4px;
}
.card-level {
  font-size: 10px;
  color: var(--battle-diff-plus);
  margin-bottom: 4px;
}
.card-effect {
  font-size: 11px;
  margin-bottom: 6px;
}
.card-flavor {
  font-size: 10px;
  opacity: 0.6;
  font-style: italic;
}
.swap-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--genre-text, var(--text));
}
.swap-hint {
  font-size: 12px;
}
.swap-slots {
  display: flex;
  gap: 8px;
}
.swap-slot {
  padding: 10px 14px;
  background: var(--genre-bg, var(--bg-panel));
  border: 1px solid var(--genre-accent, var(--green));
  border-radius: var(--radius-sm);
  color: inherit;
  cursor: pointer;
}
.swap-cancel {
  font-size: 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  text-decoration: underline;
  cursor: pointer;
}
</style>
