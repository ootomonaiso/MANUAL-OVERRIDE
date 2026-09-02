/**
 * composables/useGlossaryPanel.ts
 *
 * 右上のヘルプアイコン（HelpGuide.vue）と、本文中の用語（GlossaryTerm.vue）が
 * 共有する状態。モジュールレベルの ref にして、呼び出し元がどこであっても
 * 同じ状態を指すシングルトンにする（SoundManager と同じ方針）。
 */

import { ref } from 'vue'

const activeTermId = ref<string | null>(null)
const guideOpen = ref(false)

export function useGlossaryPanel() {
  function openTerm(id: string): void {
    guideOpen.value = false
    activeTermId.value = id
  }
  function closeTerm(): void {
    activeTermId.value = null
  }
  function toggleGuide(): void {
    activeTermId.value = null
    guideOpen.value = !guideOpen.value
  }
  function closeGuide(): void {
    guideOpen.value = false
  }
  return { activeTermId, guideOpen, openTerm, closeTerm, toggleGuide, closeGuide }
}
