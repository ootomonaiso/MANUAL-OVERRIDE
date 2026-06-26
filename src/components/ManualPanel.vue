<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ManualVersion, ManualTheme, Controls } from '../domain/types'

const props = defineProps<{
  manual: ManualVersion
  theme: ManualTheme
  diffLines: Array<{ text: string; type: 'added' | 'removed' | 'unchanged' }>
  isAnimating: boolean
  isCentered: boolean
  history: ManualVersion[]
  features?: Set<string> | ReadonlySet<string>
  controls: Controls
  highlight?: boolean
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
  <div class="manual-panel" :class="[themeClass, { 'panel-centered': isCentered, 'manual-highlight': highlight }]">
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
          <del v-if="line.startsWith('~~') && line.endsWith('~~')" class="line-conflicted">
            {{ line.slice(2, -2) }}
          </del>
          <span v-else>{{ line }}</span>
        </div>
      </template>
    </div>

    <!-- 操作キー -->
    <div class="manual-controls">
      <div class="controls-title">操作</div>
      <div class="controls-grid">
        <!-- auto_run が有効な場合は左右キーを非表示 -->
        <template v-if="!features?.has('auto_run')">
          <span class="key-badge">{{ keyLabel(controls.moveLeft) }}</span>
          <span class="key-action">左移動</span>
          <span class="key-badge">{{ keyLabel(controls.moveRight) }}</span>
          <span class="key-action">右移動</span>
        </template>
        <span class="key-badge">{{ keyLabel(controls.jump) }}</span>
        <span class="key-action">ジャンプ</span>
        <template v-if="controls.shoot">
          <span class="key-badge">{{ keyLabel(controls.shoot) }}</span>
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
  animation: panelCenterIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@keyframes panelCenterIn {
  0%   { opacity: 0; transform: translate(50%, 50%) scale(0.85); }
  100% { opacity: 1; transform: translate(50%, 50%) scale(1); }
}

/* 中央表示解除時のトランジション（position/z-index はアニメーション不可のため除外） */
.manual-panel:not(.panel-centered) {
  transition:
    box-shadow 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    padding 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    font-size 0.5s cubic-bezier(0.22, 1, 0.36, 1),
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

/* B5: 矛盾カードによる取り消し線テキスト */
.line-conflicted {
  color: rgba(255, 100, 100, 0.55);
  text-decoration-color: rgba(255, 51, 51, 0.7);
  text-decoration-thickness: 2px;
  font-style: italic;
  opacity: 0.7;
}
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
   チュートリアル中ハイライト
────────────────────────────────────── */
.manual-highlight {
  animation: manualPulse 1.8s ease-in-out infinite;
}
@keyframes manualPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(0,255,65,0.15), 0 2px 8px rgba(0,0,0,0.5); }
  50%       { box-shadow: 0 0 32px rgba(0,255,65,0.6), 0 2px 12px rgba(0,0,0,0.5), 0 0 0 2px rgba(0,255,65,0.4); }
}

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

/* ──────────────────────────────────────
   テーマ: HORROR
────────────────────────────────────── */
.theme-horror {
  background: #0a0000;
  color: #cc8888;
  border-color: #880000;
  border-width: 2px;
  box-shadow: 4px 4px 0 #440000, 0 0 24px rgba(136,0,0,0.4), inset 0 0 20px rgba(100,0,0,0.1);
  font-family: 'Courier New', monospace;
  letter-spacing: 0.3px;
}
.theme-horror .manual-header  { border-color: rgba(136,0,0,0.4); }
.theme-horror .manual-ver-dot { background: #cc4444; box-shadow: 0 0 8px #cc4444; animation: horror-flicker 3.5s steps(1) infinite; }
.theme-horror .manual-ver-badge { color: #cc4444; font-family: 'Courier New', monospace; }
.theme-horror .history-btn    { color: #882222; border-color: #660000; background: rgba(136,0,0,0.08); }
.theme-horror .history-btn:hover { background: #110000; border-color: #cc4444; color: #cc4444; }
.theme-horror .line-unchanged { color: #cc8888; font-family: 'Courier New', monospace; }
.theme-horror .line-added     { color: #ff5555; }
.theme-horror .controls-title { color: #882222; }
.theme-horror .key-badge      { background: #200000; border-color: #880000; color: #cc4444; }
.theme-horror .key-action     { color: #aa6666; }
.theme-horror .manual-controls { border-color: rgba(136,0,0,0.3); }
.theme-horror .manual-history { border-color: rgba(136,0,0,0.2); color: rgba(180,100,100,0.35); }
.theme-horror .history-ver    { color: rgba(180,80,80,0.3); }
.theme-horror .history-line   { color: rgba(180,80,80,0.3); }

@keyframes horror-flicker {
  0%, 88%, 100% { opacity: 1; }
  89%, 91% { opacity: 0.25; }
  90%, 92% { opacity: 0.85; }
}

/* ──────────────────────────────────────
   テーマ: AQUATIC
────────────────────────────────────── */
.theme-aquatic {
  background: #001a2a;
  color: #88ccff;
  border-color: #0088bb;
  border-width: 2px;
  box-shadow: 0 0 24px rgba(0,136,187,0.2), 0 2px 8px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,80,140,0.08);
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 0.2px;
}
.theme-aquatic .manual-header  { border-color: rgba(0,136,187,0.4); }
.theme-aquatic .manual-ver-dot { background: #00aadd; box-shadow: 0 0 8px #00aadd; animation: aquatic-wave 2.5s ease-in-out infinite; }
.theme-aquatic .manual-ver-badge { color: #00aadd; font-family: 'M PLUS 1 Code', monospace; }
.theme-aquatic .history-btn    { color: #0088bb; border-color: #007799; background: rgba(0,136,187,0.05); }
.theme-aquatic .history-btn:hover { background: #001520; border-color: #44aadd; color: #44aadd; }
.theme-aquatic .line-unchanged { color: #88ccff; }
.theme-aquatic .line-added     { color: #00ddff; }
.theme-aquatic .controls-title { color: #0099cc; }
.theme-aquatic .key-badge      { background: #001520; border-color: #0088bb; color: #44aadd; }
.theme-aquatic .key-action     { color: #6699bb; }
.theme-aquatic .manual-controls { border-color: rgba(0,136,187,0.3); }
.theme-aquatic .manual-history { border-color: rgba(0,136,187,0.2); color: rgba(100,180,220,0.35); }

@keyframes aquatic-wave {
  0%, 100% { transform: scale(1);   box-shadow: 0 0 6px #00aadd; }
  50%       { transform: scale(1.4); box-shadow: 0 0 10px #00ddff; }
}

/* ──────────────────────────────────────
   テーマ: RUNNER
────────────────────────────────────── */
.theme-runner {
  background: #ffffff;
  color: #111111;
  border-color: #ff3333;
  border-width: 2px;
  border-left-width: 6px;
  box-shadow: -3px 0 0 #ff3333, 0 2px 8px rgba(0,0,0,0.15);
  font-family: Impact, 'Arial Black', sans-serif;
  letter-spacing: 1px;
}
.theme-runner .manual-header  { border-color: rgba(255,50,50,0.35); }
.theme-runner .manual-ver-dot { background: #ff3333; box-shadow: 0 0 8px rgba(255,50,50,0.5); animation: runner-blink 0.6s steps(2) infinite; }
.theme-runner .manual-ver-badge { color: #ff3333; font-family: Impact, sans-serif; }
.theme-runner .history-btn    { color: #cc2222; border-color: #ff3333; background: transparent; }
.theme-runner .history-btn:hover { background: rgba(255,50,50,0.05); }
.theme-runner .line-unchanged { color: #222222; font-family: Impact, sans-serif; font-weight: 400; }
.theme-runner .line-added     { color: #ff3333; }
.theme-runner .controls-title { color: #ff3333; font-family: Impact, sans-serif; letter-spacing: 3px; }
.theme-runner .key-badge      { background: #ff3333; border-color: #cc2222; color: #fff; font-weight: 700; font-family: 'Courier New', monospace; }
.theme-runner .key-action     { color: #555555; }
.theme-runner .manual-controls { border-color: rgba(255,50,50,0.3); }
.theme-runner .manual-history { border-color: rgba(0,0,0,0.12); color: rgba(50,50,50,0.4); }
.theme-runner .history-ver    { color: rgba(50,50,50,0.3); }
.theme-runner .history-line   { color: rgba(50,50,50,0.3); }
.theme-runner .history-empty  { color: rgba(50,50,50,0.25); }

@keyframes runner-blink {
  0%  { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ──────────────────────────────────────
   テーマ: STEALTH
────────────────────────────────────── */
.theme-stealth {
  background: #050505;
  color: rgba(160, 160, 160, 0.52);
  border-color: rgba(60, 60, 60, 0.38);
  border-width: 1px;
  border-style: dashed;
  box-shadow: none;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
  font-size: 11.5px;
}
.theme-stealth .manual-header  { border-color: rgba(60,60,60,0.28); }
.theme-stealth .manual-ver-dot { background: rgba(80,80,80,0.45); box-shadow: none; }
.theme-stealth .manual-ver-badge { color: rgba(100,100,100,0.55); }
.theme-stealth .history-btn    { color: rgba(80,80,80,0.45); border-color: rgba(60,60,60,0.28); background: transparent; }
.theme-stealth .line-unchanged { color: rgba(155,155,155,0.5); }
.theme-stealth .line-added     { color: rgba(200,200,200,0.65); }
.theme-stealth .controls-title { color: rgba(80,80,80,0.45); letter-spacing: 3px; }
.theme-stealth .key-badge      { background: rgba(20,20,20,0.7); border-color: rgba(60,60,60,0.35); color: rgba(120,120,120,0.55); }
.theme-stealth .key-action     { color: rgba(120,120,120,0.45); }
.theme-stealth .manual-controls { border-color: rgba(60,60,60,0.2); }
.theme-stealth .manual-history { border-color: rgba(60,60,60,0.15); color: rgba(100,100,100,0.3); }

/* ──────────────────────────────────────
   テーマ: RACING
────────────────────────────────────── */
.theme-racing {
  background: #0f0a00;
  color: #ffaa44;
  border-color: #ff6600;
  border-width: 2px;
  border-top-width: 5px;
  box-shadow: 0 -3px 0 #ff6600, 0 0 20px rgba(255,100,0,0.18), 0 2px 12px rgba(0,0,0,0.7);
  font-family: Impact, 'Arial Black', sans-serif;
  letter-spacing: 1.5px;
}
.theme-racing .manual-header  { border-color: rgba(255,100,0,0.45); }
.theme-racing .manual-ver-dot { background: #ff6600; box-shadow: 0 0 10px #ff6600; }
.theme-racing .manual-ver-badge { color: #ff6600; font-family: Impact, sans-serif; letter-spacing: 2px; }
.theme-racing .history-btn    { color: #cc4400; border-color: #ff6600; background: rgba(255,100,0,0.07); }
.theme-racing .history-btn:hover { background: rgba(255,100,0,0.15); border-color: #ff8800; color: #ff8800; }
.theme-racing .line-unchanged { color: #ffcc88; font-family: Impact, sans-serif; font-weight: 400; }
.theme-racing .line-added     { color: #ffff00; }
.theme-racing .controls-title { color: #ff6600; font-family: Impact, sans-serif; letter-spacing: 4px; }
.theme-racing .key-badge      { background: #1a0a00; border-color: #ff6600; color: #ff8800; font-family: 'Courier New', monospace; font-weight: 700; }
.theme-racing .key-action     { color: #cc8844; }
.theme-racing .manual-controls { border-color: rgba(255,100,0,0.3); }
.theme-racing .manual-history { border-color: rgba(255,100,0,0.2); color: rgba(200,120,50,0.4); }

/* ──────────────────────────────────────
   テーマ: PLATFORMER
────────────────────────────────────── */
.theme-platformer {
  background: #001a4a;
  color: #88ddff;
  border-color: #ffcc00;
  border-width: 3px;
  border-radius: 8px;
  box-shadow: 4px 4px 0 #ffcc00, 0 0 16px rgba(0,100,200,0.2);
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 0.5px;
}
.theme-platformer .manual-header  { border-color: rgba(255,200,0,0.4); }
.theme-platformer .manual-ver-dot { background: #ffcc00; box-shadow: 0 0 8px #ffcc00; animation: platform-bounce 1.2s ease-in-out infinite; }
.theme-platformer .manual-ver-badge { color: #ffcc00; }
.theme-platformer .history-btn    { color: #ddaa00; border-color: #cc9900; background: rgba(255,200,0,0.08); }
.theme-platformer .history-btn:hover { background: rgba(255,200,0,0.15); border-color: #ffcc00; color: #ffcc00; }
.theme-platformer .line-unchanged { color: #88ddff; }
.theme-platformer .line-added     { color: #ffcc00; }
.theme-platformer .controls-title { color: #ffcc00; letter-spacing: 2px; }
.theme-platformer .key-badge      { background: #ffcc00; border-color: #cc9900; color: #002244; font-weight: 700; }
.theme-platformer .key-action     { color: #66aacc; }
.theme-platformer .manual-controls { border-color: rgba(255,200,0,0.3); }
.theme-platformer .manual-history { border-color: rgba(255,200,0,0.2); color: rgba(100,180,220,0.4); }

@keyframes platform-bounce {
  0%, 100% { transform: translateY(0); }
  45%       { transform: translateY(-2px); }
}

/* ──────────────────────────────────────
   テーマ: DUNGEON
────────────────────────────────────── */
.theme-dungeon {
  background: #0c0800;
  color: #c8a060;
  border-color: #6a3800;
  border-width: 2px;
  box-shadow: 3px 3px 0 #3a2000, 0 0 20px rgba(180,80,0,0.18), inset 0 0 20px rgba(80,40,0,0.12);
  font-family: 'Georgia', 'Times New Roman', serif;
  letter-spacing: 0.3px;
}
.theme-dungeon .manual-header  { border-color: rgba(106,56,0,0.5); }
.theme-dungeon .manual-ver-dot { background: #c87020; box-shadow: 0 0 10px rgba(200,112,32,0.6); animation: torch-flicker 2.2s ease-in-out infinite; }
.theme-dungeon .manual-ver-badge { color: #c87020; font-family: 'Georgia', serif; }
.theme-dungeon .history-btn    { color: #8a5010; border-color: #6a3800; background: transparent; }
.theme-dungeon .history-btn:hover { background: #150a00; border-color: #c87020; color: #c87020; }
.theme-dungeon .line-unchanged { color: #c8a060; font-family: 'Georgia', serif; }
.theme-dungeon .line-added     { color: #f0c080; }
.theme-dungeon .controls-title { color: #a06030; font-family: 'Georgia', serif; }
.theme-dungeon .key-badge      { background: #1a0c00; border-color: #6a3800; color: #c87020; font-family: 'Courier New', monospace; }
.theme-dungeon .key-action     { color: #a08050; font-family: 'Georgia', serif; }
.theme-dungeon .manual-controls { border-color: rgba(106,56,0,0.3); }
.theme-dungeon .manual-history { border-color: rgba(106,56,0,0.2); color: rgba(180,130,70,0.35); }

@keyframes torch-flicker {
  0%, 100% { box-shadow: 0 0 10px rgba(200,112,32,0.6); }
  30%       { box-shadow: 0 0 14px rgba(220,130,40,0.8); }
  70%       { box-shadow: 0 0 7px rgba(170,90,20,0.45); }
}

/* ──────────────────────────────────────
   テーマ: HACK & SLASH
────────────────────────────────────── */
.theme-hack_slash {
  background: #0a0000;
  color: #ff8888;
  border-color: #880000;
  border-width: 2px;
  box-shadow: 5px 5px 0 #440000, 0 0 20px rgba(200,0,0,0.28), inset 0 0 20px rgba(100,0,0,0.08);
  font-family: 'Courier New', monospace;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.theme-hack_slash .manual-header  { border-color: rgba(136,0,0,0.5); }
.theme-hack_slash .manual-ver-dot { background: #ff4444; box-shadow: 0 0 10px #ff4444; animation: slash-pulse 0.9s ease-in-out infinite; }
.theme-hack_slash .manual-ver-badge { color: #ff4444; }
.theme-hack_slash .history-btn    { color: #aa2222; border-color: #880000; background: rgba(136,0,0,0.08); }
.theme-hack_slash .history-btn:hover { background: #120000; border-color: #cc3333; color: #cc3333; }
.theme-hack_slash .line-unchanged { color: #ff9999; font-family: 'Courier New', monospace; }
.theme-hack_slash .line-added     { color: #ff4444; }
.theme-hack_slash .controls-title { color: #cc2222; }
.theme-hack_slash .key-badge      { background: #200000; border-color: #880000; color: #ff4444; }
.theme-hack_slash .key-action     { color: #dd7777; }
.theme-hack_slash .manual-controls { border-color: rgba(136,0,0,0.3); }
.theme-hack_slash .manual-history { border-color: rgba(136,0,0,0.2); color: rgba(180,80,80,0.35); }

@keyframes slash-pulse {
  0%, 100% { box-shadow: 0 0 6px #ff4444; }
  50%       { box-shadow: 0 0 14px #ff4444, 0 0 20px rgba(255,68,68,0.4); }
}

/* ──────────────────────────────────────
   テーマ: SURVIVAL
────────────────────────────────────── */
.theme-survival {
  background: #050a05;
  color: #88cc88;
  border-color: #2a4a2a;
  border-width: 2px;
  box-shadow: 3px 3px 0 #1a3a1a, 0 0 16px rgba(60,100,40,0.12), inset 0 0 20px rgba(20,50,20,0.08);
  font-family: 'Courier New', monospace;
  letter-spacing: 0.3px;
}
.theme-survival .manual-header  { border-color: rgba(42,74,42,0.5); }
.theme-survival .manual-ver-dot { background: #5a9a5a; box-shadow: 0 0 8px rgba(90,154,90,0.4); }
.theme-survival .manual-ver-badge { color: #5a9a5a; }
.theme-survival .history-btn    { color: #3a6a3a; border-color: #2a4a2a; background: transparent; }
.theme-survival .history-btn:hover { background: #0a180a; border-color: #5a9a5a; color: #5a9a5a; }
.theme-survival .line-unchanged { color: #88cc88; }
.theme-survival .line-added     { color: #aaddaa; }
.theme-survival .controls-title { color: #4a8a4a; }
.theme-survival .key-badge      { background: #0a150a; border-color: #2a4a2a; color: #5a9a5a; }
.theme-survival .key-action     { color: #6aaa6a; }
.theme-survival .manual-controls { border-color: rgba(42,74,42,0.3); }
.theme-survival .manual-history { border-color: rgba(42,74,42,0.2); color: rgba(100,160,100,0.35); }
</style>
