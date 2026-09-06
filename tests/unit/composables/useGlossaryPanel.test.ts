import { describe, it, expect, beforeEach } from 'vitest'
import { useGlossaryPanel, resetGlossaryPanel } from '../../../src/composables/useGlossaryPanel'

// useGlossaryPanel の状態はモジュールレベル singleton（App.vue と同じ ref を全テストで共有する）
// ため、他のテストの副作用が残らないよう毎回リセットする。
describe('useGlossaryPanel', () => {
  beforeEach(() => {
    resetGlossaryPanel()
  })

  it('openTermPopup で用語ポップアップを開く', () => {
    const { openTermPopup, popupTermId, popupAnchor } = useGlossaryPanel()

    openTermPopup('term_hp', { x: 10, y: 20 })

    expect(popupTermId.value).toBe('term_hp')
    expect(popupAnchor.value).toEqual({ x: 10, y: 20 })
  })

  it('closeTermPopup でポップアップを閉じる', () => {
    const { openTermPopup, closeTermPopup, popupTermId, popupAnchor } = useGlossaryPanel()

    openTermPopup('term_hp', { x: 10, y: 20 })
    closeTermPopup()

    expect(popupTermId.value).toBeNull()
    expect(popupAnchor.value).toBeNull()
  })

  it('openDetail はポップアップを閉じ、ヘルプを開いて該当セクションへ移動し、signal を増分する', () => {
    const {
      openTermPopup, openDetail,
      guideOpen, activeSectionId, popupTermId, popupAnchor, jumpToHelpSignal,
    } = useGlossaryPanel()

    openTermPopup('term_hp', { x: 10, y: 20 })
    const before = jumpToHelpSignal.value

    openDetail('term_hp')

    expect(popupTermId.value).toBeNull()
    expect(popupAnchor.value).toBeNull()
    expect(guideOpen.value).toBe(true)
    expect(activeSectionId.value).toBe('term_hp')
    expect(jumpToHelpSignal.value).toBe(before + 1)
  })

  it('openDetail を複数回呼ぶと signal がその都度増分される', () => {
    const { openDetail, jumpToHelpSignal } = useGlossaryPanel()

    openDetail('term_a')
    openDetail('term_b')
    openDetail('term_c')

    expect(jumpToHelpSignal.value).toBe(3)
  })

  it('toggleGuide はガイドの開閉を反転する', () => {
    const { toggleGuide, guideOpen } = useGlossaryPanel()

    expect(guideOpen.value).toBe(false)
    toggleGuide()
    expect(guideOpen.value).toBe(true)
    toggleGuide()
    expect(guideOpen.value).toBe(false)
  })

  it('closeGuide はガイドを常に閉じる', () => {
    const { toggleGuide, closeGuide, guideOpen } = useGlossaryPanel()

    toggleGuide()
    expect(guideOpen.value).toBe(true)
    closeGuide()
    expect(guideOpen.value).toBe(false)
    // 既に閉じている状態で呼んでもエラーにならない
    closeGuide()
    expect(guideOpen.value).toBe(false)
  })

  it('resetGlossaryPanel — ラン再開時の回帰: すべての状態が初期値へ戻る (#C-4)', () => {
    const {
      openTermPopup, openDetail, toggleGuide,
      guideOpen, activeSectionId, popupTermId, popupAnchor, jumpToHelpSignal,
    } = useGlossaryPanel()

    // 前ランで色々開きっぱなしにした状態を再現する
    toggleGuide()
    openTermPopup('term_hp', { x: 5, y: 5 })
    openDetail('term_mp')

    expect(guideOpen.value).toBe(true)
    expect(activeSectionId.value).toBe('term_mp')
    expect(jumpToHelpSignal.value).toBeGreaterThan(0)

    resetGlossaryPanel()

    expect(guideOpen.value).toBe(false)
    expect(activeSectionId.value).toBeNull()
    expect(popupTermId.value).toBeNull()
    expect(popupAnchor.value).toBeNull()
    expect(jumpToHelpSignal.value).toBe(0)
  })
})
