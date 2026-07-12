import { describe, it, expect, afterEach } from 'vitest'
import { createApp, reactive, nextTick, h, type App } from 'vue'
import ControlsLegend from '../../../src/components/ControlsLegend.vue'
import type { Controls } from '../../../src/domain/types'

const BASE_CONTROLS: Controls = {
  jump: 'Space', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight',
}

interface Harness {
  host: HTMLElement
  app: App
  state: { controls: Controls; features: Set<string>; scrollAxis: 'x' | 'y' }
}

let current: Harness | null = null

function mount(features: string[] = [], scrollAxis: 'x' | 'y' = 'x'): Harness {
  const state = reactive({ controls: { ...BASE_CONTROLS }, features: new Set(features), scrollAxis })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(ControlsLegend, {
      controls: state.controls, features: state.features, scrollAxis: state.scrollAxis,
    }),
  })
  app.mount(host)
  current = { host, app, state }
  return current
}

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
})

function chipTexts(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.legend-chip')].map(e => e.textContent?.replace(/\s+/g, '') ?? '')
}

describe('ControlsLegend', () => {
  it('原点（横スクロール）はジャンプ・左右のみを表示し、縦移動やショットは出さない', () => {
    const { host } = mount([])
    const texts = chipTexts(host)
    expect(texts.some(t => t.includes('ジャンプ'))).toBe(true)
    expect(texts.some(t => t.includes('左移動'))).toBe(true)
    expect(texts.some(t => t.includes('右移動'))).toBe(true)
    expect(texts.some(t => t.includes('ショット'))).toBe(false)
    expect(texts.some(t => t.includes('上移動'))).toBe(false)
    // 初期表示は「変更」ではないので赤注記は付かない
    expect(host.querySelectorAll('.legend-chip.is-new').length).toBe(0)
  })

  it('shoot フィーチャー追加でショット(Z)が赤NEW付きで現れる', async () => {
    const h = mount([])
    h.state.features = new Set(['shoot'])
    await nextTick()
    const shootChip = [...h.host.querySelectorAll('.legend-chip')]
      .find(e => e.textContent?.includes('ショット'))
    expect(shootChip).toBeTruthy()
    expect(shootChip!.textContent).toContain('Z')          // controls.shoot 未設定時の既定キー
    expect(shootChip!.classList.contains('is-new')).toBe(true)  // 変更を赤で注記
  })

  it('scrollAxis=y で上下移動が現れる（vertical_scroll フィーチャー非依存）', async () => {
    // aquatic は scrollDirection:vertical だが vertical_scroll を持たない → scrollAxis で判定
    const h = mount([], 'y')
    const texts = chipTexts(h.host)
    expect(texts.some(t => t.includes('上移動'))).toBe(true)
    expect(texts.some(t => t.includes('下移動'))).toBe(true)
  })

  it('横スクロール中は vertical_scroll があっても上下移動を出さない', () => {
    // scrollAxis=x なら実際に上下は効かないため表示しない
    const { host } = mount(['vertical_scroll'], 'x')
    const texts = chipTexts(host)
    expect(texts.some(t => t.includes('上移動'))).toBe(false)
  })
})
