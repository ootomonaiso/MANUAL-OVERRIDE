/**
 * src/plugins/SfxSound.ts
 *
 * JSON 駆動 SFX 再生専用の WebAudio 実装。
 * BGM シーケンサ・mute・BGM volume 連携は含まない。
 * 全メソッドは例外を絶対に投げない（AudioContext 不可環境では no-op）。
 */

import type { SoundHooks } from './SoundManager'
import { SFX_DEFS } from '../framework/SfxLoader'
import type { SfxFilter, SfxOscTrack, SfxTrack } from '../framework/sfx-types'

// ─── 定数 ────────────────────────────────────────────────────────

const SFX_VOLUME = 0.8
const MASTER_VOLUME = 1.0
const COMBO_STEP_HZ = 12
const COMBO_MAX_FREQ = 1500
const NOISE_BUFFER_SEC = 0.5
const GAIN_FADE_FLOOR = 0.001
const FILTER_SWEEP_SEC = 0.2
const STOP_MARGIN_SEC = 0.01
const MIN_FREQ_HZ = 20

// SFX_DEFS['combo'] の最初の osc track freq から combo base freq を動的に読み取る。
// JSON と TS の暗黙結合を弱めるため。読み取れなければフォールバック値を使用。
const _comboDef = SFX_DEFS['combo']
const _comboOscTrack = _comboDef?.tracks?.[0]
const _comboBaseFreqFromJson = _comboOscTrack && _comboOscTrack.kind === 'osc'
  ? _comboOscTrack.freq
  : undefined
const COMBO_BASE_FREQ = _comboBaseFreqFromJson ?? 440

/**
 * combo count から freqScale を計算する純粋関数。
 * テスト可能かつ実装コピー不要のため、モジュールレベルで export する。
 */
export function computeComboFreqScale(count: number): number {
  if (count <= 0) return 1
  const addedFreq = Math.min(count * COMBO_STEP_HZ, COMBO_MAX_FREQ - COMBO_BASE_FREQ)
  const freqScale = (COMBO_BASE_FREQ + addedFreq) / COMBO_BASE_FREQ
  // freqScale が 1 未満になると再生周波数が COMBO_BASE_FREQ 以下に落ちる（例: base=440 で scale<1 → 440Hz 未満）。
  // WebAudio の osc.frequency は 20Hz 以下で例外を投げるため、440Hz を下限として安全域を確保する。
  if (freqScale < 440 / COMBO_BASE_FREQ) return 440 / COMBO_BASE_FREQ
  return freqScale
}

// ─── AudioContext 取得 ──────────────────────────────────────────

type AudioCtxCtor = new () => AudioContext

function _getAudioContextCtor(): AudioCtxCtor | null {
  const Ctor = (globalThis as unknown as { AudioContext?: AudioCtxCtor }).AudioContext
    ?? (globalThis as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext
  return Ctor ?? null
}

// ─── ノイズバッファ ──────────────────────────────────────────────

interface NoiseBuffer {
  data: Float32Array
  length: number
}

function _createNoiseBuffer(ctx: AudioContext, durationSec: number): NoiseBuffer {
  const length = Math.round(ctx.sampleRate * durationSec)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return { data, length }
}

function _copyNoiseBuffer(ctx: AudioContext, buf: NoiseBuffer): AudioBuffer {
  const buffer = ctx.createBuffer(1, buf.length, ctx.sampleRate)
  buffer.getChannelData(0).set(buf.data)
  return buffer
}

// ─── オーディオノード設定ヘルパ ──────────────────────────────────

function _applyGainEnvelope(
  gain: GainNode,
  volume: number,
  durationSec: number,
  startTime: number,
): void {
  gain.gain.setValueAtTime(volume, startTime)
  gain.gain.exponentialRampToValueAtTime(GAIN_FADE_FLOOR, startTime + durationSec)
}

function _applyFilter(
  filter: BiquadFilterNode,
  spec: SfxFilter,
  startTime: number,
): void {
  filter.type = spec.type
  filter.frequency.setValueAtTime(spec.freq, startTime)
  if (spec.freqEnd !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(spec.freqEnd, MIN_FREQ_HZ), startTime + FILTER_SWEEP_SEC)
  }
  if (spec.q !== undefined) {
    filter.Q.value = spec.q
  }
}

// ─── SfxSound ────────────────────────────────────────────────────

export class SfxSound implements SoundHooks {
  private _ctx: AudioContext | null = null
  private _masterGain: GainNode | null = null
  private _sfxGain: GainNode | null = null
  private _noiseBuf: NoiseBuffer | null = null

  // ─── AudioContext 遅延生成 ────────────────────────────────────

  private _ensureCtx(): AudioContext | null {
    if (this._ctx) return this._ctx
    const Ctor = _getAudioContextCtor()
    if (!Ctor) return null
    try {
      const ctx = new Ctor()
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
    master.gain.value = MASTER_VOLUME
    master.connect(ctx.destination)

    const sfx = ctx.createGain()
    sfx.gain.value = SFX_VOLUME
    sfx.connect(master)

    this._masterGain = master
    this._sfxGain = sfx
    this._noiseBuf = _createNoiseBuffer(ctx, NOISE_BUFFER_SEC)
  }

  // ─── トラック再生 ─────────────────────────────────────────────

  private _playTrack(
    ctx: AudioContext,
    track: SfxTrack,
    freqScale: number,
    delaySec: number,
  ): void {
    const startTime = ctx.currentTime + delaySec
    const sfxGain = this._sfxGain
    if (!sfxGain) return

    if (track.kind === 'osc') {
      this._playOscTrack(ctx, track, freqScale, startTime, sfxGain)
    } else {
      this._playNoiseTrack(ctx, track, startTime, sfxGain)
    }
  }

  private _playOscTrack(
    ctx: AudioContext,
    track: SfxOscTrack,
    freqScale: number,
    startTime: number,
    sfxGain: GainNode,
  ): void {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    const baseFreq = Math.max(track.freq * freqScale, MIN_FREQ_HZ)
    osc.type = track.wave
    osc.frequency.setValueAtTime(baseFreq, startTime)

    if (track.freqEnd !== undefined) {
      const endFreq = Math.max(track.freqEnd * freqScale, MIN_FREQ_HZ)
      osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + track.durationSec)
    }

    _applyGainEnvelope(gain, track.volume, track.durationSec, startTime)

    if (track.filter) {
      const filter = ctx.createBiquadFilter()
      _applyFilter(filter, track.filter, startTime)
      osc.connect(filter)
      filter.connect(gain)
    } else {
      osc.connect(gain)
    }

    gain.connect(sfxGain)
    osc.start(startTime)
    osc.stop(startTime + track.durationSec + STOP_MARGIN_SEC)
  }

  private _playNoiseTrack(
    ctx: AudioContext,
    track: SfxTrack & { kind: 'noise' },
    startTime: number,
    sfxGain: GainNode,
  ): void {
    if (!this._noiseBuf) return

    const source = ctx.createBufferSource()
    const gain = ctx.createGain()

    source.buffer = _copyNoiseBuffer(ctx, this._noiseBuf)

    _applyGainEnvelope(gain, track.volume, track.durationSec, startTime)

    if (track.filter) {
      const filter = ctx.createBiquadFilter()
      _applyFilter(filter, track.filter, startTime)
      source.connect(filter)
      filter.connect(gain)
    } else {
      source.connect(gain)
    }

    gain.connect(sfxGain)
    source.start(startTime)
    source.stop(startTime + track.durationSec + STOP_MARGIN_SEC)
  }

  // ─── 公開 API ─────────────────────────────────────────────────

  /** SFX を再生する。未知 id は PROD 以外で console.warn し安全に return。 */
  playSfx(id: string, freqScale = 1): void {
    if (typeof id !== 'string' || id.length === 0) return

    const def = SFX_DEFS[id]
    if (!def) {
      if (import.meta.env?.PROD) return
      console.warn(`[SfxSound] 未知の SFX id: "${id}"`)
      return
    }

    const ctx = this._ensureCtx()
    if (!ctx) return

    for (let i = 0; i < def.tracks.length; i++) {
      try {
        const track = def.tracks[i]
        const delay = (track.delaySec ?? 0)
        this._playTrack(ctx, track, freqScale, delay)
      } catch {
        // 個別トラックの再生失敗は no-op（volume:0 等での exponentialRampToValueAtTime 例外等対策）
      }
    }
  }

  // ─── SoundHooks 実装 ──────────────────────────────────────────

  // 基本フック（origin/main 由来）
  onJump(): void { this.playSfx('jump') }
  onLand(): void { this.playSfx('land') }
  onShoot(): void { this.playSfx('shoot') }
  onHit(): void { this.playSfx('hit') }
  onDeath(): void { this.playSfx('death') }
  onGenreLock(): void { this.playSfx('genre_lock') }
  onChoiceReveal(): void { this.playSfx('choice_reveal') }
  onChoiceSelect(): void { this.playSfx('choice_select') }
  onThrowStart(): void { this.playSfx('throw_start') }
  onThrowLand(): void { this.playSfx('throw_land') }
  onBeat(): void { this.playSfx('beat') }

  onCombo(count: number): void {
    this.playSfx('combo', computeComboFreqScale(count))
  }

  // SFX 専用フック（design doc 通り）
  onTetrisMove(): void { this.playSfx('tetris_move') }
  onTetrisRotate(): void { this.playSfx('tetris_rotate') }
  onTetrisHardDrop(): void { this.playSfx('tetris_hard_drop') }
  onTetrisLock(): void { this.playSfx('tetris_lock') }
  onLineClear(): void { this.playSfx('line_clear') }
  onPuzzleSlide(): void { this.playSfx('puzzle_slide') }
  onPuzzleClear(): void { this.playSfx('puzzle_clear') }
  onJustHit(): void { this.playSfx('just_hit') }
  onEnemyDestroyed(): void { this.playSfx('enemy_destroyed') }
  onEnemyHit(): void { this.playSfx('enemy_hit') }
  onMeleeAttack(): void { this.playSfx('melee_attack') }
  onMeleeHit(): void { this.playSfx('melee_hit') }
  onDash(): void { this.playSfx('dash') }
  onSlide(): void { this.playSfx('slide') }
  onWallJump(): void { this.playSfx('wall_jump') }
  onItemPickup(): void { this.playSfx('item_pickup') }
  onColorTouch(): void { this.playSfx('color_touch') }
  onTowerFire(): void { this.playSfx('tower_fire') }
  onTimeBonus(): void { this.playSfx('time_bonus') }
  onLevelUp(): void { this.playSfx('level_up') }
  onHungerDamage(): void { this.playSfx('hunger_damage') }
  onBossSpawn(): void { this.playSfx('boss_spawn') }
  onBossDefeated(): void { this.playSfx('boss_defeated') }
  onStealthActivate(): void { this.playSfx('stealth_activate') }
  onShieldAbsorb(): void { this.playSfx('shield_absorb') }
  onManualUpdate(): void { this.playSfx('manual_update') }
  onLearningEffect(): void { this.playSfx('learning_effect') }
  onThrowRelease(): void { this.playSfx('throw_release') }
  onThrowGrab(): void { this.playSfx('throw_grab') }
  onScoreReveal(): void { this.playSfx('score_reveal') }
  onGradeStamp(): void { this.playSfx('grade_stamp') }
  onSurpriseEnding(): void { this.playSfx('surprise_ending') }
  onPauseToggle(): void { this.playSfx('pause_toggle') }
}
