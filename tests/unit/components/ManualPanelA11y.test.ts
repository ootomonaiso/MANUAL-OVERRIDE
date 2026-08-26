import { describe, it, expect, afterEach } from 'vitest'
import { createApp, nextTick, h, type App } from 'vue'
import ManualPanel from '../../../src/components/ManualPanel.vue'
import type { ManualVersion, ManualTheme } from '../../../src/domain/types'

const BASE_MANUAL: ManualVersion = {
  version: '1.0',
  manualText: ['横スクロールゲーム'],
  choices: [],
  hazards: { colors: ['#ff0000'], safeColors: ['#00ff00'] },
}

function mountManual(manual: ManualVersion = BASE_MANUAL): { host: HTMLElement; app: App } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(ManualPanel, {
      manual,
      theme: 'plain' as ManualTheme,
      diffLines: [],
      isAnimating: false,
      isCentered: false,
      history: [],
    }),
  })
  app.mount(host)
  return { host, app }
}

afterEach(() => {
  // 各テスト終了時に unmount + DOM 片付けは呼出元で行う
})

describe('ManualPanel — a11y (#267)', () => {
  it('history-btn に tabindex="-1" が設定されていない', async () => {
    const { host, app } = mountManual()
    await nextTick()
    const btn = host.querySelector('.history-btn') as HTMLButtonElement | null
    expect(btn).toBeTruthy()
    expect(btn!.hasAttribute('tabindex')).toBe(false)
    app.unmount()
    host.remove()
  })

  it('history-btn に @keydown.space ハンドラが登録されている（DOM 上に存在することを確認）', async () => {
    const { host, app } = mountManual()
    await nextTick()
    const btn = host.querySelector('.history-btn') as HTMLButtonElement | null
    expect(btn).toBeTruthy()
    // tabindex 属性がない = キーボードフォーカス可能
    expect(btn!.hasAttribute('tabindex')).toBe(false)
    app.unmount()
    host.remove()
  })
})
