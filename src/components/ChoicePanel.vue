<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

onMounted(() => {
  // カードが入ってきてから選択肢を表示するまでの遅延
  setTimeout(() => { revealed.value = true }, 120)
})

function pick(choiceId: string) {
  if (selected.value) return
  selected.value = choiceId
  setTimeout(() => emit('choose', choiceId), 480)
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
  background: rgba(0, 0, 0, 0.78);
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
    transparent 3px,
    rgba(0, 0, 0, 0.06) 3px,
    rgba(0, 0, 0, 0.06) 4px
  );
  pointer-events: none;
}

/* カード */
.choice-card {
  background: #faf7f3;
  border: 2px solid #d4c9bc;
  border-radius: 6px;
  padding: 28px 32px 22px;
  max-width: 420px;
  width: 92%;
  box-shadow:
    8px 8px 0 rgba(0,0,0,0.12),
    0 0 50px rgba(0,0,0,0.3),
    inset 0 1px 2px rgba(255,255,255,0.7);
  font-family: 'Noto Sans JP', 'Courier New', sans-serif;
  animation: cardEntrance 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;

  /* 和紙のような質感 */
  background-image:
    repeating-linear-gradient(
      45deg,
      transparent 0px, transparent 1px,
      rgba(180,150,100,0.02) 1px, rgba(180,150,100,0.02) 2px
    ),
    repeating-linear-gradient(
      to bottom,
      transparent 0px, transparent 18px,
      rgba(0,0,0,0.018) 18px, rgba(0,0,0,0.018) 19px
    );
}

@keyframes cardEntrance {
  0%   { opacity: 0; transform: translateY(-18px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* ヘッダー */
.choice-header {
  text-align: center;
  margin-bottom: 22px;
  border-bottom: 2px solid #d4c9bc;
  padding-bottom: 14px;
  position: relative;
}

.choice-stamp {
  display: inline-block;
  background: #c94f3b;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 4px 12px;
  margin-bottom: 8px;
  transform: rotate(-1.8deg);
  box-shadow: 2px 2px 0 rgba(0,0,0,0.15);
  border-radius: 2px;
}

.choice-ver {
  font-size: 10px;
  color: #998876;
  letter-spacing: 1.5px;
  margin-bottom: 8px;
  font-family: 'Noto Sans JP', sans-serif;
}

.choice-prompt {
  font-size: 14px;
  color: #3d2416;
  font-weight: 600;
  letter-spacing: 0.4px;
  font-family: 'Noto Sans JP', sans-serif;
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
  background: #fef7f1;
  border: 2px solid #c9a876;
  padding: 14px 18px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  border-radius: 8px;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.1s;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);

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
  background: linear-gradient(135deg, rgba(200,100,50,0.15) 0%, rgba(180,80,40,0.1) 100%);
  opacity: 0;
  transition: opacity 0.22s ease;
}

.choice-btn:hover {
  background: #fff5ed;
  border-color: #b89a7d;
  box-shadow: 0 4px 12px rgba(180,100,60,0.18);
}
.choice-btn:hover::after { opacity: 1; }

.choice-btn:active { transform: translateY(2px); }

.choice-btn.selected {
  background: #d4673b;
  border-color: #b84a1f;
  box-shadow: 0 6px 16px rgba(212,103,59,0.28);
  animation: selectedFlash 0.35s ease;
}
.choice-btn.selected .choice-label,
.choice-btn.selected .choice-index,
.choice-btn.selected .choice-arrow { color: #fff; }

@keyframes selectedFlash {
  0%   { background: #fef7f1; }
  40%  { background: #f5d5c8; }
  100% { background: #d4673b; }
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
  background: #c9a876;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 5px;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.12);
}

.choice-btn:hover .choice-index {
  background: #b89a7d;
}

.choice-btn.selected .choice-index {
  background: rgba(255,255,255,0.3);
}

.choice-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: #3d2416;
  line-height: 1.45;
  transition: color 0.2s;
}

.choice-arrow {
  font-size: 14px;
  color: #c9a876;
  transition: color 0.2s;
  margin-left: 4px;
}

/* フッター */
.choice-footnote {
  font-size: 10px;
  color: #a89a8a;
  text-align: center;
  letter-spacing: 0.5px;
  border-top: 1px solid #e8ddd0;
  padding-top: 12px;
  margin-top: 2px;
  font-family: 'Noto Sans JP', sans-serif;
}
</style>
