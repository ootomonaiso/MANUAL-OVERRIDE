<script setup lang="ts">
/**
 * components/battle/SkillPanel.vue
 * 5戦ごとのスキル/ステータスポイント配分パネル（第7・8フェーズ）。
 *
 * 第8フェーズでレイアウトを再設計: スクロールが必要にならないよう、
 * 左＝ステータス配分（縦積み）／右上＝説明（ホバー中・選択中スキルの効果文）／
 * 右下＝アクティブスキル一覧（コンパクトなカードのみ、効果文は右上へ逃がす）
 * の3ゾーン構成にした。倉庫保管中はアクティブ一覧の下に控えめに続ける。
 */
import { computed, ref } from 'vue'
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

const props = defineProps<{
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

// ── 右上の説明ゾーン: ホバー中を優先し、外れたら最後に触れたものへ戻る ──
const hoveredId = ref<string | null>(null)
const pinnedId = ref<string | null>(null)
const focused = computed(() =>
  props.equippedActives.find(a => a.id === hoveredId.value)
  ?? props.equippedActives.find(a => a.id === pinnedId.value)
  ?? props.equippedActives[0]
  ?? null,
)
function onCardEnter(id: string): void { hoveredId.value = id }
function onCardLeave(): void { hoveredId.value = null }
function onCardClick(id: string): void { pinnedId.value = id }
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

      <div class="panel-body">
        <div class="zone-stats">
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

        <div class="zone-detail">
          <template v-if="focused">
            <div class="detail-head">
              <span v-if="focused.categoryLabel" class="active-category" :style="{ '--category-color': focused.categoryColor ?? 'var(--battle-accent)' }">{{ focused.categoryLabel }}</span>
              <span class="detail-label">{{ focused.label }}</span>
              <span class="detail-level">Lv{{ focused.level }}</span>
              <span v-if="focused.pointsRequired !== undefined" class="active-points">{{ focused.points }}/{{ focused.pointsRequired }}pt</span>
              <span v-else class="active-points">MAX</span>
            </div>
            <div class="detail-effect"><SkillText :tokens="focused.effectTokens" /></div>
          </template>
          <div v-else class="empty-hint">セット中のアクティブがありません</div>
        </div>

        <div class="zone-actives">
          <div class="section-title">セット中のアクティブ</div>
          <div class="active-grid">
            <div
              v-for="a in equippedActives" :key="a.id" class="active-card"
              :class="{ pinned: pinnedId === a.id }"
              @mouseenter="onCardEnter(a.id)" @mouseleave="onCardLeave" @click="onCardClick(a.id)"
            >
              <div class="active-card-label">{{ a.label }}</div>
              <div class="active-card-sub">
                <span>Lv{{ a.level }}</span>
                <span v-if="a.pointsRequired !== undefined">{{ a.points }}/{{ a.pointsRequired }}pt</span>
                <span v-else>MAX</span>
              </div>
              <div class="active-card-actions">
                <button
                  type="button" class="panel-btn small"
                  :disabled="skillPoints <= 0 || a.pointsRequired === undefined"
                  @click.stop="emit('allocate', a.id)"
                >+1</button>
                <button type="button" class="panel-btn ghost small" @click.stop="emit('unequip', a.id)">外す</button>
              </div>
            </div>
          </div>

          <template v-if="storedActives.length > 0">
            <div class="section-title stored-title">倉庫保管中</div>
            <div class="stored-row">
              <div v-for="a in storedActives" :key="a.id" class="stored-chip">
                <span>{{ a.label }}（Lv{{ a.level }}）</span>
                <button type="button" class="panel-btn small" @click="emit('equip', a.id)">セット</button>
              </div>
            </div>
          </template>
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
  padding: 16px;
}
.skill-panel {
  width: min(94vw, 760px);
  max-height: min(92vh, 620px);
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--battle-panel) 97%, transparent);
  border: 2px solid var(--battle-frame-border);
  border-radius: var(--radius-md);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  padding: 14px 16px;
  gap: 10px;
}
.panel-head, .section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-title, .detail-label, .active-category, .active-card-label {
  font-weight: 700;
}
.panel-title {
  font-size: 15px;
}
.panel-points {
  display: flex;
  gap: 8px;
}
.points-badge {
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--battle-accent) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--battle-accent) 55%, transparent);
  white-space: nowrap;
}
/* 3ゾーン構成: 左=ステータス配分（縦積み・全高）、右上=説明、右下=アクティブ一覧 */
.panel-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 168px 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
}
.zone-stats {
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.zone-detail, .zone-actives {
  border: 1px solid var(--battle-frame-border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  overflow-y: auto;
}
.zone-actives {
  min-height: 0;
}
.section-title, .section-title-row {
  margin-bottom: 6px;
}
.section-title, .stat-base, .active-card-sub {
  opacity: 0.75;
}
.section-title, .points-badge, .detail-level, .active-points, .stored-chip {
  font-size: 11px;
}
.stored-title {
  margin-top: 8px;
}
.stat-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  justify-content: center;
}
.stat-row, .detail-effect, .empty-hint, .active-card-label, .panel-close {
  font-size: 12px;
}
.stat-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-label, .stat-base {
  width: 34px;
}
.stat-base {
  text-align: right;
}
.stat-allocated {
  width: 32px;
  text-align: center;
  color: var(--battle-diff-plus);
}
.stepper, .panel-btn, .panel-close {
  border: 1px solid var(--battle-accent);
  background: color-mix(in srgb, var(--battle-accent) 18%, transparent);
  color: var(--battle-text);
  cursor: pointer;
}
.stepper, .panel-btn {
  font-size: 11px;
}
.stepper {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  line-height: 1;
  flex-shrink: 0;
}
.stepper:disabled, .panel-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.active-category, .panel-btn.small, .active-card-sub {
  font-size: 10px;
}
.active-category {
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--category-color);
  background: color-mix(in srgb, var(--category-color) 20%, transparent);
}
.detail-label {
  font-size: 14px;
}
.detail-level {
  opacity: 0.8;
}
.active-points {
  color: var(--battle-diff-plus);
}
.detail-effect {
  margin-top: 6px;
}
.empty-hint {
  opacity: 0.6;
}
.active-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.active-card {
  padding: 6px 8px;
  border: 1px solid var(--battle-frame-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.active-card.pinned {
  border-color: var(--battle-accent);
  background: color-mix(in srgb, var(--battle-accent) 12%, transparent);
}
.active-card-sub {
  display: flex;
  gap: 6px;
  margin: 2px 0 4px;
}
.active-card-actions {
  display: flex;
  gap: 4px;
}
.panel-btn, .panel-close {
  border-radius: var(--radius-sm);
}
.panel-btn {
  padding: 4px 10px;
}
.panel-btn.ghost {
  background: transparent;
  border-color: var(--text-muted);
}
.panel-btn.small {
  padding: 3px 8px;
}
.stored-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.stored-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--battle-frame-border);
  border-radius: 999px;
}
.panel-close {
  padding: 9px;
}
</style>
