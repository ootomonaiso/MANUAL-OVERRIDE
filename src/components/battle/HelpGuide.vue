<script setup lang="ts">
/**
 * 右上のヘルプボタン。押すと「遊び方」を大きな2ペインパネル（InfoPanelShell）で開く。
 * 画面のどこかで GlossaryTerm を押した時も同じパネルを開き、その用語の項目へジャンプする。
 */
import { computed } from 'vue'
import { useGlossaryPanel } from '../../composables/useGlossaryPanel'
import { BATTLE_GUIDE_SECTIONS, BATTLE_GLOSSARY } from '../../data/battleGuide'
import InfoPanelShell from './InfoPanelShell.vue'
import type { InfoNavSection } from './InfoPanelShell.vue'

const { guideOpen, activeSectionId, toggleGuide, closeGuide } = useGlossaryPanel()

const navSections = computed<InfoNavSection[]>(() => [
  ...BATTLE_GUIDE_SECTIONS.map(s => ({ id: s.id, label: s.title })),
  {
    id: 'glossary',
    label: '用語集',
    isGroup: true,
    children: Object.entries(BATTLE_GLOSSARY).map(([id, t]) => ({ id, label: t.label })),
  },
])

const defaultId = computed(() => BATTLE_GUIDE_SECTIONS[0]?.id ?? null)
const currentId = computed(() => activeSectionId.value ?? defaultId.value)

function setActive(id: string): void {
  activeSectionId.value = id
}

const activeGuideSection = computed(() => BATTLE_GUIDE_SECTIONS.find(s => s.id === currentId.value))
const activeTerm = computed(() => {
  const id = currentId.value
  return id && !activeGuideSection.value ? BATTLE_GLOSSARY[id] ?? null : null
})
</script>

<template>
  <div class="help-guide">
    <button type="button" class="help-icon-btn" aria-label="遊び方を見る" @click="toggleGuide">
      <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
    </button>

    <InfoPanelShell
      v-if="guideOpen"
      title="遊び方"
      :sections="navSections"
      :active-id="currentId"
      @update:active-id="setActive"
      @close="closeGuide"
    >
      <div v-if="activeGuideSection" class="guide-section">
        <h3 class="guide-section-title">{{ activeGuideSection.title }}</h3>
        <p v-for="(p, i) in activeGuideSection.body" :key="i">{{ p }}</p>
      </div>
      <div v-else-if="activeTerm" class="guide-section">
        <h3 class="guide-section-title">{{ activeTerm.label }}</h3>
        <p>{{ activeTerm.body }}</p>
      </div>
    </InfoPanelShell>
  </div>
</template>

<style scoped>
.help-guide {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 50;
}
.help-icon-btn {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 34px;
  height: 34px;
  padding: 0;
  background: color-mix(in srgb, var(--battle-panel) 88%, transparent);
  border: 1px solid var(--battle-frame-border);
  border-radius: 17px;
  cursor: pointer;
}
.help-icon-btn span {
  display: block;
  height: 2px;
  margin: 0 9px;
  background: var(--battle-text);
  border-radius: 1px;
}
.guide-section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--battle-accent);
  margin: 0 0 12px;
  letter-spacing: 1px;
}
.guide-section p {
  font-size: 13px;
  line-height: 1.85;
  margin: 0 0 10px;
  opacity: 0.92;
}
</style>
