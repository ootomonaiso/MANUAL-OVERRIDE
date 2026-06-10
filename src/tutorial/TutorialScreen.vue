<script setup lang="ts">
defineEmits<{
  start: []
}>()
</script>

<template>
  <div class="tutorial-screen">
    <!-- スキャンライン -->
    <div class="tutorial-scanlines" />

    <!-- グリッド背景 -->
    <div class="tutorial-grid-bg" />

    <div class="tutorial-card">
      <!-- 書類風ヘッダー -->
      <div class="tutorial-doc-header">
        <span class="tutorial-doc-tag">QUICK START</span>
        <span class="tutorial-doc-tag">ver.0.0</span>
      </div>

      <div class="tutorial-rule" />

      <div class="tutorial-scroll">
        <!-- 概念 -->
        <section class="tutorial-section">
          <h2 class="tutorial-section-title">このゲームについて</h2>
          <p class="tutorial-text">
            「説明書を読むゲーム」です。<br>
            説明書が更新されるたびに、ゲームのルール・見た目・ジャンルが変化します。<br>
            あなたが選ぶ選択肢の積み重ねで、どんなゲームになるかが決まります。
          </p>
        </section>

        <!-- コアループ -->
        <section class="tutorial-section">
          <h2 class="tutorial-section-title">遊び方</h2>
          <div class="tutorial-loop">
            <div class="loop-step">
              <span class="loop-num">①</span>
              <div class="loop-text">プレイして障害物を避ける</div>
            </div>
            <div class="loop-arrow">→</div>
            <div class="loop-step">
              <span class="loop-num">②</span>
              <div class="loop-text">説明書が更新され、2択の選択肢が出る</div>
            </div>
            <div class="loop-arrow">→</div>
            <div class="loop-step">
              <span class="loop-num">③</span>
              <div class="loop-text">選んだ分、ゲームが変化する</div>
            </div>
          </div>
          <p class="tutorial-text tutorial-text-sub">
            これを繰り返すうちに、ゲームの「ジャンル」が確定します。<br>
            ランナー？STG？RPG？それとも…？
          </p>
        </section>

        <!-- 操作 -->
        <section class="tutorial-section">
          <h2 class="tutorial-section-title">操作方法</h2>
          <div class="tutorial-controls">
            <div class="ctrl-row">
              <kbd class="tutorial-ctrl-key">←</kbd>
              <kbd class="tutorial-ctrl-key">→</kbd>
              <span class="tutorial-ctrl-desc">移動</span>
            </div>
            <div class="ctrl-row">
              <kbd class="tutorial-ctrl-key tutorial-ctrl-key-wide">SPACE</kbd>
              <span class="tutorial-ctrl-desc">ジャンプ</span>
            </div>
          </div>
        </section>

        <!-- 色のルール -->
        <section class="tutorial-section">
          <h2 class="tutorial-section-title">色のルール</h2>
          <div class="tutorial-colors">
            <div class="color-row">
              <span class="color-dot color-danger" />
              <span class="color-label">赤 — 触れると失敗</span>
            </div>
            <div class="color-row">
              <span class="color-dot color-safe" />
              <span class="color-label">青 — 安全（触れても大丈夫）</span>
            </div>
          </div>
        </section>

        <!-- ジャンル収束 -->
        <section class="tutorial-section tutorial-section-last">
          <h2 class="tutorial-section-title">ジャンルの収束</h2>
          <p class="tutorial-text">
            各選択肢は裏で「ジャンルパラメータ」を蓄積しています。<br>
            一定以上蓄積されると、ゲームのジャンルが確定します。<br>
            <span class="tutorial-text-dim">例：攻撃系を選択 → STG / 成長系を選択 → RPG</span>
          </p>
        </section>
      </div>

      <!-- 開始ボタン -->
      <button class="tutorial-btn" @click="$emit('start')">
        <span class="tutorial-btn-bracket">[</span>
        &nbsp;わかった、プレイする&nbsp;
        <span class="tutorial-btn-bracket">]</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tutorial-screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

/* スキャンライン */
.tutorial-scanlines {
  position: absolute;
  inset: 0;
  background: var(--scanline);
  pointer-events: none;
}

/* グリッド背景 */
.tutorial-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(0,255,65,0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0,255,65,0.04) 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
  opacity: 0.5;
}

/* カード */
.tutorial-card {
  text-align: center;
  font-family: var(--font-mono);
  color: var(--text);
  background: var(--bg-panel);
  border: 1px solid var(--green-dim);
  padding: 28px 40px 24px;
  max-width: 520px;
  width: 90%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow:
    0 0 30px var(--green-glow),
    inset 0 1px 0 rgba(0,255,65,0.1);
  animation: tutorialCardIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes tutorialCardIn {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 書類ヘッダー */
.tutorial-doc-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tutorial-doc-tag {
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--green-dim);
  text-transform: uppercase;
  font-family: var(--font-mono);
}

.tutorial-rule {
  height: 1px;
  background: linear-gradient(to right, transparent, var(--green-dim), transparent);
  margin-bottom: 16px;
}

/* スクロール領域 */
.tutorial-scroll {
  overflow-y: auto;
  text-align: left;
  margin-bottom: 20px;
  max-height: calc(85vh - 200px);
  scrollbar-width: thin;
  scrollbar-color: var(--green-dim) transparent;
}

.tutorial-scroll::-webkit-scrollbar {
  width: 4px;
}

.tutorial-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.tutorial-scroll::-webkit-scrollbar-thumb {
  background: var(--green-dim);
  border-radius: 2px;
}

/* セクション */
.tutorial-section {
  margin-bottom: 18px;
}

.tutorial-section-last {
  margin-bottom: 0;
}

.tutorial-section-title {
  font-size: 13px;
  font-weight: bold;
  color: var(--green);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
  font-family: var(--font-mono);
}

.tutorial-text {
  font-size: 12px;
  line-height: 1.9;
  color: var(--text);
  font-family: var(--font-mono);
}

.tutorial-text-sub {
  margin-top: 8px;
  color: var(--text-dim);
}

.tutorial-text-dim {
  color: var(--text-dim);
}

/* ループ図 */
.tutorial-loop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.loop-step {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0,255,65,0.06);
  border: 1px solid rgba(0,255,65,0.15);
  padding: 4px 10px;
  border-radius: 2px;
}

.loop-num {
  font-size: 14px;
  color: var(--green);
}

.loop-text {
  font-size: 11px;
  color: var(--text);
  font-family: var(--font-mono);
}

.loop-arrow {
  font-size: 16px;
  color: var(--green-dim);
}

/* 操作キー */
.tutorial-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.ctrl-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tutorial-ctrl-key {
  display: inline-block;
  background: var(--green-dark);
  border: 1px solid var(--green-dim);
  border-bottom-width: 2px;
  color: var(--green);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 2px;
  letter-spacing: 0;
}

.tutorial-ctrl-key-wide {
  min-width: 56px;
  text-align: center;
}

.tutorial-ctrl-desc {
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
}

/* 色のルール */
.tutorial-colors {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.color-danger {
  background: #ff3333;
  box-shadow: 0 0 8px rgba(255, 51, 51, 0.6);
}

.color-safe {
  background: #3498db;
  box-shadow: 0 0 8px rgba(52, 152, 219, 0.6);
}

.color-label {
  font-size: 11px;
  color: var(--text);
  font-family: var(--font-mono);
}

/* 開始ボタン */
.tutorial-btn {
  background: transparent;
  color: var(--green);
  border: 1.5px solid var(--green-dim);
  padding: 10px 32px;
  font-size: 14px;
  font-family: var(--font-mono);
  cursor: pointer;
  letter-spacing: 2px;
  transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
  display: inline-block;
  align-self: center;
}

.tutorial-btn:hover {
  background: var(--green-dark);
  border-color: var(--green);
  box-shadow: 0 0 20px var(--green-glow);
}

.tutorial-btn:active {
  transform: translateY(1px);
}

.tutorial-btn-bracket {
  color: var(--green-dim);
}
</style>