<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  survivedSec: number
  distance: number
}>()

// ── ヒントが「こなされた」かを追跡 ──────────────────
// ジャンプキー・色ルールの案内は常時表示の ControlsLegend に集約したため、
// ここでは「右下の説明書を読む」誘導だけを担当する（重複排除）。
const manualDone = ref(false)
const allDone    = ref(false)

watch(() => props.distance, v => {
  if (v > 300) manualDone.value = true  // 説明書ヒントを300pxまで表示
  if (v > 500) allDone.value = true     // 500px でオーバーレイ全消し
})
watch(() => props.survivedSec, v => {
  if (v > 8) allDone.value = true       // 8秒後に強制消去
})
</script>

<template>
  <Transition name="hints-fade">
    <div v-if="!allDone" class="tutorial-overlay">

      <!-- 説明書ヒント（右下の説明書を指す矢印） -->
      <Transition name="hint-pop">
        <div v-if="!manualDone" class="hint hint-manual">
          <div class="hint-manual-text">
            <span class="hint-manual-icon">📋</span>
            右下の説明書を読んでください
          </div>
          <div class="hint-manual-sub">選択でゲームが変わります</div>
          <div class="hint-manual-arrow">↘</div>
        </div>
      </Transition>

    </div>
  </Transition>
</template>

<style scoped>
.tutorial-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 12;
}

.hint {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

/* ── 説明書ヒント（右下寄り） ── */
.hint-manual {
  bottom: 270px;
  right: 240px;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.hint-manual-text {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0,255,65,0.12);
  border: 1px solid rgba(0,255,65,0.5);
  padding: 6px 12px;
  border-radius: 2px;
  font-size: 12px;
  color: rgba(184,255,184,0.8);
  font-family: 'M PLUS 1 Code', monospace;
  font-weight: 600;
  animation: manualHintPulse 2s ease-in-out infinite;
}
.hint-manual-sub {
  font-size: 10px;
  color: rgba(184,255,184,0.5);
  font-family: 'M PLUS 1 Code', monospace;
  text-align: center;
  margin-top: 3px;
}
@keyframes manualHintPulse {
  0%, 100% { border-color: rgba(0,255,65,0.4); }
  50%       { border-color: rgba(0,255,65,0.9); box-shadow: 0 0 8px rgba(0,255,65,0.3); }
}
.hint-manual-icon { font-size: 13px; }
.hint-manual-arrow {
  font-size: 22px;
  color: rgba(0,255,65,0.7);
  animation: arrowBounce 0.8s ease-in-out infinite;
}
@keyframes arrowBounce {
  0%, 100% { transform: translate(0,0); }
  50%       { transform: translate(4px, 4px); }
}

/* ── トランジション ── */
.hints-fade-leave-active { transition: opacity 0.8s ease; }
.hints-fade-leave-to     { opacity: 0; }

.hint-pop-enter-active { animation: hintIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
.hint-pop-leave-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.hint-pop-leave-to     { opacity: 0; transform: translateY(-8px); }
@keyframes hintIn {
  0%   { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
</style>
