<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Choice } from '../domain/types'

const props = defineProps<{
  choices: Choice[]
  version: string
}>()

const emit = defineEmits<{
  (e: 'choose', choiceId: string): void
}>()

const selected = ref<string | null>(null)
const revealed = ref(false)

let choiceTimer: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  revealed.value = true
})

onUnmounted(() => {
  if (choiceTimer !== null) clearTimeout(choiceTimer)
})

function pick(choiceId: string) {
  if (selected.value) return
  selected.value = choiceId
  choiceTimer = setTimeout(() => emit('choose', choiceId), 150)
}
</script>

<template>
  <div class="choice-overlay">
    <!-- ノイズライン演出 -->
    <div class="scanline-overlay" />

    <div class="choice-card" :class="{ revealed }">
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
            selected: selected === c.id,
            faded:    selected !== null && selected !== c.id,
            staggered: revealed,
          }"
          :style="{ '--delay': idx * 80 + 'ms' }"
          @click="pick(c.id)"
        >
          <span class="choice-index">{{ String.fromCharCode(65 + idx) }}</span>
          <span class="choice-label">{{ c.label }}</span>
          <span class="choice-arrow">→</span>
        </button>
      </div>

      <!-- フッター注記 -->
      <div class="choice-footnote">選んだ内容によってゲームが変わります</div>
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
}

/* スキャンラインノイズ */
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

/* カード */
.choice-card {
  background: #0d120d;
  border: 2px solid #33aa55;
  border-radius: 2px;
  padding: 28px 32px 22px;
  max-width: 420px;
  width: 92%;
  box-shadow:
    0 0 20px rgba(0,255,65,0.15),
    0 0 50px rgba(0,0,0,0.5),
    inset 0 1px 2px rgba(0,255,65,0.05);
  font-family: 'M PLUS 1 Code', cursive;
  animation: cardEntrance 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes cardEntrance {
  0%   { opacity: 0; transform: translateY(-18px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* ヘッダー */
.choice-header {
  text-align: center;
  margin-bottom: 22px;
  border-bottom: 1px solid rgba(0,255,65,0.2);
  padding-bottom: 14px;
  position: relative;
}

.choice-stamp {
  display: inline-block;
  background: transparent;
  color: #00ff41;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 4px 12px;
  margin-bottom: 8px;
  transform: rotate(-1.8deg);
  box-shadow: 0 0 8px rgba(0,255,65,0.15);
  border: 1px solid #00ff41;
  border-radius: 1px;
  font-family: 'M PLUS 1 Code', monospace;
}

.choice-ver {
  font-size: 10px;
  color: #33aa55;
  letter-spacing: 1.5px;
  margin-bottom: 8px;
  font-family: 'M PLUS 1 Code', monospace;
}

.choice-prompt {
  font-size: 14px;
  color: #b8ffb8;
  font-weight: 600;
  letter-spacing: 0.4px;
  font-family: 'M PLUS 1 Code', cursive;
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
  background: #001a00;
  border: 1px solid #33aa55;
  padding: 14px 18px;
  text-align: left;
  cursor: pointer;
  font-family: 'M PLUS 1 Code', cursive;
  border-radius: 2px;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.1s;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);

  /* 初期は非表示 */
  opacity: 0;
  transform: translateY(8px);
}

.choice-btn.staggered {
  animation: optionReveal 0.35s cubic-bezier(0.22, 1, 0.36, 1) var(--delay, 0ms) both;
}

@keyframes optionReveal {
  0%   { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}

.choice-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(0,255,65,0.05) 0%, rgba(0,255,65,0.02) 100%);
  opacity: 0;
  transition: opacity 0.22s ease;
}

.choice-btn:hover {
  background: #002a00;
  border-color: #00ff41;
  box-shadow: 0 4px 12px rgba(0,255,65,0.15);
}
.choice-btn:hover::after { opacity: 1; }

.choice-btn:active { transform: translateY(2px); }

.choice-btn.selected {
  background: #003300;
  border-color: #00ff41;
  box-shadow: 0 6px 16px rgba(0,255,65,0.2);
  animation: selectedFlash 0.35s ease;
}
.choice-btn.selected .choice-label,
.choice-btn.selected .choice-index,
.choice-btn.selected .choice-arrow { color: #00ff41; }

@keyframes selectedFlash {
  0%   { background: #001a00; }
  40%  { background: #002a00; }
  100% { background: #003300; }
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
  background: transparent;
  color: #33aa55;
  font-size: 11px;
  font-weight: 700;
  border-radius: 1px;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
  box-shadow: 0 0 4px rgba(0,255,65,0.1);
  border: 1px solid #33aa55;
  font-family: 'M PLUS 1 Code', monospace;
}

.choice-btn:hover .choice-index {
  background: rgba(0,255,65,0.1);
  color: #00ff41;
}

.choice-btn.selected .choice-index {
  background: rgba(0,255,65,0.2);
  color: #00ff41;
}

.choice-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: #b8ffb8;
  line-height: 1.45;
  transition: color 0.2s;
  font-family: 'M PLUS 1 Code', cursive;
}

.choice-arrow {
  font-size: 14px;
  color: #33aa55;
  transition: color 0.2s;
  margin-left: 4px;
  font-family: 'M PLUS 1 Code', monospace;
}

/* フッター */
.choice-footnote {
  font-size: 10px;
  color: rgba(184,255,184,0.35);
  text-align: center;
  letter-spacing: 0.5px;
  border-top: 1px solid rgba(0,255,65,0.2);
  padding-top: 12px;
  margin-top: 2px;
  font-family: 'M PLUS 1 Code', cursive;
}
</style>
