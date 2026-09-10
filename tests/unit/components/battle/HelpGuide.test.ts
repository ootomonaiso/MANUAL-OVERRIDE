import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import HelpGuide from '../../../../src/components/battle/HelpGuide.vue'
import { useGlossaryPanel } from '../../../../src/composables/useGlossaryPanel'
import { BATTLE_GUIDE_SECTIONS, BATTLE_GLOSSARY } from '../../../../src/data/rpg/battleGuide'

/**
 * 用語ポップアップは Teleport to body で出るため host 配下には現れない。
 * 探索は document.body 側で行う。
 * また useGlossaryPanel はモジュールレベルのシングルトンで、状態がテスト間に持ち越される。
 */

interface Harness {
  host: HTMLElement
  app: App
}

let current: Harness | null = null

function mountGuide(): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(HelpGuide) })
  app.mount(host)
  current = { host, app }
  return current
}

function $(host: HTMLElement, sel: string): HTMLElement | null {
  return host.querySelector(sel)
}
function $$(host: HTMLElement, sel: string): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(sel)]
}
/** Teleport 先（body直下）を探す */
function body$(sel: string): HTMLElement | null {
  return document.body.querySelector(sel)
}
function textOf(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}
/** ポップアップは「描画 → getBoundingClientRect で実測 → 位置確定」の2段構えなので複数tick待つ */
async function flush(): Promise<void> {
  await nextTick()
  await nextTick()
  await nextTick()
}

beforeEach(() => {
  const g = useGlossaryPanel()
  g.closeTermPopup()
  g.closeGuide()
  g.activeSectionId.value = null
})

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
  const g = useGlossaryPanel()
  g.closeTermPopup()
  g.closeGuide()
  g.activeSectionId.value = null
})

const FIRST_SECTION = BATTLE_GUIDE_SECTIONS[0]
const SECOND_SECTION = BATTLE_GUIDE_SECTIONS[1]
const TERM_ID = Object.keys(BATTLE_GLOSSARY)[0]
const TERM = BATTLE_GLOSSARY[TERM_ID]

describe('HelpGuide: 遊び方パネルの開閉', () => {
  it('初期状態はアイコンボタンだけで、パネルは閉じている', () => {
    const h = mountGuide()
    const btn = $(h.host, '.help-guide .help-icon-btn') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-label')).toBe('遊び方を見る')
    expect($(h.host, '.info-shell-overlay')).toBeNull()
  })

  it('アイコンを押すと2ペインパネルが開き、先頭セクションが初期表示される', async () => {
    const h = mountGuide()
    ;($(h.host, '.help-icon-btn') as HTMLButtonElement).click()
    await nextTick()
    expect($(h.host, '.info-shell-overlay')).not.toBeNull()
    expect(textOf($(h.host, '.info-shell-title'))).toBe('遊び方')
    expect(textOf($(h.host, '.guide-section-title'))).toBe(FIRST_SECTION.title)
    expect($$(h.host, '.guide-section p')).toHaveLength(FIRST_SECTION.body.length)
  })

  it('もう一度押すと閉じる（トグル）', async () => {
    const h = mountGuide()
    const btn = $(h.host, '.help-icon-btn') as HTMLButtonElement
    btn.click()
    await nextTick()
    btn.click()
    await nextTick()
    expect($(h.host, '.info-shell-overlay')).toBeNull()
  })

  it('×ボタンでも閉じる', async () => {
    const h = mountGuide()
    ;($(h.host, '.help-icon-btn') as HTMLButtonElement).click()
    await nextTick()
    ;($(h.host, '.info-shell-close') as HTMLButtonElement).click()
    await nextTick()
    expect($(h.host, '.info-shell-overlay')).toBeNull()
  })
})

describe('HelpGuide: セクションの切り替え', () => {
  it('左ナビにガイドのセクションと「用語集」グループが並ぶ', async () => {
    const h = mountGuide()
    ;($(h.host, '.help-icon-btn') as HTMLButtonElement).click()
    await nextTick()
    const navLabels = $$(h.host, '.info-shell-nav .nav-item:not(.child)').map(b => textOf(b))
    for (const s of BATTLE_GUIDE_SECTIONS) expect(navLabels).toContain(s.title)
    const group = $$(h.host, '.info-shell-nav .nav-group-title').find(b => b.textContent?.includes('用語集'))
    expect(group).toBeTruthy()
  })

  it('ナビで別のセクションを選ぶと本文が入れ替わる', async () => {
    const h = mountGuide()
    ;($(h.host, '.help-icon-btn') as HTMLButtonElement).click()
    await nextTick()
    const target = $$(h.host, '.info-shell-nav .nav-item')
      .find(b => textOf(b) === SECOND_SECTION.title) as HTMLButtonElement
    target.click()
    await nextTick()
    expect(textOf($(h.host, '.guide-section-title'))).toBe(SECOND_SECTION.title)
    expect(target.classList.contains('active')).toBe(true)
  })

  it('用語集グループを開いて用語を選ぶと、その用語の説明が出る', async () => {
    const h = mountGuide()
    ;($(h.host, '.help-icon-btn') as HTMLButtonElement).click()
    await nextTick()
    const group = $$(h.host, '.info-shell-nav .nav-group-title')
      .find(b => b.textContent?.includes('用語集')) as HTMLButtonElement
    group.click()
    await nextTick()
    const child = $$(h.host, '.info-shell-nav .nav-item.child')
      .find(b => textOf(b) === TERM.label) as HTMLButtonElement
    expect(child).toBeTruthy()
    child.click()
    await nextTick()
    expect(textOf($(h.host, '.guide-section-title'))).toBe(TERM.label)
    expect(textOf($(h.host, '.guide-section p'))).toBe(TERM.body)
  })
})

describe('HelpGuide: 用語ポップアップ（Teleport to body）', () => {
  it('用語が選ばれると body 直下にポップアップが出る（host の中には出ない）', async () => {
    const h = mountGuide()
    useGlossaryPanel().openTermPopup(TERM_ID, { x: 120, y: 200 })
    await flush()
    expect($(h.host, '.term-popup')).toBeNull()
    const popup = body$('.term-popup-catcher .term-popup')
    expect(popup).not.toBeNull()
    expect(textOf(popup!.querySelector('.term-popup-title'))).toBe(TERM.label)
    expect(textOf(popup!.querySelector('.term-popup-body'))).toBe(TERM.body)
  })

  it('実測が済むと ready クラスと位置が付く', async () => {
    mountGuide()
    useGlossaryPanel().openTermPopup(TERM_ID, { x: 120, y: 200 })
    await flush()
    const popup = body$('.term-popup') as HTMLElement
    expect(popup.classList.contains('ready')).toBe(true)
    // happy-dom では getBoundingClientRect が 0 を返すため、アンカーの真下・そのままの x に置かれる
    expect(popup.style.left).toBe('120px')
    expect(popup.style.top).toBe('210px')
  })

  it('用語が無いときはポップアップごと出ない', async () => {
    mountGuide()
    await flush()
    expect(body$('.term-popup-catcher')).toBeNull()
  })

  it('外側（catcher）を押すと閉じる', async () => {
    mountGuide()
    useGlossaryPanel().openTermPopup(TERM_ID, { x: 120, y: 200 })
    await flush()
    const catcher = body$('.term-popup-catcher') as HTMLElement
    catcher.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(body$('.term-popup')).toBeNull()
  })

  it('中身（ポップアップ本体）を押しても閉じない', async () => {
    mountGuide()
    useGlossaryPanel().openTermPopup(TERM_ID, { x: 120, y: 200 })
    await flush()
    ;(body$('.term-popup') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()
    expect(body$('.term-popup')).not.toBeNull()
  })
})

describe('HelpGuide: 「詳細」からヘルプ本体へ飛ぶ', () => {
  it('詳細を押すとポップアップが消え、その用語を開いた状態でパネルが開く', async () => {
    const h = mountGuide()
    const glossary = useGlossaryPanel()
    const signalBefore = glossary.jumpToHelpSignal.value
    glossary.openTermPopup(TERM_ID, { x: 120, y: 200 })
    await flush()
    ;(body$('.term-popup-detail') as HTMLButtonElement).click()
    await flush()

    expect(body$('.term-popup')).toBeNull()
    expect($(h.host, '.info-shell-overlay')).not.toBeNull()
    expect(textOf($(h.host, '.guide-section-title'))).toBe(TERM.label)
    // BattleScreen 側が他のオーバーレイを閉じる合図。増分することだけを保証する
    expect(glossary.jumpToHelpSignal.value).toBe(signalBefore + 1)
  })

  it('飛んだ先では該当する用語のナビ項目が選択済みになる', async () => {
    const h = mountGuide()
    useGlossaryPanel().openTermPopup(TERM_ID, { x: 120, y: 200 })
    await flush()
    ;(body$('.term-popup-detail') as HTMLButtonElement).click()
    await flush()
    // 子が選択中のグループは自動で開く（InfoPanelShell.groupIsOpen）
    const active = $(h.host, '.info-shell-nav .nav-item.child.active')
    expect(textOf(active)).toBe(TERM.label)
  })
})
