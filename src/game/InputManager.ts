import type { InputSnapshot } from '../engine/types'
import type { Controls } from '../domain/types'

/**
 * キーボード入力の受付・正規化・エッジ検出を一元管理する。
 * SideScroller から分離することで、入力ロジックを独立してテスト・変更できる。
 */
export class InputManager {
  /** 現在押されているキーのセット */
  readonly keys = new Set<string>()
  /** このフレームで押し始めたキー */
  readonly justPressed = new Set<string>()
  /** このフレームで離したキー */
  readonly justReleased = new Set<string>()

  private prevKeys = new Set<string>()
  private preventKeys: string[] = []

  private readonly _onKeyDown: (e: KeyboardEvent) => void
  private readonly _onKeyUp: (e: KeyboardEvent) => void

  constructor() {
    this._onKeyDown = (e) => {
      const key = InputManager._normalize(e)
      if (key === null) return
      this.keys.add(key)
      if (this.preventKeys.includes(key)) e.preventDefault()
    }
    this._onKeyUp = (e) => {
      const key = InputManager._normalize(e)
      if (key !== null) this.keys.delete(key)
    }
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }

  /** ゲームで使うキーを登録し、ブラウザのデフォルト動作を抑制する */
  setGameKeys(controls: Controls): void {
    this.preventKeys = [
      controls.jump,
      controls.moveLeft,
      controls.moveRight,
      controls.shoot ?? 'z',
      controls.moveUp,
      controls.moveDown,
    ].filter((k): k is string => k !== undefined)
  }

  /** フレームの先頭で呼ぶ。justPressed / justReleased を前フレームとの差分で更新する */
  tick(): void {
    this.justPressed.clear()
    this.justReleased.clear()
    for (const k of this.keys) {
      if (!this.prevKeys.has(k)) this.justPressed.add(k)
    }
    for (const k of this.prevKeys) {
      if (!this.keys.has(k)) this.justReleased.add(k)
    }
    this.prevKeys = new Set(this.keys)
  }

  /** FeatureSystem に渡す InputSnapshot を返す */
  snapshot(): InputSnapshot {
    return { keys: this.keys, justPressed: this.justPressed, justReleased: this.justReleased }
  }

  /** イベントリスナーを解除する（SideScroller.stop() で呼ぶ） */
  dispose(): void {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
  }

  /** IME 変換中キーを除外し、スペース・z を統一表記に正規化する */
  private static _normalize(e: KeyboardEvent): string | null {
    if (e.isComposing || e.key === 'Process') return null
    if (e.key === ' ') return 'Space'
    if (e.key === 'z' || e.key === 'Z') return 'z'
    return e.key
  }
}
