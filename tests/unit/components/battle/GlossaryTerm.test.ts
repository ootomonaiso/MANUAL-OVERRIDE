import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import GlossaryTerm from '../../../../src/components/battle/GlossaryTerm.vue'
import { useGlossaryPanel } from '../../../../src/composables/useGlossaryPanel'

/**
 * クリック位置は getBoundingClientRect の実測から決まるが、happy-dom は常に0を返す。
 * 位置決めのロジックを見るために、要素の rect を差し替えてから押す。
 */

interface Harness { host: HTMLElement; app: App; outerClicks: number }
let current: Harness | null = null

function mountTerm(termId: string, label = '弱点'): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const harness: Harness = { host, app: null as unknown as App, outerClicks: 0 }
  const app = createApp({
    render: () => h('div', { onClick: () => { harness.outerClicks++ } }, [
      h(GlossaryTerm, { termId }, () => label),
    ]),
  })
  app.mount(host)
  harness.app = app
  current = harness
  return harness
}

function termButton(host: HTMLElement): HTMLButtonElement {
  return host.querySelector('.glossary-term') as HTMLButtonElement
}

function stubRect(el: HTMLElement, rect: { left: number; width: number; bottom: number }): void {
  el.getBoundingClientRect = () => ({
    left: rect.left, width: rect.width, bottom: rect.bottom,
    right: rect.left + rect.width, top: rect.bottom, height: 0, x: rect.left, y: rect.bottom,
    toJSON: () => ({}),
  }) as DOMRect
}

beforeEach(() => {
  const g = useGlossaryPanel()
  g.closeTermPopup()
  g.closeGuide()
})

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
  useGlossaryPanel().closeTermPopup()
})

describe('GlossaryTerm', () => {
  it('スロットの中身を持つ button として描かれる', () => {
    const h = mountTerm('weak', '弱点')
    const btn = termButton(h.host)
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.type).toBe('button')
    expect(btn.textContent?.trim()).toBe('弱点')
  })

  it('押すと termId と「要素の下端中央」がポップアップのアンカーになる', async () => {
    const h = mountTerm('weak')
    stubRect(termButton(h.host), { left: 100, width: 40, bottom: 250 })
    termButton(h.host).click()
    await nextTick()
    const g = useGlossaryPanel()
    expect(g.popupTermId.value).toBe('weak')
    expect(g.popupAnchor.value).toEqual({ x: 120, y: 250 })
  })

  it('クリックは親へ伝播しない（背後のキャラ選択などを誤爆させない）', async () => {
    const h = mountTerm('weak')
    termButton(h.host).click()
    await nextTick()
    expect(h.outerClicks).toBe(0)
  })
})
