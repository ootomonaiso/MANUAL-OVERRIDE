import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import CategoryListPanel from '../../../../src/components/battle/CategoryListPanel.vue'
import type { CategoryRowView } from '../../../../src/components/battle/CategoryListPanel.vue'
import { useGlossaryPanel } from '../../../../src/composables/useGlossaryPanel'

/**
 * 折りたたみ殻（.panel-toggle / .panel-collapse / .panel-collapse-inner / .panel-body）の
 * 共通化リファクタが控えているため、テキストだけでなくDOMの入れ子構造そのものを固定する。
 */

interface Harness {
  host: HTMLElement
  app: App
  toggles: number
}

let current: Harness | null = null

function makeRow(over: Partial<CategoryRowView> = {}): CategoryRowView {
  return {
    id: 'might',
    label: '剛力',
    color: '#ff8844',
    current: 3,
    threshold: 8,
    maxed: false,
    contributions: [],
    ...over,
  }
}

function mountPanel(rows: CategoryRowView[], collapsed = false): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const harness: Harness = { host, app: null as unknown as App, toggles: 0 }
  const app = createApp({
    render: () => h(CategoryListPanel, {
      rows,
      collapsed,
      onToggleCollapsed: () => { harness.toggles++ },
    }),
  })
  app.mount(host)
  harness.app = app
  current = harness
  return harness
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

beforeEach(() => {
  // useGlossaryPanel はモジュールレベルのシングルトンなので、前のテストの残骸を消してから始める
  const g = useGlossaryPanel()
  g.closeTermPopup()
  g.closeGuide()
  g.activeSectionId.value = null
})

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
})

describe('CategoryListPanel: 殻の構造', () => {
  it('ルートから .panel-body までが決まった順で入れ子になる', () => {
    const h = mountPanel([makeRow()])
    const root = $(h.host, '.category-list-panel')
    expect(root).not.toBeNull()
    expect(root!.children[0].classList.contains('panel-toggle')).toBe(true)

    const collapse = root!.children[1] as HTMLElement
    expect(collapse.classList.contains('panel-collapse')).toBe(true)
    const inner = collapse.children[0] as HTMLElement
    expect(inner.classList.contains('panel-collapse-inner')).toBe(true)
    const body = inner.children[0] as HTMLElement
    expect(body.classList.contains('panel-body')).toBe(true)
    expect(body.querySelector('.category-row')).not.toBeNull()
  })

  it('トグルは button 要素で、開いているときは ▾ が付く', () => {
    const h = mountPanel([makeRow()])
    const toggle = $(h.host, '.panel-toggle') as HTMLButtonElement
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.type).toBe('button')
    expect(textOf(toggle)).toBe('カテゴリ一覧 ▾')
    expect($(h.host, '.category-list-panel')!.classList.contains('collapsed')).toBe(false)
  })

  it('collapsed のときは ▸ とルートの collapsed クラスで示す', () => {
    const h = mountPanel([makeRow()], true)
    expect(textOf($(h.host, '.panel-toggle'))).toBe('カテゴリ一覧 ▸')
    expect($(h.host, '.category-list-panel')!.classList.contains('collapsed')).toBe(true)
  })

  it('collapsed でも中身はDOMに残る（畳むのはCSSのgrid-template-rowsのみ）', () => {
    const h = mountPanel([makeRow(), makeRow({ id: 'guard', label: '守勢' })], true)
    expect($$(h.host, '.panel-body .category-row')).toHaveLength(2)
  })

  it('トグルを押すと toggle-collapsed が飛ぶ（開閉状態は親が持つ）', async () => {
    const h = mountPanel([makeRow()])
    ;($(h.host, '.panel-toggle') as HTMLButtonElement).click()
    await nextTick()
    expect(h.toggles).toBe(1)
    // 自前では畳まない
    expect($(h.host, '.category-list-panel')!.classList.contains('collapsed')).toBe(false)
  })
})

describe('CategoryListPanel: 行の描画', () => {
  it('行ごとに色マーク・用語ラベル・現在値/しきい値が並ぶ', () => {
    const h = mountPanel([makeRow({ color: 'rgb(255, 0, 0)' })])
    const head = $(h.host, '.category-row .row-head')!
    expect((head.querySelector('.row-mark') as HTMLElement).style.background).toBe('rgb(255, 0, 0)')
    expect(textOf(head.querySelector('.row-label'))).toBe('剛力')
    expect(textOf(head.querySelector('.row-frac'))).toBe('3/8')
  })

  it('ラベルは GlossaryTerm で包まれ、押すと用語ポップアップが開く', async () => {
    const h = mountPanel([makeRow({ id: 'combo', label: '連撃' })])
    const term = $(h.host, '.row-label .glossary-term') as HTMLButtonElement
    expect(term).not.toBeNull()
    term.click()
    await nextTick()
    expect(useGlossaryPanel().popupTermId.value).toBe('combo')
  })

  it('現在値は小数を切り捨てて出す', () => {
    const h = mountPanel([makeRow({ current: 3.9, threshold: 8 })])
    expect(textOf($(h.host, '.row-frac'))).toBe('3/8')
  })

  it('maxed の行は row-frac に maxed クラスが付く', () => {
    const h = mountPanel([
      makeRow({ id: 'might', maxed: true }),
      makeRow({ id: 'guard', label: '守勢', maxed: false }),
    ])
    const fracs = $$(h.host, '.row-frac')
    expect(fracs[0].classList.contains('maxed')).toBe(true)
    expect(fracs[1].classList.contains('maxed')).toBe(false)
  })

  it('行数ぶんだけ .category-row が並ぶ', () => {
    const rows = ['vitality', 'guard', 'might'].map((id, i) => makeRow({ id: id as CategoryRowView['id'], label: `c${i}` }))
    const h = mountPanel(rows)
    expect($$(h.host, '.category-row')).toHaveLength(3)
  })
})

describe('CategoryListPanel: 内訳の開閉', () => {
  const contributed = (): CategoryRowView => makeRow({
    id: 'might',
    contributions: [
      { id: 'skill_a', label: '一撃', amount: 2 },
      { id: 'skill_b', label: '猛進', amount: 1.8 },
    ],
  })

  it('初期状態では内訳は閉じている', () => {
    const h = mountPanel([contributed()])
    expect($(h.host, '.row-breakdown')).toBeNull()
    expect($(h.host, '.row-frac')!.classList.contains('open')).toBe(false)
  })

  it('数字を押すと内訳が開き、貢献が名前と +量 で並ぶ', async () => {
    const h = mountPanel([contributed()])
    ;($(h.host, '.row-frac') as HTMLButtonElement).click()
    await nextTick()
    expect($(h.host, '.row-frac')!.classList.contains('open')).toBe(true)
    const items = $$(h.host, '.row-breakdown .breakdown-item')
    expect(items).toHaveLength(2)
    expect(textOf(items[0].querySelector('.breakdown-label'))).toBe('一撃')
    expect(textOf(items[0].querySelector('.breakdown-amount'))).toBe('+2')
    // 貢献量も切り捨て
    expect(textOf(items[1].querySelector('.breakdown-amount'))).toBe('+1')
  })

  it('内訳は .category-row の中（.row-head の次）に出る', async () => {
    const h = mountPanel([contributed()])
    ;($(h.host, '.row-frac') as HTMLButtonElement).click()
    await nextTick()
    const row = $(h.host, '.category-row')!
    expect(row.children[0].classList.contains('row-head')).toBe(true)
    expect(row.children[1].classList.contains('row-breakdown')).toBe(true)
  })

  it('もう一度押すと閉じる', async () => {
    const h = mountPanel([contributed()])
    const frac = $(h.host, '.row-frac') as HTMLButtonElement
    frac.click()
    await nextTick()
    ;($(h.host, '.row-frac') as HTMLButtonElement).click()
    await nextTick()
    expect($(h.host, '.row-breakdown')).toBeNull()
  })

  it('別の行を開くと前の行は閉じる（同時に開くのは1行だけ）', async () => {
    const h = mountPanel([
      contributed(),
      makeRow({ id: 'guard', label: '守勢', contributions: [{ id: 'x', label: '盾', amount: 1 }] }),
    ])
    ;($$(h.host, '.row-frac')[0] as HTMLButtonElement).click()
    await nextTick()
    ;($$(h.host, '.row-frac')[1] as HTMLButtonElement).click()
    await nextTick()
    expect($$(h.host, '.row-breakdown')).toHaveLength(1)
    expect($$(h.host, '.category-row')[1].querySelector('.row-breakdown')).not.toBeNull()
  })

  it('貢献が空の行は専用の一文を出す', async () => {
    const h = mountPanel([makeRow({ contributions: [] })])
    ;($(h.host, '.row-frac') as HTMLButtonElement).click()
    await nextTick()
    expect(textOf($(h.host, '.breakdown-empty'))).toBe('まだ何も貢献していません')
    expect($(h.host, '.breakdown-item')).toBeNull()
  })
})
