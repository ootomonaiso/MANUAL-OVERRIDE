/**
 * src/plugins/WebAudioSound.ts
 *
 * WebAudio を使った手続き生成 SFX + BGM シーケンサ。
 * 全メソッドは例外を絶対に投げない。AudioContext が利用できない環境（jsdom 等）では
 * 生成時に _ctx = null に固定し、以降の呼び出しはすべて no-op となる。
 *
 * 音設計:
 *   - SFX: _blip（オシレーター）/ _noise（バッファノイズ）ヘルパーで合成
 *   - BGM: 16ステップシーケンサ、Aマイナー、setInterval + currentTime ベース予約
 *   - ミュート: masterGain を 50ms でランプ
 */

import type { SoundHooks } from './SoundManager'
import { SOUND } from '../data/tunables'

// AudioContext の型（webkit 互換を含む）
type AudioCtxCtor = new () => AudioContext

function _getAudioContextCtor(): AudioCtxCtor | null {
  const Ctor = (globalThis as unknown as { AudioContext?: AudioCtxCtor }).AudioContext
    ?? (globalThis as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext
  return Ctor ?? null
}

interface NoiseBuffer {
  data: Float32Array
  length: number
}

/** 指定長さ（秒）の白ノイズバッファを生成 */
function _createNoiseBuffer(ctx: AudioContext, durationSec: number): NoiseBuffer {
  const length = Math.round(ctx.sampleRate * durationSec)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return { data, length }
}

export class WebAudioSound implements SoundHooks {
  private _ctx: AudioContext | null = null
  private _masterGain: GainNode | null = null
  private _sfxGain: GainNode | null = null
  private _bgmGain: GainNode | null = null
  private _noiseBuf: NoiseBuffer | null = null
  private _bgmTimer: ReturnType<typeof setInterval> | null = null
  private _bgmStep = 0
  private _bgmNextTime = 0
  private _muted = false

  // ─── AudioContext 遅延生成 ──────────────────────────────────────
  private _ensureCtx(): AudioContext | null {
    if (this._ctx) return this._ctx
    const Ctor = _getAudioContextCtor()
    if (!Ctor) {
      // AudioContext 不可 → no-op 固定
      return null
    }
    try {
      const ctx = new Ctor()
      // ユーザー操作後のフックからは resume() が成功する見込み。
      ctx.resume().catch(() => { /* no-op */ })
      this._initChains(ctx)
      this._ctx = ctx
      return ctx
    } catch {
      return null
    }
  }

  private _initChains(ctx: AudioContext): void {
    const master = ctx.createGain()
    master.gain.value = SOUND.masterVolume
    master.connect(ctx.destination)

    const sfx = ctx.createGain()
    sfx.gain.value = SOUND.sfxVolume
    sfx.connect(master)

    const bgm = ctx.createGain()
    bgm.gain.value = SOUND.bgmVolume
    bgm.connect(master)

    this._masterGain = master
    this._sfxGain = sfx
    this._bgmGain = bgm
    this._noiseBuf = _createNoiseBuffer(ctx, 0.5)

    // localStorage からミュート状態を復元
    try {
      const saved = localStorage.getItem(SOUND.muteStorageKey)
      if (saved === 'true') {
        this._muted = true
        master.gain.value = 0
      }
    } catch {
      // localStorage 不可環境は無視
    }
  }

  // ─── ヘルパー: ブレップ（短音） ──────────────────────────────────
  private _blip(
    frequency: number,
    type: OscillatorType,
    durationMs: number,
    volume: number,
    frequencyEnd?: number,
  ): void {
    const ctx = this._ensureCtx()
    if (!ctx || !this._sfxGain) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      const t = ctx.currentTime
      osc.frequency.setValueAtTime(frequency, t)
      if (frequencyEnd !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(frequencyEnd, 20), t + durationMs / 1000,
        )
      }
      gain.gain.setValueAtTime(volume, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + durationMs / 1000)
      osc.connect(gain)
      gain.connect(this._sfxGain)
      osc.start(t)
      osc.stop(t + durationMs / 1000 + 0.01)
    } catch {
      // 例外を絶対に外に出さない
    }
  }

  private _noise(durationMs: number, volume: number, filterFreq?: number): void {
    const ctx = this._ensureCtx()
    if (!ctx || !this._sfxGain || !this._noiseBuf) return
    try {
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, this._noiseBuf.length, ctx.sampleRate)
      src.buffer.getChannelData(0).set(this._noiseBuf.data)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(volume, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000)

      src.connect(gain)
      if (filterFreq) {
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = filterFreq
        filter.Q.value = 1
        gain.connect(filter)
        filter.connect(this._sfxGain)
      } else {
        gain.connect(this._sfxGain)
      }
      src.start(ctx.currentTime)
      src.stop(ctx.currentTime + durationMs / 1000 + 0.01)
    } catch {
      // no-op
    }
  }

  // ─── SFX レシピ ─────────────────────────────────────────────────
  onJump(): void {
    this._blip(300, 'triangle', 80, 0.5, 500)
  }

  onLand(): void {
    this._noise(60, 0.3)
    this._blip(150, 'sine', 50, 0.3)
  }

  onShoot(): void {
    this._blip(900, 'square', 60, 0.35, 300)
  }

  onHit(): void {
    this._noise(150, 0.4)
    this._blip(100, 'sine', 120, 0.4)
  }

  onDeath(): void {
    this._blip(400, 'sawtooth', 500, 0.3, 60)
    this._noise(300, 0.15)
  }

  onGenreLock(_genreId: string): void {
    // 3 音のファンファーレ（440/554/659 Hz、各 120ms 順次）
    const ctx = this._ensureCtx()
    if (!ctx || !this._sfxGain) return
    try {
      const freqs = [440, 554, 659]
      const sfx = this._sfxGain
      if (!sfx) return
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        const t = ctx.currentTime + i * 0.13
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.2, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
        osc.connect(gain)
        gain.connect(sfx)
        osc.start(t)
        osc.stop(t + 0.13)
      })
    } catch {
      // no-op
    }
  }

  onChoiceReveal(): void {
    // 2 音の「ページめくり」（ノイズ 80ms × 2、間 90ms）
    this._noise(80, 0.2)
    setTimeout(() => {
      this._noise(80, 0.15)
    }, 90)
  }

  onChoiceSelect(): void {
    this._blip(660, 'sine', 60, 0.4)
  }

  onThrowStart(): void {
    this._blip(200, 'sine', 300, 0.4, 800)
  }

  onThrowLand(): void {
    this._noise(200, 0.3)
    this._blip(80, 'sine', 150, 0.3)
  }

  onBeat(_bpm: number): void {
    // ハイハット風ノイズ 40ms（bpm は音設計に使用しない。呼び出し頻度で刻む）
    this._noise(40, 0.12)
  }

  onCombo(count: number): void {
    // 矩形波、基本 440Hz + count × 12Hz（上限 1500Hz）、50ms
    const freq = Math.min(440 + count * 12, 1500)
    this._blip(freq, 'square', 50, 0.25)
  }

  onMilestone(_distance: number): void {
    // 2 音（523→784Hz、各 100ms）
    const ctx = this._ensureCtx()
    if (!ctx || !this._sfxGain) return
    try {
      const t = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(523, t)
      osc1.frequency.exponentialRampToValueAtTime(784, t + 0.1)
      gain1.gain.setValueAtTime(0.25, t)
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
      osc1.connect(gain1)
      gain1.connect(this._sfxGain)
      osc1.start(t)
      osc1.stop(t + 0.11)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      const t2 = t + 0.12
      osc2.frequency.value = 784
      gain2.gain.setValueAtTime(0.2, t2)
      gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.1)
      osc2.connect(gain2)
      gain2.connect(this._sfxGain)
      osc2.start(t2)
      osc2.stop(t2 + 0.11)
    } catch {
      // no-op
    }
  }

  onNearMiss(): void {
    // 帯域フィルタ付きノイズの「フー」（200ms、周波数スウェプト）
    const ctx = this._ensureCtx()
    if (!ctx || !this._sfxGain || !this._noiseBuf) return
    try {
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, this._noiseBuf.length, ctx.sampleRate)
      src.buffer.getChannelData(0).set(this._noiseBuf.data)

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.Q.value = 3
      const t = ctx.currentTime
      filter.frequency.setValueAtTime(800, t)
      filter.frequency.exponentialRampToValueAtTime(2000, t + 0.2)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.2, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)

      src.connect(filter)
      filter.connect(gain)
      gain.connect(this._sfxGain)
      src.start(t)
      src.stop(t + 0.21)
    } catch {
      // no-op
    }
  }

  // ─── BGM シーケンサ ─────────────────────────────────────────────
  // Aマイナー 16 ステップ:
  //   キック: 0/4/8/12（サイン波 120→40Hz、150ms）
  //   ハイハット: 2/6/10/14（ノイズ 30ms）
  //   ベース: 0=A2, 3=C3, 6=E3, 10=G2
  //   リード: 2小節目ごとに数音（A4/C5/E5 sparse）
  private static readonly BGM_STEPS = 16
  private static readonly BGM_SCHEDULE_MS = 25
  private static readonly BGM_LOOKAHEAD_SEC = 0.12

  startBgm(bpm: number): void {
    this.stopBgmImpl()

    const ctx = this._ensureCtx()
    if (!ctx || !this._bgmGain) return

    // 前回 stopBgmImpl() が linearRampToValueAtTime(0) していたため、
    // 再起動時にゲインを SOUND.bgmVolume へ復元する（さもなくば無音になる）
    this._bgmGain.gain.cancelScheduledValues(ctx.currentTime)
    this._bgmGain.gain.setValueAtTime(SOUND.bgmVolume, ctx.currentTime)

    const stepDurationMs = (60000 / bpm) / WebAudioSound.BGM_STEPS
    this._bgmStep = 0
    this._bgmNextTime = ctx.currentTime + 0.05

    const scheduleStep = () => {
      if (this._bgmTimer === null) return // 停止済み
      const step = this._bgmStep % WebAudioSound.BGM_STEPS

      // キック（ステップ 0/4/8/12）
      if (step % 4 === 0) {
        this._playKick(ctx, this._bgmNextTime)
      }
      // ハイハット（ステップ 2/6/10/14）
      if (step % 4 === 2) {
        this._playHihat(ctx, this._bgmNextTime)
      }
      // ベース
      switch (step) {
        case 0:  this._playBassNote(ctx, this._bgmNextTime, 110)  // A2
          break
        case 3:  this._playBassNote(ctx, this._bgmNextTime, 130.81) // C3
          break
        case 6:  this._playBassNote(ctx, this._bgmNextTime, 164.81) // E3
          break
        case 10: this._playBassNote(ctx, this._bgmNextTime, 98)    // G2
          break
      }
      // リード（2 小節目: ステップ 8, 11, 14 に A4/C5/E5）
      if (this._bgmStep >= WebAudioSound.BGM_STEPS) {
        const measure = Math.floor(this._bgmStep / WebAudioSound.BGM_STEPS)
        if (measure % 2 === 1) {
          const noteStep = step
          if (noteStep === 8)  this._playLeadNote(ctx, this._bgmNextTime, 440)   // A4
          if (noteStep === 11) this._playLeadNote(ctx, this._bgmNextTime, 523.25) // C5
          if (noteStep === 14) this._playLeadNote(ctx, this._bgmNextTime, 659.25) // E5
        }
      }

      // 次ステップの予約時間
      this._bgmNextTime += stepDurationMs / 1000
      this._bgmStep++
    }

    // 先行予約ループ
    this._bgmTimer = setInterval(() => {
      const ctx2 = this._ensureCtx()
      if (!ctx2) return
      while (this._bgmNextTime < ctx2.currentTime + WebAudioSound.BGM_LOOKAHEAD_SEC) {
        scheduleStep()
      }
    }, WebAudioSound.BGM_SCHEDULE_MS)

    // 即座に数ステップ分予約
    for (let i = 0; i < 5; i++) {
      scheduleStep()
    }
  }

  stopBgm(): void {
    this.stopBgmImpl()
    // ファイルベース BGM のフェードアウトは SoundManager.stopBgm() が担当
    // ここでは手続き BGM 専用
  }

  private stopBgmImpl(): void {
    if (this._bgmTimer !== null) {
      clearInterval(this._bgmTimer)
      this._bgmTimer = null
    }
    if (this._bgmGain) {
      try {
        this._bgmGain.gain.linearRampToValueAtTime(0, (this._ctx?.currentTime ?? 0) + 0.15)
      } catch {
        // no-op
      }
    }
    this._bgmStep = 0
  }

  private _playKick(ctx: AudioContext, time: number): void {
    if (!this._bgmGain) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(120, time)
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.15)
      gain.gain.setValueAtTime(0.35, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15)
      osc.connect(gain)
      gain.connect(this._bgmGain)
      osc.start(time)
      osc.stop(time + 0.16)
    } catch {
      // no-op
    }
  }

  private _playHihat(ctx: AudioContext, time: number): void {
    if (!this._bgmGain || !this._noiseBuf) return
    try {
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, this._noiseBuf.length, ctx.sampleRate)
      src.buffer.getChannelData(0).set(this._noiseBuf.data)

      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 6000

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.15, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03)

      src.connect(filter)
      filter.connect(gain)
      gain.connect(this._bgmGain)
      src.start(time)
      src.stop(time + 0.04)
    } catch {
      // no-op
    }
  }

  private _playBassNote(ctx: AudioContext, time: number, freq: number): void {
    if (!this._bgmGain) return
    try {
      const stepDuration = (60 / (SOUND.bgmBpm)) // 1 beat in seconds (approx)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.2, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration)
      osc.connect(gain)
      gain.connect(this._bgmGain)
      osc.start(time)
      osc.stop(time + stepDuration + 0.01)
    } catch {
      // no-op
    }
  }

  private _playLeadNote(ctx: AudioContext, time: number, freq: number): void {
    if (!this._bgmGain) return
    try {
      const stepDuration = (60 / (SOUND.bgmBpm * 2)) // 半分の長さ
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.12, time)
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepDuration * 1.5)
      osc.connect(gain)
      gain.connect(this._bgmGain)
      osc.start(time)
      osc.stop(time + stepDuration * 1.5 + 0.01)
    } catch {
      // no-op
    }
  }

  // ─── ミュート ────────────────────────────────────────────────────
  setMuted(muted: boolean): void {
    this._muted = muted
    try {
      localStorage.setItem(SOUND.muteStorageKey, String(muted))
    } catch {
      // no-op
    }
    if (!this._masterGain || !this._ctx) return
    const target = muted ? 0 : SOUND.masterVolume
    this._masterGain.gain.cancelScheduledValues(this._ctx.currentTime)
    this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, this._ctx.currentTime)
    this._masterGain.gain.linearRampToValueAtTime(target, this._ctx.currentTime + 0.05)
  }

  get muted(): boolean {
    return this._muted
  }

  // ─── P1: 目標達成音（明るい上昇音・3ノートのアセンディング） ──
  onGoalAchieved(): void {
    const ctx = this._ensureCtx()
    if (!ctx || !this._sfxGain) return
    try {
      const freqs = [523, 659, 784] // C5, E5, G5
      const sfx = this._sfxGain
      if (!sfx) return
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        const t = ctx.currentTime + i * 0.1
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.2, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
        osc.connect(gain)
        gain.connect(sfx)
        osc.start(t)
        osc.stop(t + 0.16)
      })
    } catch {
      // no-op
    }
  }

  // ─── P1: 新記録音（ファンファーレ風・短め） ──────────────────
  onRecordUpdate(): void {
    const ctx = this._ensureCtx()
    if (!ctx || !this._sfxGain) return
    try {
      const freqs = [523, 659, 784, 1047] // C5, E5, G5, C6
      const sfx = this._sfxGain
      if (!sfx) return
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        const t = ctx.currentTime + i * 0.12
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.15, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
        osc.connect(gain)
        gain.connect(sfx)
        osc.start(t)
        osc.stop(t + 0.15)
      })
    } catch {
      // no-op
    }
  }

  // ─── P1: スキン選択音（クリック + 短いピッチ） ──────────────
  onSkinSelect(): void {
    this._blip(880, 'sine', 40, 0.3)
    setTimeout(() => {
      this._blip(1100, 'sine', 30, 0.2)
    }, 50)
  }
}
