<script setup lang="ts">
/**
 * BATTLE を選んだあとに出す技の一覧。
 * 上に選択中の技の説明を出し、押す前に効果とクールタイムが分かるようにする。
 *
 * 選択は2回クリック制: 1回目のクリックで「固定」し、2回目のクリック（同じ枠を
 * もう一度押す）で確定・発動する。固定中でも従来どおりマウスオーバーで他の技の
 * 説明を一時的に見られるが、そこから外すと固定していた技の説明に戻る。
 * 誤発動（ホバーしただけで即発動）を防ぎつつ、見比べる操作を両立させるため。
 */
import { computed, ref, watch } from 'vue'
import SkillText from './SkillText.vue'
import type { SkillTextToken } from '../../domain/battle/skillText'
import type { Element } from '../../domain/battle/types'

export interface SkillCommandEntry {
  /** 'active:<slotIndex>' / 'builtin:guard' のような識別子 */
  id: string
  label: string
  /** 属性・種別を示す小さな印の色 */
  markColor: string
  /** 攻撃対象への相性プレビュー（弱点/耐性・抜群/微妙）の計算に使う。builtin行動は省略可 */
  element?: Element
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
  /** 技を選ぶ最中でも自分のHPを見たいという要望への対応。省略時は表示しない */
  playerHp?: number
  playerMaxHp?: number
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'cancel'): void
  /** 説明欄に今表示されている技（= 相性プレビュー対象）。無ければ null */
  (e: 'preview', entry: SkillCommandEntry | null): void
}>()

const hoveredId = ref<string | null>(null)
/** 1回目のクリックで固定された枠。null なら未固定 */
const pinnedId = ref<string | null>(null)

/** ホバー中はホバー先を優先表示し、外れたら固定先へ戻る。固定も無ければ先頭の使える技 */
const focused = computed(() =>
  props.entries.find(e => e.id === hoveredId.value)
  ?? props.entries.find(e => e.id === pinnedId.value)
  ?? props.entries.find(e => !e.disabled)
  ?? props.entries[0]
  ?? null,
)

watch(focused, (f) => emit('preview', f), { immediate: true })

const hpRatio = computed(() => {
  if (!props.playerMaxHp || props.playerMaxHp <= 0) return 0
  return Math.max(0, Math.min(1, (props.playerHp ?? 0) / props.playerMaxHp))
})

function onSlotClick(entry: SkillCommandEntry): void {
  if (entry.disabled) return
  if (pinnedId.value === entry.id) {
    emit('select', entry.id)
    pinnedId.value = null
    return
  }
  pinnedId.value = entry.id
}
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

    <div v-if="playerMaxHp" class="skill-hp">
      <span class="skill-hp-label">HP</span>
      <div class="skill-hp-track">
        <div class="skill-hp-fill" :style="{ width: `${hpRatio * 100}%` }" />
      </div>
      <span class="skill-hp-num">{{ Math.max(0, Math.floor(playerHp ?? 0)) }}/{{ Math.floor(playerMaxHp) }}</span>
    </div>

    <div class="skill-list">
      <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="skill-slot"
        :class="{ disabled: entry.disabled, pinned: pinnedId === entry.id }"
        :disabled="entry.disabled"
        @click="onSlotClick(entry)"
        @mouseenter="hoveredId = entry.id"
        @mouseleave="hoveredId = null"
      >
        <span class="slot-mark" :style="{ background: entry.markColor }" />
        <span class="slot-label">{{ entry.label }}</span>
        <span v-if="pinnedId === entry.id" class="slot-confirm">{{ hoveredId === entry.id ? '確定' : '選択中' }}</span>
        <span v-else-if="entry.cooldown > 0" class="slot-cooldown">{{ entry.cooldown }}</span>
        <span v-else-if="entry.note" class="slot-note">{{ entry.note }}</span>
      </button>
      <button type="button" class="skill-slot back" @click="pinnedId = null; emit('cancel')">
        <span class="slot-label">もどる</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.skill-command {
  position: relative;
  width: 320px;
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
/*
 * 通常のフローに乗せて上に置くと、説明文の長さで高さが変わるたびに下の一覧（.skill-list）の
 * 画面上の位置がずれ、マウスがホバー先の枠から外れてしまっていた。外れる→説明が縮む→
 * 高さが戻って再びホバーに入る→また伸びる…という高速な点滅ループが起きていたため、
 * 説明欄を絶対配置にして一覧の上に「浮かせ」、一覧の位置には一切影響しないようにする。
 */
.skill-tip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  margin-bottom: 8px;
  padding: 10px 14px;
  background: rgba(58, 46, 38, 0.94);
  border: 2px solid rgba(255, 255, 255, 0.22);
  color: #f2ecdd;
  font-size: 12px;
  line-height: 1.6;
  pointer-events: none;
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
.skill-hp {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  margin-bottom: 4px;
  background: #f6e3cf;
  border: 2px solid #c98a5a;
  border-radius: var(--radius-sm);
  color: #4a2a1e;
}
.skill-hp-label {
  font-size: 10px;
  font-weight: 700;
  opacity: 0.75;
}
.skill-hp-track {
  position: relative;
  flex: 1;
  height: 7px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  overflow: hidden;
}
.skill-hp-fill {
  height: 100%;
  background: linear-gradient(180deg, #ffd07a 0%, #e88a2a 55%, #b4550f 100%);
  transition: width 320ms ease-out;
}
.skill-hp-num {
  font-size: 11px;
  white-space: nowrap;
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
.skill-slot.pinned {
  background: #f0a878;
  box-shadow: inset 0 0 0 2px #d9564b;
}
.slot-confirm {
  font-size: 10px;
  font-weight: 700;
  color: #d9564b;
  white-space: nowrap;
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
