/**
 * framework/types.ts
 * ManualDeck JSON ファイルのスキーマ定義。
 * src/data/manuals/*.json はこの型に従って書く。
 */

import type { GenreParams, GenreId, ScrollDirection, EnvironmentId, ManualRuntimeConfig, LearningRule } from '../domain/types'

// ManualRuntimeConfig は domain/types.ts から再エクスポートして JSON 定義側でも使いやすくする
export type { ManualRuntimeConfig }

// ──────────────────────────────────────────────────────────────────────
// JSON ファイル形式（1ファイル = 1ブランチ or ルートデッキ）
// ──────────────────────────────────────────────────────────────────────
export interface ManualDeckFile {
  /** このファイルの識別子（ファイル名と合わせると分かりやすい） */
  id: string

  /** 開発者向けメモ */
  description?: string

  /**
   * エントリーリスト。各エントリーが1つのバージョン（マップキー）に対応。
   * key を省略すると version の値がキーになる。
   */
  entries: ManualEntryJSON[]
}

// ──────────────────────────────────────────────────────────────────────
// PhysicsOverride — 1バージョン中だけ変えたい物理値
// ──────────────────────────────────────────────────────────────────────
export interface PhysicsOverride {
  /** ジャンプ初速 px/s（負 = 上方向。デフォルト -680） */
  jumpVelocity?: number
  /** 早離し時の速度倍率（0〜1、小さいほど低ジャンプ。デフォルト 0.42） */
  jumpCutMultiplier?: number
  /** 重力 px/s²（デフォルト 1800） */
  gravity?: number
  /** 落下時の重力倍率（デフォルト 1.75） */
  fallGravityMult?: number
  /** 走行速度 px/s（デフォルト 240） */
  runSpeed?: number
  /** slow_precise 時の速度倍率（デフォルト 0.45） */
  slowPreciseRatio?: number
  /** コヨーテタイムフレーム数（デフォルト 9） */
  coyoteFrames?: number
  /** ジャンプバッファフレーム数（デフォルト 10） */
  jumpBufferFrames?: number
}

// ──────────────────────────────────────────────────────────────────────
// SpawnConfigOverride — 1バージョン中だけ変えたいスポーン設定
// ──────────────────────────────────────────────────────────────────────
export interface SpawnConfigOverride {
  /** スポーン間隔のベース距離 px（デフォルト 2400） */
  baseInterval?: number
  /** スポーン間隔の最小値 px（デフォルト 620） */
  minInterval?: number
  /** スポーン間隔の距離減衰率（デフォルト 0.00022） */
  decayRate?: number
  /** アイテムドロップ確率 0〜1（デフォルト 0.38） */
  itemDropChance?: number
  /** enemy_hp 時のHP（デフォルト 3） */
  enemyHpAmount?: number
  /** float placement の浮遊振幅 px（デフォルト 14） */
  floatAmp?: number
}

// ──────────────────────────────────────────────────────────────────────
// ShootOverride — シュート挙動の上書き
// ──────────────────────────────────────────────────────────────────────
export interface ShootOverride {
  /** 弾速 px/s（デフォルト 900） */
  bulletSpeed?: number
  /** 連射クールダウン 秒（デフォルト 0.18） */
  shotCooldown?: number
  /** コンボリセット時間 秒（デフォルト 2.5） */
  comboResetTime?: number
  /** 1キルのベーススコア（デフォルト 120） */
  baseScorePerKill?: number
  /** 三方向弾を強制有効 / 無効にする（省略 = feature フラグ依存） */
  forceThreeWay?: boolean
}

// ──────────────────────────────────────────────────────────────────────
// ManualStyleOverride — 説明書UIのビジュアル上書き
// ──────────────────────────────────────────────────────────────────────
export interface ManualStyleOverride {
  /** 本文フォント（CSS font-family 形式） */
  fontFamily?: string
  /** アクセントカラー（ヘッダー・ボーダーなど） */
  accentColor?: string
  /** 紙の背景色 */
  paperColor?: string
  /** 本文テキスト色 */
  textColor?: string
  /** 枠線色 */
  borderColor?: string
  /** ヘッダー文字色 */
  headerTextColor?: string
  /** 差分追加テキストの色 */
  diffAddColor?: string
  /** 差分削除テキストの色 */
  diffRemoveColor?: string
  /** 説明書のbox-shadow（CSS shadow 形式） */
  boxShadow?: string
  /** 説明書の角丸半径 px */
  borderRadius?: number
  /** 本文フォントサイズ px */
  fontSize?: number
  /** 行間倍率 */
  lineHeight?: number
}

// ──────────────────────────────────────────────────────────────────────
// RuntimeOverrides — ゲームの実行時パラメータの上書き（1バージョン単位）
// ──────────────────────────────────────────────────────────────────────
export interface RuntimeOverrides {
  /** スクロール速度 px/s（rules.scrollSpeed を上書き） */
  scrollSpeed?: number
  /** 重力 px/s²（rules.gravity を上書き） */
  gravity?: number
  /** BPM（rules.bpm を上書き、rhythm ジャンル用） */
  bpm?: number
  /** このバージョン期間中、ジャンルを強制固定する */
  forceGenreId?: GenreId
  /** スクロール方向（'horizontal' | 'vertical' | 'none'） */
  scrollDirection?: ScrollDirection
  /** 環境設定（背景・スポーンテーブルに影響） */
  environment?: EnvironmentId
  /** 最大HP（hp Feature 有効時。デフォルト 3） */
  playerMaxHp?: number
  /** 時間スケール（1.0=通常、<1 でスロー） */
  timescale?: number
  /** color_touch 時の1タッチスコア上書き */
  colorTouchScore?: number
  /** 物理の細部上書き */
  physics?: PhysicsOverride
  /** スポーン設定の上書き */
  spawn?: SpawnConfigOverride
  /** シュート挙動の上書き */
  shoot?: ShootOverride
}

// ──────────────────────────────────────────────────────────────────────
// ManualEntryJSON
// ──────────────────────────────────────────────────────────────────────
export interface ManualEntryJSON {
  /** MANUAL_DECK のキー（省略すると version の値を使用） */
  key?: string

  /** 説明書ヘッダーに表示するバージョン文字列 */
  version: string

  /** 説明書本文（行ごと） */
  manualText: string[]

  /**
   * イラスト画像。
   * - public/manuals/ に配置したファイル名を指定: "v1_0_illustration.png"
   * - フルパス指定も可: "/manuals/v1_0_illustration.png"
   * - 省略可（画像なし）
   */
  image?: string

  /** 画像の代替テキスト（アクセシビリティ用） */
  imageAlt?: string

  /** 危険/安全色の定義 */
  hazards?: {
    colors?: string[]
    safeColors?: string[]
  }

  /**
   * このバージョン中だけ有効なゲームパラメータ上書き。
   * 次のバージョンへ移行すると解除される。
   */
  runtimeOverrides?: RuntimeOverrides

  /**
   * 説明書UIのビジュアル上書き。
   * ジャンルが近づくにつれてフォントや色を変えるのに使う。
   */
  style?: ManualStyleOverride

  /**
   * チュートリアルヒントテキスト。
   * ゲーム画面の目立つ位置に一時表示する短い説明。
   * 省略可。
   */
  tutorialHint?: string

  /**
   * バージョン切替演出に表示するナラティブテキスト。
   * ManualPanel の差分アニメ前に1〜2行が画面中央にフェードイン表示される。
   * 省略可。
   */
  narrative?: string

  /**
   * 2択（空配列 or 省略 = 末端 → ジャンル収束）
   */
  choices?: ChoiceJSON[]

  /**
   * プレイヤー行動に基づいた自動ルール更新（省略可）。
   * id と triggered は省略可（ローダが JSON から直接マッピングする）。
   */
  learningRules?: LearningRule[]

  /** プール選択用: ジャンルごとの親和性（0〜1） */
  genreAffinity?: Record<string, number>
  /** プール選択用: 表示可能な最小 updateIndex */
  minUpdateIndex?: number
  /** プール選択用: 表示可能な最大 updateIndex */
  maxUpdateIndex?: number
  /** プール選択用: 選択肢を借用するチェーンバージョンのキー */
  chainKey?: string
}

// ──────────────────────────────────────────────────────────────────────
// ChoiceDisplayStyle — 選択ボタンの見た目カスタマイズ
// ──────────────────────────────────────────────────────────────────────
export interface ChoiceDisplayStyle {
  /** ボタン背景色 */
  color?: string
  /** ボタンテキスト色 */
  textColor?: string
  /** ボタン枠線色 */
  borderColor?: string
  /** ラベル前に付ける絵文字やアイコン文字 */
  icon?: string
  /** 強調表示フラグ（true = ボーダーを太くするなど） */
  emphasis?: boolean
}

// ──────────────────────────────────────────────────────────────────────
// ChoiceJSON
// ──────────────────────────────────────────────────────────────────────
export interface ChoiceJSON {
  /** プレイヤーに見せるラベル */
  label: string

  /** 選択後に遷移するバージョンキー */
  next: string

  /** ジャンルパラメータへの加算値 */
  genreParams: GenreParams

  /** 内部ID（省略すると自動生成） */
  id?: string

  /** 開発者向けメモ（プレイヤーには非表示） */
  hint?: string

  /**
   * 選択ボタンの見た目上書き。
   * ジャンル方向性のヒントを視覚的に埋め込みたい場合に使う。
   */
  displayStyle?: ChoiceDisplayStyle

  /**
   * この選択がプレイヤーのジャンルパラメータ合計に与える乗数。
   * 1.0 がデフォルト。例: 2.0 にすると genreParams の効果が2倍になる。
   * プレイヤーには見せない。
   */
  paramMultiplier?: number

  /**
   * 選択肢を表示するための条件（将来拡張用）。
   * 現バージョンでは未実装。
   */
  condition?: ChoiceCondition
}

// ──────────────────────────────────────────────────────────────────────
// ChoiceCondition — 選択肢の表示条件（将来拡張用）
// ──────────────────────────────────────────────────────────────────────
export interface ChoiceCondition {
  /** 蓄積ジャンルパラメータのいずれかがこの値以上のとき表示 */
  minGenreParam?: Partial<Record<keyof GenreParams, number>>
  /** 蓄積ジャンルパラメータのいずれかがこの値以下のとき表示 */
  maxGenreParam?: Partial<Record<keyof GenreParams, number>>
  /** 現在のジャンルIDが一致するとき表示 */
  requiredGenre?: GenreId
  /** 現在のジャンルIDが一致しないとき表示 */
  excludedGenre?: GenreId
}
