<script setup lang="ts">
/**
 * BATTLE を選んだあとに出す技の一覧。
 * 上に選択中の技の説明を出し、押す前に効果とクールタイムが分かるようにする。
 */
import { computed, ref } from 'vue'
import SkillText from './SkillText.vue'
import type { SkillTextToken } from '../../domain/battle/skillText'

export interface SkillCommandEntry {
  /** 'active:<slotIndex>' / 'builtin:guard' のような識別子 */
  id: string
  label: string
  /** 属性・種別を示す小さな印の色 */
  markColor: string
  /** 残りクールタイム。0 なら使える */
  cooldown: number
  disabled: boolean
  /** 右端に出す補足（Lv など） */
  note?: string
  description?: string
  effectTokens?: SkillTextToken[]
}

const props = defineProps<{
  entries: SkillCommandEntry[]
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'cancel'): void
}>()

const hoveredId = ref<string | null>(null)
const focused = computed(() =>
  props.entries.find(e => e.id === hoveredId.value) ?? props.entries.find(e => !e.disabled) ?? props.entries[0] ?? null,
)
</script>

<template>
  <div class="skill-command">
    <div v-if="focused" class="skill-tip">
      <div class="tip-head">
        <span class="tip-icon">✦</span>クールダウン：{{ focused.cooldown > 0 ? `${focused.cooldown}ターン` : '-' }}
      </div>
      <div class="tip-body">
        <SkillText v-if="focused.effectTokens" :tokens="focused.effectTokens" />
        <span v-else>{{ focused.description }}</span>
      </div>
    </div>

    <div class="skill-list">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="skill-slot"
        :class="{ disabled: entry.disabled }"
        :disabled="entry.disabled"
        @click="emit('select', entry.id)"
        @mouseenter="hoveredId = entry.id"
        @mouseleave="hoveredId = null"
      >
        <span class="slot-mark" :style="{ background: entry.markColor }" />
        <span class="slot-label">{{ entry.label }}</span>
        <span v-if="entry.cooldown > 0" class="slot-cooldown">{{ entry.cooldown }}</span>
        <span v-else-if="entry.note" class="slot-note">{{ entry.note }}</span>
      </button>
      <button type="button" class="skill-slot back" @click="emit('cancel')">
        <span class="slot-label">もどる</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.skill-command {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transform-origin: right center;
  /* BATTLE を押した瞬間に技の一覧へ踏み込む手応えを出す入場アニメーション。
     @keyframes menu-pop-in は BattleScreen.vue の説明コメント参照
     （.command-area が right 基準のため、位置がずれて見えないよう scale のみで出現させる） */
  animation: menu-pop-in 220ms cubic-bezier(0.2, 1, 0.3, 1);
}
@keyframes menu-pop-in {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
.skill-tip {
  padding: 10px 14px;
  background: rgba(58, 46, 38, 0.94);
  border: 2px solid rgba(255, 255, 255, 0.22);
  color: #f2ecdd;
  font-size: 12px;
  line-height: 1.6;
  /* 右上と左下を落として、下の一覧と同じ斜めの形にそろえる */
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
}
.tip-head {
  color: #ffd98a;
  font-size: 11px;
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.tip-icon {
  margin-right: 4px;
}
.skill-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px;
  background: #f6e3cf;
  border: 3px solid #c98a5a;
  clip-path: polygon(22px 0, 100% 0, 100% calc(100% - 22px), calc(100% - 22px) 100%, 0 100%, 0 22px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.skill-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: transparent;
  border: none;
  font: inherit;
  font-size: 16px;
  color: #4a2a1e;
  cursor: pointer;
  text-align: left;
}
.skill-slot:hover:not(:disabled) {
  background: #f0a878;
}
.skill-slot.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.skill-slot.back {
  margin-top: 4px;
  font-size: 13px;
  opacity: 0.75;
}
.slot-mark {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
}
.slot-label {
  flex: 1;
}
.slot-cooldown {
  font-size: 13px;
  font-weight: 700;
  color: #c0392b;
}
.slot-note {
  font-size: 12px;
  opacity: 0.7;
}
</style>
