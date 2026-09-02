<script setup lang="ts">
import SkillText from './SkillText.vue'
import GlossaryTerm from './GlossaryTerm.vue'
import type { SkillTextToken } from '../../domain/battle/skillText'

export interface DraftCardView {
  index: number
  kind: 'active' | 'passive' | 'trait'
  label: string
  flavorText: string
  effectTokens: SkillTextToken[]
  categoryLabel: string
  categoryColor?: string
  categoryId?: string
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
      <div
        v-for="opt in options"
        :key="opt.index"
        role="button"
        tabindex="0"
        class="draft-card"
        :class="{ unlocked: opt.isUnlocked }"
        @click="emit('select', opt.index)"
        @keydown.enter="emit('select', opt.index)"
        @keydown.space.prevent="emit('select', opt.index)"
      >
        <div v-if="opt.isUnlocked" class="unlock-badge">解放</div>
        <div class="card-kind">
          <GlossaryTerm :term-id="opt.kind">{{ opt.kind === 'active' ? 'アクティブ' : opt.kind === 'passive' ? 'パッシブ' : '特性' }}</GlossaryTerm>
        </div>
        <div class="card-label">{{ opt.label }}</div>
        <div
          v-if="opt.categoryLabel !== '―'"
          class="card-category"
          :style="{ '--category-color': opt.categoryColor ?? 'var(--battle-accent)' }"
        >
          <GlossaryTerm v-if="opt.categoryId" :term-id="opt.categoryId">{{ opt.categoryLabel }}</GlossaryTerm>
          <template v-else>{{ opt.categoryLabel }}</template>
        </div>
        <div v-if="opt.levelTransition" class="card-level">{{ opt.levelTransition }}</div>
        <div class="card-effect"><SkillText :tokens="opt.effectTokens" /></div>
        <div class="card-flavor">「{{ opt.flavorText }}」</div>
      </div>
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
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 1160px;
  padding: 20px;
}
.draft-card {
  position: relative;
  width: 300px;
  padding: 20px;
  background: color-mix(in srgb, var(--battle-panel) 97%, transparent);
  border: 2px solid var(--battle-frame-border);
  border-radius: var(--radius-md);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  text-align: left;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.draft-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--battle-accent) 30%, transparent);
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
  font-size: 11px;
  letter-spacing: 1px;
  opacity: 0.65;
}
.card-label {
  font-size: 20px;
  font-weight: 700;
  margin: 3px 0 8px;
}
/* カテゴリはスキルの性格を一目で示す要なので、地味な添え書きではなく色つきの
   バッジとして目立たせる（カテゴリごとの色は CATEGORY_COLOR / battle-screen の
   CSSカスタムプロパティ側で定義） */
.card-category {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 3px 10px;
  margin-bottom: 8px;
  border-radius: 999px;
  color: var(--category-color);
  background: color-mix(in srgb, var(--category-color) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--category-color) 55%, transparent);
}
.card-level {
  font-size: 12px;
  color: var(--battle-diff-plus);
  margin-bottom: 6px;
}
.card-effect {
  font-size: 13px;
  margin-bottom: 10px;
}
.card-flavor {
  font-size: 11px;
  opacity: 0.6;
  font-style: italic;
}
.swap-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--battle-text);
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
  background: color-mix(in srgb, var(--battle-panel) 97%, transparent);
  border: 1px solid var(--battle-accent);
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
