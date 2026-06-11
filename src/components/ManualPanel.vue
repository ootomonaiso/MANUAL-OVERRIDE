<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ManualVersion, ManualTheme } from '../domain/types'

const props = defineProps<{
  manual: ManualVersion
  theme: ManualTheme
  diffLines: Array<{ text: string; type: 'added' | 'removed' | 'unchanged' }>
  isAnimating: boolean
  isCentered: boolean
  history: ManualVersion[]
  features?: Set<string>
}>()

const showHistory = ref(false)
const themeClass = computed(() => `theme-${props.theme}`)

// auto_run が有効な場合、左右移動の説明を除外
const filteredManualText = computed(() => {
  if (!props.features?.has('auto_run')) return props.manual.manualText
  return props.manual.manualText.filter(line =>
    !line.includes('←') && !line.includes('→') && !line.includes('左右')
  )
})

// 同様に差分ラインもフィルタ
const filteredDiffLines = computed(() => {
  if (!props.features?.has('auto_run')) return props.diffLines
  return props.diffLines.filter(line =>
    !line.text.includes('←') && !line.text.includes('→') && !line.text.includes('左右')
  )
})

function keyLabel(key: string): string {
  const map: Record<string, string> = {
    Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  }
  return map[key] ?? key.toUpperCase()
}
</script>

<template>
  <div class="manual-panel" :class="[themeClass, { 'panel-centered': isCentered }]">
    <!-- ヘッダー -->
    <div class="manual-header">
      <div class="manual-ver-badge">
        <span class="manual-ver-dot" />
        ver.{{ manual.version }}
      </div>
      <button class="history-btn" @click="showHistory = !showHistory" tabindex="-1">
        {{ showHistory ? '▲' : '▼ 履歴' }}
      </button>
    </div>

    <!-- 更新履歴 -->
    <Transition name="slide">
      <div v-if="showHistory" class="manual-history">
        <div v-if="history.length <= 1" class="history-empty">まだ更新はありません</div>
        <div
          v-for="h in [...history].reverse().slice(1)"
          :key="h.version"
          class="history-item"
        >
          <div class="history-ver">ver.{{ h.version }}</div>
          <div v-for="line in h.manualText" :key="line" class="history-line">{{ line }}</div>
        </div>
      </div>
    </Transition>

    <!-- イラスト（image フィールドがある場合のみ表示） -->
    <div v-if="manual.image" class="manual-image-wrap">
      <img
        :src="manual.image"
        :alt="manual.imageAlt ?? '説明書のイラスト'"
        class="manual-image"
        loading="lazy"
      />
    </div>

    <!-- 本文（差分強調） -->
    <div class="manual-body">
      <template v-if="isAnimating && filteredDiffLines.length > 0">
        <div
          v-for="(line, i) in filteredDiffLines"
          :key="i"
          class="manual-line"
          :class="`line-${line.type}`"
          :style="line.type === 'added' ? { animationDelay: (i * 40) + 'ms' } : {}"
        >
          <span v-if="line.type === 'removed'" class="line-removed">{{ line.text }}</span>
          <span v-else-if="line.type === 'added'" class="line-added">{{ line.text }}</span>
          <span v-else class="line-unchanged">{{ line.text }}</span>
        </div>
      </template>
      <template v-else>
        <div v-for="line in filteredManualText" :key="line" class="manual-line line-unchanged">
          <span>{{ line }}</span>
        </div>
      </template>
    </div>

    <!-- 操作キー -->
    <div class="manual-controls">
      <div class="controls-title">操作</div>
      <div class="controls-grid">
        <!-- auto_run が有効な場合は左右キーを非表示 -->
        <template v-if="!features?.has('auto_run')">
          <span class="key-badge">{{ keyLabel(manual.controls.moveLeft) }}</span>
          <span class="key-action">左移動</span>
          <span class="key-badge">{{ keyLabel(manual.controls.moveRight) }}</span>
          <span class="key-action">右移動</span>
        </template>
        <span class="key-badge">{{ keyLabel(manual.controls.jump) }}</span>
        <span class="key-action">ジャンプ</span>
        <template v-if="manual.controls.shoot">
          <span class="key-badge">{{ keyLabel(manual.controls.shoot) }}</span>
          <span class="key-action">ショット</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ──────────────────────────────────────
   ベーススタイル
────────────────────────────────────── */
.manual-panel {
  position: absolute;
  bottom: 58px; right: 16px;
  width: 340px;
  background: #0d120d;
  border: 2px solid #33aa55;
  border-radius: 2px;
  padding: 16px 18px;
  font-family: 'M PLUS 1 Code', cursive;
  font-size: 13px;
  line-height: 1.8;
  color: #b8ffb8;
  box-shadow: 0 0 20px rgba(0,255,65,0.15), 0 2px 8px rgba(0,0,0,0.5);
  z-index: 20;
  transition: font-family 0.6s, background 0.6s, border-color 0.6s, box-shadow 0.6s;
  user-select: none;
  max-height: 380px;
  overflow-y: auto;
}

/* ── 中央表示（説明書更新時） ── */
.panel-centered {
  position: fixed !important;
  bottom: 50% !important;
  right: 50% !important;
  transform-origin: center center;
  transform: translate(50%, 50%) !important;
  width: 520px !important;
  max-height: 60vh !important;
  z-index: 50 !important;
  padding: 24px 28px !important;
  font-size: 14px !important;
  box-shadow:
    0 0 60px rgba(0,255,65,0.35),
    0 8px 32px rgba(0,0,0,0.7),
    inset 0 1px 0 rgba(0,255,65,0.15) !important;
  /*animation: panelCenterIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;*/
}

@keyframes panelCenterIn {
  0%   { opacity: 0; transform: translate(50%, 50%) scale(0.85); }
  100% { opacity: 1; transform: translate(50%, 50%) scale(1); }
}

@keyframes overlayFadeIn {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

/* 中央表示解除時のトランジション */
.manual-panel:not(.panel-centered) {
  transition:
    position 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    bottom 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    right 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    z-index 0.5s,
    padding 0.5s,
    font-size 0.5s,
    box-shadow 0.5s,
    font-family 0.6s,
    background 0.6s,
    border-color 0.6s;
}

.manual-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0,255,65,0.2);
  padding-bottom: 5px;
  margin-bottom: 7px;
}
.manual-ver-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', monospace;
}
.manual-ver-dot {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #00ff41;
  box-shadow: 0 0 6px #00ff41;
}
.history-btn {
  font-size: 9px;
  background: transparent;
  border: 1px solid #33aa55;
  cursor: pointer;
  padding: 1px 6px;
  border-radius: 2px;
  color: #33aa55;
  font-family: 'M PLUS 1 Code', monospace;
  transition: all 0.15s;
}
.history-btn:hover { background: #001a00; border-color: #00ff41; color: #00ff41; }

/* ── 履歴 ── */
.manual-history {
  border-bottom: 1px dashed rgba(0,255,65,0.2);
  margin-bottom: 7px;
  padding-bottom: 7px;
  max-height: 110px;
  overflow-y: auto;
  font-size: 10px;
  color: rgba(184,255,184,0.45);
}
.history-empty { font-style: italic; color: rgba(184,255,184,0.25); }
.history-item { margin-bottom: 5px; }
.history-ver { font-weight: bold; font-size: 9px; color: rgba(184,255,184,0.35); text-transform: uppercase; letter-spacing: 1px; font-family: 'M PLUS 1 Code', monospace; }
.history-line { padding-left: 4px; color: rgba(184,255,184,0.35); font-family: 'M PLUS 1 Code', cursive; }

/* ── イラスト ── */
.manual-image-wrap {
  margin: -2px -12px 8px;  /* パディングを相殺してフル幅に */
  border-bottom: 1px solid rgba(0,0,0,0.1);
  overflow: hidden;
  max-height: 100px;
}
.manual-image {
  width: 100%;
  height: 100px;
  object-fit: cover;
  display: block;
  transition: opacity 0.3s;
}
.manual-image[src=""] { display: none; }

/* ── 本文 ── */
.manual-body { margin-bottom: 8px; }
.manual-line { display: block; padding: 1px 0; }

.line-unchanged { color: #b8ffb8; font-weight: 500; font-family: 'M PLUS 1 Code', cursive; }
.line-removed {
  display: block;
  text-decoration: line-through;
  color: rgba(255,51,51,0.5);
  opacity: 0.7;
  background: transparent;
  padding: 0 2px;
}
.line-added {
  display: block;
  color: #00ff88;
  font-weight: 700;
  animation: inkIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  position: relative;
  padding-left: 12px;
  max-height: 100px;
  overflow: hidden;
  font-family: 'M PLUS 1 Code', cursive;
}
.line-added::before {
  content: '>';
  position: absolute;
  left: 0;
  font-size: 12px;
  top: 0px;
  color: #00ff88;
  font-family: 'M PLUS 1 Code', monospace;
}
@keyframes inkIn {
  0%   { opacity: 0; transform: translateX(-5px); max-height: 0; }
  100% { opacity: 1; transform: translateX(0); max-height: 100px; }
}

/* ── 操作キー ── */
.manual-controls {
  border-top: 1px solid rgba(0,255,65,0.2);
  padding-top: 6px;
}
.controls-title {
  font-size: 10px;
  color: #33aa55;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 5px;
  font-weight: 600;
  font-family: 'M PLUS 1 Code', monospace;
}
.controls-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: center;
}
.key-badge {
  background: #001a00;
  color: #00ff41;
  padding: 2px 6px;
  border-radius: 1px;
  font-size: 11px;
  min-width: 35px;
  text-align: center;
  letter-spacing: 0.5px;
  border: 1px solid #33aa55;
  font-weight: 600;
  font-family: 'M PLUS 1 Code', monospace;
}
.key-action { font-size: 12px; color: #b8ffb8; font-weight: 500; font-family: 'M PLUS 1 Code', cursive; }

/* ── 履歴トランジション ── */
.slide-enter-active, .slide-leave-active { transition: all 0.2s ease; max-height: 200px; }
.slide-enter-from, .slide-leave-to { opacity: 0; max-height: 0; }

/* ──────────────────────────────────────
   テーマ: STG
────────────────────────────────────── */
.theme-stg {
  background: #080818;
  color: #a8d8ff;
  border-color: #1a66ff;
  border-width: 2px;
  box-shadow: 4px 4px 0 #1a66ff, 0 0 20px rgba(26,102,255,0.3), inset 0 0 20px rgba(26,102,255,0.05);
  font-family: 'Courier New', monospace;
  letter-spacing: 0.5px;
  font-weight: 500;
}
.theme-stg .manual-header    { border-color: rgba(26,102,255,0.4); }
.theme-stg .manual-ver-badge  { color: #1a66ff; font-family: 'Courier New', monospace; }
.theme-stg .manual-ver-dot    { background: #1a66ff; box-shadow: 0 0 8px #1a66ff; }
.theme-stg .history-btn       { color: #5588cc; border-color: #1a66ff; background: rgba(26,102,255,0.1); }
.theme-stg .line-unchanged    { color: #a8d8ff; font-family: 'Courier New', monospace; }
.theme-stg .line-added        { color: #00ff88; }
.theme-stg .controls-title    { color: #446688; font-family: 'Courier New', monospace; }
.theme-stg .key-badge         { background: #1a66ff; border-color: #0033aa; font-family: 'Courier New', monospace; }
.theme-stg .key-action        { color: #6699cc; }
.theme-stg .manual-controls   { border-color: rgba(26,102,255,0.3); }
.theme-stg .manual-history    { border-color: rgba(26,102,255,0.2); }

/* ──────────────────────────────────────
   テーマ: RPG
────────────────────────────────────── */
.theme-rpg {
  background: linear-gradient(135deg, #f5edd0 0%, #faf6e6 100%);
  color: #3a2200;
  border-color: #8b6100;
  border-width: 3px;
  font-family: 'Georgia', 'Times New Roman', serif;
  box-shadow: 5px 5px 0 #8b6100, 2px 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.8);
  letter-spacing: 0.2px;
}
.theme-rpg .manual-header  { border-color: #d4b896; }
.theme-rpg .manual-ver-dot { background: #8b6100; box-shadow: 0 0 4px rgba(139,97,0,0.3); }
.theme-rpg .manual-ver-badge { font-family: 'Georgia', serif; }
.theme-rpg .line-unchanged { color: #4a3a00; font-family: 'Georgia', serif; }
.theme-rpg .line-added     { color: #a84000; }
.theme-rpg .key-badge      { background: #8b6100; border-color: #5a3e00; font-family: 'Georgia', serif; color: #fff; }
.theme-rpg .controls-title { color: #c4a020; font-family: 'Georgia', serif; }
.theme-rpg .key-action     { color: #8b6100; font-family: 'Georgia', serif; }
.theme-rpg .manual-controls { border-color: #d4b896; }

/* ──────────────────────────────────────
   テーマ: PUZZLE
────────────────────────────────────── */
.theme-puzzle {
  background: #f8f8fa;
  color: #222;
  border-color: #444;
  border-radius: 0;
  border-width: 1px;
  box-shadow: 2px 2px 0 #444;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.5px;
}
.theme-puzzle .manual-ver-badge { letter-spacing: 2px; }
.theme-puzzle .key-badge        { border-radius: 0; }

/* ──────────────────────────────────────
   テーマ: RHYTHM
────────────────────────────────────── */
.theme-rhythm {
  background: #0f0020;
  color: #ee88ff;
  border-color: #9900ff;
  border-width: 2px;
  box-shadow: 4px 4px 0 #9900ff, 0 0 24px rgba(153,0,255,0.5), inset 0 0 16px rgba(153,0,255,0.1);
  font-family: 'Courier New', monospace;
  letter-spacing: 0.3px;
  font-weight: 500;
}
.theme-rhythm .manual-header  { border-color: rgba(153,0,255,0.4); }
.theme-rhythm .manual-ver-dot { background: #ff00ff; box-shadow: 0 0 12px #ff00ff; animation: rhythm-pulse 1s infinite; }
.theme-rhythm .line-unchanged { color: #dd88ff; font-family: 'Courier New', monospace; }
.theme-rhythm .line-added     { color: #00ffff; text-decoration: underline wavy #00ff88; }
.theme-rhythm .key-badge      { background: #9900ff; border-color: #6600cc; font-family: 'Courier New', monospace; }
.theme-rhythm .key-action     { color: #cc66ff; }
.theme-rhythm .controls-title { color: #bb44ff; font-family: 'Courier New', monospace; }
.theme-rhythm .manual-controls { border-color: rgba(153,0,255,0.3); }

@keyframes rhythm-pulse {
  0%, 100% { box-shadow: 0 0 8px #ff00ff; }
  50% { box-shadow: 0 0 12px #ff00ff; }
}
</style>
