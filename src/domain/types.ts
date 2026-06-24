// ============================================================
// ゲーム全体の型定義
// ============================================================

// ─────────────────────────────────────────────────────────────
// ジャンル分岐の軸パラメータ（12軸）
// choices の genreParams を積み重ねることでジャンルが収束する。
// ─────────────────────────────────────────────────────────────
export type GenreParam =
  | 'tempo'    // スピード・テンポ感（ランナー/リズム/レーシング系）
  | 'range'    // 射程・遠距離立ち回り（STG系）
  | 'enemy'    // 敵密度・戦闘激化（STG/アリーナ/弾幕系）
  | 'combo'    // 連続成功・コンボ重視（パズル/ハックスラッシュ系）
  | 'growth'   // 成長・育成要素（RPG/ダンジョン系）
  | 'rhythm'   // リズム・タイミング精度（リズム/スポーツ系）
  | 'stealth'  // 隠密・接触回避（ステルス/ホラー系）
  | 'vertical' // 縦移動・縦スクロール指向（縦STG/水中系）
  | 'aerial'   // 空中・浮遊・プラットフォーム指向
  | 'survive'  // 耐久・生存優先（サバイバル/ホラー系）
  | 'craft'    // 作成・設置・積み上げ（タワーディフェンス/クラフト/放置系）
  | 'speed'    // 純粋速度・ダッシュ量（レーシング/スポーツ系）

export type GenreParams = Partial<Record<GenreParam, number>>

// ─────────────────────────────────────────────────────────────
// ジャンルID
// 既存: 'base' | 'runner' | 'stg' | 'rpg' | 'puzzle' | 'rhythm' |
//       'aerial_stg' | 'bullet_hell' | 'survival' | 'stealth_action' |
//       'racing' | 'platformer' | 'dungeon' | 'tower_def' | 'sports' |
//       'idle' | 'bullet_runner' | 'arena' | 'aquatic' | 'horror' | 'hack_slash'
// 新規ジャンルは genres.json と Plugin ファイルを追加するだけで拡張可能。
// ─────────────────────────────────────────────────────────────
export type GenreId = string

export type Phase = 'title' | 'tutorialIntro' | 'tutorial' | 'updating' | 'playing' | 'genreLocked' | 'throwing' | 'ending'

// ─────────────────────────────────────────────────────────────
// 説明書テーマ（UIの見た目クラスに対応）
// ─────────────────────────────────────────────────────────────
export type ManualTheme =
  | 'plain'    // 白背景・黒文字（デフォルト）
  | 'stg'      // ドット文字・SFフォント・暗黒背景
  | 'rpg'      // 明朝体・羊皮紙風・枠線
  | 'puzzle'   // モノスペース・グリッド罫線・ライト背景
  | 'rhythm'   // ネオン風・カラフル・アニメ
  | 'horror'   // 崩れた文字・血痕・暗黒
  | 'aquatic'  // 波紋・青緑・滲み

// ─────────────────────────────────────────────────────────────
// スクロール方向・環境
// ─────────────────────────────────────────────────────────────
export type ScrollDirection = 'horizontal' | 'vertical' | 'none'
export type EnvironmentId   =
  | 'ground'    // 地上（デフォルト）
  | 'sky'       // 空（雲・背景変化）
  | 'space'     // 宇宙（星・無重力演出）
  | 'ocean'     // 水中（波紋・青みがかり）
  | 'dungeon'   // ダンジョン（暗闇・松明）
  | 'forest'    // 森（緑・木々）
  | 'city'      // 都市（ビル・夜景）

// ─────────────────────────────────────────────────────────────
// Feature フラグ
// 既存: shoot / three_way / charge_shot / spread_shot / bomb / enemy_hp / boss
//       movement / auto_run / slow_precise / double_jump / long_air / dash /
//       wall_jump / slide / gravity_flip / vertical_scroll
//       hp / exp / item_pickup / shield
//       grid_stop / puzzle_solve
//       beat_hazard / just_input / beat_dash
//       stealth_mode / time_bonus / tower / color_touch
// 新規フィーチャーは FeatureSystem 実装 + systems/index.ts 登録で拡張可能。
// ─────────────────────────────────────────────────────────────
export type FeatureId = string

// ─────────────────────────────────────────────────────────────
// コントロール定義
// ─────────────────────────────────────────────────────────────
export interface Controls {
  jump: string
  moveLeft: string
  moveRight: string
  moveUp?: string    // 縦スクロール上移動
  moveDown?: string  // 縦スクロール下移動
  shoot?: string
  dash?: string    // ダッシュキー（省略可）
  slide?: string   // スライドキー（省略可）
}

// ─────────────────────────────────────────────────────────────
// 説明書 バージョン・選択肢
// ─────────────────────────────────────────────────────────────
export interface Choice {
  id: string
  label: string
  hint?: string      // 開発者メモ（プレイヤーには非表示）
  next: string       // 次バージョンキー
  genreParams: GenreParams
  /** genreParams への乗数。デフォルト 1.0。大きくするとこの選択の重みが増す */
  paramMultiplier?: number
  /**
   * ジャンルへの直接ポイント付与（軸パラメータの代替）。
   * 例: { "stg": 3, "rpg": 1 } → この選択で STG に3点、RPG に1点加算。
   * ジャンル側が `threshold` を持つ場合にこちらが評価される。
   * `genreParams` と併用可（genreParams は軸ベース収束用に残しても良い）。
   */
  genrePoints?: Record<string, number>
}

/**
 * 説明書カード（案2: フラットランダムプール方式）
 * ツリー構造の `next` ポインタを持たず、単体で追加可能な独立したカード。
 * 各ラウンドでプールからランダムに2枚抽出し、プレイヤーが選択する。
 */
export interface ManualCard {
  id: string
  label: string
  manualText: string[]
  genreParams?: GenreParams
  paramMultiplier?: number
  genrePoints?: Record<string, number>
  weight?: number
  hazards?: { colors: string[]; safeColors: string[] }
  runtimeConfig?: ManualRuntimeConfig
  hint?: string
  /** このカードが向かうジャンルID群。選択履歴の傾向と合うとサンプリング重みが上がる */
  genreAffinity?: string[]
  /** 矛盾するカードID群。選択時、対象カードの説明書テキストが取り消し線になる */
  conflictsWith?: string[]
}

/** 説明書バージョンが runtime に適用できる上書き設定 */
export interface ManualRuntimeConfig {
  /** スクロール速度 px/s（RuntimeRules.scrollSpeed を上書き） */
  scrollSpeed?: number
  /** 重力 px/s²（RuntimeRules.gravity を上書き） */
  gravity?: number
  /** BPM（RuntimeRules.bpm を上書き、リズム系で使用） */
  bpm?: number
  /** スクロール方向（'horizontal' = 横、'vertical' = 縦、'none' = 停止） */
  scrollDirection?: ScrollDirection
  /** 環境設定（背景・スポーンテーブルに影響） */
  environment?: EnvironmentId
  /** 最大HP（hp Feature 有効時のみ使用。デフォルト 3） */
  playerMaxHp?: number
  /** 時間スケール（1.0=通常、<1 でスロー、>1 でファスト。デフォルト 1.0） */
  timescale?: number
  /** color_touch 時の1タッチあたりのスコア（デフォルト 200） */
  colorTouchScore?: number
  /** このバージョン期間中ジャンルを強制固定（テスト・演出用） */
  forceGenreId?: GenreId
}

export interface ManualVersion {
  version: string
  manualText: string[]
  /** 説明書に差し込むイラスト（public/manuals/ からの相対パス）。省略可 */
  image?: string
  /** イラストの代替テキスト */
  imageAlt?: string
  choices: Choice[]
  hazards: { colors: string[]; safeColors: string[] }
  /** このバージョン中だけ有効な runtime 上書き */
  runtimeConfig?: ManualRuntimeConfig
  /** ゲーム画面に一時表示するチュートリアルヒント */
  tutorialHint?: string
  /** 選択後の演出テキスト（ManualPanel の差分アニメ前に表示） */
  narrative?: string
  /** プレイヤー行動に基づいた自動ルール更新ルール（省略可） */
  learningRules?: LearningRule[]
}

// ─────────────────────────────────────────────────────────────
// ジャンル定義
// ─────────────────────────────────────────────────────────────
export interface GenreDef {
  id: GenreId
  label: string
  /**
   * 軸パラメータ型の閾値（旧システム）。
   * `threshold` が指定されていない場合にこちらが使われる。
   */
  thresholds: GenreParams
  /**
   * genrePoints 型の収束閾値（新システム）。
   * この値以上の genrePoints が蓄積されるとジャンルが収束する。
   * 指定した場合、`thresholds` の代わりにこちらが評価される。
   */
  threshold?: number
  /**
   * このジャンルに収束するために必要な選択肢 ID のリスト（任意）。
   * 全 ID が選ばれていない限り収束しない。
   * `threshold` と組み合わせて使用する。
   */
  requiredChoices?: string[]
  enableFeatures: FeatureId[]
  disableFeatures: FeatureId[]
  /** 安全パーサで評価するスコア式。変数は ScoreVars のキーを使用 */
  scoreFormula: string
  /** ジャンル確定時に説明書へ出す宣言文 */
  manualReveal: string
  theme: ManualTheme
  /** Canvas 背景色（ジャンルの雰囲気） */
  bgColor: string
  /** 環境設定（このジャンルの舞台）。省略時は 'ground' */
  environment?: EnvironmentId
  /** 操作方法定義。省略時は 'default' */
  controls?: Partial<Controls>
  /** スクロール方向。省略時は 'horizontal' */
  scrollDirection?: ScrollDirection
  /** 重力加速度 px/s²。省略時は 1600。0 で無重力 */
  gravity?: number
  /** エンディングのフレーバーテキスト（EndingPanel に表示） */
  endingFlavor?: string
  /** BGM設定（音声ファイルが存在しない場合はスキップされる） */
  bgm?: BgmConfig
}

/** BGM再生設定 */
export interface BgmConfig {
  /** 音源ファイルのパス（public/ からの相対パス。例: "bgm/stg.ogg"） */
  src: string
  /** ループ再生するか（省略時: true） */
  loop?: boolean
  /** 音量 0〜1（省略時: 0.5） */
  volume?: number
  /** フェードイン時間 ms（省略時: 1200） */
  fadeInMs?: number
}

// ─────────────────────────────────────────────────────────────
// ゲームループが参照する合成済みルール（毎フレーム読み取り専用）
// ─────────────────────────────────────────────────────────────
export interface RuntimeRules {
  controls: Controls
  hazardColors: Set<string>
  safeColors: Set<string>
  features: Set<FeatureId>
  genre: GenreId
  scrollSpeed: number        // px/s
  bpm: number                // リズム系で使用。無関係なら 120
  gravity: number            // px/s²（ジャンル定義 → runtimeConfig → デフォルト 1600 の優先順位で決定）
  /** スクロール方向（デフォルト: 'horizontal'） */
  scrollDirection: ScrollDirection
  /** 舞台環境（背景・スポーンテーブルに影響） */
  environment: EnvironmentId
  /** 最大HP（hp Feature 有効時。デフォルト 3） */
  playerMaxHp: number
  /** 時間スケール（1.0=通常） */
  timescale: number
  /** スクロール方向。'x' = 横スクロール（デフォルト）、'y' = 縦スクロール */
  scrollAxis: 'x' | 'y'
  /** color_touch 時の1タッチあたりのスコア（デフォルト 200） */
  colorTouchScore: number
}

// ─────────────────────────────────────────────────────────────
// 行動統計（学習ルール用）
// ─────────────────────────────────────────────────────────────
export interface ActionStats {
  jumps: number
  moveRight: number
  moveLeft: number
  shots: number
  ticks: number     // フレーム数（分母）
  dashes?: number   // ダッシュ使用回数（dash Feature 有効時のみ）
}

export interface LearningTrigger {
  type: 'jumpRate' | 'rightRate' | 'leftRate' | 'shotRate' | 'dashRate'
  threshold: number
  /** threshold を超えた場合に発動（デフォルト: true = 超えたら発動） */
  triggerAbove?: boolean
}

export interface LearningEffect {
  type: 'disableAction' | 'invertHazard' | 'forceFeature' | 'changeKey'
  payload: string
  durationSec?: number
}

export interface LearningRule {
  id?: string
  trigger: LearningTrigger
  effect: LearningEffect
  triggered?: boolean
}

// ─────────────────────────────────────────────────────────────
// 投擲・スコア
// ─────────────────────────────────────────────────────────────
export interface ThrowResult {
  airTime: number    // 秒
  arcHeight: number  // px
  speed: number      // 初速 px/s
}

export interface FinalScore {
  play: number
  throw: number
  total: number
}

/** scoreFormula で使える変数 */
export interface ScoreVars {
  distance: number         // 走行距離 px
  kills: number            // 撃破数
  combo: number            // 現在コンボ数
  exp: number              // 累積EXP
  beatHits: number         // ビートヒット数
  survivedSec: number      // 生存時間 秒
  // ── 追加変数 ──────────────────────────────────────────────
  accuracy: number         // 命中率 0〜1（shots > 0 なら hits/shots）
  maxCombo: number         // セッション中の最大コンボ数
  deaths: number           // 死亡回数（0=パーフェクト、減点に使用可）
  itemsCollected: number   // アイテム収集総数
  bossKills: number        // ボス撃破数
  stealthBonus: number     // ステルス継続フレーム数（隠密評価）
  colorTouches: number     // 安全色に触れた回数（color_touch 評価）
}
