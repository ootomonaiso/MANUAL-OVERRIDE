import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import BuffStrip from '../../../../src/components/battle/BuffStrip.vue'
import type { BuffEntry } from '../../../../src/components/battle/BuffStrip.vue'

/** isBuff は true / false / undefined の3値分岐で、undefined は矢印もクラスも付かない */

interface Harness { host: HTMLElement; app: App }
let current: Harness | null = null

function mountStrip(entries: BuffEntry[]): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(BuffStrip, { entries }) })
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
function textOf(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
})

describe('BuffStrip', () => {
  it('空なら帯ごと出ない', () => {
    expect($(mountStrip([]).host, '.buff-strip')).toBeNull()
  })

  it('永続（特性）は鍵アイコンを添え、範囲ラベルは出さない', () => {
    const h = mountStrip([
      { id: 'trait_a', label: '鋼の意志', permanent: true, color: 'rgb(1, 2, 3)', scopeLabel: '(3T)' },
    ])
    const item = $(h.host, '.buff-item')!
    expect(textOf(item.querySelector('.buff-lock'))).toBe('🔒')
    expect(item.querySelector('.buff-scope')).toBeNull()
    expect((item.querySelector('.buff-mark') as HTMLElement).style.background).toBe('rgb(1, 2, 3)')
    expect(textOf(item.querySelector('.buff-label'))).toBe('鋼の意志')
  })

  it('上昇は ▲ と buff クラス、低下は ▼ と debuff クラス', () => {
    const h = mountStrip([
      { id: 'up', label: '攻撃上昇', permanent: false, color: '#fff', isBuff: true, scopeLabel: '(このターン)' },
      { id: 'down', label: '防御低下', permanent: false, color: '#fff', isBuff: false, scopeLabel: '(戦闘中)' },
    ])
    const items = $$(h.host, '.buff-item')
    expect(items[0].classList.contains('buff')).toBe(true)
    expect(textOf(items[0].querySelector('.buff-arrow'))).toBe('▲')
    expect(items[0].querySelector('.buff-arrow')!.classList.contains('down')).toBe(false)
    expect(textOf(items[0].querySelector('.buff-scope'))).toBe('(このターン)')

    expect(items[1].classList.contains('debuff')).toBe(true)
    expect(textOf(items[1].querySelector('.buff-arrow'))).toBe('▼')
    expect(items[1].querySelector('.buff-arrow')!.classList.contains('down')).toBe(true)
  })

  it('isBuff 未指定なら矢印もバフ/デバフのクラスも付かない', () => {
    const h = mountStrip([
      { id: 'neutral', label: '状態', permanent: false, color: '#fff', scopeLabel: '(戦闘中)' },
    ])
    const item = $(h.host, '.buff-item')!
    expect(item.querySelector('.buff-arrow')).toBeNull()
    expect(item.classList.contains('buff')).toBe(false)
    expect(item.classList.contains('debuff')).toBe(false)
    expect(textOf(item.querySelector('.buff-scope'))).toBe('(戦闘中)')
  })

  it('永続でも範囲ラベルも無ければ、末尾には何も付かない', () => {
    const h = mountStrip([{ id: 'bare', label: '無印', permanent: false, color: '#fff' }])
    const item = $(h.host, '.buff-item')!
    expect(item.querySelector('.buff-lock')).toBeNull()
    expect(item.querySelector('.buff-scope')).toBeNull()
  })
})
