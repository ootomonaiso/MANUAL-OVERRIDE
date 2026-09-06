import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import SkillText from '../../../../src/components/battle/SkillText.vue'
import type { SkillTextToken } from '../../../../src/domain/battle/skillText'

/** skillText.test.ts はトークン生成だけを見ているので、ここではトークン→クラスの写像を固定する */

interface Harness { host: HTMLElement; app: App }
let current: Harness | null = null

function mountText(tokens: SkillTextToken[]): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(SkillText, { tokens }) })
  app.mount(host)
  current = { host, app }
  return current
}

function spans(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.skill-text > span')]
}

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
})

describe('SkillText', () => {
  it('トークンの種別が tok-<type> クラスになる', () => {
    const h = mountText([
      { type: 'plain', text: 'の' },
      { type: 'stat', text: 'STR' },
      { type: 'number', text: '120%' },
    ])
    expect(spans(h.host).map(s => s.className)).toEqual(['tok-plain', 'tok-stat', 'tok-number'])
  })

  it('element トークンだけ属性別のクラスが追加で付く', () => {
    const h = mountText([
      { type: 'element', text: '物理', element: 'physical' },
      { type: 'element', text: '魔法', element: 'magical' },
    ])
    const cls = spans(h.host).map(s => s.className)
    expect(cls[0]).toContain('tok-element')
    expect(cls[0]).toContain('tok-element-physical')
    expect(cls[1]).toContain('tok-element-magical')
  })

  it('element が無いトークンには属性クラスが付かない', () => {
    const h = mountText([{ type: 'plain', text: 'ただの文' }])
    expect(spans(h.host)[0].className).not.toContain('tok-element-')
  })

  it('本文はトークンの順に連結されて読める', () => {
    const h = mountText([
      { type: 'stat', text: 'INT' },
      { type: 'plain', text: 'の' },
      { type: 'number', text: '80%' },
      { type: 'plain', text: 'の' },
      { type: 'element', text: '魔法', element: 'magical' },
      { type: 'plain', text: 'ダメージ' },
    ])
    expect(h.host.querySelector('.skill-text')?.textContent).toBe('INTの80%の魔法ダメージ')
  })

  it('空配列でも殻の span は残る', () => {
    const h = mountText([])
    expect(h.host.querySelector('.skill-text')).not.toBeNull()
    expect(spans(h.host)).toHaveLength(0)
  })
})
