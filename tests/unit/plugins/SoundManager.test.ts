import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { soundManager } from '../../../src/plugins/SoundManager'
import type { BgmConfig } from '../../../src/domain/types'

/**
 * SoundManager.playBgm 耐障害性テスト（#262）
 *
 * 音源ファイルが存在しない場合でも、例外でクラッシュせず
 * console.warn を出して無音で継続することを確認する。
 *
 * happy-dom 環境では Audio コンストラクタが利用可能だが、
 * 実際のファイル読み込みは行われないため、error イベントを
 * 手動でトリガーしてフォールバック経路をテストする。
 */
describe('SoundManager playBgm 耐障害性 (#262)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let originalAudioCtor: typeof Audio

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    originalAudioCtor = (globalThis as unknown as { Audio: typeof Audio }).Audio
  })

  afterEach(() => {
    warnSpy.mockRestore()
    soundManager.stopBgm(0)
    // globalThis.Audio を復元
    ;(globalThis as unknown as { Audio: typeof Audio }).Audio = originalAudioCtor
  })

  it('error イベント即時発火時に console.warn が呼ばれる', () => {
    // Audio をモック: error イベントを同期的に発火
    const mockAudio = {
      loop: false,
      volume: 0,
      src: '',
      pause: () => {},
      play: () => Promise.resolve(),
      addEventListener: (type: string, handler: () => void) => {
        if (type === 'error') handler()
      },
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as HTMLAudioElement

    const MockAudio = function (this: HTMLAudioElement, src: string) {
      Object.assign(this, mockAudio)
      Object.defineProperty(this, 'src', { set: (v: string) => { mockAudio.src = v } })
    } as unknown as new (src: string) => HTMLAudioElement

    ;(globalThis as unknown as { Audio: typeof Audio }).Audio = MockAudio

    expect(() => {
      soundManager.playBgm({ src: 'bgm/nonexistent.ogg' })
    }).not.toThrow()

    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls.some(call =>
      typeof call[0] === 'string' && call[0].includes('[SoundManager]'),
    )).toBe(true)
  })

  it('正常な BgmConfig で再生試行ができる（引数伝搬確認）', () => {
    const mockAudio = {
      loop: false,
      volume: 0,
      src: '',
      pause: () => {},
      play: () => Promise.resolve(),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as HTMLAudioElement

    const MockAudio = function (this: HTMLAudioElement, src: string) {
      Object.assign(this, mockAudio)
      Object.defineProperty(this, 'src', { set: (v: string) => { mockAudio.src = v } })
    } as unknown as new (src: string) => HTMLAudioElement

    ;(globalThis as unknown as { Audio: typeof Audio }).Audio = MockAudio

    const config: BgmConfig = {
      src: 'bgm/test.ogg',
      loop: true,
      volume: 0.3,
      fadeInMs: 500,
    }

    expect(() => soundManager.playBgm(config)).not.toThrow()
  })

  it('存在しない音源パスでも例外を出さず warn して無音で継続する', async () => {
    // Audio をモック: error イベントを非同期的に発火（ファイル不存在をシミュレート）
    let errorCallback: (() => void) | null = null
    const mockAudio = {
      loop: false,
      volume: 0,
      src: '',
      pause: () => {},
      play: () => Promise.resolve(),
      addEventListener: (type: string, handler: () => void) => {
        if (type === 'error') errorCallback = handler
      },
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as HTMLAudioElement

    const MockAudio = function (this: HTMLAudioElement, src: string) {
      Object.assign(this, mockAudio)
      Object.defineProperty(this, 'src', { set: (v: string) => { mockAudio.src = v } })
      queueMicrotask(() => errorCallback?.())
    } as unknown as new (src: string) => HTMLAudioElement

    ;(globalThis as unknown as { Audio: typeof Audio }).Audio = MockAudio

    expect(() => {
      soundManager.playBgm({ src: 'bgm/nonexistent.ogg' })
    }).not.toThrow()

    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalled()
    }, { timeout: 1000 })
  })
})
