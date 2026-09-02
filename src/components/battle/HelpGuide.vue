<script setup lang="ts">
/**
 * 右上のヘルプアイコン。
 * - 直接クリックすると「遊び方」の全文（コマンド・ステータス・ドラフト・クリティカルの
 *   セクション + 用語集）をオーバーレイで開く。
 * - 画面のどこかで GlossaryTerm をクリックすると、正方形のアイコンが横長の帯に
 *   アニメーションで変化し、その用語の解説をここに表示する（追従: 別の用語を押すと
 *   中身だけ差し替わる）。関係のない場所をクリックすると正方形に戻る。
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { useGlossaryPanel } from '../../composables/useGlossaryPanel'
import { BATTLE_GUIDE_SECTIONS, BATTLE_GLOSSARY } from '../../data/battleGuide'

const { activeTermId, guideOpen, closeTerm, toggleGuide, closeGuide } = useGlossaryPanel()

const activeTerm = computed(() => (activeTermId.value ? BATTLE_GLOSSARY[activeTermId.value] : null))
const termEntries = computed(() => Object.entries(BATTLE_GLOSSARY))

/** 用語の帯・ガイド自身のクリックでは閉じない。それ以外のクリックで用語表示だけ閉じる */
function onDocClick(e: MouseEvent): void {
  const target = e.target instanceof HTMLElement ? e.target : null
  if (!target) return
  if (target.closest('.glossary-term') || target.closest('.help-guide')) return
  closeTerm()
}

onMounted(() => window.addEventListener('click', onDocClick))
onUnmounted(() => window.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="help-guide">
    <button
      type="button"
      class="help-pill"
      :class="{ expanded: activeTerm !== null }"
      @click="toggleGuide"
    >
      <span v-if="!activeTerm" class="help-icon" aria-hidden="true">
        <span /><span /><span />
      </span>
      <span v-else class="help-term">
        <span class="help-term-label">{{ activeTerm.label }}</span>
        <span class="help-term-body">{{ activeTerm.body }}</span>
      </span>
    </button>

    <div v-if="guideOpen" class="guide-overlay" @click.self="closeGuide">
      <div class="guide-card">
        <div class="guide-header">
          <span class="guide-title">遊び方</span>
          <button type="button" class="guide-close" @click="closeGuide">×</button>
        </div>
        <div class="guide-body">
          <section v-for="s in BATTLE_GUIDE_SECTIONS" :key="s.title" class="guide-section">
            <h3 class="guide-section-title">{{ s.title }}</h3>
            <p v-for="(p, i) in s.body" :key="i">{{ p }}</p>
          </section>
          <section class="guide-section guide-terms">
            <h3 class="guide-section-title">用語集</h3>
            <div v-for="[id, term] in termEntries" :key="id" class="guide-term-row">
              <span class="guide-term-label">{{ term.label }}</span>
              <span class="guide-term-body">{{ term.body }}</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.help-guide {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 50;
}
.help-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  min-width: 34px;
  padding: 0 8px;
  background: color-mix(in srgb, var(--battle-panel) 88%, transparent);
  border: 1px solid var(--battle-frame-border);
  border-radius: 17px;
  color: var(--battle-text);
  cursor: pointer;
  overflow: hidden;
  /* 正方形 ⇄ 横長帯の変化そのものは width の transition で表現する。
     用語文の長さが毎回変わるため、grid-template-columns ではなく単純な幅の遷移にする */
  transition: width 260ms cubic-bezier(0.2, 1, 0.3, 1), min-width 260ms cubic-bezier(0.2, 1, 0.3, 1);
}
.help-pill.expanded {
  min-width: 240px;
  max-width: min(70vw, 420px);
  padding: 6px 14px;
  justify-content: flex-start;
  text-align: left;
}
.help-icon {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 16px;
}
.help-icon span {
  display: block;
  height: 2px;
  background: currentColor;
  border-radius: 1px;
}
.help-term {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.4;
  white-space: normal;
}
.help-term-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--battle-accent);
  letter-spacing: 1px;
}
.help-term-body {
  font-size: 11px;
  opacity: 0.92;
}

.guide-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 51;
}
.guide-card {
  width: 92%;
  max-width: 640px;
  max-height: 82vh;
  overflow-y: auto;
  background: color-mix(in srgb, var(--battle-panel) 97%, transparent);
  border: 2px solid var(--battle-frame-border);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
}
.guide-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--battle-frame-border);
  padding-bottom: 8px;
  margin-bottom: 10px;
}
.guide-title {
  font-size: 16px;
  font-weight: 700;
}
.guide-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
}
.guide-section {
  margin-bottom: 16px;
}
.guide-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--battle-accent);
  margin: 0 0 6px;
  letter-spacing: 1px;
}
.guide-section p {
  font-size: 12px;
  line-height: 1.7;
  margin: 0 0 6px;
  opacity: 0.92;
}
.guide-terms {
  border-top: 1px solid var(--battle-frame-border);
  padding-top: 12px;
}
.guide-term-row {
  display: flex;
  gap: 10px;
  font-size: 11px;
  line-height: 1.6;
  padding: 4px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--battle-frame-border) 60%, transparent);
}
.guide-term-label {
  flex: 0 0 auto;
  min-width: 64px;
  font-weight: 700;
  color: var(--battle-accent);
}
.guide-term-body {
  opacity: 0.9;
}
</style>
