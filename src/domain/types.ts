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
// ジャンルID（20種 + base）
// ─────────────────────────────────────────────────────────────
export type GenreId =
  // ── コアジャンル（M3 で実装済み） ─────────────────────────
  | 'base'           // チュートリアル・収束前のデフォルト
  | 'runner'         // エンドレスランナー     { tempo: 5 }
  | 'stg'            // 横スクロールSTG        { range: 4, enemy: 4 }
  | 'rpg'            // RPG                   { growth: 4 }
  | 'puzzle'         // パズル                { combo: 4 }
  | 'rhythm'         // リズムゲーム          { tempo: 4, rhythm: 4 }
  // ── 追加ジャンル（M5+ で順次実装） ────────────────────────
  | 'aerial_stg'     // 縦スクロールSTG        { vertical: 3, range: 3, enemy: 3 }
  | 'bullet_hell'    // 弾幕シューティング     { vertical: 3, enemy: 5 }
  | 'survival'       // サバイバル            { survive: 4, growth: 3 }
  | 'stealth_action' // ステルスアクション     { stealth: 4 }
  | 'racing'         // レーシング            { speed: 4, tempo: 3 }
  | 'platformer'     // プラットフォーマー     { aerial: 3, combo: 3 }
  | 'dungeon'        // ダンジョン探索        { growth: 5, craft: 2 }
  | 'tower_def'      // タワーディフェンス     { craft: 5, enemy: 3 }
  | 'sports'         // スポーツゲーム        { speed: 3, rhythm: 3 }
  | 'idle'           // 放置ゲーム            { craft: 4 }
  | 'bullet_runner'  // 弾幕ランナー          { tempo: 5, enemy: 4 }
  | 'arena'          // アリーナバトル        { enemy: 5, combo: 4 }
  | 'aquatic'        // 水中アドベンチャー    { vertical: 2, aerial: 2, survive: 3 }
  | 'horror'         // サバイバルホラー      { survive: 5, stealth: 3 }
  | 'hack_slash'     // ハックアンドスラッシュ { enemy: 4, combo: 5 }

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
// ─────────────────────────────────────────────────────────────
export type FeatureId =
  // ── STG 系 ──────────────────────────────────────────────
  | 'shoot'           // 前方弾発射（Z キーなど）
  | 'three_way'       // 三方向弾（shoot の拡張）
  | 'charge_shot'     // 長押しチャージショット
  | 'spread_shot'     // 拡散弾（扇状5方向）
  | 'bomb'            // 爆弾アイテム（画面全体攻撃）
  | 'enemy_hp'        // 敵がHPを持ち複数ヒット必要
  | 'boss'            // ボスエネミーが出現する
  // ── 移動 系 ──────────────────────────────────────────────
  | 'auto_run'        // 自動前進（プレイヤーは左右/ジャンプのみ）
  | 'slow_precise'    // 低速精密移動（速度1/2 × 精密な足場避け）
  | 'double_jump'     // 空中でもう一度ジャンプ可能
  | 'long_air'        // 空中での水平速度を持続（滑空）
  | 'dash'            // 短距離ダッシュ（Shift など）
  | 'wall_jump'       // 壁に接触中に逆方向ジャンプ
  | 'slide'           // しゃがみスライド（障害物くぐり）
  | 'gravity_flip'    // 重力反転（天井を床として走る）
  | 'vertical_scroll' // 縦スクロールモード（障害物が上下から来る）
  // ── RPG / 育成 系 ────────────────────────────────────────
  | 'hp'              // HP システム（複数回被弾を許容）
  | 'exp'             // 経験値・レベルアップシステム
  | 'item_pickup'     // フィールドアイテム収集
  | 'shield'          // シールド（1回ガード）
  // ── パズル 系 ────────────────────────────────────────────
  | 'grid_stop'       // スクロール停止してグリッド配置モード
  | 'puzzle_solve'    // 正解が存在するパズル入力
  // ── リズム 系 ────────────────────────────────────────────
  | 'beat_hazard'     // BPM 同期でハザードが色/種類を変える
  | 'just_input'      // ジャスト入力で大幅ボーナス
  | 'beat_dash'       // リズムに合わせたダッシュで加速
  // ── ステルス / 特殊 系 ────────────────────────────────────
  | 'stealth_mode'    // 透明化/隠密状態（一定時間ハザード無視）
  | 'time_bonus'      // タイムアタック評価（早いほど高得点）
  // ── タワー / クラフト 系 ──────────────────────────────────
  | 'tower'           // タワー設置（停止して配置）
  // ── 色接触 ────────────────────────────────────────────────
  | 'color_touch'     // 安全色を踏むと得点（積極的に踏む）

// ─────────────────────────────────────────────────────────────
// コントロール定義
// ─────────────────────────────────────────────────────────────
export interface Controls {
  jump: string
  moveLeft: string
  moveRight: string
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
  controls: Controls
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
  thresholds: GenreParams
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
  /** スクロール方向。省略時は 'horizontal' */
  scrollDirection?: ScrollDirection
  /** エンディングのフレーバーテキスト（EndingPanel に表示） */
  endingFlavor?: string
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
  gravity: number            // px/s²（デフォルト 1600）
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
  id: string
  trigger: LearningTrigger
  effect: LearningEffect
  triggered: boolean
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
