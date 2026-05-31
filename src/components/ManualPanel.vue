<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ManualVersion, ManualTheme } from '../domain/types'

const props = defineProps<{
  manual: ManualVersion
  theme: ManualTheme
  diffLines: Array<{ text: string; type: 'added' | 'removed' | 'unchanged' }>
  isAnimating: boolean
  history: ManualVersion[]
  features?: Set<string>
}>()

const showHistory = ref(false)
const themeClass = computed(() => `theme-${props.theme}`)

function keyLabel(key: string): string {
  const map: Record<string, string> = {
    Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  }
  return map[key] ?? key.toUpperCase()
}
</script>

<template>
  <div class="manual-panel" :class="themeClass">
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
      <template v-if="isAnimating && diffLines.length > 0">
        <div
          v-for="(line, i) in diffLines"
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
        <div v-for="line in manual.manualText" :key="line" class="manual-line line-unchanged">
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
  width: 320px;
  background: #fefdfb;
  border: 2px solid #c9a876;
  border-radius: 6px;
  padding: 14px 16px;
  font-family: 'Noto Sans JP', 'Courier New', sans-serif;
  font-size: 13px;
  line-height: 1.8;
  color: #2a1810;
  box-shadow: 6px 6px 12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
  z-index: 20;
  transition: font-family 0.6s, background 0.6s, border-color 0.6s, box-shadow 0.6s;
  user-select: none;
  max-height: 380px;
  overflow-y: auto;
}

.manual-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0,0,0,0.12);
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
  color: #333;
}
.manual-ver-dot {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #cc2222;
}
.history-btn {
  font-size: 9px;
  background: none;
  border: 1px solid #ccc;
  cursor: pointer;
  padding: 1px 6px;
  border-radius: 2px;
  color: #888;
  font-family: inherit;
  transition: all 0.15s;
}
.history-btn:hover { background: #f0f0f0; border-color: #999; color: #333; }

/* ── 履歴 ── */
.manual-history {
  border-bottom: 1px dashed #ddd;
  margin-bottom: 7px;
  padding-bottom: 7px;
  max-height: 110px;
  overflow-y: auto;
  font-size: 10px;
  color: #aaa;
}
.history-empty { font-style: italic; color: #ccc; }
.history-item { margin-bottom: 5px; }
.history-ver { font-weight: bold; font-size: 9px; color: #bbb; text-transform: uppercase; letter-spacing: 1px; }
.history-line { padding-left: 4px; color: #bbb; }

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

.line-unchanged { color: #1a1a1a; font-weight: 500; }
.line-removed {
  display: block;
  text-decoration: line-through;
  color: #cc2222;
  opacity: 0.55;
  background: rgba(200,0,0,0.05);
  padding: 0 2px;
}
.line-added {
  display: block;
  color: #cc2222;
  font-weight: 700;
  animation: inkIn 0.5s ease both;
  position: relative;
  padding-left: 12px;
}
.line-added::before {
  content: '▶';
  position: absolute;
  left: 0;
  font-size: 8px;
  top: 3px;
  color: #cc2222;
}
@keyframes inkIn {
  0%   { opacity: 0; transform: translateX(-5px); filter: blur(2px); }
  100% { opacity: 1; transform: translateX(0); filter: blur(0); }
}

/* ── 操作キー ── */
.manual-controls {
  border-top: 1px solid rgba(0,0,0,0.1);
  padding-top: 6px;
}
.controls-title {
  font-size: 10px;
  color: #666;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 5px;
  font-weight: 600;
}
.controls-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  align-items: center;
}
.key-badge {
  background: #1a1a1a;
  color: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  min-width: 35px;
  text-align: center;
  letter-spacing: 0.5px;
  border-bottom: 2px solid rgba(0,0,0,0.4);
  font-weight: 600;
}
.key-action { font-size: 12px; color: #333; font-weight: 500; }

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
  box-shadow: 4px 4px 0 #1a66ff, 0 0 20px rgba(26,102,255,0.3);
  font-family: 'Courier New', monospace;
  letter-spacing: 0.3px;
}
.theme-stg .manual-header    { border-color: rgba(26,102,255,0.3); }
.theme-stg .manual-ver-badge  { color: #a8d8ff; }
.theme-stg .manual-ver-dot    { background: #1a66ff; box-shadow: 0 0 6px #1a66ff; }
.theme-stg .history-btn       { color: #5588cc; border-color: #1a66ff; }
.theme-stg .line-unchanged    { color: #a8d8ff; }
.theme-stg .controls-title    { color: #446688; }
.theme-stg .key-badge         { background: #1a66ff; border-color: #0033aa; }
.theme-stg .key-action        { color: #6699cc; }
.theme-stg .manual-controls   { border-color: rgba(26,102,255,0.2); }
.theme-stg .manual-history    { border-color: rgba(26,102,255,0.2); }

/* ──────────────────────────────────────
   テーマ: RPG
────────────────────────────────────── */
.theme-rpg {
  background: #f5edd0;
  color: #3a2200;
  border-color: #8b6100;
  font-family: 'Georgia', 'Times New Roman', serif;
  box-shadow: 5px 5px 0 #8b6100, 2px 2px 8px rgba(0,0,0,0.2);
}
.theme-rpg .manual-ver-dot { background: #8b6100; }
.theme-rpg .key-badge      { background: #8b6100; border-color: #5a3e00; }
.theme-rpg .controls-title { color: #c4a020; }
.theme-rpg .key-action     { color: #8b6100; }

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
  box-shadow: 4px 4px 0 #9900ff, 0 0 24px rgba(153,0,255,0.4);
  font-family: 'Courier New', monospace;
}
.theme-rhythm .manual-header  { border-color: rgba(153,0,255,0.3); }
.theme-rhythm .manual-ver-dot { background: #ff00ff; box-shadow: 0 0 8px #ff00ff; }
.theme-rhythm .key-badge      { background: #9900ff; border-color: #6600cc; }
.theme-rhythm .key-action     { color: #cc66ff; }
.theme-rhythm .line-unchanged { color: #dd88ff; }
.theme-rhythm .controls-title { color: #660088; }
</style>
