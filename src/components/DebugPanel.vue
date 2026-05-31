<script setup lang="ts">
import { computed, ref } from 'vue'
import { accumulateParams, resolveGenre, resolveGenreProgress } from '../domain/genreResolver'
import { GENRES } from '../data/genres'
import type { GenreId } from '../domain/types'

interface Props {
  choiceHistory: any[]
  currentManual: () => any
  lockedGenre: GenreId | null
  phase: string
}

const props = withDefaults(defineProps<Props>(), {})
const isOpen = ref(true)
const expandedGenres = ref<Set<GenreId>>(new Set())

// 蓄積されたパラメータを計算
const accumulatedParams = computed(() => {
  const paramsList = props.choiceHistory.map(h => h.genreParams || {})
  return accumulateParams(paramsList)
})

// 確定状況（全ジャンルについて閾値充足状況）
const genreStatuses = computed(() => {
  const accumulated = accumulatedParams.value
  const result: Array<{
    id: GenreId
    label: string
    thresholds: Record<string, number>
    current: Record<string, number>
    gaps: Record<string, number>
    isMet: boolean
  }> = []

  for (const genre of GENRES) {
    if (genre.id === 'base') continue

    const gaps: Record<string, number> = {}
    let isMet = true

    for (const [key, required] of Object.entries(genre.thresholds || {})) {
      const current = accumulated[key as any] ?? 0
      gaps[key] = Math.max(0, required - current)
      if (gaps[key] > 0) isMet = false
    }

    result.push({
      id: genre.id,
      label: genre.label,
      thresholds: genre.thresholds || {},
      current: Object.keys(genre.thresholds || {}).reduce((acc, k) => {
        acc[k] = accumulated[k as any] ?? 0
        return acc
      }, {} as Record<string, number>),
      gaps,
      isMet,
    })
  }

  return result
})

// 現在のジャンル進行状況
const genreProgress = computed(() => {
  return resolveGenreProgress(accumulatedParams.value, GENRES)
})

// 次の選択肢の効果を表示
const nextChoices = computed(() => {
  const manual = props.currentManual()
  return (manual?.choices || []).map(c => ({
    id: c.id,
    label: c.label,
    genreParams: c.genreParams || {},
  }))
})

// 最新の選択（直前の選択）
const latestChoice = computed(() => {
  if (props.choiceHistory.length === 0) return null
  return props.choiceHistory[props.choiceHistory.length - 1]
})

function toggleGenre(genreId: GenreId) {
  if (expandedGenres.value.has(genreId)) {
    expandedGenres.value.delete(genreId)
  } else {
    expandedGenres.value.add(genreId)
  }
}

// パラメータをフォーマット（表示用）
function formatParams(params: Record<string, number>) {
  return Object.entries(params)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k}: +${v}`)
    .join(', ')
}

function formatCurrentParams() {
  const accumulated = accumulatedParams.value
  const entries = Object.entries(accumulated)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  return entries.length > 0
    ? entries.map(([k, v]) => `${k}: ${v}`).join(', ')
    : '(なし)'
}
</script>

<template>
  <div class="debug-panel" v-if="isOpen">
    <!-- ヘッダー -->
    <div class="debug-header">
      <h3>🔧 Debug Panel</h3>
      <button @click="isOpen = false" class="close-btn">✕</button>
    </div>

    <!-- フェーズ情報 -->
    <section class="section">
      <h4>フェーズ情報</h4>
      <div class="info-row">
        <label>Current Phase:</label>
        <span class="phase-badge" :data-phase="phase">{{ phase }}</span>
      </div>
      <div class="info-row" v-if="lockedGenre">
        <label>Locked Genre:</label>
        <span class="locked-badge">{{ lockedGenre }}</span>
      </div>
    </section>

    <!-- 累積パラメータ -->
    <section class="section">
      <h4>📊 累積パラメータ</h4>
      <div class="params-display">{{ formatCurrentParams() }}</div>
    </section>

    <!-- 次の選択肢の効果 -->
    <section class="section" v-if="nextChoices.length > 0">
      <h4>🎯 次の選択肢</h4>
      <div class="choices-list">
        <div v-for="choice in nextChoices" :key="choice.id" class="choice-item">
          <div class="choice-label">{{ choice.label }}</div>
          <div class="choice-params">{{ formatParams(choice.genreParams) }}</div>
        </div>
      </div>
    </section>

    <!-- ジャンル進行状況 -->
    <section class="section">
      <h4>🎮 ジャンル進行状況</h4>
      <div class="progress-info">
        <div class="info-row">
          <label>Closest Genre:</label>
          <span>{{ genreProgress.closestGenre }}</span>
        </div>
        <div class="info-row">
          <label>Progress:</label>
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: (genreProgress.progress * 100) + '%' }"
            ></div>
            <span class="progress-text">{{ (genreProgress.progress * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ジャンル別閾値 -->
    <section class="section">
      <h4>📋 ジャンル別閾値</h4>
      <div class="genres-list">
        <div
          v-for="status in genreStatuses"
          :key="status.id"
          class="genre-item"
          :class="{ 'is-met': status.isMet, 'is-locked': lockedGenre === status.id }"
        >
          <div class="genre-header" @click="toggleGenre(status.id)">
            <span class="genre-indicator" :class="{ expanded: expandedGenres.has(status.id) }">
              ▶
            </span>
            <span class="genre-label">{{ status.label }}</span>
            <span class="genre-status">
              {{ status.isMet ? '✓ 確定可能' : '○ 進行中' }}
            </span>
          </div>

          <div v-if="expandedGenres.has(status.id)" class="genre-details">
            <div v-for="[param, required] in Object.entries(status.thresholds)" :key="param" class="threshold-row">
              <span class="param-name">{{ param }}:</span>
              <span class="current">{{ status.current[param] || 0 }}</span>
              <span class="slash">/</span>
              <span class="required">{{ required }}</span>
              <span v-if="status.gaps[param] > 0" class="gap">
                (残り {{ status.gaps[param] }})
              </span>
              <span v-else class="met">✓</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 選択履歴 -->
    <section class="section">
      <h4>📜 選択履歴</h4>
      <div class="history-list">
        <div v-if="choiceHistory.length === 0" class="empty">選択なし</div>
        <div
          v-for="(choice, idx) in choiceHistory"
          :key="idx"
          class="history-item"
        >
          <span class="history-idx">#{{ idx + 1 }}</span>
          <span class="history-choice">{{ choice.choiceId }}</span>
          <span class="history-params" v-if="Object.keys(choice.genreParams || {}).length > 0">
            {{ formatParams(choice.genreParams) }}
          </span>
        </div>
      </div>
    </section>
  </div>

  <!-- 開き直すボタン -->
  <button v-else class="debug-toggle" @click="isOpen = true">
    🔧 Debug
  </button>
</template>

<style scoped>
.debug-panel {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 360px;
  max-height: 80vh;
  background: #1a1a2e;
  border: 2px solid #4a90e2;
  border-radius: 8px;
  padding: 12px;
  color: #eee;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  overflow-y: auto;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #4a90e2;
}

.debug-header h3 {
  margin: 0;
  font-size: 14px;
  color: #4a90e2;
}

.close-btn {
  background: none;
  border: none;
  color: #4a90e2;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #ff6b6b;
}

.section {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.section:last-child {
  border-bottom: none;
}

.section h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: bold;
  color: #4a90e2;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin: 6px 0;
  align-items: center;
}

.info-row label {
  font-weight: bold;
  color: #aaa;
}

.phase-badge {
  padding: 2px 8px;
  border-radius: 4px;
  background: #333;
  font-weight: bold;
}

.phase-badge[data-phase="title"] {
  color: #888;
}
.phase-badge[data-phase="tutorial"] {
  color: #4ecdc4;
}
.phase-badge[data-phase="playing"] {
  color: #45b7d1;
}
.phase-badge[data-phase="updating"] {
  color: #f9ca24;
}
.phase-badge[data-phase="genreLocked"] {
  color: #6c5ce7;
}
.phase-badge[data-phase="throwing"] {
  color: #a29bfe;
}
.phase-badge[data-phase="ending"] {
  color: #fd79a8;
}

.locked-badge {
  padding: 2px 8px;
  border-radius: 4px;
  background: #6c5ce7;
  color: #fff;
  font-weight: bold;
}

.params-display {
  background: #0a0a0a;
  padding: 8px;
  border-radius: 4px;
  border-left: 2px solid #4a90e2;
  word-break: break-word;
  color: #a2ff59;
  font-weight: bold;
}

.choices-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.choice-item {
  background: #252a3a;
  padding: 6px 8px;
  border-radius: 4px;
  border-left: 2px solid #45b7d1;
}

.choice-label {
  font-weight: bold;
  color: #45b7d1;
  margin-bottom: 2px;
}

.choice-params {
  color: #a2ff59;
  font-size: 11px;
}

.progress-info {
  background: #252a3a;
  padding: 8px;
  border-radius: 4px;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #0a0a0a;
  border-radius: 4px;
  margin: 6px 0;
  position: relative;
  overflow: hidden;
  border: 1px solid #333;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4a90e2, #7b68ee);
  transition: width 0.2s ease;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  color: #fff;
  font-size: 10px;
}

.genres-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.genre-item {
  background: #252a3a;
  border-radius: 4px;
  overflow: hidden;
  border-left: 2px solid #888;
  transition: border-color 0.2s;
}

.genre-item.is-met {
  border-left-color: #2ed573;
  background: rgba(46, 213, 115, 0.1);
}

.genre-item.is-locked {
  border-left-color: #ffa502;
  background: rgba(255, 165, 2, 0.1);
}

.genre-header {
  padding: 6px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
  transition: background 0.15s;
}

.genre-header:hover {
  background: rgba(74, 144, 226, 0.1);
}

.genre-indicator {
  display: inline-block;
  width: 12px;
  text-align: center;
  transition: transform 0.15s;
  font-size: 10px;
  color: #888;
}

.genre-indicator.expanded {
  transform: rotate(90deg);
}

.genre-label {
  flex: 1;
  font-weight: bold;
  color: #ccc;
}

.genre-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.05);
  color: #aaa;
}

.genre-item.is-met .genre-status {
  background: rgba(46, 213, 115, 0.2);
  color: #2ed573;
}

.genre-details {
  padding: 8px 8px 8px 24px;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid #333;
}

.threshold-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 4px 0;
  font-size: 11px;
}

.param-name {
  min-width: 60px;
  color: #888;
}

.current {
  font-weight: bold;
  color: #4a90e2;
}

.slash {
  color: #555;
}

.required {
  color: #aaa;
}

.gap {
  color: #ff6b6b;
  margin-left: 4px;
}

.met {
  color: #2ed573;
  margin-left: 4px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.empty {
  color: #666;
  font-style: italic;
  padding: 8px;
}

.history-item {
  background: #252a3a;
  padding: 6px 8px;
  border-radius: 3px;
  border-left: 2px solid #7b68ee;
  display: flex;
  gap: 8px;
  font-size: 11px;
}

.history-idx {
  color: #888;
  min-width: 25px;
}

.history-choice {
  flex: 1;
  color: #7b68ee;
  font-weight: bold;
  word-break: break-word;
}

.history-params {
  color: #a2ff59;
}

.debug-toggle {
  position: fixed;
  top: 10px;
  right: 10px;
  padding: 8px 12px;
  background: #4a90e2;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  z-index: 9998;
  transition: background 0.2s;
}

.debug-toggle:hover {
  background: #357abd;
}

/* スクロールバーのスタイリング */
.debug-panel::-webkit-scrollbar {
  width: 6px;
}

.debug-panel::-webkit-scrollbar-track {
  background: #1a1a2e;
}

.debug-panel::-webkit-scrollbar-thumb {
  background: #4a90e2;
  border-radius: 3px;
}

.debug-panel::-webkit-scrollbar-thumb:hover {
  background: #357abd;
}

.history-list::-webkit-scrollbar {
  width: 4px;
}

.history-list::-webkit-scrollbar-track {
  background: transparent;
}

.history-list::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 2px;
}
</style>
