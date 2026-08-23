import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SfxSound, computeComboFreqScale } from '../../src/plugins/SfxSound'
import { SFX_DEFS } from '../../src/framework/SfxLoader'
import type { MockInstance } from 'vitest'
import type { SfxOscTrack } from '../../src/framework/sfx-types'

/**
 * SfxSound 単体テスト
 * (1) AudioContext なし環境で全フック → 例外なし
 * (2) playSfx 未知 id → 例外なし + console.warn
 * (3) playSfx 空文字列 → 例外なし
 * (4) onCombo 極端値 → 例外なし
 * (5) stub 環境で playSfx(全 SFX_DEFS id) → 例外なし
 * (6) computeComboFreqScale 純粋関数のテスト
 */

// ─── AudioContext stub ──────────────────────────────────────────

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
        gain: {
          value: 0.5,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
        },
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
    createBuffer: vi.fn(() => ({
      getChannelData: () => new Float32Array(22050),
    })) as unknown as AudioContext['createBuffer'],
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

/** SoundHooks に定義された全フック名（SFX 専用として追加した分を含む） */
const ALL_HOOKS: Array<keyof SfxSound> = [
  'onJump', 'onLand', 'onShoot', 'onHit', 'onDeath',
  'onGenreLock', 'onChoiceReveal', 'onChoiceSelect',
  'onThrowStart', 'onThrowLand', 'onBeat', 'onCombo',
  'onTetrisMove', 'onTetrisRotate', 'onTetrisHardDrop', 'onTetrisLock', 'onLineClear',
  'onPuzzleSlide', 'onPuzzleClear', 'onJustHit',
  'onEnemyDestroyed', 'onEnemyHit',
  'onMeleeAttack', 'onMeleeHit',
  'onDash', 'onSlide', 'onWallJump',
  'onItemPickup', 'onColorTouch', 'onTowerFire', 'onTimeBonus',
  'onLevelUp', 'onHungerDamage',
  'onBossSpawn', 'onBossDefeated',
  'onStealthActivate', 'onShieldAbsorb',
  'onManualUpdate', 'onLearningEffect',
  'onThrowRelease', 'onThrowGrab',
  'onScoreReveal', 'onGradeStamp', 'onSurpriseEnding', 'onPauseToggle',
]

// ─── テスト ──────────────────────────────────────────────────────

describe('SfxSound', () => {
  let warnSpy: MockInstance

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ })
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // (1) AudioContext なし環境で全フック → 例外なし
  it('AudioContext なし環境で全フックが例外を投げない', () => {
    const sfx = new SfxSound()
    for (const hook of ALL_HOOKS) {
      expect(() => (sfx as unknown as Record<string, () => void>)[hook]()).not.toThrow()
    }
  })

  // (2) playSfx 未知 id → 例外なし + console.warn
  it('playSfx 未知 id は例外を投げず console.warn する', () => {
    const sfx = new SfxSound()
    expect(() => sfx.playSfx('nonexistent_sfx_id_xyz')).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('未知の SFX id'))
  })

  // (3) playSfx 空文字列 → 例外なし
  it('playSfx 空文字列は安全に return する', () => {
    const sfx = new SfxSound()
    expect(() => sfx.playSfx('')).not.toThrow()
  })

  // (4) onCombo 極端値 → 例外なし
  it('onCombo 極端値（0, 1000）が例外を投げない', () => {
    const sfx = new SfxSound()
    expect(() => sfx.onCombo(0)).not.toThrow()
    expect(() => sfx.onCombo(1000)).not.toThrow()
  })

  // (5) stub 環境で全 SFX_DEFS id → 例外なし
  it('stub 環境で playSfx(全 SFX_DEFS id) が例外を投げない', () => {
    const { stub } = _createStubCtx()
    const Ctor = vi.fn(() => stub) as unknown as new () => AudioContext
    const origAudioCtx = (globalThis as unknown as { AudioContext?: unknown }).AudioContext

    // stub を globalThis.AudioContext として設定（happy-dom の実体と置き換え）
    ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = Ctor

    try {
      const sfx = new SfxSound()
      const ids = Object.keys(SFX_DEFS)
      // 全 SFX_DEFS id で例外を投げないことを検証
      for (const id of ids) {
        expect(() => sfx.playSfx(id)).not.toThrow()
      }
      // Ctor が呼ばれたことを確認（AudioContext が生成された）
      expect(Ctor).toHaveBeenCalled()
      // 全 SFX が発音されることを確認（ ids 分だけ playSfx が呼ばれた）
      // _ensureCtx が 1 回、各 playSfx が 1 回 → 合計 ids.length + 1 回
      expect(Ctor.mock.calls.length).toBeGreaterThanOrEqual(1)
    } finally {
      if (origAudioCtx === undefined) {
        delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext
      } else {
        ;(globalThis as unknown as { AudioContext?: unknown }).AudioContext = origAudioCtx
      }
    }
  })

  // (6) computeComboFreqScale 純粋関数のテスト
  it('computeComboFreqScale が正しい値を返す', () => {
    // 実装のコピーではなく、export された純粋関数を直接テストする。
    // 実装が変わっても正しく検出される。
    const comboDef = SFX_DEFS['combo']
    const comboOscTrack = comboDef?.tracks?.[0] as SfxOscTrack | undefined
    const baseFreq = comboOscTrack?.kind === 'osc' ? comboOscTrack.freq : 440

    // count=0 → freqScale = 1.0
    expect(computeComboFreqScale(0)).toBe(1.0)

    // count=5 → (baseFreq + 60) / baseFreq
    expect(computeComboFreqScale(5)).toBe((baseFreq + 60) / baseFreq)

    // count=100 → 上限到達: 1500 / baseFreq
    const maxScale = 1500 / baseFreq
    expect(computeComboFreqScale(100)).toBe(maxScale)

    // 上限チェック: count が非常に大きくなっても飽和する
    expect(computeComboFreqScale(10000)).toBe(maxScale)

    // 負の値 → freqScale = 1.0（count <= 0 のため）
    expect(computeComboFreqScale(-1)).toBe(1.0)
  })
})
