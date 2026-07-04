<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const progress = ref(0)
const statusText = ref('初期化中...')

const statusMessages = [
  'ゲームエンジンを構築中...',
  '説明書を読み込んでいます...',
  'ジャンルの種を蒔いています...',
  '世界を生成中...',
  '準備完了...',
]

let progressInterval: ReturnType<typeof setInterval> | null = null
let statusInterval: ReturnType<typeof setInterval> | null = null
let statusIndex = 0

onMounted(() => {
  // ステータスメッセージを交互に表示
  statusIndex = 0
  statusInterval = setInterval(() => {
    statusIndex = (statusIndex + 1) % statusMessages.length
    statusText.value = statusMessages[statusIndex]
  }, 600)

  // 進捗バーを疑似アニメーション
  progressInterval = setInterval(() => {
    progress.value = Math.min(progress.value + Math.random() * 15 + 5, 100)
    if (progress.value >= 100) {
      if (statusInterval !== null) clearInterval(statusInterval)
      if (progressInterval !== null) clearInterval(progressInterval)
    }
  }, 200)
})

onUnmounted(() => {
  if (statusInterval !== null) clearInterval(statusInterval)
  if (progressInterval !== null) clearInterval(progressInterval)
})
</script>

<template>
  <div class="loading-screen">
    <!-- スキャンライン -->
    <div class="loading-scanlines" />

    <!-- グリッド背景 -->
    <div class="loading-grid" />

    <div class="loading-card">
      <!-- ロゴ -->
      <div class="loading-logo">
        <div class="loading-logo-icon" />
        <span class="loading-logo-text">MANUAL OVERRIDE</span>
      </div>

      <!-- 説明 -->
      <div class="loading-status">{{ statusText }}</div>

      <!-- 進捗バー -->
      <div class="loading-bar-track">
        <div class="loading-bar-fill" :style="{ width: progress + '%' }" />
      </div>

      <!-- バージョン -->
      <div class="loading-version">ver.1.0</div>
    </div>
  </div>
</template>

<style scoped>
.loading-screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  z-index: 200;
  pointer-events: none;
}

.loading-scanlines {
  position: absolute;
  inset: 0;
  background: var(--scanline);
  pointer-events: none;
  opacity: 0.4;
}

.loading-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(0, 255, 65, 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 255, 65, 0.03) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
  opacity: 0.6;
}

.loading-card {
  pointer-events: auto;
}

.loading-card {
  text-align: center;
  font-family: var(--font-main);
  color: var(--text);
  z-index: 1;
  animation: cardIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes cardIn {
  0%   { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ── ロゴ ── */
.loading-logo {
  margin-bottom: 28px;
}

.loading-logo-icon {
  width: 40px;
  height: 40px;
  margin: 0 auto 12px;
  border: 2px solid var(--green);
  border-radius: 4px;
  position: relative;
  box-shadow: 0 0 16px var(--green-glow);
  animation: logoPulse 2s ease-in-out infinite;
}

.loading-logo-icon::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid var(--green-dim);
  border-radius: 2px;
}

@keyframes logoPulse {
  0%, 100% { box-shadow: 0 0 16px var(--green-glow); }
  50%      { box-shadow: 0 0 24px var(--green-glow), 0 0 40px rgba(0, 255, 65, 0.1); }
}

.loading-logo-text {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 3px;
  color: var(--green);
  text-shadow: 0 0 12px var(--green-glow);
  font-family: var(--font-display);
}

/* ── ステータス ── */
.loading-status {
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 1px;
  margin-bottom: 20px;
  font-family: var(--font-main);
  min-height: 1.5em;
}

/* ── 進捗バー ── */
.loading-bar-track {
  width: 240px;
  height: 3px;
  background: rgba(0, 255, 65, 0.1);
  border-radius: 1px;
  margin: 0 auto 16px;
  overflow: hidden;
}

.loading-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--green-dim), var(--green));
  border-radius: 1px;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px var(--green-glow);
}

/* ── バージョン ── */
.loading-version {
  font-size: 9px;
  color: var(--text-muted);
  letter-spacing: 2px;
  font-family: var(--font-main);
}
</style>
