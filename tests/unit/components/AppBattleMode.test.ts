import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { createApp, h, nextTick, type App as VueApp } from 'vue'
import App from '../../../src/App.vue'

/**
 * App.vue における rpg 戦闘モードの結線を検証する（docs/genre/rpg/01-architecture.md）。
 *
 * rpg は Canvas を止めてメニューUIへ置き換わる唯一のジャンルなので、
 * 「キャンバスを隠す」「HUDを出さない」「説明書とギブアップは残す」「投擲へ繋ぐ」
 * といった分岐は App.vue にしか存在しない。ここを実際にマウントして押さえる。
 */

/** happy-dom には 2D コンテキストがないため、SideScroller が呼ぶ API を無害化する */
function installCanvasStub(): void {
  const NUMERIC_PROPS = new Set(['lineWidth', 'globalAlpha', 'shadowBlur', 'miterLimit', 'lineDashOffset'])
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      const key = String(prop)
      if (key === 'canvas') return {}
      if (NUMERIC_PROPS.has(key)) return 1
      if (key === 'measureText') return () => ({ width: 10 })
      if (key === 'createLinearGradient' || key === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} })
      }
      if (key === 'getImageData') {
        return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
      }
      if (key === 'setTransform' || key === 'getTransform') return () => ({})
      return () => undefined
    },
    set: () => true,
  })
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never
}

interface Harness { host: HTMLElement; app: VueApp }
let current: Harness | null = null

beforeAll(() => { installCanvasStub() })

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
})

function mountApp(): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(App) })
  app.mount(host)
  current = { host, app }
  return current
}

/** デバッグパネルからジャンルを強制してゲームを開始する */
async function startWithGenre(h: Harness, genreId: string | null): Promise<void> {
  if (genreId !== null) {
    const select = h.host.querySelector('.debug-select') as HTMLSelectElement
    select.value = genreId
    select.dispatchEvent(new Event('change'))
    await nextTick()
  }
  ;(h.host.querySelector('.debug-ok') as HTMLButtonElement).click()
  await nextTick()
  await nextTick()
}

function canvasHidden(h: Harness): boolean {
  const canvas = h.host.querySelector('.game-canvas') as HTMLElement
  return canvas.style.display === 'none'
}

describe('App.vue: rpg 戦闘モードへの切り替え', () => {
  it('タイトル画面ではキャンバスも戦闘UIも動いていない', () => {
    const h = mountApp()
    expect(h.host.querySelector('.title-screen')).not.toBeNull()
    expect(h.host.querySelector('.battle-screen')).toBeNull()
  })

  it('rpg を確定すると戦闘UIが出てキャンバスが隠れる', async () => {
    const h = mountApp()
    await startWithGenre(h, 'rpg')
    expect(h.host.querySelector('.battle-screen')).not.toBeNull()
    expect(canvasHidden(h)).toBe(true)
  })

  it('rpg 以外ではキャンバスが表示され、戦闘UIは出ない', async () => {
    const h = mountApp()
    await startWithGenre(h, 'runner')
    expect(h.host.querySelector('.battle-screen')).toBeNull()
    expect(canvasHidden(h)).toBe(false)
  })

  it('戦闘モードでは横スクロール用の HUD と操作ヒントを出さない', async () => {
    const h = mountApp()
    await startWithGenre(h, 'rpg')
    expect(h.host.querySelector('.hud')).toBeNull()
    expect(h.host.querySelector('.control-legend')).toBeNull()
  })

  it('rpg 以外では HUD と操作ヒントが出る（上の検証が空打ちでないこと）', async () => {
    const h = mountApp()
    await startWithGenre(h, 'runner')
    expect(h.host.querySelector('.hud')).not.toBeNull()
    expect(h.host.querySelector('.control-legend')).not.toBeNull()
  })

  it('戦闘モードでも説明書パネルとギブアップボタンは残る', async () => {
    const h = mountApp()
    await startWithGenre(h, 'rpg')
    expect(h.host.querySelector('.manual-panel')).not.toBeNull()
    expect(h.host.querySelector('.giveup-btn')).not.toBeNull()
  })

  it('戦闘UIは戦闘の初期状態を描画している', async () => {
    const h = mountApp()
    await startWithGenre(h, 'rpg')
    expect(h.host.querySelectorAll('.char-frame').length).toBeGreaterThanOrEqual(2)
    expect(h.host.querySelectorAll('.active-skill-bar .skill-slot')).toHaveLength(6)
    expect(h.host.querySelector('.turn-queue-bar')).not.toBeNull()
  })
})

describe('App.vue: 戦闘モードからの終了', () => {
  it('ギブアップすると投擲フェーズへ移る', async () => {
    const h = mountApp()
    await startWithGenre(h, 'rpg')
    ;(h.host.querySelector('.giveup-btn') as HTMLButtonElement).click()
    await nextTick()
    await nextTick()
    expect(h.host.querySelector('.throw-overlay')).not.toBeNull()
  })

  it('投擲中も戦闘UIは背後に残り、キャンバスは隠れたまま', async () => {
    const h = mountApp()
    await startWithGenre(h, 'rpg')
    ;(h.host.querySelector('.giveup-btn') as HTMLButtonElement).click()
    await nextTick()
    await nextTick()
    expect(h.host.querySelector('.battle-screen')).not.toBeNull()
    expect(canvasHidden(h)).toBe(true)
  })

  it('投擲フェーズでは説明書パネルが投擲UIに置き換わる', async () => {
    const h = mountApp()
    await startWithGenre(h, 'rpg')
    ;(h.host.querySelector('.giveup-btn') as HTMLButtonElement).click()
    await nextTick()
    await nextTick()
    expect(h.host.querySelector('.manual-panel')).toBeNull()
  })

  it('rpg 以外のギブアップでも投擲フェーズへ移る（既存動作の維持）', async () => {
    const h = mountApp()
    await startWithGenre(h, 'runner')
    ;(h.host.querySelector('.giveup-btn') as HTMLButtonElement).click()
    await nextTick()
    await nextTick()
    expect(h.host.querySelector('.throw-overlay')).not.toBeNull()
    expect(h.host.querySelector('.battle-screen')).toBeNull()
  })
})
