<script setup lang="ts">
import SkillText from './SkillText.vue'
import type { SkillTextToken } from '../../domain/battle/skillText'

export interface DetailStatRow {
  key: string
  label: string
  base: number
  effective: number
  isPercent: boolean
}

export interface DetailSkillRow {
  id: string
  label: string
  level?: number
  flavorText: string
  effectTokens: SkillTextToken[]
}

defineProps<{
  title: string
  stats: DetailStatRow[]
  traits: DetailSkillRow[]
  passives: DetailSkillRow[]
  actives: DetailSkillRow[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function fmt(v: number, isPercent: boolean): string {
  return isPercent ? `${Math.round(v * 1000) / 10}%` : `${Math.round(v)}`
}
</script>

<template>
  <div class="detail-overlay" @click.self="emit('close')">
    <div class="detail-card">
      <div class="detail-header">
        <span class="detail-title">{{ title }}</span>
        <button type="button" class="detail-close" @click="emit('close')">×</button>
      </div>

      <div class="detail-section">
        <div class="section-title">ステータス</div>
        <div class="stat-grid">
          <div v-for="s in stats" :key="s.key" class="stat-cell">
            <span class="stat-name">{{ s.label }}</span>
            <span class="stat-values">
              実効 {{ fmt(s.effective, s.isPercent) }} / 基礎 {{ fmt(s.base, s.isPercent) }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="actives.length > 0" class="detail-section">
        <div class="section-title">アクティブスキル</div>
        <div v-for="a in actives" :key="a.id" class="skill-row">
          <div class="skill-row-head">{{ a.label }} <span v-if="a.level">Lv{{ a.level }}</span></div>
          <SkillText :tokens="a.effectTokens" />
          <div class="skill-flavor">「{{ a.flavorText }}」</div>
        </div>
      </div>

      <div v-if="passives.length > 0" class="detail-section">
        <div class="section-title">パッシブスキル</div>
        <div v-for="p in passives" :key="p.id" class="skill-row">
          <div class="skill-row-head">{{ p.label }} <span v-if="p.level">Lv{{ p.level }}</span></div>
          <SkillText :tokens="p.effectTokens" />
          <div class="skill-flavor">「{{ p.flavorText }}」</div>
        </div>
      </div>

      <div v-if="traits.length > 0" class="detail-section">
        <div class="section-title">特性</div>
        <div v-for="t in traits" :key="t.id" class="skill-row">
          <div class="skill-row-head">{{ t.label }}</div>
          <SkillText :tokens="t.effectTokens" />
          <div class="skill-flavor">「{{ t.flavorText }}」</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.detail-card {
  background: var(--genre-bg, var(--bg-panel));
  border: 2px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-md);
  padding: 16px 20px;
  width: 92%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  color: var(--genre-text, var(--text));
  font-family: var(--genre-font, var(--font-main));
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--genre-border, var(--green-dim));
  padding-bottom: 8px;
  margin-bottom: 10px;
}
.detail-title {
  font-size: 15px;
  font-weight: 700;
}
.detail-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
}
.detail-section {
  margin-bottom: 12px;
}
.section-title {
  font-size: 10px;
  opacity: 0.6;
  margin-bottom: 4px;
}
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}
.stat-cell {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}
.stat-name { opacity: 0.85; }
.stat-values { font-size: 10px; }
.skill-row {
  margin-bottom: 8px;
  font-size: 11px;
}
.skill-row-head {
  font-weight: 700;
  margin-bottom: 2px;
}
.skill-flavor {
  opacity: 0.6;
  font-style: italic;
  font-size: 10px;
  margin-top: 2px;
}
</style>
