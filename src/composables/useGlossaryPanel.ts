/**
 * composables/useGlossaryPanel.ts
 *
 * 右上のヘルプボタン（HelpGuide.vue）と、本文中の用語（GlossaryTerm.vue）が
 * 共有する状態。モジュールレベルの ref にして、呼び出し元がどこであっても
 * 同じ状態を指すシングルトンにする（SoundManager と同じ方針）。
 *
 * 以前は「用語をクリックすると小さなアイコンが帯に伸びて、その場でミニ説明を出す」
 * 仕組みだったが、帯が狭く文字が溢れるというフィードバックを受け、ヘルプ自体を
 * 大きな2ペインパネル（InfoPanelShell）に作り直した。用語クリックはそのパネルを開き、
 * 該当項目へジャンプする形に統一している。
 */

import { ref } from 'vue'

const guideOpen = ref(false)
const activeSectionId = ref<string | null>(null)

export function useGlossaryPanel() {
  /** 用語(GlossaryTerm)のクリック: ヘルプパネルを開き、該当項目を選択状態にする */
  function openTerm(id: string): void {
    activeSectionId.value = id
    guideOpen.value = true
  }
  function toggleGuide(): void {
    guideOpen.value = !guideOpen.value
  }
  function closeGuide(): void {
    guideOpen.value = false
  }
  return { guideOpen, activeSectionId, openTerm, toggleGuide, closeGuide }
}
