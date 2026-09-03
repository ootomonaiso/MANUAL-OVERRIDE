/**
 * composables/useGlossaryPanel.ts
 *
 * 右上のヘルプボタン（HelpGuide.vue）と、本文中の用語（GlossaryTerm.vue）が
 * 共有する状態。モジュールレベルの ref にして、呼び出し元がどこであっても
 * 同じ状態を指すシングルトンにする（SoundManager と同じ方針）。
 *
 * 用語クリックの挙動は変遷している:
 *  1. 最初は「小さなアイコンが帯に伸びて、その場でミニ説明を出す」方式 →
 *     帯が狭く文字が溢れるフィードバックで、ヘルプ本体（2ペインの大きなパネル）に
 *     ジャンプする方式へ作り直した。
 *  2. 今度は「ジャンプすると今読んでいた画面が消えて分かりづらい」フィードバックを受け、
 *     再度その場に説明を出す方式へ戻した。ただし文字が溢れた反省を踏まえ、
 *     ポップアップ自体は実測してから位置決めする（GlossaryTermPopup 側）ことで
 *     画面端でもはみ出さないようにしている。ヘルプ本体へのジャンプは
 *     ポップアップ内の「詳細」ボタンからのみ行う。
 */

import { ref } from 'vue'

export interface GlossaryPopupAnchor {
  x: number
  y: number
}

const guideOpen = ref(false)
const activeSectionId = ref<string | null>(null)

const popupTermId = ref<string | null>(null)
const popupAnchor = ref<GlossaryPopupAnchor | null>(null)

/**
 * 「詳細」が押されるたびに増分するカウンタ。BattleScreen 側はこれを監視して、
 * INFOパネルなど他に開いているオーバーレイを閉じる合図として使う
 * （useGlossaryPanel 自身は他パネルの状態を知らないため、値の変化だけを伝える）。
 */
const jumpToHelpSignal = ref(0)

export function useGlossaryPanel() {
  /** 用語(GlossaryTerm)のクリック: クリック位置の近くに簡易説明のポップアップを出す */
  function openTermPopup(id: string, anchor: GlossaryPopupAnchor): void {
    popupTermId.value = id
    popupAnchor.value = anchor
  }
  function closeTermPopup(): void {
    popupTermId.value = null
    popupAnchor.value = null
  }
  /** ポップアップの「詳細」ボタン: ポップアップを閉じ、ヘルプ本体の該当項目へ飛ぶ */
  function openDetail(id: string): void {
    popupTermId.value = null
    popupAnchor.value = null
    activeSectionId.value = id
    guideOpen.value = true
    jumpToHelpSignal.value += 1
  }
  function toggleGuide(): void {
    guideOpen.value = !guideOpen.value
  }
  function closeGuide(): void {
    guideOpen.value = false
  }
  return {
    guideOpen, activeSectionId, popupTermId, popupAnchor, jumpToHelpSignal,
    openTermPopup, closeTermPopup, openDetail, toggleGuide, closeGuide,
  }
}
