<script setup lang="ts">
/**
 * components/battle/SkillPanel.vue
 * 5戦ごとに挟むスキル/ステータスポイント配分パネル（第7フェーズ）。
 *
 * アクティブ4枠の入れ替えは既存の SkillDraftPanel（status:'swapping'の入れ替え画面）を
 * そのまま流用する。ここでは「装備中への配分」「倉庫との入れ替え起点」
 * 「ステータス配分」だけを扱う。
 */
import type { GrowthStatKey } from '../../domain/battle/types'
import type { SkillTextToken } from '../../domain/battle/skillText'
import SkillText from './SkillText.vue'

export interface PanelActiveView {
  id: string
  label: string
  level: number
  points: number
  /** 次のレベルに必要な累計ポイント。Lv上限ならなし */
  pointsRequired?: number
  categoryLabel?: string
  categoryColor?: string
  effectTokens: SkillTextToken[]
}

export interface StatRowView {
  key: GrowthStatKey
  label: string
  base: number
  allocated: number
}

defineProps<{
  equippedActives: PanelActiveView[]
  storedActives: PanelActiveView[]
  skillPoints: number
  statRows: StatRowView[]
  statPoints: number
}>()

const emit = defineEmits<{
  (e: 'allocate', activeId: string): void
  (e: 'unequip', activeId: string): void
  (e: 'equip', activeId: string): void
  (e: 'stat-inc', stat: GrowthStatKey): void
  (e: 'stat-dec', stat: GrowthStatKey): void
  (e: 'reset-stats'): void
  (e: 'close'): void
}>()
</script>

<template>
  <div class="skill-panel-overlay">
    <div class="skill-panel">
      <div class="panel-head">
        <div class="panel-title">スキル/ステータス配分</div>
        <div class="panel-points">
          <span class="points-badge">スキルP {{ skillPoints }}</span>
          <span class="points-badge">ステータスP {{ statPoints }}</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title">セット中のアクティブ</div>
        <div class="active-list">
          <div v-for="a in equippedActives" :key="a.id" class="active-row">
            <div class="active-head">
              <span
                v-if="a.categoryLabel"
                class="active-category"
                :style="{ '--category-color': a.categoryColor ?? 'var(--battle-accent)' }"
              >{{ a.categoryLabel }}</span>
              <span class="active-label">{{ a.label }}</span>
              <span class="active-level">Lv{{ a.level }}</span>
              <span v-if="a.pointsRequired !== undefined" class="active-points">{{ a.points }}/{{ a.pointsRequired }}pt</span>
              <span v-else class="active-points">MAX</span>
            </div>
            <div class="active-effect"><SkillText :tokens="a.effectTokens" /></div>
            <div class="active-actions">
              <button
                type="button" class="panel-btn"
                :disabled="skillPoints <= 0 || a.pointsRequired === undefined"
                @click="emit('allocate', a.id)"
              >+1 配分</button>
              <button type="button" class="panel-btn ghost" @click="emit('unequip', a.id)">外す</button>
            </div>
          </div>
          <div v-if="equippedActives.length === 0" class="empty-hint">セット中のアクティブがありません</div>
        </div>
      </div>

      <div v-if="storedActives.length > 0" class="panel-section">
        <div class="section-title">倉庫保管中</div>
        <div class="active-list">
          <div v-for="a in storedActives" :key="a.id" class="active-row stored">
            <div class="active-head">
              <span class="active-label">{{ a.label }}</span>
              <span class="active-level">Lv{{ a.level }}</span>
            </div>
            <button type="button" class="panel-btn" @click="emit('equip', a.id)">セットする</button>
          </div>
        </div>
      </div>

      <div class="panel-section">
        <div class="section-title-row">
          <div class="section-title">ステータス配分</div>
          <button type="button" class="panel-btn ghost small" @click="emit('reset-stats')">全リセット</button>
        </div>
        <div class="stat-list">
          <div v-for="s in statRows" :key="s.key" class="stat-row">
            <span class="stat-label">{{ s.label }}</span>
            <span class="stat-base">{{ s.base }}</span>
            <button type="button" class="stepper" :disabled="s.allocated <= 0" @click="emit('stat-dec', s.key)">−</button>
            <span class="stat-allocated">+{{ s.allocated }}</span>
            <button type="button" class="stepper" :disabled="statPoints <= 0" @click="emit('stat-inc', s.key)">+</button>
          </div>
        </div>
      </div>

      <button type="button" class="panel-close" @click="emit('close')">次の戦闘へ</button>
    </div>
  </div>
</template>

<style scoped>
.skill-panel-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 35;
}
.skill-panel {
  width: min(92vw, 620px);
  max-height: 86vh;
  overflow-y: auto;
  background: color-mix(in srgb, var(--battle-panel) 97%, transparent);
  border: 2px solid var(--battle-frame-border);
  border-radius: var(--radius-md);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  padding: 18px 20px;
}
.panel-head, .section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-head {
  margin-bottom: 12px;
}
.panel-title {
  font-size: 16px;
  font-weight: 700;
}
.panel-points {
  display: flex;
  gap: 8px;
}
.points-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--battle-accent) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--battle-accent) 55%, transparent);
}
.panel-section {
  margin-bottom: 16px;
}
.section-title, .section-title-row {
  margin-bottom: 6px;
}
.section-title {
  font-size: 12px;
  opacity: 0.75;
}
.active-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.active-row {
  padding: 8px 10px;
  border: 1px solid var(--battle-frame-border);
  border-radius: var(--radius-sm);
}
.active-row.stored {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.active-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.active-category {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--category-color);
  background: color-mix(in srgb, var(--category-color) 20%, transparent);
}
.active-label {
  font-size: 14px;
  font-weight: 700;
  flex: 1;
}
.active-level {
  font-size: 11px;
  opacity: 0.8;
}
.active-points {
  font-size: 11px;
  color: var(--battle-diff-plus);
}
.active-effect {
  font-size: 12px;
  margin: 4px 0 6px;
}
.active-actions {
  display: flex;
  gap: 6px;
}
.panel-btn, .stepper, .panel-close {
  border: 1px solid var(--battle-accent);
  background: color-mix(in srgb, var(--battle-accent) 18%, transparent);
  color: var(--battle-text);
  cursor: pointer;
}
.panel-btn, .panel-close {
  border-radius: var(--radius-sm);
}
.panel-btn {
  padding: 5px 12px;
  font-size: 12px;
}
.panel-btn:disabled, .stepper:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.panel-btn.ghost {
  background: transparent;
  border-color: var(--text-muted);
}
.panel-btn.small {
  padding: 3px 8px;
  font-size: 11px;
}
.empty-hint {
  font-size: 12px;
  opacity: 0.6;
}
.stat-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.stat-label, .stat-base {
  width: 60px;
}
.stat-base {
  text-align: right;
  opacity: 0.75;
}
.stat-allocated {
  width: 40px;
  text-align: center;
  color: var(--battle-diff-plus);
}
.stepper {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}
.panel-close {
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  font-size: 13px;
}
</style>
