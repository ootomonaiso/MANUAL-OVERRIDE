/**
 * engine/types.ts
 * ゲームエンジンのコア型定義。
 * GenrePlugin・FeatureSystem が共通して受け取る「世界への窓口」。
 */

import type { Player, Hazard, Item, Bullet } from '../game/entities'
import type { RuntimeRules } from '../domain/types'

// ──────────────────────────────────────────────────────────────────────
// GameStats — FeatureSystem が読み書きするゲーム統計
// ──────────────────────────────────────────────────────────────────────
export interface GameStats {
  kills: number
  combo: number
  maxCombo: number
  beatHits: number
  beatHazardInverted: boolean
}

// ──────────────────────────────────────────────────────────────────────
// MutableWorld — システム・プラグインがフレームごとに受け取るコンテキスト
// ──────────────────────────────────────────────────────────────────────
export interface MutableWorld {
  // ─ 読み取り ─────────────────────────────────────────────────
  readonly player: Player
  readonly hazards: Hazard[]
  readonly items: Item[]
  readonly bullets: Bullet[]
  readonly rules: RuntimeRules
  readonly distance: number
  readonly survivedSec: number
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  /** 横スクロール時のカメラX位置（ワールド→スクリーン変換に使用） */
  readonly cameraX: number
  /** ゲーム統計（kills/combo/beatHits 等）の現在値 */
  readonly gameStats: Readonly<GameStats>
  /** スクロールモード（'x'=横 / 'y'=縦） */
  readonly scrollMode: 'x' | 'y'

  // ─ スコア / UI ───────────────────────────────────────────────
  addScore(amount: number): void
  addScorePopup(x: number, y: number, text: string, color: string): void
  triggerShake(intensity: number): void
  addParticle(
    x: number, y: number,
    vx: number, vy: number,
    life: number, color: string, size?: number
  ): void

  // ─ ワールド操作 ──────────────────────────────────────────────
  spawnHazard(h: Hazard): void
  spawnItem(item: Item): void
  removeHazardById(h: Hazard): void

  // ─ ゲーム状態操作 ────────────────────────────────────────────
  /**
   * プレイヤーのHPを増減する（hp Feature 有効時のみ意味を持つ）。
   * @param delta 正: 回復、負: ダメージ
   */
  modifyPlayerHp(delta: number): void

  /**
   * コンボをリセットする（障害物に当たった・ミスしたとき呼ぶ）。
   * FeatureSystem が onComboChange(world, 0) を受け取れるようにする。
   */
  resetCombo(): void

  /**
   * 時間スケールを一時的に変更する（スロー演出など）。
   * @param scale 1.0=通常、0.5=半速
   * @param durationSec この秒数後に 1.0 に戻る（省略=永続）
   */
  setTimescale(scale: number, durationSec?: number): void

  // ─ 座標系ヘルパー（FeatureSystem が scrollMode を意識しなくてよくする）
  /**
   * ハザードのスクリーン X 座標を取得（モード非依存）。
   * 横スクロール時は (hazard.x - cameraX) を返し、縦スクロール時は hazard.x をそのまま返す。
   */
  getHazardScreenX(hazard: Hazard): number

  /**
   * プレイヤーのワールド X 座標を取得（モード非依存）。
   * 横スクロール時は (player.x + cameraX) を返し、縦スクロール時は player.x をそのまま返す。
   */
  getPlayerWorldX(): number

  // ─ 統計書き込み（FeatureSystem 専用） ──────────────────────
  /** kills 数を直接セット（ShootFeature が使用） */
  setKills(n: number): void
  /** combo 数をセット。maxCombo も自動更新（ShootFeature が使用） */
  setCombo(n: number): void
  /** beatHits をインクリメント（RhythmFeature が使用） */
  addBeatHit(): void
  /** beat_hazard の色反転フラグを更新（RhythmFeature が使用） */
  setBeatHazardInverted(v: boolean): void

  // ─ ScoreVars 書き込み（FeatureSystem が scoreFormula 計算用に更新）
  /** accuracy 計算用：敵撃破時のヒット数をインクリメント（ShootFeature が使用） */
  addScoreVarsHit(): void
  /** アイテム収集総数をインクリメント（RpgFeature が使用） */
  addScoreVarsItemCollected(): void
  /** ボス撃破数をインクリメント（特定 Feature が使用） */
  addScoreVarsBossKill(): void
  /** ステルス継続フレーム数を加算（StealthFeature が使用） */
  addScoreVarsStealthBonus(amount: number): void
  /** 安全色タッチ回数をインクリメント（color_touch Feature が使用） */
  addScoreVarsColorTouch(): void
}

// ──────────────────────────────────────────────────────────────────────
// InputSnapshot — 1フレーム分の入力状態
// ──────────────────────────────────────────────────────────────────────
export interface InputSnapshot {
  readonly keys: ReadonlySet<string>
  readonly justPressed: ReadonlySet<string>
  readonly justReleased: ReadonlySet<string>
}

// ──────────────────────────────────────────────────────────────────────
// SpawnEntry — ジャンルプラグインが宣言するハザード出現テーブルの1行
// ──────────────────────────────────────────────────────────────────────
import type { HazardDirection, HazardShape } from '../game/entities'

export interface SpawnEntry {
  shape: HazardShape
  /** 配置場所: 地面 / 空中（低め） / 浮遊（sin アニメ付き） */
  placement: 'ground' | 'air' | 'float'
  /**
   * 出現重み。distance=0 と distance=maxDist で線形補間する。
   * weight: 0 のエントリーは出現しない。
   */
  weightStart: number
  weightEnd: number
  /** 幅 [min, max] */
  wRange: [number, number]
  /** 高さ [min, max] */
  hRange: [number, number]

  // ── 以下はすべて省略可能（省略時はゲームバランス設定のデフォルトを使用） ──

  /**
   * この形状が safe（安全色）で出現する確率 0〜1。
   * 省略時は hazardColors と safeColors の比率から自動計算される。
   */
  safeChance?: number

  /**
   * enemy_hp feature 有効時のHP。
   * 省略時は SPAWN.enemyHpAmount（デフォルト3）を使用。
   * 1 にすると一撃で倒せる弱い敵になる。
   */
  hpOverride?: number

  /**
   * 浮遊振幅の [min, max] px。
   * placement が 'float' の場合のみ有効。
   * 省略時は [SPAWN.defaultFloatAmp, SPAWN.defaultFloatAmp]（固定値）。
   */
  floatAmpRange?: [number, number]

  /**
   * パルスアニメの角速度 rad/s。
   * 省略時は VFX.hazardPulseRate（デフォルト 2.0）。
   * 大きいほど速く脈動する。
   */
  pulseSpeed?: number

  /**
   * グロー（shadowBlur）強度の上書き。
   * 省略時は HAZARD_VFX.glowBlur（デフォルト 12）。
   * 0 にするとグロー無効。
   */
  glowBlurOverride?: number

  /**
   * この形状が持つ色を強制上書き（danger 色として使用）。
   * 省略時はジャンルプラグインの palette.danger を使う。
   */
  colorOverride?: string

  /**
   * この形状の safe 色を強制上書き。
   * 省略時はジャンルプラグインの palette.safe を使う。
   */
  safeColorOverride?: string

  /**
   * 衝突判定の grace ピクセル数（内側に縮小する量）。
   * 省略時は 4px（デフォルト）。0 にすると厳密判定になる。
   */
  collisionGrace?: number

  /**
   * この形状のスポーン重み補間の最大距離 px。
   * 省略時は SPAWN.spawnWeightMaxDist（デフォルト 3000）。
   * 短くすると早い段階で高難度形状が出やすくなる。
   */
  weightMaxDist?: number

  /**
   * このエントリーをボスとして扱う。
   * true の場合、スポーン時に onBossSpawn フックが呼ばれる。
   * 省略時は false。
   */
  isBoss?: boolean

  /**
   * このエントリーが出現し始める距離 px。
   * 省略時はゲーム開始直後から有効（weightStart で制御）。
   */
  minDist?: number

  /**
   * このエントリーが出現しなくなる距離 px。
   * 省略時は制限なし。
   */
  maxDist?: number

  /**
   * このエントリーが属するグループID。
   * 同グループ内でまとめてスポーン数を制限したい時に使う（将来拡張用）。
   */
  groupId?: string

 /**
    * スポーン時に環境条件を評価する関数（将来拡張用）。
    * false を返した場合このエントリーはスキップされる。
    */
  spawnCondition?: (distance: number, rules: RuntimeRules) => boolean

  /**
    * ハザードの移動方向。'right' = 右から左へ（デフォルト）、
    * 'left' = 左から右へ（サバイバルの両方向攻撃対応）。
    * 省略時は 'right'。
    */
  direction?: HazardDirection
}

/** distance に基づいて SpawnEntry の重みを補間して返す */
export function resolveWeight(entry: SpawnEntry, distance: number, maxDist = 3000): number {
  const t = Math.min(1, distance / maxDist)
  return entry.weightStart + (entry.weightEnd - entry.weightStart) * t
}
