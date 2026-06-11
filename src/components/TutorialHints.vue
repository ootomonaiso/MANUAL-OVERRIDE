<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  survivedSec: number
  jumps: number
  movesLeft: number
  movesRight: number
  distance: number
}>()

// ── 各ヒントが「こなされた」かを追跡 ──────────────────
const movedDone  = ref(false)
const jumpedDone = ref(false)
const manualDone = ref(false)
const allDone    = ref(false)

// 操作が行われたら対応ヒントを消す
watch(() => props.movesLeft + props.movesRight, v => { if (v > 0) movedDone.value = true })
watch(() => props.jumps, v => { if (v > 0) jumpedDone.value = true })
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

      <!-- 移動ヒント -->
      <Transition name="hint-pop">
        <div v-if="!movedDone" class="hint hint-move">
          <div class="hint-step">① 移動</div>
          <div class="hint-keys">
            <kbd class="hint-key">← ArrowLeft</kbd>
            <kbd class="hint-key">→ ArrowRight</kbd>
          </div>
          <div class="hint-pulse" />
        </div>
      </Transition>

      <!-- ジャンプヒント -->
      <Transition name="hint-pop">
        <div v-if="!jumpedDone" class="hint hint-jump">
          <div class="hint-step">② ジャンプ</div>
          <div class="hint-keys">
            <kbd class="hint-key hint-key-wide">SPACE キー</kbd>
          </div>
          <div class="hint-pulse" />
        </div>
      </Transition>

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

      <!-- 色ルール -->
      <div class="hint-colors">
        <span class="color-dot danger" />
        <span class="color-label">触れると失敗</span>
        <span class="color-sep">/</span>
        <span class="color-dot safe" />
        <span class="color-label">安全</span>
      </div>

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

/* ── 移動ヒント（左下） ── */
.hint {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.hint-move {
  bottom: 110px;
  left: 160px;
}

/* ── ジャンプヒント（プレイヤー上） ── */
.hint-jump {
  bottom: 200px;
  left: 120px;
}

.hint-keys { display: flex; gap: 4px; }

.hint-key {
  background: rgba(0,255,65,0.1);
  border: 1.5px solid rgba(0,255,65,0.3);
  border-bottom: 3px solid rgba(0,255,65,0.3);
  color: #00ff41;
  padding: 4px 8px;
  border-radius: 2px;
  font-size: 12px;
  font-family: 'M PLUS 1 Code', monospace;
  min-width: 28px;
  text-align: center;
}
.hint-key-wide { min-width: 64px; }

.hint-label {
  font-size: 11px;
  color: rgba(184,255,184,0.45);
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 1px;
}

.hint-step {
  font-size: 12px;
  font-weight: bold;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

/* キーが脈動 */
.hint-pulse {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #00ff41;
  animation: pulseDot 1.2s ease-in-out infinite;
}
@keyframes pulseDot {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50%       { opacity: 1.0; transform: scale(1.3); }
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

/* ── 色ルール（上中央） ── */
.hint-colors {
  position: absolute;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,255,65,0.08);
  border: 1px solid rgba(0,255,65,0.2);
  padding: 5px 14px;
  border-radius: 2px;
  font-size: 11px;
  font-family: 'M PLUS 1 Code', monospace;
}
.color-dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
}
.color-dot.danger { background: #ff3333; box-shadow: 0 0 6px #ff3333; }
.color-dot.safe   { background: #00ff41; box-shadow: 0 0 6px #00ff41; }
.color-label { color: rgba(184,255,184,0.45); }
.color-sep   { color: rgba(0,255,65,0.2); }

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
