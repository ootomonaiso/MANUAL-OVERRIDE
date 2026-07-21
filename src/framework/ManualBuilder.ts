/**
 * framework/ManualBuilder.ts
 *
 * TypeScript から型安全にマニュアルバージョンを定義できる Fluent Builder。
 * JSON ファイルの代わりにコードで分岐を追加したい場合に使う。
 *
 * @example
 * ```ts
 * const entry = new ManualBuilder('2.0-special', '2.0')
 *   .text('新しいルールです。')
 *   .image('v2_special.png', '特別版のイラスト')
 *   .hazards({ colors: ['red'], safeColors: ['blue'] })
 *   .choice('高速化する', { tempo: 3 }, '3.0-fast')
 *   .choice('別の方向へ', { range: 2 }, '3.0-other')
 *   .build()
 *
 * // MANUAL_DECK に追加
 * ManualRegistry.add(entry)
 * ```
 */

import type { ManualVersion, Choice, GenreParams, ManualRuntimeConfig } from '../domain/types'


const DEFAULT_HAZARDS = { colors: ['red'], safeColors: ['blue'] }

export class ManualBuilder {
  private readonly _key: string
  private _version: ManualVersion

  /**
   * @param key   MANUAL_DECK のキー（例: '2.0-stg'）
   * @param verLabel  説明書ヘッダーに表示するバージョン番号（例: '2.0'）
   */
  constructor(key: string, verLabel: string) {
    this._key = key
    this._version = {
      version: verLabel,
      manualText: [],
      choices: [],
      hazards: { ...DEFAULT_HAZARDS },
    }
  }

  /** 本文行を1行追加 */
  text(line: string): this {
    this._version.manualText.push(line)
    return this
  }

  /** 本文行を複数まとめて追加 */
  texts(lines: string[]): this {
    this._version.manualText.push(...lines)
    return this
  }

  /**
   * 説明書に差し込むイラストを設定。
   * @param path    public/manuals/ からのファイル名（例: 'v2_stg.png'）
   *                または絶対パス（例: '/manuals/v2_stg.png'）
   * @param alt     代替テキスト
   */
  image(path: string, alt?: string): this {
    // '/' で始まらない場合は public/manuals/ 配下を仮定
    this._version.image = path.startsWith('/') ? path : `/manuals/${path}`
    if (alt) this._version.imageAlt = alt
    return this
  }


  /** 危険/安全色を設定 */
  hazards(h: { colors?: string[]; safeColors?: string[] }): this {
    if (h.colors)      this._version.hazards.colors = h.colors
    if (h.safeColors)  this._version.hazards.safeColors = h.safeColors
    return this
  }

  /**
   * 2択選択肢を1つ追加。
   * @param label       プレイヤーに表示するテキスト
   * @param genreParams ジャンルパラメータへの加算値
   * @param next        選択後に遷移するバージョンキー
   * @param id          内部ID（省略時は自動生成）
   * @param hint        開発者向けメモ
   */
  choice(
    label: string,
    genreParams: GenreParams,
    next: string,
    id?: string,
    hint?: string,
  ): this {
    const choice: Choice = {
      id: id ?? `${this._key}-choice-${this._version.choices.length}`,
      label,
      genreParams,
      next,
      hint,
    }
    this._version.choices.push(choice)
    return this
  }

  /**
   * ゲーム画面に一時表示するチュートリアルヒントを設定する。
   * 新しい操作や重要なルール変更時に短い説明文を出す。
   */
  tutorialHint(hint: string): this {
    this._version.tutorialHint = hint
    return this
  }

  /**
   * バージョン切替演出に表示するナラティブテキストを設定する。
   * ManualPanel の差分アニメ前に画面中央にフェードイン表示される。
   */
  narrative(text: string): this {
    this._version.narrative = text
    return this
  }

  /**
   * このバージョン期間中の runtime 上書き設定を一括適用する。
   * スクロール速度・重力・BPM・環境など細かい調整に使う。
   *
   * @example
   * .runtimeConfig({ scrollSpeed: 320, environment: 'sky' })
   */
  runtimeConfig(config: ManualRuntimeConfig): this {
    this._version.runtimeConfig = { ...this._version.runtimeConfig, ...config }
    return this
  }

  /** [key, ManualVersion] のタプルを返す（ManualRegistry.add() に渡す） */
  build(): [string, ManualVersion] {
    return [this._key, { ...this._version, manualText: [...this._version.manualText] }]
  }
}
