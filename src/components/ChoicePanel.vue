<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps<{
  choices: readonly { id: string; label: string }[]
  version: string
  lockedGenre?: string
}>()

const emit = defineEmits<{
  (e: 'choose', choiceId: string): void
}>()

const selected = ref<string | null>(null)
const revealed = ref(false)
const hoverIndex = ref<number | null>(null)

const SELECT_DELAY_MS = 150
const STAGGER_DELAY_MS = 60

let choiceTimer: ReturnType<typeof setTimeout> | null = null

function pick(choiceId: string) {
  if (selected.value) return
  selected.value = choiceId
  choiceTimer = setTimeout(() => emit('choose', choiceId), SELECT_DELAY_MS)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === '1' && props.choices[0]) pick(props.choices[0].id)
  if (e.key === '2' && props.choices[1]) pick(props.choices[1].id)
}

onMounted(() => {
  revealed.value = true
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (choiceTimer !== null) clearTimeout(choiceTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="choice-overlay">
    <div class="scanline-overlay" />

    <div class="choice-card" :class="[{ revealed }, lockedGenre ? `genre-${lockedGenre.replace(/_/g, '-')}` : '']">
      <!-- ヘッダー -->
      <div class="choice-header">
        <div class="choice-stamp">UPDATE</div>
        <div class="choice-ver">ver.{{ version }} → ?</div>
        <div class="choice-prompt">
          説明書の内容を選んでください
        </div>
      </div>

      <!-- 選択肢 -->
      <div class="choice-options">
        <button
          v-for="(c, idx) in choices"
          :key="c.id"
          class="choice-btn"
          :data-choice-id="c.id"
          :class="{
            selected:    selected === c.id,
            faded:       selected !== null && selected !== c.id,
            staggered:   revealed,
            hovered:     hoverIndex === idx,
          }"
          :style="{ '--delay': idx * STAGGER_DELAY_MS + 'ms' }"
          @click="pick(c.id)"
          @mouseenter="hoverIndex = idx"
          @mouseleave="hoverIndex = null"
        >
          <span class="choice-index">{{ idx === 0 ? '1' : '2' }}</span>
          <span class="choice-label">{{ c.label }}</span>
          <span class="choice-arrow">→</span>
        </button>
      </div>

      <!-- フッター注記 -->
      <div class="choice-footnote">
        選んだ内容によってゲームが変わります
        <span class="key-hint">[ 1 / 2 キーでも選択 ]</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.choice-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  backdrop-filter: blur(3px);
  perspective: 800px;
}

.scanline-overlay {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0, 0, 0, 0.15) 2px,
    rgba(0, 0, 0, 0.15) 3px
  );
  pointer-events: none;
}

/* カード — 初期は横に倒れた状態（裏面）からフリップ */
.choice-card {
  background: var(--genre-bg, var(--bg-panel));
  border: 2px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-md);
  padding: 28px 32px 22px;
  max-width: 440px;
  width: 92%;
  box-shadow:
    0 0 20px var(--genre-glow, var(--green-glow)),
    0 0 50px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  font-family: var(--genre-font, var(--font-main));
  color: var(--genre-text, var(--text));
  animation: cardFlipIn 0.15s cubic-bezier(0.22, 1, 0.36, 1) both;
  transition: border-color 0.4s ease, background 0.4s ease, box-shadow 0.4s ease;
}

@keyframes cardFlipIn {
  0%   { opacity: 0.4; transform: rotateY(70deg) scale(0.97); }
  100% { opacity: 1;   transform: rotateY(0deg)  scale(1); }
}

/* ─── ジャンル別文体テーマ（CSS 変数経由で制御） ─── */
.choice-card.genre-stg {
  --genre-font: 'Courier New', monospace;
}
.choice-card.genre-rpg {
  --genre-font: 'Georgia', serif;
  --genre-bg: #120e00;
}
.choice-card.genre-puzzle {
  --genre-font: 'Courier New', monospace;
  --genre-bg: #f5f5f0;
  --genre-text: #222;
}
.choice-card.genre-rhythm {
  --genre-bg: #0a0014;
}
.choice-card.genre-horror {
  --genre-bg: #0a0000;
}
.choice-card.genre-aquatic {
  --genre-bg: #00090d;
}
.choice-card.genre-runner {
  border-left-width: 6px;
  box-shadow: -4px 0 0 #ff3333, 0 2px 8px rgba(0, 0, 0, 0.15);
  --genre-bg: #ffffff;
  --genre-font: Impact, 'Arial Black', sans-serif;
  --genre-text: #111;
}
.choice-card.genre-stealth-action {
  border-style: dashed;
  box-shadow: none;
  --genre-bg: #050505;
  --genre-font: 'Courier New', monospace;
}
.choice-card.genre-racing {
  border-top-width: 5px;
  box-shadow: 0 -3px 0 #ff6600, 0 0 20px rgba(255, 100, 0, 0.18), 0 0 50px rgba(0, 0, 0, 0.5);
  --genre-font: Impact, 'Arial Black', sans-serif;
  --genre-bg: #0f0a00;
}
.choice-card.genre-platformer {
  border-width: 3px;
  border-radius: var(--radius-lg);
  box-shadow: 4px 4px 0 #ffcc00, 0 0 20px rgba(0, 80, 180, 0.2), 0 0 50px rgba(0, 0, 0, 0.5);
  --genre-bg: #001a4a;
}
.choice-card.genre-dungeon {
  box-shadow: 3px 3px 0 #3a2000, 0 0 20px rgba(180, 80, 0, 0.15), 0 0 50px rgba(0, 0, 0, 0.5);
  --genre-font: 'Georgia', serif;
  --genre-bg: #0c0800;
}
.choice-card.genre-survival {
  box-shadow: 3px 3px 0 #1a3a1a, 0 0 16px rgba(60, 100, 40, 0.1), 0 0 50px rgba(0, 0, 0, 0.5);
  --genre-bg: #050a05;
}
.choice-card.genre-hack-slash {
  box-shadow: 5px 5px 0 #440000, 0 0 20px rgba(200, 0, 0, 0.25), 0 0 50px rgba(0, 0, 0, 0.5);
  --genre-bg: #0a0000;
}
.choice-card.genre-arena {
  border-width: 3px;
  box-shadow: 5px 5px 0 #440000, 0 0 28px rgba(200, 0, 0, 0.35), 0 0 50px rgba(0, 0, 0, 0.7);
  --genre-bg: #0f0000;
}
.choice-card.genre-aerial-stg {
  --genre-font: 'Courier New', monospace;
  --genre-bg: #000820;
}
.choice-card.genre-bullet-hell {
  --genre-font: 'Courier New', monospace;
  --genre-bg: #000010;
}
.choice-card.genre-bullet-runner {
  --genre-font: 'Courier New', monospace;
  --genre-bg: #0a0018;
}
.choice-card.genre-idle {
  box-shadow: 2px 2px 0 #aaa;
  --genre-font: 'Courier New', monospace;
  --genre-bg: #fafaf8;
  --genre-text: #444;
}
.choice-card.genre-tower-def {
  box-shadow: 2px 2px 0 #558855;
  --genre-font: 'Courier New', monospace;
  --genre-bg: #0a0f0a;
  --genre-text: #88aa88;
}
.choice-card.genre-sports {
  --genre-bg: #0a001a;
}

/* ─── ヘッダー ─── */
.choice-header {
  text-align: center;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--genre-border, var(--green-dim));
  padding-bottom: 14px;
  opacity: 0.9;
}

.choice-stamp {
  display: inline-block;
  color: var(--genre-accent, var(--green));
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 4px 12px;
  margin-bottom: 8px;
  transform: rotate(-1.8deg);
  border: 1px solid var(--genre-accent, var(--green));
  border-radius: var(--radius-sm);
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease, border-color 0.4s ease;
}

.choice-ver {
  font-size: 10px;
  color: var(--genre-accent, var(--green-dim));
  letter-spacing: 1.5px;
  margin-bottom: 8px;
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}

.choice-prompt {
  font-size: 14px;
  color: var(--genre-text, var(--text));
  font-weight: 600;
  letter-spacing: 0.4px;
  transition: color 0.4s ease;
}

/* 選択肢リスト */
.choice-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.choice-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--genre-bg, var(--green-dark));
  border: 1px solid var(--genre-border, var(--green-dim));
  padding: 14px 18px;
  text-align: left;
  cursor: pointer;
  font-family: var(--genre-font, var(--font-main));
  color: var(--genre-text, var(--text));
  border-radius: var(--radius-sm);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast),
    color var(--transition-fast);
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  opacity: 0;
  transform: translateY(8px);
}

.choice-btn.staggered {
  animation: optionReveal 0.2s cubic-bezier(0.22, 1, 0.36, 1) var(--delay, 0ms) both;
}

@keyframes optionReveal {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ホバーエフェクト */
.choice-btn.hovered {
  transform: translateY(0) translateX(4px);
  box-shadow:
    0 4px 12px var(--genre-glow, var(--green-glow)),
    -2px 0 0 var(--genre-accent, var(--green)) inset;
}

/* キーボードフォーカス */
.choice-btn:focus-visible {
  outline: 2px solid var(--genre-accent, var(--green));
  outline-offset: 2px;
}

/* 確定エフェクト */
.choice-btn.selected {
  animation: selectedFlash 0.3s ease both;
}
.choice-btn.selected .choice-label,
.choice-btn.selected .choice-index,
.choice-btn.selected .choice-arrow {
  color: var(--genre-accent, var(--green));
}

@keyframes selectedFlash {
  0%   { background: var(--genre-bg, var(--green-dark)); }
  40%  { background: var(--genre-glow, var(--green-glow)); }
  100% { background: var(--genre-bg, var(--green-dark)); }
}

.choice-btn.faded {
  opacity: 0.22;
  pointer-events: none;
}

.choice-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--genre-accent, var(--green-dim));
  font-size: 11px;
  font-weight: 700;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  border: 1px solid var(--genre-accent, var(--green-dim));
  font-family: var(--genre-font, var(--font-mono));
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
}

.choice-btn:hover .choice-index {
  background: var(--genre-glow, rgba(0, 255, 65, 0.1));
  color: var(--genre-accent, var(--green));
}

.choice-btn.selected .choice-index {
  background: var(--genre-glow, rgba(0, 255, 65, 0.2));
  color: var(--genre-accent, var(--green));
}

.choice-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--genre-text, var(--text));
  line-height: 1.45;
  transition: color var(--transition-fast);
}

.choice-arrow {
  font-size: 14px;
  color: var(--genre-accent, var(--green-dim));
  transition:
    color var(--transition-fast),
    transform var(--transition-fast);
  margin-left: 4px;
  font-family: var(--genre-font, var(--font-mono));
}

.choice-btn:hover .choice-arrow {
  transform: translateX(3px);
}

/* フッター */
.choice-footnote {
  font-size: 10px;
  color: var(--genre-text, var(--text-muted));
  text-align: center;
  letter-spacing: 0.5px;
  border-top: 1px solid var(--genre-border, var(--green-dim));
  padding-top: 12px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  opacity: 0.7;
  font-family: var(--genre-font, var(--font-mono));
  transition: border-color 0.4s ease, color 0.4s ease;
}

.key-hint {
  color: var(--genre-text, var(--text-muted));
  font-size: 9px;
  letter-spacing: 0.5px;
  opacity: 0.7;
}
</style>
