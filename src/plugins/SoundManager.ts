import type { BgmConfig } from '../domain/types'

export interface SoundHooks {
  onJump(): void
  onLand(): void
  onShoot(): void
  onHit(): void
  onDeath(): void
  onGenreLock(genreId: string): void
  onChoiceReveal(): void
  onChoiceSelect(): void
  onThrowStart(): void
  onThrowLand(): void
  onBeat(bpm: number): void
  onCombo(count: number): void

  // P0 ドーパミン: 任意フック（未実装でも no-op）
  onMilestone?(distance: number): void
  onNearMiss?(): void
  startBgm?(bpm: number): void
  stopBgm?(): void
  setMuted?(muted: boolean): void
  readonly muted?: boolean

  // P1: 目標・記録・スキン
  onGoalAchieved?(): void
  onRecordUpdate?(): void
  onSkinSelect?(): void
}

class SoundManager implements SoundHooks {
  private _impl: Partial<SoundHooks> = {}

  // ─── BGM管理 ───────────────────────────────────────────────
  private _bgmAudio: HTMLAudioElement | null = null
  private _cancelFadeIn: (() => void) | null = null
  private _cancelFadeOut: (() => void) | null = null

  /**
   * BGMを再生する。既存BGMはフェードアウトしてから切り替える。
   * 音声ファイルが存在しない場合は静かに失敗する。
   */
  playBgm(config: BgmConfig): void {
    const { src, loop = true, volume = 0.5, fadeInMs = 1200 } = config

    // ファイル BGM 開始時は手続き生成 BGM（WebAudioSound）を停止させ、同時再生を防ぐ
    this._impl.stopBgm?.()

    // 進行中のフェードインをキャンセル
    this._cancelFadeIn?.()
    this._cancelFadeIn = null

    // 既存BGMをフェードアウト（フェードイン/アウトは別タイマーで並走）
    if (this._bgmAudio) {
      const old = this._bgmAudio
      this._cancelFadeOut?.()
      this._cancelFadeOut = this._fade(old, 0, 400, () => {
        old.pause()
        old.src = ''
        this._cancelFadeOut = null
      })
    }

    const audio = new Audio(src)
    audio.loop = loop
    audio.volume = 0
    this._bgmAudio = audio

    audio.play().then(() => {
      this._cancelFadeIn = this._fade(audio, volume, fadeInMs, () => {
        this._cancelFadeIn = null
      })
    }).catch((e: unknown) => {
      console.warn('[SoundManager] BGM の再生に失敗しました:', src, e)
      if (this._bgmAudio === audio) this._bgmAudio = null
    })
  }

  /**
   * BGMをフェードアウトして停止する。
   */
  stopBgm(fadeOutMs = 800): void {
    // 手続き生成 BGM はファイル BGM が無効でも停止する必要がある（早期 return 前に呼ぶ）
    // public/ に BGM ファイルがない環境では _bgmAudio が null だが、WebAudioSound のシーケンサは別経路で動く
    this._impl.stopBgm?.()
    if (!this._bgmAudio) return
    this._cancelFadeIn?.()
    this._cancelFadeIn = null
    const audio = this._bgmAudio
    this._bgmAudio = null
    this._cancelFadeOut?.()
    this._cancelFadeOut = this._fade(audio, 0, fadeOutMs, () => {
      audio.pause()
      audio.src = ''
      this._cancelFadeOut = null
    })
  }

  /** volume を to まで durationMs かけてリニアにフェードし、キャンセル関数を返す */
  private _fade(
    audio: HTMLAudioElement,
    to: number,
    durationMs: number,
    onDone: (() => void) | null,
  ): () => void {
    const STEPS = 20
    const stepMs = durationMs / STEPS
    const from = audio.volume
    const delta = (to - from) / STEPS
    let step = 0

    const timer = window.setInterval(() => {
      step++
      audio.volume = Math.max(0, Math.min(1, from + delta * step))
      if (step >= STEPS) {
        clearInterval(timer)
        audio.volume = to
        onDone?.()
      }
    }, stepMs)

    return () => clearInterval(timer)
  }

  // ─── SEフック ─────────────────────────────────────────────
  register(impl: Partial<SoundHooks>) {
    this._impl = impl
  }

  onJump() { this._impl.onJump?.() }
  onLand() { this._impl.onLand?.() }
  onShoot() { this._impl.onShoot?.() }
  onHit() { this._impl.onHit?.() }
  onDeath() { this._impl.onDeath?.() }
  onGenreLock(genreId: string) { this._impl.onGenreLock?.(genreId) }
  onChoiceReveal() { this._impl.onChoiceReveal?.() }
  onChoiceSelect() { this._impl.onChoiceSelect?.() }
  onThrowStart() { this._impl.onThrowStart?.() }
  onThrowLand() { this._impl.onThrowLand?.() }
  onBeat(bpm: number) { this._impl.onBeat?.(bpm) }
  onCombo(count: number) { this._impl.onCombo?.(count) }

  // P0 ドーパミン: 拡張フック（すべて .optional で安全に no-op）
  onMilestone(distance: number) { this._impl.onMilestone?.(distance) }
  onNearMiss() { this._impl.onNearMiss?.() }
  startBgm(bpm: number) { this._impl.startBgm?.(bpm) }
  setMuted(muted: boolean) { this._impl.setMuted?.(muted) }
  get muted(): boolean { return this._impl.muted ?? false }

  // P1: 目標・記録・スキン
  onGoalAchieved() { this._impl.onGoalAchieved?.() }
  onRecordUpdate() { this._impl.onRecordUpdate?.() }
  onSkinSelect() { this._impl.onSkinSelect?.() }
}

export const soundManager = new SoundManager()
