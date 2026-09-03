<script setup lang="ts">
/**
 * 右上のヘルプボタン。押すと「遊び方」を大きな2ペインパネル（InfoPanelShell）で開く。
 *
 * 画面のどこかで GlossaryTerm を押した時はこのパネルへ飛ばず、クリック位置の近くに
 * 簡易説明のポップアップ（GlossaryTermPopup、このファイル内）をその場で出す。
 * ポップアップの「詳細」ボタンを押した時だけ、このパネルへその項目を開いた状態で飛ぶ
 * （useGlossaryPanel.openDetail が jumpToHelpSignal を進め、BattleScreen 側が
 * INFOパネルなど他に開いているオーバーレイを閉じる）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useGlossaryPanel } from '../../composables/useGlossaryPanel'
import { BATTLE_GUIDE_SECTIONS, BATTLE_GLOSSARY } from '../../data/rpg/battleGuide'
import InfoPanelShell from './InfoPanelShell.vue'
import type { InfoNavSection } from './InfoPanelShell.vue'

const POPUP_MARGIN = 12
const POPUP_GAP = 10

const {
  guideOpen, activeSectionId, popupTermId, popupAnchor,
  toggleGuide, closeGuide, closeTermPopup, openDetail,
} = useGlossaryPanel()

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

// ── 用語ポップアップ ─────────────────────────────────────────
const popupTerm = computed(() => (popupTermId.value ? BATTLE_GLOSSARY[popupTermId.value] ?? null : null))
const popupEl = ref<HTMLElement | null>(null)
const popupReady = ref(false)
const popupStyle = ref({ left: '0px', top: '0px' })

/**
 * ポップアップの実サイズを測ってから位置を決める。CSSだけの中央寄せ+clampだと
 * テキスト量次第で画面端からはみ出すため（以前の「帯」で実際に起きた不具合）、
 * 描画後に getBoundingClientRect() で測り直して画面内に収める。
 */
watch([popupTermId, popupAnchor], async ([id, anchor]) => {
  if (!id || !anchor) {
    popupReady.value = false
    return
  }
  popupReady.value = false
  await nextTick()
  const el = popupEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  let left = anchor.x - rect.width / 2
  left = Math.max(POPUP_MARGIN, Math.min(left, window.innerWidth - rect.width - POPUP_MARGIN))
  let top = anchor.y + POPUP_GAP
  if (top + rect.height > window.innerHeight - POPUP_MARGIN) {
    top = anchor.y - rect.height - POPUP_GAP
  }
  top = Math.max(POPUP_MARGIN, top)
  popupStyle.value = { left: `${left}px`, top: `${top}px` }
  popupReady.value = true
}, { immediate: true })

function goToDetail(): void {
  if (popupTermId.value) openDetail(popupTermId.value)
}
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

    <Teleport to="body">
      <div
        v-if="popupTerm"
        class="term-popup-catcher"
        @click.self="closeTermPopup"
        @contextmenu.prevent="closeTermPopup"
      >
        <div
          ref="popupEl"
          class="term-popup"
          :class="{ ready: popupReady }"
          :style="popupStyle"
          @contextmenu.prevent="closeTermPopup"
        >
          <div class="term-popup-title">{{ popupTerm.label }}</div>
          <p class="term-popup-body">{{ popupTerm.body }}</p>
          <div class="term-popup-actions">
            <button type="button" class="term-popup-detail" @click="goToDetail">詳細</button>
          </div>
        </div>
      </div>
    </Teleport>
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

/* クリックした場所の近くにその場で出す簡易説明。透明な全画面キャッチャーで
   クリック外し/右クリックを拾い、閉じられるようにする（他のパネルと同じ作法）。
   INFOパネルの上で用語を押すと、ポップアップの背景色（--battle-panel）が
   INFOパネル自体の背景色と同じため、境界が消えて文字が透けて見える／INFOパネル
   側の文字と重なって読めない不具合が実機で報告された。キャッチャーに半透明の
   スクリムを敷いて背後を一段暗くし、カード自体の縁もアクセントカラーで
   はっきり縁取ることで、どんな背景の上でも独立した層として視認できるようにする。 */
.term-popup-catcher {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.5);
}
.term-popup {
  position: fixed;
  width: max-content;
  min-width: 220px;
  max-width: min(360px, calc(100vw - 24px));
  padding: 14px 16px;
  background: color-mix(in srgb, var(--battle-panel) 96%, black);
  border: 2px solid var(--battle-accent);
  border-radius: var(--radius-md);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 12px 36px rgba(0, 0, 0, 0.75);
  visibility: hidden;
  opacity: 0;
}
.term-popup.ready {
  visibility: visible;
  opacity: 1;
}
.term-popup-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--battle-accent);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}
.term-popup-body {
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 12px;
  opacity: 0.92;
}
.term-popup-actions {
  display: flex;
  justify-content: flex-end;
}
.term-popup-detail {
  padding: 5px 14px;
  background: color-mix(in srgb, var(--battle-accent) 22%, transparent);
  border: 1px solid var(--battle-accent);
  border-radius: var(--radius-sm);
  color: var(--battle-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.term-popup-detail:hover {
  background: color-mix(in srgb, var(--battle-accent) 36%, transparent);
}
</style>
