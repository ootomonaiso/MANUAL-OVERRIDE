import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebAudioSound } from '../../src/plugins/WebAudioSound'

/**
 * WebAudioSound 単体テスト
 *
 * (1) AudioContext なし環境で全フック → 例外なし
 * (2) setMuted → muted getter
 * (3) startBgm / stopBgm → 例外なし
 * (4) ミニマル stub 環境で SFX 発音 → 例外なし
 */

// ─── AudioContext スタブ ─────────────────────────────────────────
function _createStubCtx() {
  const gainNodes: GainNode[] = []
  const oscillators: OscillatorNode[] = []
  const bufferSources: AudioBufferSourceNode[] = []
  const currentTime = { value: 0 }

  const stub: Partial<AudioContext> = {
    sampleRate: 44100,
    destination: {} as AudioNode,
    get currentTime() { return currentTime.value },
    createGain: () => {
      const g = {
        gain: { value: 0.5, linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
        connect: vi.fn(),
      } as unknown as GainNode
      gainNodes.push(g)
      return g
    },
    createOscillator: () => {
      const o = {
        type: 'sine' as OscillatorType,
        frequency: { value: 440, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      } as unknown as OscillatorNode
      oscillators.push(o)
      return o
    },
    createBufferSource: () => {
      const b = {
        buffer: null as AudioBuffer | null,
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      } as unknown as AudioBufferSourceNode
      bufferSources.push(b)
      return b
    },
    createBuffer: (_channels: number, _length: number, _rate: number) => ({
      getChannelData: () => new Float32Array(100),
    }) as AudioBuffer,
    createBiquadFilter: () => ({
      type: 'bandpass' as BiquadFilterType,
      frequency: { value: 1000, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      Q: { value: 1 },
      connect: vi.fn(),
    }) as BiquadFilterNode,
    resume: vi.fn().mockResolvedValue(undefined),
  }
  return { stub, gainNodes, oscillators, bufferSources, currentTime }
}

describe('WebAudioSound', () => {
  let origAudioContext: typeof AudioContext | undefined

  beforeEach(() => {
    origAudioContext = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext
  })

  afterEach(() => {
    // 元に戻す
    if (origAudioContext === undefined) {
      delete (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext
    } else {
      (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext = origAudioContext
    }
  })

  it('(1) AudioContext なし環境で全フック呼び出し → 例外なし', () => {
    delete (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext
    delete (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    const s = new WebAudioSound()
    // 全フックを呼んでも例外は投げない
    expect(() => s.onJump()).not.toThrow()
    expect(() => s.onLand()).not.toThrow()
    expect(() => s.onShoot()).not.toThrow()
    expect(() => s.onHit()).not.toThrow()
    expect(() => s.onDeath()).not.toThrow()
    expect(() => s.onGenreLock('stg')).not.toThrow()
    expect(() => s.onChoiceReveal()).not.toThrow()
    expect(() => s.onChoiceSelect()).not.toThrow()
    expect(() => s.onThrowStart()).not.toThrow()
    expect(() => s.onThrowLand()).not.toThrow()
    expect(() => s.onBeat(120)).not.toThrow()
    expect(() => s.onCombo(5)).not.toThrow()
    expect(() => s.onMilestone(500)).not.toThrow()
    expect(() => s.onNearMiss()).not.toThrow()
    expect(() => s.startBgm(120)).not.toThrow()
    expect(() => s.stopBgm()).not.toThrow()
    expect(() => s.setMuted(true)).not.toThrow()
    expect(s.muted).toBe(true) // setMuted は内部フラグを更新（AudioContext 有無に関わらず）
    s.setMuted(false)
    expect(s.muted).toBe(false)
  })

  it('(2) setMuted(true) → muted === true, setMuted(false) → false', () => {
    // localStorage をモック
    const store: Record<string, string> = {}
    vi.spyOn(localStorage, 'getItem').mockImplementation((k: string) => store[k] ?? null)
    vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => { store[k] = v })

    const s = new WebAudioSound()
    s.setMuted(true)
    expect(s.muted).toBe(true)
    s.setMuted(false)
    expect(s.muted).toBe(false)
  })

  it('(3) startBgm(120) / stopBgm() → 例外なし（AudioContext なし）', () => {
    delete (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext
    delete (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    const s = new WebAudioSound()
    expect(() => s.startBgm(120)).not.toThrow()
    expect(() => s.stopBgm()).not.toThrow()
  })

  it('(4) ミニマル AudioContext stub で SFX 発音 → 例外なし', () => {
    const { stub } = _createStubCtx()
    ;(globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext = stub as unknown as typeof AudioContext

    const s = new WebAudioSound()
    expect(() => s.onJump()).not.toThrow()
    expect(() => s.onLand()).not.toThrow()
    expect(() => s.onShoot()).not.toThrow()
    expect(() => s.onHit()).not.toThrow()
    expect(() => s.onDeath()).not.toThrow()
    expect(() => s.onGenreLock('stg')).not.toThrow()
    expect(() => s.onChoiceReveal()).not.toThrow()
    expect(() => s.onChoiceSelect()).not.toThrow()
    expect(() => s.onThrowStart()).not.toThrow()
    expect(() => s.onThrowLand()).not.toThrow()
    expect(() => s.onBeat(120)).not.toThrow()
    expect(() => s.onCombo(10)).not.toThrow()
    expect(() => s.onMilestone(500)).not.toThrow()
    expect(() => s.onNearMiss()).not.toThrow()
    expect(() => s.startBgm(120)).not.toThrow()
    expect(() => s.stopBgm()).not.toThrow()
  })
})
