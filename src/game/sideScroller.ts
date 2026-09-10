import type { RuntimeRules, ActionStats, ScoreVars, ManualVersion, LearningRule, LearningEffect, FeatureId } from '../domain/types'
import type { MutableWorld, GameStats } from '../engine/types'
import { Player, Hazard, Item, Bullet, rectsOverlap, type ScorePopup, type HazardShape } from './entities'
import { HAZARD_SPAWN, PLAYER_PHYSICS, UPDATE_DISTANCES, DISTANCE_ACCEL, BASE_SCROLL_SPEED, DEFAULT_SCORE_FORMULA } from '../data/gameBalance'
import { VFX, CAMERA, BACKGROUND, HAZARD_VFX, UI, SPAWN, SCORE, PHYSICS, DIFFICULTY, PIXELART, HUD_SAFEZONE, GIMMICKS, EXTRA_MOVEMENT, AQUATIC_TUNING } from '../data/tunables'
import { classifyHudLayout, computeSafeZone, type SafeZone } from '../domain/hudLayout'
import { getGenre, getActiveSystems } from '../engine/GameRegistry'
import { resolveWeight, type SpawnEntry } from '../engine/types'
import { soundManager } from '../plugins/SoundManager'
import { evalScoreFormula, getLastFormulaError } from '../domain/scoreCalc'
import { evaluateLearningRules, describeEffect } from '../domain/LearningSystem'
import { GENRES } from '../data/genres'
import { InputManager } from './InputManager'
import { ParticleSystem } from './ParticleSystem'
import { PixelCanvas } from './render'
import { SPRITES } from '../data/sprites'
import { PLATFORMER_ROOMS, pickRandomPattern } from '../framework/PatternLoader'
import type { PatternEntry } from '../engine/patternTypes'
// ジャンルプラグインとフィーチャーシステムを一括登録
import '../genres/index'
import '../game/systems/index'

export interface GameSnapshot {
  distance: number
  playScore: number
  combo: number
  kills: number
  exp: number
  beatHits: number
  survivedSec: number
  hp: number
  maxHp: number
  dead: boolean
  shouldUpdate: number | null
  // チュートリアルヒント用の入力統計
  statJumps: number
  statMoveLeft: number
  statMoveRight: number
  // 最初のジャンプが完了したかを示すフラグ
  firstJumpDone: boolean
  // LearningSystem がエフェクトを発動した際の通知（1フレーム後にクリアされる）
  learningNotification: string | null
  // スコア計算式のパースエラー（発生時のみ非 null）
  scoreFormulaError: string | null
  // プレイスタイル検出用の統計（Issue #24）
  statCollisions: number
  statItemsCollected: number
  statShots: number
  statDashes: number | undefined
  // 現在の（イージング補間済み）セーフゾーン境界（px）。HUD配置の同期用。
  safeZone: SafeZone
  // ジャンル遷移演出中か（入力ロック中）。
  transitioning: boolean
}

// ループ内 dt のクランプ上限（フレーム落ち時に物理が発散するのを防ぐ）
const MAX_DELTA_SEC = 0.05

// LearningSystem の最初のチェックまでの遅延（秒）
const INITIAL_LEARNING_DELAY_SEC = 0.5

// ミリ秒 → 秒換算（spawnDensity の interval は ms、スクロール計算は px/s で一致させるため）
const MS_TO_SEC = 1000

// _drawRect の四隅ベベル幅（docs/pixelart-rebuild/01-sideScroller.md「1セル分の階段状ベベル」）
const HAZARD_RECT_BEVEL_CELLS = 1

// セーフゾーン境界の指数的追従係数。境界値は目標へ 1-exp(-k*dt/transitionSec) で
// 補間され、約 transitionSec 経過で ~98% に達する（急な出現を防ぐ, 仕様 2-F/3）。
const SAFE_ZONE_SETTLE_K = 4

// ジャンル遷移の自動移動イージング係数。ease-out（速く動いて最後に減速＝キビキビ,
// 仕様 4-2）を指数追従で近似する。transitionSec 経過でほぼ目標に到達。
const TRANSITION_EASE_K = 5

// ハザードを可動域内に収める際の内側マージン（px）。従来のスポーン端マージン相当。
const HAZARD_BAND_MARGIN = 10

/**
 * beat_hazard フィーチャー有効時の危険判定。
 * 反転ONかつbeat_hazard有効なら isSafe の逆（safe=危険、hazard=安全）、
 * それ以外は従来通り isSafe=false が危険。
 * 横モード (_updateHorizontal) と縦モード (_updateVertical) の両方で再利用する。
 */
export function isHazardous(beatHazardInverted: boolean, hasBeatHazard: boolean, isSafe: boolean): boolean {
  return beatHazardInverted && hasBeatHazard ? isSafe : !isSafe
}

// ──────────────────────────────────────────────────────────────────────
// SideScroller — Canvas ゲームエンジン本体
// ──────────────────────────────────────────────────────────────────────
export class SideScroller {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private px: PixelCanvas
  private rules: RuntimeRules
  private player: Player
  private hazards: Hazard[] = []
  private items: Item[] = []
  private _bullets: Bullet[] = []
  private _gameStats: GameStats = { kills: 0, combo: 0, maxCombo: 0, beatHits: 0, beatHazardInverted: false }

  // ゲーム状態
  private distance = 0
  private playScore = 0
  private survivedSec = 0
  private dead = false
  private paused = false
  private firstJumpDone = false
  // stealth_mode: 隠密中の被弾回避フラグ（衝突判定が Feature update より前のため、
  // 前フレームの隠密状態を参照して被弾をスキップする。#254）
  private stealthHidden = false
  // 説明書更新の進行度。distance と違い初回ジャンプ後にのみ加算し、ジャンル確定後は
  // postLockUpdatePace 倍で減速する。初回ジャンプ前に更新が溜まる問題(#169)と、
  // 確定後もテンポが途切れ続ける問題(#104)をこの単一アキュムレータで解消する。
  private updateProgress = 0
  private genreLocked = false

  // ScoreVars 計算用フィールド
  private scoreVarsHits = 0           // 敵撃破時のヒット数（accuracy 計算用）
  private scoreVarsItemsCollected = 0 // アイテム収集総数
  private scoreVarsBossKills = 0      // ボス撃破数
  private scoreVarsStealthBonus = 0   // ステルス継続フレーム数の累積
  private scoreVarsColorTouches = 0   // 安全色タッチ回数
  private scoreVarsHitsOnBoss = 0     // ボスへの命中数（bullet_hell）
  private scoreVarsMaxHitCombo = 0    // 被弾せずに連続命中させた最大数（bullet_hell）
  private deaths = 0                  // 死亡回数（hp 有効時は複数回あり得る）

  // カメラ
  private cameraX = 0

  // セーフゾーン境界（px）。毎フレーム目標値へイージング補間される（仕様 2-F/3）。
  // 現在のレイアウトに応じた上下（横STG）/左右（縦STG）の非可動帯。
  private safeZone: SafeZone = { top: 0, bottom: 0, left: 0, right: 0 }

  // ジャンル遷移演出の残り時間（秒）。>0 の間は入力ロック＆自動移動中（仕様 2-F）。
  private _transitionRemaining = 0

  // スポーン
  private nextSpawnDist = SPAWN.firstSpawnDist
  private updateTriggeredFor = new Set<number>()
  private readonly MAX_TRIGGER_CACHE = 256  // updateTriggeredFor の最大キャッシュ数

  // ─── 入力・パーティクル ──────────────────────────────────────────
  private input = new InputManager()
  private particles = new ParticleSystem()

  // ジャンプ改善
  private coyoteTimer = 0       // 地面を離れてからのフレーム数
  private jumpBufferTimer = 0   // ジャンプ先行入力フレーム数
  private jumpHeld = false      // ジャンプキー押しっぱなし判定

  // 穴落下の確定フラグ（runner/bullet_runner）: 穴の真上で地面ラインに到達した時点で
  // true になり、以後は穴のハザードが画面外へ抜けても地面判定を復活させない
  // （_resolveHorizontalLanding が参照・更新する）
  private inLethalHoleFall = false

  // pattern_climb フィーチャー（platformer）専用状態。部屋は連続スクロールせず、
  // 出口に到達したら次の部屋へハードカット（即座に切り替え）する方式（plan/spec-platformer.md）
  private climbDriftTime = 0            // 移動足場の水平ドリフト位相
  private climbStandingOn: Hazard | null = null  // 現在立っている足場（コンベア速度の適用に使用）
  private climbLavaTopY = 0             // 溶岩上端のスクリーンY座標。上限なく上昇し続ける
  private climbLavaGraceSec = 0         // 残り猶予秒数。0より大きい間は溶岩が上昇しない
  private climbRoomsCleared = 0         // クリアした部屋数（スコア・溶岩速度の計算に使用）
  private climbLastRoomId: string | null = null  // 直前の部屋ID（連続同一部屋を避けるため）

  // pattern_descend フィーチャー（aquatic）専用状態。連続スクロールしながら重力・ジャンプで
  // 岩（一方通行足場）を乗り継ぐ方式（plan/spec-aquatic.md）
  private aquaticDriftTime = 0                    // ふわふわ足場の水平ドリフト位相
  private aquaticStandingOn: Hazard | null = null  // 現在立っている岩・足場

  // ─── 演出 ────────────────────────────────────────────────────────
  private scorePopups: ScorePopup[] = []
  private shakeIntensity = 0
  private shakeX = 0
  private shakeY = 0
  /** 被ダメージフラッシュ（残像 0〜1、減衰） */
  private hitFlash = 0
  /** ジャンルロック画面フラッシュ（0〜1、減衰） */
  private genreLockFlash = 0

  // 死亡演出
  private deathTimer = 0
  private deathSlowMo = false

  // プレイヤー演出
  private runCycle = 0           // 走りアニメ位相（0〜1）

  // タイムスケール（setTimescale 用）
  private _timescaleScale = 1.0
  private _timescaleRemaining = -1

  private _frameWorld: MutableWorld | null = null

  // power_up フィーチャー用のブーストタイマー（ShootFeature が参照）
  private _powerBoostTimer = 0

  // ─── 統計 ────────────────────────────────────────────────────────
  private stats: ActionStats = { jumps: 0, moveRight: 0, moveLeft: 0, shots: 0, ticks: 0, collisions: 0, itemsCollected: 0, dashes: 0 }
  private rafId = 0
  private lastTime = 0

  // ─── LearningSystem ──────────────────────────────────────────────
  private learningRules: LearningRule[] | null = null
  private learningCheckTimer = 0         // 次のチェック予定時刻
  // disableAction エフェクト: action名 → 解除予定時刻(performance.now() ベース)
  private _disabledActions = new Map<string, number>()
  // invertHazard 解除予定時刻（-Infinity = 永続/未設定）
  private _invertHazardUntil = -Infinity
  // changeKey キースタック: action名 → 元のキーのスタック（複数エフェクト対応）
  private _keyStack = new Map<string, string[]>()
  // changeKey 解除予定時刻: action名 → 解除時刻
  private _changeKeyUntil = new Map<string, number>()
  // 次の getSnapshot() で一度だけ返す通知メッセージ
  private _pendingLearningMsg: string | null = null
  private _pendingFormulaError: string | null = null

  constructor(canvas: HTMLCanvasElement, rules: RuntimeRules) {
    this.canvas = canvas
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx2d
    this.px = new PixelCanvas(ctx2d)
    this.rules = rules

    const gY = canvas.height - PHYSICS.groundYOffset
    this.player = new Player(PLAYER_PHYSICS.startX, gY)
    this.player.jumpsLeft = rules.features.has('double_jump') ? 2 : 1

    this.input.setGameKeys(rules.controls)

    // pattern_climb フィーチャーを最初から持つ状態で起動される場合（デバッグの force genre 等）、
    // updateRules() の enteringClimb 判定を経由しないため、ここでも部屋を用意する。
    if (rules.features.has('pattern_climb')) this._seedClimbRoom(true)
  }

  // ルール更新（ManualVersion があれば learningRules を同期）
  updateRules(rules: RuntimeRules, manual?: ManualVersion): void {
    // 重力が変化した場合、空中にいる時のみ慣性（vy）を新しい重力に応じて比例調整する
    // （無重力ジャンルへの切り替え時に、旧重力下で蓄積した速度がそのまま残り続けるのを防ぐ）
    const oldGravity = this.rules.gravity
    const newGravity = rules.gravity
    if (!this.player.onGround && newGravity !== oldGravity) {
      if (oldGravity > 0 && newGravity > 0) {
        this.player.vy *= newGravity / oldGravity
      } else if (newGravity === 0) {
        this.player.vy *= 0.3
      }
    }

    // 非アクティブになった Feature の onDisable を呼び出す（rules 更新前に旧 features を使う）
    const oldFeatures = this.rules.features
    const preWorld = this._buildWorld()
    for (const sys of getActiveSystems(oldFeatures)) {
      const ids = Array.isArray(sys.handles) ? sys.handles : [sys.handles]
      const stillActive = ids.some((id: FeatureId) => rules.features.has(id))
      if (!stillActive) {
        sys.onDisable?.(preWorld)
      }
    }
    const enteringClimb = !oldFeatures.has('pattern_climb') && rules.features.has('pattern_climb')

    this.rules = rules
    this.input.setGameKeys(rules.controls)
    if (rules.features.has('double_jump')) {
      this.player.jumpsLeft = Math.max(this.player.jumpsLeft, 2)
    } else {
      // double_jump が削除された場合、最大ジャンプ回数を1に制限
      this.player.jumpsLeft = Math.min(this.player.jumpsLeft, 1)
    }

    // playerMaxHp をプレイヤーへ反映（hp ゲージの上限）。満タンだった場合は
    // 新上限でも満タンに保つ（ジャンル遷移時の自然な「回復」演出として扱う）。
    if (this.player.maxHp !== rules.playerMaxHp) {
      const wasFull = this.player.hp >= this.player.maxHp
      this.player.maxHp = rules.playerMaxHp
      this.player.hp = wasFull ? this.player.maxHp : Math.min(this.player.hp, this.player.maxHp)
    }

    if (enteringClimb) this._seedClimbRoom(true)
    // LearningSystem の副作用状態をリセット（ルール差し替えで古いエフェクトが残らないよう）
    this._disabledActions.clear()
    this._invertHazardUntil = -Infinity
    this._changeKeyUntil.clear()
    this._keyStack.clear()
    this._pendingLearningMsg = null
    this._gameStats.beatHazardInverted = false
    // stealthHidden: ルール差し替え時にリセット（#254 follow-up。
    // 隠密中のプレイヤーが stealth_mode 無効ジャンルへ確定すると、
    // フラグが true のまま残り新ジャンルで永久無敵になる問題を防止）
    this.stealthHidden = false
    // ManualVersion から learningRules を取得
    if (manual?.learningRules) {
      this.learningRules = JSON.parse(JSON.stringify(manual.learningRules))
      this.learningCheckTimer = INITIAL_LEARNING_DELAY_SEC
    } else {
      this.learningRules = null
    }
    // updateRules はループ外から呼ばれるため _frameWorld を使わず直接構築
    const world = this._buildWorld()
    for (const sys of getActiveSystems(rules.features)) {
      sys.onManualUpdated?.(world, '')
    }
    getGenre(rules.genre).onManualUpdated?.(world, '')
  }

  /** ジャンル確定直後に1回だけ呼ぶ（App.vue の lockedGenre watch から） */
  notifyGenreLocked(): void {
    this.genreLocked = true
    getGenre(this.rules.genre).onGenreLocked?.(this._buildWorld())
  }

  /** フレーム内で _buildWorld() を1回だけ呼ぶためのキャッシュアクセサ */
  private _getWorld(): MutableWorld {
    if (!this._frameWorld) this._frameWorld = this._buildWorld()
    return this._frameWorld
  }

  start(): void {
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this._loop)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
    this.input.dispose()
  }

  setPaused(v: boolean): void { this.paused = v }

  /** stealth_hidden 状態を外部（SpecialFeature）から更新するためのセッター */
  setStealthHidden(v: boolean): void { this.stealthHidden = v }

  /** ジャンル確定時の画面フラッシュを発火 */
  triggerGenreLockFlash(): void { this.genreLockFlash = 1.0 }

  /** ウィンドウリサイズ時に呼ぶ。canvas.width/height の変更後に Canvas コンテキスト状態を復元する */
  onResize(): void {
    // canvas サイズ変更で ctx 状態はリセットされる。次フレームの描画が正しく動くよう
    // lastTime をリセットして dt が巨大値にならないようにする
    this.lastTime = performance.now()
  }

  getSnapshot(): GameSnapshot {
    // distance ではなく updateProgress を基準にする（初回ジャンプ前は 0 のまま
    // 溜まらない, 確定後は減速する）。#169 / #104
    const prog = this.updateProgress
    let pending = UPDATE_DISTANCES.findIndex(
      (d, i) => prog >= d && !this.updateTriggeredFor.has(i)
    )
    // UPDATE_DISTANCES の範囲外でも無限に更新を続ける
    if (pending < 0) {
      const lastDist = UPDATE_DISTANCES[UPDATE_DISTANCES.length - 1]
      if (prog >= lastDist) {
        const extraIdx = UPDATE_DISTANCES.length + Math.floor((prog - lastDist) / DIFFICULTY.infiniteUpdateInterval)
        if (!this.updateTriggeredFor.has(extraIdx)) {
          pending = extraIdx
        }
      }
    }

    // 1フレームだけ公開して即クリア
    const learningNotification = this._pendingLearningMsg
    this._pendingLearningMsg = null
    const scoreFormulaError = this._pendingFormulaError
    this._pendingFormulaError = null

    return {
      distance: this.distance,
      playScore: this.playScore,
      combo: this._gameStats.combo,
      kills: this._gameStats.kills,
      exp: this.player.exp,
      beatHits: this._gameStats.beatHits,
      survivedSec: this.survivedSec,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      dead: this.dead,
      shouldUpdate: pending >= 0 ? pending : null,
      statJumps: this.stats.jumps,
      statMoveLeft: this.stats.moveLeft,
      statMoveRight: this.stats.moveRight,
      firstJumpDone: this.firstJumpDone,
      learningNotification,
      scoreFormulaError,
      statCollisions: this.stats.collisions,
      statItemsCollected: this.stats.itemsCollected,
      statShots: this.stats.shots,
      statDashes: this.stats.dashes,
      safeZone: { ...this.safeZone },
      transitioning: this._transitionRemaining > 0,
    }
  }

  markUpdated(index: number): void {
    this.updateTriggeredFor.add(index)
    // メモリリーク防止: 50%まで一括削除（毎フレーム1件ずつ削除を防ぐ）
    if (this.updateTriggeredFor.size > this.MAX_TRIGGER_CACHE) {
      const sorted = [...this.updateTriggeredFor].sort((a, b) => a - b)
      for (const idx of sorted.slice(0, sorted.length - this.MAX_TRIGGER_CACHE / 2)) {
        this.updateTriggeredFor.delete(idx)
      }
    }
  }

  getStats(): ActionStats { return { ...this.stats } }

  /**
   * ScoreVars を構築し、ジャンル別 scoreFormula を使って playScore を再計算する。
   * ゲーム終了時や最終スコア計算時に呼ぶ。
   */
  private _recalculatePlayScore(): void {
    // accuracy: 命中率（shots > 0 なら hits/shots, 0 なら 0）
    const accuracy = this.stats.shots > 0
      ? this.scoreVarsHits / this.stats.shots
      : 0

    const vars: ScoreVars = {
      distance: this.distance,
      kills: this._gameStats.kills,
      combo: this._gameStats.combo,
      exp: this.player.exp,
      beatHits: this._gameStats.beatHits,
      survivedSec: this.survivedSec,
      accuracy,
      maxCombo: this._gameStats.maxCombo,
      deaths: this.deaths,
      itemsCollected: this.scoreVarsItemsCollected,
      bossKills: this.scoreVarsBossKills,
      stealthBonus: this.scoreVarsStealthBonus,
      colorTouches: this.scoreVarsColorTouches,
      hitsOnBoss: this.scoreVarsHitsOnBoss,
      maxHitCombo: this.scoreVarsMaxHitCombo,
    }

    const genre = GENRES.find(g => g.id === this.rules.genre)
    const formula = genre?.scoreFormula ?? DEFAULT_SCORE_FORMULA
    this.playScore = Math.max(0, Math.round(evalScoreFormula(formula, vars)))
  }

  // ─── メインループ ────────────────────────────────────────────────
  private _loop = (ts: number) => {
    const rawDt = Math.min((ts - this.lastTime) / 1000, MAX_DELTA_SEC)
    this.lastTime = ts
    this._frameWorld = null  // フレームキャッシュを毎フレーム破棄

    // タイムスケール経過カウントダウン（実時間ベース）
    if (this._timescaleRemaining > 0) {
      this._timescaleRemaining -= rawDt
      if (this._timescaleRemaining <= 0) this._timescaleScale = 1.0
    }
    const dt = rawDt * this._timescaleScale

    this.input.tick()

    if (!this.paused) {
      if (!this.dead) {
        this._update(dt)
      } else {
        this._updateDeathEffect(dt)
      }
    }

    this._render()

    this.rafId = requestAnimationFrame(this._loop)
  }

  // ─── 更新 ────────────────────────────────────────────────────────
  private _update(dt: number): void {
    this.survivedSec += dt
    this.stats.ticks++

    // セーフゾーン境界を現レイアウトの目標値へ補間（急な出現を防ぐ）
    this._updateSafeZone(dt)

    // ジャンル遷移演出中は入力を無効化しプレイヤーを中央へ自動移動（仕様 2-F）
    if (this._transitionRemaining > 0) {
      this._updateTransition(dt)
      return
    }

    // ─── LearningSystem の評価（定期チェック） ────────────────────
    if (this.learningRules) {
      this.learningCheckTimer -= dt
      if (this.learningCheckTimer <= 0) {
        this.learningCheckTimer = 1.0  // 1秒ごとに評価
        const effects = evaluateLearningRules(this.learningRules, this.stats)
        for (const effect of effects) {
          this._applyLearningEffect(effect)
          this._pendingLearningMsg = describeEffect(effect)
        }
      }
    }

    // ─── LearningEffect 期限切れの自動リセット ────────────────────
    const now = performance.now()
    if (this._invertHazardUntil !== -Infinity && now >= this._invertHazardUntil) {
      this._gameStats.beatHazardInverted = false
      this._invertHazardUntil = -Infinity
    }
    for (const [action, until] of this._changeKeyUntil) {
      if (now >= until) {
        const stack = this._keyStack.get(action)
        const orig = stack?.pop()
        if (orig !== undefined) {
          this._setControl(action, orig)
        } else {
          this._keyStack.delete(action)
        }
        this._changeKeyUntil.delete(action)
      }
    }

    const r = this.rules
    const H = this.canvas.height
    const dashKey  = r.controls.dash ?? 'Shift'
    const isVertical = r.scrollAxis === 'y'

    if (r.features.has('dash') && this.input.justPressed.has(dashKey)) {
      this.stats.dashes += 1
    }

    // ─── 距離ベースの自動加速 ─────────────────────────────────────────
    const distanceAccelFactor = 1 + Math.min(this.distance / DISTANCE_ACCEL.fullDist, DISTANCE_ACCEL.maxBonus)
    // ジャンル固有の scrollSpeedBonus を適用（STG 等で -80 等）
    const genrePlugin = getGenre(r.genre)
    const scrollBonus = genrePlugin.scrollSpeedBonus ?? 0
    const effectiveScrollSpeed = (r.scrollSpeed + scrollBonus) * distanceAccelFactor

    // ─── Pre-physics: 移動 Feature が vx をセット ────────────────────
    const inputSnap = this.input.snapshot()
    for (const sys of getActiveSystems(r.features)) {
      sys.preUpdate?.(this._getWorld(), inputSnap, dt)
    }

    if (isVertical ? this._updateVertical(dt, effectiveScrollSpeed)
                   : this._updateHorizontal(dt, effectiveScrollSpeed)) return

    // ════════════════════════════════════════════════════════
    // 以降は横・縦モード共通
    // ════════════════════════════════════════════════════════

    // ─── Feature システム（GameRegistry 経由で全システムをディスパッチ） ──
    for (const sys of getActiveSystems(r.features)) {
      sys.update(this._getWorld(), inputSnap, dt)
    }

    // ─── アイテムクリーンアップ ───────────────────────────────────
    // 収集・パルスアニメは RpgFeature.update() が担当。ここは dead / 画面外除去のみ。
    this.items = this.items.filter(i =>
      i.alive && (isVertical ? i.y < H + 100 : i.x - this.cameraX > SPAWN.itemCullLeft)
    )

    // ─── パーティクル更新 ─────────────────────────────────────────
    this.particles.update(dt, VFX.particleGravity)

    // ─── スコアポップアップ更新 ───────────────────────────────────
    for (const sp of this.scorePopups) {
      sp.y  += sp.vy * dt
      sp.life -= dt
    }
    this.scorePopups = this.scorePopups.filter(s => s.life > 0)

    // ─── 画面シェイク減衰 ─────────────────────────────────────────
    this.shakeIntensity *= VFX.shakeDecay
    if (this.shakeIntensity < VFX.shakeEpsilon) this.shakeIntensity = 0
    this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2
    this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2

    // ─── 演出フラッシュ減衰 ───────────────────────────────────────
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 4)
    if (this.genreLockFlash > 0) this.genreLockFlash = Math.max(0, this.genreLockFlash - dt * 1.5)

    // ─── 距離スコア加算 ───────────────────────────────────────────
    this.playScore += effectiveScrollSpeed * dt * SCORE.distanceScoreRate

    // ─── 説明書更新の進行度加算 ───────────────────────────────────
    // 初回ジャンプ前は加算しない（溜め込み→まとめ発火の防止, #169）。
    // ジャンル確定後は減速させ、確定後の割り込み頻度を下げる（#104）。
    // 進行度はスクロール速度・距離加速に依存させず、固定基準速度で正規化した
    // 経過時間ベースで加算する（説明書出現を速度非依存にする, #213）。
    if (this.firstJumpDone) {
      const pace = this.genreLocked ? DIFFICULTY.postLockUpdatePace : 1
      this.updateProgress += BASE_SCROLL_SPEED * dt * pace
    }
  }

  // ─── セーフゾーン境界の補間 ──────────────────────────────────────
  // 現レイアウト（横STG=上下 / 縦STG=左右）の目標帯幅へ、指数的に追従する。
  // ジャンル遷移時に旧→新の境界が「徐々に」変化する（仕様 2-F/3）。
  private _updateSafeZone(dt: number): void {
    const layout = classifyHudLayout(this.rules)
    const target = computeSafeZone(layout, this.canvas.width, this.canvas.height, HUD_SAFEZONE)
    const t = 1 - Math.exp(-dt * SAFE_ZONE_SETTLE_K / HUD_SAFEZONE.transitionSec)
    const s = this.safeZone
    s.top    += (target.top    - s.top)    * t
    s.bottom += (target.bottom - s.bottom) * t
    s.left   += (target.left   - s.left)   * t
    s.right  += (target.right  - s.right)  * t
  }

  /**
   * ジャンル確定時に1回呼ぶ（App.vue の lockedGenre watch から）。
   * 新レイアウトが STG系（セーフゾーンを持つ）の場合のみ遷移演出を開始する。
   * それ以外のジャンルでは中央への自動移動は不自然なため何もしない。
   * pattern_climb（platformer）は左右パネル表示のため vstg に分類されるが、
   * 自由飛行の中央寄せは部屋の床に立つ物理と噛み合わないため対象外
   * （_seedClimbRoom が入室時の配置を専用に処理する）。
   */
  beginGenreTransition(): void {
    const layout = classifyHudLayout(this.rules)
    if (layout !== 'hstg' && layout !== 'vstg') return
    if (this.rules.features.has('pattern_climb')) return
    this._transitionRemaining = HUD_SAFEZONE.transitionSec
  }

  /** 遷移演出フレーム: 入力を無視し、プレイヤーを新レイアウトのy中央へease-outで寄せる */
  private _updateTransition(dt: number): void {
    this._transitionRemaining = Math.max(0, this._transitionRemaining - dt)
    const p = this.player
    const W = this.canvas.width
    const H = this.canvas.height
    const sz = this.safeZone

    // 目標 y: 縦STGは下寄り（シューティングらしい初期位置）、横STGは可動域の中央。
    const bandTop = sz.top
    const bandBottom = H - sz.bottom
    const targetY = this.rules.scrollAxis === 'y'
      ? bandTop + (bandBottom - bandTop - p.h) * HUD_SAFEZONE.vstgInitialYRatio
      : (bandTop + bandBottom) / 2 - p.h / 2
    // 縦STGは可動域の水平中央へ寄せる（左端入場のまま左UIゾーンに張り付くのを防ぐ）。
    // 横STGは既存の左寄り立ち位置を保つため、境界内クランプのみ。
    const targetX = this.rules.scrollAxis === 'y'
      ? (sz.left + (W - sz.right)) / 2 - p.w / 2
      : Math.max(sz.left, Math.min(W - sz.right - p.w, p.x))
    const t = 1 - Math.exp(-dt * TRANSITION_EASE_K / HUD_SAFEZONE.transitionSec)
    p.y += (targetY - p.y) * t
    p.x += (targetX - p.x) * t
    p.vx = 0
    p.vy = 0
    p.onGround = false

    // 背景スクロールと演出のみ進める（スポーン・衝突・入力は停止）
    const accel = 1 + Math.min(this.distance / DISTANCE_ACCEL.fullDist, DISTANCE_ACCEL.maxBonus)
    const speed = this.rules.scrollSpeed * accel
    this.distance += speed * dt
    this.cameraX = this.rules.scrollAxis === 'y' ? 0 : this.distance - CAMERA.leadOffset
    this.particles.update(dt, VFX.particleGravity)
    this.shakeIntensity *= VFX.shakeDecay
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 4)
    if (this.genreLockFlash > 0) this.genreLockFlash = Math.max(0, this.genreLockFlash - dt * 1.5)
  }

  // ─── 死亡演出更新 ────────────────────────────────────────────────
  private _updateDeathEffect(dt: number): void {
    this.deathTimer += dt
    this.particles.updateSlow(dt, VFX.deathSlowMoFactor, VFX.deathParticleGravity)
    this.shakeIntensity *= VFX.deathShakeDecay
    this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2
    this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2
  }

  // ─── 縦スクロール更新 ────────────────────────────────────────────
  private _updateVertical(dt: number, speed: number): boolean {
    // pattern_climb フィーチャー（platformer）: 自由飛行ではなく重力・ジャンプ・足場着地の
    // 専用物理を使う。既存の縦スクロール自由移動（aerial_stg 等）とは
    // 挙動が根本的に異なるため、早期に別メソッドへ委譲する。
    if (this.rules.features.has('pattern_climb')) return this._updateClimbRoom(dt)
    // pattern_descend フィーチャー（aquatic）: pattern_climb と同じ重力・ジャンプ・一方通行足場の
    // 物理を使うが、部屋のハードカットではなく連続スクロールしながら進む（Runnerの横エンドレスを
    // 縦に転用した第3の形）ため、こちらも別メソッドへ委譲する。
    if (this.rules.features.has('pattern_descend')) return this._updateAquaticDescent(dt)

    const r = this.rules
    const p = this.player
    const W = this.canvas.width
    const H = this.canvas.height
    const leftKey  = r.controls.moveLeft
    const rightKey = r.controls.moveRight

    if (this.input.keys.has(leftKey))  this.stats.moveLeft++
    if (this.input.keys.has(rightKey)) this.stats.moveRight++
    p.x += p.vx * dt
    // 左右セーフゾーン（縦STG）: UIゾーンへは進入不可
    const sz = this.safeZone
    p.x = Math.max(sz.left, Math.min(W - sz.right - p.w, p.x))
    p.y = Math.max(0, Math.min(H - p.h, p.y + p.vy * dt))
    p.onGround = false
    this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate
    this.distance += speed * dt
    this.cameraX = 0

    for (const h of this.hazards) {
      // direction='left' は「下から出現し上へ流れる」ジャンル用（aquatic）。既定の
      // 'right' は従来通り上から下へ（aerial_stg / bullet_hell 等、挙動不変）。
      h.y += (h.direction === 'left' ? -speed : speed) * dt
      h.pulse += dt * VFX.hazardPulseRate
    }
    this.hazards = this.hazards.filter(h =>
      h.direction === 'left' ? h.y > -SPAWN.hazardCullBelow - h.h : h.y < H + SPAWN.hazardCullBelow
    )

    for (const item of this.items) {
      item.y += speed * dt
    }

    if (this.distance >= this.nextSpawnDist) {
      this._spawnHazard()
      const sp = this._getSpawnParams()
      const interval = sp.baseInterval * Math.exp(-sp.decayRate * this.distance)
      this.nextSpawnDist += (Math.max(sp.minInterval, interval) / MS_TO_SEC) * speed
    }

    if (p.invincible > 0) p.invincible -= dt
    if (p.invincible <= 0) {
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i]
        if (!rectsOverlap(p.rect, h.rect)) continue
        const isHazard = isHazardous(this._gameStats.beatHazardInverted, r.features.has('beat_hazard'), h.isSafe)
        if (isHazard) {
          // stealth_mode 無効ジャンル（tetris / tower_def / idle 等）では
          // 隠密保護を適用しない。#254 follow-up
          if (this.stealthHidden && r.features.has('stealth_mode')) { /* 隠密中は被弾しない #254 */ }
          else {
            this._onPlayerHit(p)
            if (this.dead) return true
            break  // 無敵時間が付与されたため、同一フレームの追加被弾を防ぐ
          }
        } else {
          for (const sys of getActiveSystems(r.features)) {
            sys.onSafeHazardTouch?.(this._getWorld(), h, h.x)
          }
        }
      }
    }

    // 発射数の統計は実発射する ShootFeature 側で addShot() により計上する（#209）
    return false
  }

  /** 縦STG系ジャンル（vstg）共通の水平可動域（画面端の左右を除いた帯）。pattern_climb / pattern_descend が使う */
  private _vstgBandX(): { min: number; max: number } {
    const W = this.canvas.width
    return { min: W * HUD_SAFEZONE.vstgLeftRatio, max: W * (1 - HUD_SAFEZONE.vstgRightRatio) }
  }

  /** pattern_climb: 部屋の床の世界Y座標（部屋高さの基準点）。_seedClimbRoom / _updateClimbRoom で共有する */
  private _climbFloorY(): number {
    return this.canvas.height - GIMMICKS.climbFloorBottomMarginPx - GIMMICKS.climbFloorHeightPx
  }

  /**
   * pattern_climb フィーチャーの部屋を1つ生成する。フィーチャーが有効化された瞬間、および
   * 部屋クリア（出口足場への着地）のたびに呼ぶ。既存のハザードを全て破棄し、プールから
   * 均一確率で選んだ部屋パターン（直前と同一は除外）の床・entries・exit を新たに生成し、
   * プレイヤーを新しい部屋の床の上へ再配置する。連続スクロールしないハードカット方式のため、
   * 溶岩の位置も部屋ごとに同じ相対位置（画面下端）へリセットされる（plan/spec-platformer.md）。
   */
  private _seedClimbRoom(isInitialEntry = false): void {
    const p = this.player
    const H = this.canvas.height
    const { min: bandMinX, max: bandMaxX } = this._vstgBandX()
    const floorY = this._climbFloorY()
    const plugin = getGenre('platformer')
    const pal = plugin.palette

    this.hazards = []

    const floor = new Hazard(bandMinX, floorY, bandMaxX - bandMinX, GIMMICKS.climbFloorHeightPx, pal.safe, pal.safeGlow, 'rect', 1, true)
    floor.isPlatform = true
    floor.isOneWay = true
    floor.isGimmick = true
    this.hazards.push(floor)

    p.x = (bandMinX + bandMaxX) / 2 - p.w / 2
    p.y = floorY - p.h
    p.vy = 0
    p.onGround = true
    p.jumpsLeft = this.rules.features.has('double_jump') ? 2 : 1
    this.climbStandingOn = floor
    this.climbLavaTopY = H
    // ジャンル確定演出（GenreRevealOverlay）表示中は画面が見えず溶岩の接近に気づけないため、
    // 演出時間（2.8秒）より長めの猶予を設けてから上昇を始める。通常の部屋クリア時は0のまま
    this.climbLavaGraceSec = isInitialEntry ? GIMMICKS.climbInitialGraceSec : 0

    if (PLATFORMER_ROOMS.length === 0) return
    const room = pickRandomPattern(PLATFORMER_ROOMS, this.climbLastRoomId)
    this.climbLastRoomId = room.id

    for (const entry of room.entries) {
      this.hazards.push(this._buildClimbHazard(entry, bandMinX, floorY, plugin))
    }
    // 出口は帯いっぱいの幅（床と同じ長さ）にする。JSONのx/wは無視し、どの経路から
    // 登ってきても指定の高さへ達しさえすれば到達できるようにする（複数ルート対応）。
    const exit = this._buildClimbHazard(
      { ...room.exit, x: 0, w: bandMaxX - bandMinX },
      bandMinX, floorY, plugin,
    )
    exit.isRoomExit = true
    this.hazards.push(exit)
  }

  /** pattern_climb: PatternEntry（entries / exit 共通）から Hazard を生成する */
  private _buildClimbHazard(entry: PatternEntry, bandMinX: number, floorY: number, plugin: ReturnType<typeof getGenre>): Hazard {
    const pal = plugin.palette
    const gp = plugin.gimmickPalette
    const worldX = bandMinX + entry.x

    if (entry.kind === 'spring') {
      // 地面に乗る物体は下端基準（上端基準にすると entry.y=0 のとき床に埋まってしまう）
      const spec = gp?.spring ?? { color: pal.safe, glow: pal.safeGlow }
      const worldY = floorY - entry.y - entry.h
      const hz = new Hazard(worldX, worldY, entry.w, entry.h, spec.color, spec.glow, 'diamond', 1, true)
      hz.isSpring = true
      hz.isGimmick = true
      // isOneWay を立てないと「このフレームで上端を跨いだか」を見ない＝一度でも下を
      // 通過した後は足元Yがバネの上端を超えている限りずっと反発対象になってしまい、
      // 部屋の床にいるだけで遠く離れた場所のバネに反応する巨大な当たり判定になる。
      // 通常の足場と同じ一方通行判定に乗せ、着地の瞬間だけ反発するよう制限する。
      hz.isOneWay = true
      return hz
    }

    // oneWayPlatform（exit含む）: 着地面（上端）の高さが entry.y になるよう上端基準で配置する
    const spec = gp?.platform ?? { color: pal.safe, glow: pal.safeGlow }
    const worldY = floorY - entry.y
    const hz = new Hazard(worldX, worldY, entry.w, entry.h, spec.color, spec.glow, 'rect', 1, true)
    hz.isPlatform = true
    hz.isOneWay = true
    hz.isGimmick = true
    hz.driftEnabled = entry.driftEnabled ?? false
    hz.conveyorVx = entry.conveyorVx ?? 0
    return hz
  }

  // ─── pattern_climb 更新（platformer: 部屋内の重力・ジャンプ・足場登り） ──────────
  // 横スクロールと同じ重力・コヨーテ・ジャンプバッファ・二段ジャンプ物理を縦方向に適用する。
  // 部屋は連続スクロールしない（ハードカット方式）ため、ハザードは部屋内で静止したままで
  // よく、着地判定は横スクロールの isOneWay 判定と同じ「このフレームで足場上端を跨いだか」
  // だけで足りる（穴修正で得た知見と同じロジック。plan/spec-platformer.md）。
  private _updateClimbRoom(dt: number): boolean {
    const r = this.rules
    const p = this.player
    const floorY = this._climbFloorY()
    const { min: bandMinX, max: bandMaxX } = this._vstgBandX()
    const jumpKey = r.controls.jump
    const leftKey = r.controls.moveLeft
    const rightKey = r.controls.moveRight

    if (this.input.keys.has(leftKey))  this.stats.moveLeft++
    if (this.input.keys.has(rightKey)) this.stats.moveRight++
    if (p.onGround) this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate

    // 横方向は自由移動（vx は MovementFeature.preUpdate が設定済み）
    p.x += p.vx * dt
    p.x = Math.max(bandMinX, Math.min(bandMaxX - p.w, p.x))

    // ─── ジャンプ（横スクロールと同じ coyote / buffer / 二段ジャンプ） ──────
    const isDouble = r.features.has('double_jump')
    const jumpJustPressed = this.input.justPressed.has(jumpKey)
    const jumpJustReleased = this.input.justReleased.has(jumpKey)

    if (p.onGround) {
      this.coyoteTimer = PLAYER_PHYSICS.coyoteFrames
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer--
    }
    if (jumpJustPressed) {
      this.jumpBufferTimer = PLAYER_PHYSICS.jumpBufferFrames
    } else if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer--
    }

    const canJumpCoyote = this.coyoteTimer > 0 && p.jumpsLeft === (isDouble ? 2 : 1)
    const canJumpDouble = isDouble && p.jumpsLeft > 0
    if (this.jumpBufferTimer > 0 && (canJumpCoyote || (canJumpDouble && !p.onGround) || p.onGround)) {
      if (p.jumpsLeft > 0 || this.coyoteTimer > 0) {
        p.vy = PLAYER_PHYSICS.jumpVelocity
        p.jumpsLeft = Math.max(0, p.jumpsLeft - 1)
        p.onGround = false
        this.climbStandingOn = null
        this.jumpHeld = true
        this.jumpBufferTimer = 0
        this.coyoteTimer = 0
        this.stats.jumps++
        this.firstJumpDone = true
        this._spawnJumpParticles(p.x + p.w / 2, p.y + p.h)
        soundManager.onJump()
        const jw = this._getWorld()
        getGenre(r.genre).onPlayerJump?.(jw)
        for (const sys of getActiveSystems(r.features)) sys.onPlayerJump?.(jw)
      }
    }
    if (jumpJustReleased && p.vy < 0 && this.jumpHeld) {
      p.vy *= PLAYER_PHYSICS.jumpCutMultiplier
      this.jumpHeld = false
    }
    if (!this.input.keys.has(jumpKey)) this.jumpHeld = false

    // ─── 重力 ───────────────────────────────────────────────────────
    // isOneWay判定用: 移動前の足元Y（このフレームでまだ足場に潜り込んでいなかったか）
    const prevFootY = p.y + p.h
    p.vy += r.gravity * (p.vy > 0 ? PLAYER_PHYSICS.fallGravityMult : 1.0) * dt
    p.y += p.vy * dt

    // ─── 移動足場のドリフトアニメーション（連続スクロールしないため経過時間ベース） ──
    this.climbDriftTime += dt
    for (const h of this.hazards) {
      h.pulse += dt * VFX.hazardPulseRate
      if (h.driftEnabled) {
        const drift = Math.sin(this.climbDriftTime * EXTRA_MOVEMENT.verticalDriftFreq + h.y * 0.01)
          * GIMMICKS.movingPlatformDriftAmp * dt
        h.x = Math.max(bandMinX, Math.min(bandMaxX - h.w, h.x + drift))
      }
    }

    // ─── 足場・バネ・出口への着地判定 ───────────────────────────────────
    const landed = this._resolveClimbLanding(p, prevFootY)

    // ─── コンベア: 立っている足場の水平速度を加算 ──────────────────────
    if (p.onGround && this.climbStandingOn?.conveyorVx) {
      p.x = Math.max(bandMinX, Math.min(bandMaxX - p.w, p.x + this.climbStandingOn.conveyorVx * dt))
    }

    if (p.landSquash > 0) p.landSquash *= PHYSICS.landSquashDecay

    // ─── 部屋クリア: 出口に着地したら次の部屋へハードカット ──────────────
    if (landed?.isRoomExit) {
      this.climbRoomsCleared++
      this.distance += floorY - landed.rect.y  // 「高度」= クリアした部屋の床→出口の高さを積算
      this._seedClimbRoom()
      return false
    }

    // ─── 溶岩: 猶予中は上昇を止め、明けたら部屋クリア数に応じて上限付きで加速しながら上昇し続ける ──
    if (this.climbLavaGraceSec > 0) {
      this.climbLavaGraceSec = Math.max(0, this.climbLavaGraceSec - dt)
    } else {
      const lavaSpeed = Math.min(
        GIMMICKS.lavaSpeedBasePxPerSec + this.climbRoomsCleared * GIMMICKS.lavaSpeedGrowthPerRoomPxPerSec,
        GIMMICKS.lavaSpeedMaxPxPerSec,
      )
      this.climbLavaTopY -= lavaSpeed * dt
      if (p.y + p.h >= this.climbLavaTopY) {
        this._die(p)
        return true
      }
    }

    return false
  }

  /**
   * pattern_climb 用の足場・バネ・出口への着地判定。isOneWay足場は横スクロールと同じ
   * 一方通行ロジック（上昇中は素通り、下降中に足場上端を跨いだフレームだけ着地）を使う。
   * 着地したハザードを返す（出口判定・コンベア適用に使う）。p.onGround は呼び出し前の値
   * （＝前フレームの接地状態）を読んでから確定させる（wasInAir 判定に使うため）。
   */
  private _resolveClimbLanding(p: Player, prevFootY: number): Hazard | null {
    let best: Hazard | null = null
    let bestTop = Infinity
    for (const h of this.hazards) {
      if (!h.isPlatform && !h.isSpring) continue
      if (p.x + p.w <= h.x || p.x >= h.x + h.w) continue  // 水平方向に重なっていない
      const top = h.rect.y
      if (h.isOneWay && (p.vy < 0 || prevFootY > top)) continue
      if (p.y + p.h < top) continue  // まだ足場に到達していない
      if (top < bestTop) { bestTop = top; best = h }
    }

    if (!best) { p.onGround = false; this.climbStandingOn = null; return null }

    const isDouble = this.rules.features.has('double_jump')
    if (best.isSpring) {
      p.y = best.rect.y - p.h
      p.vy = GIMMICKS.springBounceVelocity
      p.onGround = false
      p.jumpsLeft = isDouble ? 2 : 1
      this.climbStandingOn = null
      this._spawnJumpParticles(p.x + p.w / 2, p.y + p.h)
      soundManager.onJump()
    } else {
      const wasInAir = !p.onGround
      p.y = best.rect.y - p.h
      p.vy = 0
      p.onGround = true
      p.jumpsLeft = isDouble ? 2 : 1
      this.climbStandingOn = best
      if (wasInAir) {
        p.landSquash = 1.0
        this._spawnLandParticles(p.x + p.w / 2, best.rect.y)
        soundManager.onLand()
        getGenre(this.rules.genre).onPlayerLand?.(this._getWorld())
      }
    }
    return best
  }

  // ─── pattern_descend 更新（aquatic: 重力・ジャンプで岩を乗り継ぐ縦エンドレス潜行） ──────
  // pattern_climb と同じ重力・コヨーテ・ジャンプバッファ物理を使うが（二段ジャンプは無し）、
  // 部屋のハードカットではなく連続スクロールしながら進む点が異なる（plan/spec-aquatic.md）。
  // 画面外（上端・下端）への逸脱はどちらも敗北として扱う。
  private _updateAquaticDescent(dt: number): boolean {
    const r = this.rules
    const p = this.player
    const H = this.canvas.height
    const band = this._vstgBandX()
    const jumpKey = r.controls.jump
    const leftKey = r.controls.moveLeft
    const rightKey = r.controls.moveRight

    const scrollSpeed = Math.min(
      AQUATIC_TUNING.scrollSpeedBasePxPerSec + this.survivedSec * AQUATIC_TUNING.scrollSpeedGrowthPxPerSec2,
      AQUATIC_TUNING.scrollSpeedMaxPxPerSec,
    )

    if (this.input.keys.has(leftKey))  this.stats.moveLeft++
    if (this.input.keys.has(rightKey)) this.stats.moveRight++
    if (p.onGround) this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate

    // 横方向は自由移動（vx は MovementFeature.preUpdate が設定済み）
    p.x += p.vx * dt
    p.x = Math.max(band.min, Math.min(band.max - p.w, p.x))

    // ─── ジャンプ（横スクロールと同じ coyote / buffer。二段ジャンプは無し） ──────────
    const jumpJustPressed = this.input.justPressed.has(jumpKey)
    const jumpJustReleased = this.input.justReleased.has(jumpKey)

    if (p.onGround) {
      this.coyoteTimer = PLAYER_PHYSICS.coyoteFrames
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer--
    }
    if (jumpJustPressed) {
      this.jumpBufferTimer = PLAYER_PHYSICS.jumpBufferFrames
    } else if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer--
    }
    if (this.jumpBufferTimer > 0 && (p.onGround || this.coyoteTimer > 0)) {
      p.vy = AQUATIC_TUNING.aquaticJumpVelocityPxPerSec
      p.jumpsLeft = 0
      p.onGround = false
      this.aquaticStandingOn = null
      this.jumpHeld = true
      this.jumpBufferTimer = 0
      this.coyoteTimer = 0
      this.stats.jumps++
      this.firstJumpDone = true
      this._spawnJumpParticles(p.x + p.w / 2, p.y + p.h)
      soundManager.onJump()
      const jw = this._getWorld()
      getGenre(r.genre).onPlayerJump?.(jw)
      for (const sys of getActiveSystems(r.features)) sys.onPlayerJump?.(jw)
    }
    if (jumpJustReleased && p.vy < 0 && this.jumpHeld) {
      p.vy *= PLAYER_PHYSICS.jumpCutMultiplier
      this.jumpHeld = false
    }
    if (!this.input.keys.has(jumpKey)) this.jumpHeld = false

    // ─── 重力（小さいジャンル定義値。画面外脱出を検知するため y は clamp しない） ──────
    const prevFootY = p.y + p.h
    p.vy += r.gravity * (p.vy > 0 ? PLAYER_PHYSICS.fallGravityMult : 1.0) * dt
    p.y += p.vy * dt

    // ─── ハザードのスクロール・パルス・ドリフト（ふわふわ足場） ───────────────────
    // direction='left' は「下から出現し上へ流れる」（既存の縦スクロール規約）
    this.aquaticDriftTime += dt
    for (const h of this.hazards) {
      h.y += (h.direction === 'left' ? -scrollSpeed : scrollSpeed) * dt
      h.pulse += dt * VFX.hazardPulseRate
      if (h.driftEnabled) {
        const drift = Math.sin(this.aquaticDriftTime * EXTRA_MOVEMENT.verticalDriftFreq + h.y * 0.01)
          * GIMMICKS.movingPlatformDriftAmp * dt
        h.x = Math.max(band.min, Math.min(band.max - h.w, h.x + drift))
      }
    }
    this.hazards = this.hazards.filter(h =>
      h.direction === 'left' ? h.y > -SPAWN.hazardCullBelow - h.h : h.y < H + SPAWN.hazardCullBelow
    )

    // ─── 岩・ふわふわ足場への着地判定 ───────────────────────────────────
    this._resolveAquaticLanding(p, prevFootY)
    if (p.onGround && this.aquaticStandingOn?.conveyorVx) {
      p.x = Math.max(band.min, Math.min(band.max - p.w, p.x + this.aquaticStandingOn.conveyorVx * dt))
    }
    if (p.landSquash > 0) p.landSquash *= PHYSICS.landSquashDecay

    // ─── 流れが強い場所: 重なっている間、水平方向へ強制的に押し流す ───────────────
    for (const h of this.hazards) {
      if (!h.isCurrentZone || !rectsOverlap(p.rect, h.rect)) continue
      p.x = Math.max(band.min, Math.min(band.max - p.w, p.x + h.currentVx * dt))
    }

    // ─── 敵（トゲ）等の危険ハザードとの接触判定 ───────────────────────────
    if (p.invincible > 0) p.invincible -= dt
    if (p.invincible <= 0) {
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i]
        if (!rectsOverlap(p.rect, h.rect)) continue
        const isHazard = isHazardous(this._gameStats.beatHazardInverted, r.features.has('beat_hazard'), h.isSafe)
        if (isHazard) {
          if (this.stealthHidden && r.features.has('stealth_mode')) { /* 隠密中は被弾しない */ }
          else {
            this._onPlayerHit(p)
            if (this.dead) return true
            break
          }
        } else {
          for (const sys of getActiveSystems(r.features)) {
            sys.onSafeHazardTouch?.(this._getWorld(), h, h.x)
          }
        }
      }
    }

    // ─── 画面外への逸脱（上下どちらも敗北） ─────────────────────────────
    if (p.y + p.h <= 0 || p.y >= H) {
      this._die(p)
      return true
    }

    this.distance += scrollSpeed * dt
    this.cameraX = 0
    return false
  }

  /**
   * pattern_descend の岩・ふわふわ足場への着地判定。isOneWay足場は横スクロールと同じ
   * 一方通行ロジック（上昇中は素通り、下降中に足場上端を跨いだフレームだけ着地）を使う。
   */
  private _resolveAquaticLanding(p: Player, prevFootY: number): void {
    let best: Hazard | null = null
    let bestTop = Infinity
    for (const h of this.hazards) {
      if (!h.isPlatform) continue
      if (p.x + p.w <= h.x || p.x >= h.x + h.w) continue  // 水平方向に重なっていない
      const top = h.rect.y
      if (h.isOneWay && (p.vy < 0 || prevFootY > top)) continue
      if (p.y + p.h < top) continue  // まだ足場に到達していない
      if (top < bestTop) { bestTop = top; best = h }
    }

    if (!best) { p.onGround = false; this.aquaticStandingOn = null; return }

    const wasInAir = !p.onGround
    p.y = best.rect.y - p.h
    p.vy = 0
    p.onGround = true
    p.jumpsLeft = 1
    this.aquaticStandingOn = best
    if (wasInAir) {
      p.landSquash = 1.0
      this._spawnLandParticles(p.x + p.w / 2, best.rect.y)
      soundManager.onLand()
      getGenre(this.rules.genre).onPlayerLand?.(this._getWorld())
    }
  }

  // ─── 横スクロール更新 ────────────────────────────────────────────
  private _updateHorizontal(dt: number, speed: number): boolean {
    const r = this.rules
    const p = this.player
    const W = this.canvas.width
    const H = this.canvas.height
    const gY = H - BACKGROUND.groundHeight
    const jumpKey  = r.controls.jump
    const leftKey  = r.controls.moveLeft
    const rightKey = r.controls.moveRight
    // tetris_mode: jump key is repurposed for hard drop; lights_out: パズル中は操作不要
    const tetrisMode = r.features.has('tetris_mode')
    const noControlMode = tetrisMode || r.features.has('lights_out')

    // auto_run 由来の自動前進は「プレイヤーの移動操作」ではないため統計に数えない。
    // 数えるとプレイスタイル判定が入力に関係なく常に explorer へ偏り、passive が
    // 一度も検出できなくなる（#171-3）。実際に押されたキーだけを移動操作として数える。
    if (!tetrisMode && this.input.keys.has(leftKey))  this.stats.moveLeft++
    if (!tetrisMode && this.input.keys.has(rightKey)) this.stats.moveRight++
    if (p.onGround) {
      this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate
    }

    // gravity === 0: 上下左右に自由移動する STG モード。ジャンプ・重力・着地は行わない
    if (r.gravity === 0) {
      const upKey   = r.controls.moveUp
      const downKey = r.controls.moveDown
      if (upKey   && this.input.keys.has(upKey))   p.y -= PLAYER_PHYSICS.runSpeed * dt
      if (downKey && this.input.keys.has(downKey)) p.y += PLAYER_PHYSICS.runSpeed * dt
      // 上下セーフゾーン（横STG）: 上端 sz.top、下端は地面と下側UIゾーンの厳しい方
      const sz = this.safeZone
      const lowerLimit = Math.min(gY, H - sz.bottom) - p.h
      p.y = Math.max(sz.top, Math.min(lowerLimit, p.y))
      p.vy = 0
      p.onGround = false
      p.airTime += dt
    } else {
    const isDouble         = r.features.has('double_jump')
    const jumpDisabled     = this._isActionDisabled('jump')
    const jumpJustPressed  = !noControlMode && !jumpDisabled && this.input.justPressed.has(jumpKey)
    const jumpJustReleased = this.input.justReleased.has(jumpKey)

    if (p.onGround) {
      this.coyoteTimer = PLAYER_PHYSICS.coyoteFrames
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer--
    }
    if (jumpJustPressed) {
      this.jumpBufferTimer = PLAYER_PHYSICS.jumpBufferFrames
    } else if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer--
    }

    const canJumpCoyote = this.coyoteTimer > 0 && p.jumpsLeft === (isDouble ? 2 : 1)
    const canJumpDouble = isDouble && p.jumpsLeft > 0
    if (this.jumpBufferTimer > 0 && (canJumpCoyote || (canJumpDouble && !p.onGround) || p.onGround)) {
      if (p.jumpsLeft > 0 || this.coyoteTimer > 0) {
        p.vy = PLAYER_PHYSICS.jumpVelocity
        p.jumpsLeft = Math.max(0, p.jumpsLeft - 1)
        p.onGround = false
        this.jumpHeld = true
        this.jumpBufferTimer = 0
        this.coyoteTimer = 0
        this.stats.jumps++
        this.firstJumpDone = true
        this._spawnJumpParticles(p.x + p.w / 2, p.y + p.h)
        soundManager.onJump()
        const jw = this._getWorld()
        getGenre(r.genre).onPlayerJump?.(jw)
        for (const sys of getActiveSystems(r.features)) sys.onPlayerJump?.(jw)
      }
    }
    if (jumpJustReleased && p.vy < 0 && this.jumpHeld) {
      p.vy *= PLAYER_PHYSICS.jumpCutMultiplier
      this.jumpHeld = false
    }
    if (!this.input.keys.has(jumpKey)) this.jumpHeld = false

    if (r.gravity === 0) {
      p.vy *= Math.pow(0.05, dt)
    } else {
      p.vy += r.gravity * (p.vy > 0 ? PLAYER_PHYSICS.fallGravityMult : 1.0) * dt
    }
    // isOneWay足場の判定用: 移動前の足元Y（このフレームでまだ足場に潜り込んでいなかったか）
    const prevFootY = p.y + p.h
    p.y += p.vy * dt

    const landing = this._resolveHorizontalLanding(p, gY, prevFootY)
    if (landing.surfaceY !== null && p.y + p.h >= landing.surfaceY) {
      const wasInAir = !p.onGround
      p.y = landing.surfaceY - p.h
      if (landing.isSpring) {
        p.vy = GIMMICKS.springBounceVelocity
        p.onGround = false
        p.jumpsLeft = isDouble ? 2 : 1
        this._spawnJumpParticles(p.x + p.w / 2, p.y + p.h)
        soundManager.onJump()
      } else {
        p.vy = 0
        p.onGround = true
        p.jumpsLeft = isDouble ? 2 : 1
        if (landing.hazard?.conveyorVx) {
          p.x = Math.max(PHYSICS.playerMinX, Math.min(W * PHYSICS.playerMaxXRatio, p.x + landing.hazard.conveyorVx * dt))
        }
      }
      if (wasInAir) {
        p.landSquash = 1.0
        this._spawnLandParticles(p.x + p.w / 2, landing.surfaceY)
        soundManager.onLand()
        getGenre(r.genre).onPlayerLand?.(this._getWorld())
        if (!landing.isSpring && this.jumpBufferTimer > 0) {
          p.vy = PLAYER_PHYSICS.jumpVelocity
          p.onGround = false
          p.jumpsLeft = isDouble ? 1 : 0
          this.jumpBufferTimer = 0
          this.jumpHeld = true
          this.stats.jumps++
          // 通常ジャンプ分岐と同じ副作用を揃える。欠落すると着地バッファジャンプ時に
          // 初回ジャンプ判定・ジャンプ粒子・SE が出ない一貫性バグになる（#181）。
          this.firstJumpDone = true
          this._spawnJumpParticles(p.x + p.w / 2, p.y + p.h)
          soundManager.onJump()
          const jw = this._getWorld()
          getGenre(r.genre).onPlayerJump?.(jw)
          for (const sys of getActiveSystems(r.features)) sys.onPlayerJump?.(jw)
        }
      }
    } else {
      p.onGround = false
      p.airTime += dt
      // 穴の上で着地先が無いまま画面外(下)へ落ちきったら死亡（穴に落下）
      if (landing.overHole && p.y > H + GIMMICKS.holeDeathMarginPx) {
        this._die(p)
        return true
      }
    }
    if (p.landSquash > 0) p.landSquash *= PHYSICS.landSquashDecay
    }

    if (!r.features.has('auto_run') && !noControlMode) p.x += p.vx * dt
    p.x = Math.max(PHYSICS.playerMinX, Math.min(W * PHYSICS.playerMaxXRatio, p.x))

    this.distance += speed * dt
    this.cameraX = this.distance - CAMERA.leadOffset

    // pattern_runner（runner/bullet_runner）は手作りパターンで自前スポーンするため、
    // 汎用の重み付きランダム生成（spawnTable ベース）は呼ばない（plan/spec-pattern-system.md）。
    if (!r.features.has('pattern_runner') && this.distance >= this.nextSpawnDist) {
      this._spawnHazard()
      const sp = this._getSpawnParams()
      const interval = sp.baseInterval * Math.exp(-sp.decayRate * this.distance)
      this.nextSpawnDist += (Math.max(sp.minInterval, interval) / MS_TO_SEC) * speed
    }

    for (const h of this.hazards) {
      h.pulse += dt * VFX.hazardPulseRate
      // 左方向ハザードは右へ移動（スクロール速度と同速）
      if (h.direction === 'left') {
        h.x += speed * dt
      }
    }

    if (p.invincible > 0) p.invincible -= dt
    if (p.invincible <= 0) {
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i]
        const sx = h.x - this.cameraX
        const hRect = { ...h.rect, x: sx }
        if (!rectsOverlap(p.rect, hRect)) continue
        const isHazard = isHazardous(this._gameStats.beatHazardInverted, r.features.has('beat_hazard'), h.isSafe)
        if (isHazard) {
          // stealth_mode 無効ジャンル（tetris / tower_def / idle 等）では
          // 隠密保護を適用しない。#254 follow-up
          if (this.stealthHidden && r.features.has('stealth_mode')) { /* 隠密中は被弾しない #254 */ }
          else {
            this._onPlayerHit(p)
            if (this.dead) return true
            break  // 無敵時間が付与されたため、同一フレームの追加被弾を防ぐ
          }
        } else {
          for (const sys of getActiveSystems(r.features)) {
            sys.onSafeHazardTouch?.(this._getWorld(), h, sx)
          }
        }
      }
    }

    // 右方向: 画面左外で除去、左方向: 画面右外で除去
    this.hazards = this.hazards.filter(h => {
      if (h.direction === 'left') {
        return h.x - this.cameraX < this.canvas.width - SPAWN.hazardCullLeft
      }
      return h.x - this.cameraX > SPAWN.hazardCullLeft
    })

    // 発射数の統計は実発射する ShootFeature 側で addShot() により計上する（#209）
    return false
  }

  // ─── 被弾処理 ────────────────────────────────────────────────────
  private _onPlayerHit(p: Player): void {
    this.stats.collisions += 1
    this.hitFlash = 1.0  // 被ダメフラッシュ
    const world = this._getWorld()
    soundManager.onHit()
    for (const sys of getActiveSystems(this.rules.features)) {
      sys.onPlayerHit?.(world)
    }
    // どのシステムも死亡を処理しなかった場合（hp feature なし）は即死
    if (!this.dead) {
      this._die(p)
    }
  }

  private _die(p: Player): void {
    if (this.dead) return  // 二重死亡防止
    this.dead = true
    this.deaths++
    this.shakeIntensity = VFX.deathShakeIntensity
    this._spawnDeathExplosion(p.x + p.w / 2, p.y + p.h / 2)
    soundManager.onDeath()
    // Hook: onPlayerDeath
    const dw = this._getWorld()
    for (const sys of getActiveSystems(this.rules.features)) sys.onPlayerDeath?.(dw)
    // ScoreVars に基づいて playScore を再計算
    this._recalculatePlayScore()
    this._pendingFormulaError = getLastFormulaError()
  }

  /** ギブアップ経路でも scoreFormula を適用してスコアを確定する */
  recalcPlayScore(): number {
    this._recalculatePlayScore()
    return this.playScore
  }

  // ─── 描画 ────────────────────────────────────────────────────────
  private _render(): void {
    const ctx = this.ctx
    const W = this.canvas.width, H = this.canvas.height
    const r = this.rules
    const gY = H - PHYSICS.groundYOffset

    // canvas.width への代入で ctx の状態がリセットされるため毎フレーム設定する
    // （docs/pixelart-rebuild/00-rendering-system.md §5「imageSmoothingEnabled の扱い」）
    ctx.imageSmoothingEnabled = false

    ctx.save()
    ctx.translate(this.shakeX, this.shakeY)

    // ─── 背景（パラレックス） ─────────────────────────────────────
    this._drawBackground(W, H, gY)

    // ─── アイテム ─────────────────────────────────────────────────
    for (const item of this.items) {
      const sx = item.x - this.cameraX
      if (sx < -60 || sx > W + 60) continue
      this._drawItem(item, sx)
    }

    // ─── 障害物 ───────────────────────────────────────────────────
    const isVerticalRender = r.scrollAxis === 'y'
    for (const h of this.hazards) {
      const sx = h.x - this.cameraX
      if (isVerticalRender) {
        // 縦モード: h.y がスクリーンY（cameraX=0 なので sx=h.x）
        if (h.y < -200 || h.y > H + 100) continue
        this._drawHazard(h, h.x, r)
      } else {
        if (sx < -200 || sx > W + 100) continue
        this._drawHazard(h, sx, r)
      }
    }

    // ─── Feature システム描画（弾・ビートマーカー等） ─────────────
    {
      const fWorld = this._getWorld()
      for (const sys of getActiveSystems(r.features)) {
        sys.render?.(ctx, fWorld)
      }
    }

    // ─── パーティクル ─────────────────────────────────────────────
    this.particles.render(ctx)

    // ─── スコアポップアップ ───────────────────────────────────────
    for (const sp of this.scorePopups) {
      this.px.text(sp.text, sp.x, sp.y, { font: UI.popupFont, fill: sp.color, alpha: sp.life })
    }

    // ─── プレイヤー ───────────────────────────────────────────────
    if (!this.dead) this._drawPlayer()

    // ─── ジャンル固有HUD（シェイクの影響を受けるレイヤー） ─────
    getGenre(r.genre).drawGenreHUD?.(ctx, this._getWorld(), W, H)

    ctx.restore()  // shake の restore

    // ─── 前景レイヤー（シェイクの影響を受けない画面固定レイヤー） ──
    // ビネット・スキャンライン・HUDフレーム等の画面固定装飾はここで1回だけ描画
    getGenre(r.genre).drawForeground?.(ctx, this.cameraX, W, H, gY, this._getWorld())

    // ─── セーフゾーン境界のグラデーションフェード（仕様 3-3） ──────
    this._drawSafeZoneBoundaries(W, H)

    // ─── 死亡オーバーレイ ─────────────────────────────────────────
    if (this.dead) {
      const fadeIn = Math.min(1, this.deathTimer * UI.deathFadeSpeed)
      ctx.fillStyle = `rgba(0,0,0,${fadeIn * UI.deathOverlayAlpha})`
      ctx.fillRect(0, 0, W, H)

      if (this.deathTimer > UI.deathTextDelayS) {
        const alpha = Math.min(1, (this.deathTimer - UI.deathTextDelayS) * UI.deathTextFadeSpeed)
        this.px.text('GAME OVER', W / 2, H / 2 - 10, { font: UI.deathTitleFont, fill: '#ffffff', align: 'center', alpha })
        this.px.text('説明書を投げてください', W / 2, H / 2 + 28, {
          font: UI.deathSubFont,
          fill: `rgba(255,255,255,${UI.deathSubTextAlpha})`,
          align: 'center',
          alpha,
        })
      }
    }

    // ─── 被ダメージフラッシュ ─────────────────────────────────────
    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${this.hitFlash * 0.3})`
      ctx.fillRect(0, 0, W, H)
    }

    // ─── ジャンルロックフラッシュ ─────────────────────────────────
    if (this.genreLockFlash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.genreLockFlash * 0.15})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  // ─── セーフゾーン境界のグラデーション描画 ────────────────────────
  // アクティブな UIゾーン（横STG=上下 / 縦STG=左右）を、外縁が濃く内側へ
  // 透明にフェードする半透明帯で示す。明確な線は引かない（仕様 3-3 / 4-4 #10）。
  private _drawSafeZoneBoundaries(W: number, H: number): void {
    const sz = this.safeZone
    const a = HUD_SAFEZONE.boundaryFadeAlpha
    const lineA = HUD_SAFEZONE.boundaryLineAlpha
    const ctx = this.ctx
    const EPS = 1

    ctx.save()
    // UIゾーンを半透明フィルで塗る（可動域を明確化・仕様/実機調整）
    ctx.fillStyle = `rgba(0,0,0,${a})`
    if (sz.top > EPS)    ctx.fillRect(0, 0, W, sz.top)
    if (sz.bottom > EPS) ctx.fillRect(0, H - sz.bottom, W, sz.bottom)
    if (sz.left > EPS)   ctx.fillRect(0, 0, sz.left, H)
    if (sz.right > EPS)  ctx.fillRect(W - sz.right, 0, sz.right, H)

    // 内側境界線（可動域の縁）
    ctx.strokeStyle = `rgba(255,255,255,${lineA})`
    ctx.lineWidth = 1
    ctx.beginPath()
    if (sz.top > EPS)    { ctx.moveTo(0, sz.top);          ctx.lineTo(W, sz.top) }
    if (sz.bottom > EPS) { ctx.moveTo(0, H - sz.bottom);   ctx.lineTo(W, H - sz.bottom) }
    if (sz.left > EPS)   { ctx.moveTo(sz.left, 0);         ctx.lineTo(sz.left, H) }
    if (sz.right > EPS)  { ctx.moveTo(W - sz.right, 0);    ctx.lineTo(W - sz.right, H) }
    ctx.stroke()
    ctx.restore()
  }

  // ─── 背景描画（プラグイン委譲） ──────────────────────────────────
  private _drawBackground(W: number, H: number, gY: number): void {
    const ctx = this.ctx
    const plugin = getGenre(this.rules.genre)
    const cam = this.cameraX
    const isVertical = this.rules.scrollAxis === 'y'

    if (isVertical) {
      // 縦モード: 全画面を空グラデーションで塗り、地面ラインなし
      this.px.bandGradient(0, 0, W, H, [[0, plugin.skyColors[0]], [1, plugin.skyColors[1]]], 'v', PIXELART.gradientSteps)
      if (plugin.starColor) {
        this._drawStarField(this.distance * CAMERA.parallaxStars, W, H * 0.9, plugin)
      }
      // 縦モードでも遠景・中景を描きたいジャンルだけレイヤーを委譲（gY は全画面高）
      if (plugin.verticalBackgroundLayers) {
        const parallaxFar = plugin.parallax?.far ?? CAMERA.parallaxFar
        const parallaxMid = plugin.parallax?.mid ?? CAMERA.parallaxMid
        plugin.drawFarLayer(ctx, this.distance * parallaxFar, W, H)
        plugin.drawMidLayer(ctx, this.distance * parallaxMid, W, H)
      }
      this._drawEnvironmentOverlay(W, H)
      return
    }

    // 空グラデーション
    this.px.bandGradient(0, 0, W, gY, [[0, plugin.skyColors[0]], [1, plugin.skyColors[1]]], 'v', PIXELART.gradientSteps)

    // 星フィールド
    const parallaxStars = plugin.parallax?.stars ?? CAMERA.parallaxStars
    const parallaxFar   = plugin.parallax?.far   ?? CAMERA.parallaxFar
    const parallaxMid   = plugin.parallax?.mid   ?? CAMERA.parallaxMid
    if (plugin.starColor) {
      this._drawStarField(cam * parallaxStars, W, gY * BACKGROUND.starMaxYRatio, plugin)
    }

    // 遠景・中景・地面はプラグインに委譲
    plugin.drawFarLayer(ctx, cam * parallaxFar, W, gY)
    plugin.drawMidLayer(ctx, cam * parallaxMid, W, gY)
    this._drawGround(W, H, gY, plugin.groundColors[0], plugin.groundColors[1])
    this._drawEnvironmentOverlay(W, H)
  }

  private _drawStarField(offsetX: number, W: number, maxY: number, plugin: import('../engine/GenrePlugin').GenrePlugin): void {
    const cfg = plugin.starConfig
    const sectorW   = BACKGROUND.starSectorWidth
    const density   = cfg?.density    ?? BACKGROUND.starCountPerSector
    const sizeMin   = cfg?.sizeRange?.[0] ?? BACKGROUND.starSizeMin
    const sizeRange = (cfg?.sizeRange?.[1] ?? (BACKGROUND.starSizeMin + BACKGROUND.starSizeRange)) - sizeMin
    const alphaMin  = cfg?.alphaRange?.[0] ?? BACKGROUND.starAlphaMin
    const alphaStep = cfg?.alphaRange
      ? (cfg.alphaRange[1] - cfg.alphaRange[0]) / 3
      : BACKGROUND.starAlphaStep

    const sector = Math.floor(offsetX / sectorW)
    const color = plugin.starColor ?? '#ffffff'
    for (let s = sector - 1; s <= sector + 2; s++) {
      const baseX = s * sectorW - offsetX
      for (let i = 0; i < density; i++) {
        const h = (s * 1013 + i * 37) & 0xffff
        const x = baseX + ((h * 1664525 + 1013904223) & 0xffff) % sectorW
        const y = ((h * 22695477 + 1) & 0xffff) % Math.floor(maxY)
        const size = sizeMin + ((h >> 12) % (sizeRange + 1))
        const alpha = alphaMin + ((h >> 8) & 3) * alphaStep
        // px.rect が内部でデバイス空間スナップするため、サイズ量子化はここで行わない
        // （00-rendering-system.md §3 のスナップ規則に一本化する）
        this.px.withAlpha(alpha, () => {
          this.px.rect(x - size, y - size, size * 2, size * 2, color)
        })
      }
    }
  }

  // ─── 環境オーバーレイ（environment 値に応じた色調補正） ─────────────
  private _drawEnvironmentOverlay(W: number, H: number): void {
    const env = this.rules.environment
    let color: string | null = null
    switch (env) {
      case 'ocean':   color = 'rgba(0,60,160,0.20)';  break
      case 'dungeon': color = 'rgba(30,0,60,0.25)';   break
      case 'forest':  color = 'rgba(0,80,20,0.15)';   break
      case 'city':    color = 'rgba(60,60,80,0.12)';  break
      case 'sky':     color = 'rgba(80,160,255,0.08)'; break
      case 'space':   color = 'rgba(0,0,20,0.15)';    break
      // 'ground' はデフォルト → オーバーレイなし
    }
    if (!color) return
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, W, H)
  }

  private _drawGround(W: number, H: number, gY: number, gTop: string, gBot: string): void {
    this.px.bandGradient(0, gY, W, H - gY, [[0, gTop], [1, gBot]], 'v', PIXELART.gradientSteps)

    // 地面ライン
    const plugin = getGenre(this.rules.genre)
    const lineAlpha = plugin.groundLineAlpha ?? BACKGROUND.groundLineAlpha
    const dashAlpha = plugin.groundDashAlpha ?? BACKGROUND.dashAlpha
    this.px.rect(0, gY, W, BACKGROUND.groundLineHeight, `rgba(255,255,255,${lineAlpha})`)

    // 流れる横ダッシュ模様
    const startX = -(this.cameraX * CAMERA.parallaxGround) % BACKGROUND.dashInterval
    for (let x = startX; x < W; x += BACKGROUND.dashInterval) {
      this.px.rect(x, gY + BACKGROUND.dashOffsetY, BACKGROUND.dashLength, BACKGROUND.dashHeight, `rgba(255,255,255,${dashAlpha})`)
    }
  }

  // ─── プレイヤー描画（ジャンルプラグインに委譲） ───────────────────
  private _drawPlayer(): void {
    const p = this.player
    const ctx = this.ctx

    if (p.invincible > 0 && Math.floor(p.invincible * VFX.invincibleBlinkRate) % 2 === 0) return

    // スカッシュ＆ストレッチ
    const sqAmt = PHYSICS.landSquashAmount
    const squashX = 1 + p.landSquash * sqAmt
    const squashY = 1 - p.landSquash * sqAmt
    const threshold = -VFX.stretchUpThreshold
    const stretchX = p.onGround ? 1 : (p.vy < threshold ? VFX.stretchUpX : 1.0)
    const stretchY = p.onGround ? 1 : (p.vy < threshold ? VFX.stretchUpY : 1.0)

    ctx.save()
    ctx.translate(p.x + p.w / 2, p.y + p.h)
    ctx.scale(squashX * stretchX, squashY * stretchY)
    ctx.translate(-p.w / 2, -p.h)

    // 縦スクロール時は進行（射撃）方向が上になるため、右向き固定のスプライトを
    // 中心周りに -90° 回して上を向かせる（撃つ向きと体の向きの食い違いを解消, #102）。
    // 既に上向きで描くプラグイン（spriteFacesUp）は二重回転になるため回さない。
    if (this.rules.scrollAxis === 'y' && !getGenre(this.rules.genre).spriteFacesUp) {
      ctx.translate(p.w / 2, p.h / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.translate(-p.w / 2, -p.h / 2)
    }

    // ジャンルプラグインに描画を委譲（ここに if/else は一切不要）
    getGenre(this.rules.genre).drawPlayer(ctx, p.w, p.h, p.onGround, this.runCycle)

    ctx.restore()
  }

  // ─── ハザード描画 ─────────────────────────────────────────────────
  private _drawHazard(h: Hazard, sx: number, r: RuntimeRules): void {
    const ctx = this.ctx
    const pluginH = getGenre(this.rules.genre)

    // ジャンルプラグインが独自のハザード描画を提供する場合は委譲（true でデフォルト描画をスキップ）。
    // フックはこの1回限り。ctx.save 後の二重呼び出しは冗長で、将来「描画して false を返す」
    // プラグインが現れたら二重描画になる潜在リスクだった（#216）。
    if (pluginH.drawHazard?.(ctx, h, sx, this._getWorld()) === true) return

    const floatY = h.floatAmp > 0 ? Math.sin(h.pulse) * h.floatAmp : 0

    // ビートリズム反転色
    let color = h.color
    let glow = h.glowColor
    if (this._gameStats.beatHazardInverted && r.features.has('beat_hazard')) {
      // safeColors はマニュアル由来の色名 Set、h.color はプラグインの HEX なので
      // has() は常に false になり全ハザードが同色に潰れていた（#171-5）。
      // 反転時に危険物となる側（衝突判定 line 679 と同じ h.isSafe 基準）を赤で示す。
      color = h.isSafe ? '#e74c3c' : '#3498db'
      glow  = h.isSafe ? '#ff6b6b' : '#74b9ff'
    }

    const y = h.y + floatY
    const hCfg = pluginH.hazardConfig
    const pulseSpd = hCfg?.pulseSpeed    ?? HAZARD_VFX.pulseSpeed
    const pulseAmp = hCfg?.pulseAmplitude ?? HAZARD_VFX.pulseAmplitude
    const pulse = Math.sin(h.pulse * pulseSpd) * pulseAmp + 1

    ctx.save()

    // ジャンル固有のハザード描画フック。true ならデフォルト描画（形状・HPバー）をスキップ
    if (pluginH.drawHazard?.(ctx, h, sx, this._getWorld())) {
      ctx.restore()
      return
    }

    // グロー効果（shadowBlur の代替。px.halo が段階的に外側へ拡張して重ねる）
    this._drawHazardHalo(h.shape, sx, y, h.w, h.h, pulse, glow)

    switch (h.shape) {
      case 'spike':
        this._drawSpike(sx, y, h.w, h.h, color)
        break
      case 'pillar':
        this._drawPillar(sx, y, h.w, h.h, color)
        break
      case 'diamond':
        this._drawDiamond(sx + h.w / 2, y + h.h / 2, h.w * 0.5 * pulse, color)
        break
      default:
        this._drawRect(sx, y, h.w, h.h, color)
    }

    // STG: HP バー（StgPlugin / AerialStgPlugin の HP バーと同じく px.rect で描き、
    // デバイス空間スナップを効かせる。比率・幅の計算式は変更しない）
    if (r.features.has('enemy_hp') && h.maxHp > 1) {
      const barW = h.w * (h.hp / h.maxHp)
      const barColor = barW / h.w > HAZARD_VFX.hpBarThreshold ? HAZARD_VFX.hpBarHighColor : HAZARD_VFX.hpBarLowColor
      this.px.rect(sx, y - HAZARD_VFX.hpBarOffsetY, h.w, HAZARD_VFX.hpBarHeight, `rgba(0,0,0,${HAZARD_VFX.hpBarBgAlpha})`)
      this.px.rect(sx, y - HAZARD_VFX.hpBarOffsetY, barW, HAZARD_VFX.hpBarHeight, barColor)
    }

    ctx.restore()
  }

  // ハザード形状ごとのブロックハロー（px.halo の draw コールバック）。
  // 本体描画（_drawSpike 等）と同じ形状輪郭を expand 分だけ拡張して呼び出し側へ渡す。
  private _drawHazardHalo(shape: HazardShape, x: number, y: number, w: number, h: number, pulse: number, glow: string): void {
    const px = this.px
    px.halo((expand, c) => {
      switch (shape) {
        case 'spike':
          px.tri(x - expand, y - expand, w + expand * 2, h + expand * 2, 'up', c)
          break
        case 'diamond': {
          const r = w * 0.5 * pulse + expand
          const cx = x + w / 2, cy = y + h / 2
          px.tri(cx - r, cy - r, r * 2, r, 'up', c)
          px.tri(cx - r, cy, r * 2, r, 'down', c)
          break
        }
        default:
          px.rect(x - expand, y - expand, w + expand * 2, h + expand * 2, c)
      }
    }, glow, PIXELART.haloSteps)
  }

  private _drawRect(x: number, y: number, w: number, h: number, color: string): void {
    const px = this.px
    const light = this._lighten(color, HAZARD_VFX.lightenTopAmount)
    // 角の切り欠き（roundRect の代替）。角のセルだけ描かずに残すことで階段状ベベルにする
    const c = HAZARD_RECT_BEVEL_CELLS * Math.max(1, PIXELART.size)
    if (c > 0 && c * 2 < Math.min(w, h)) {
      px.bandGradient(x, y + c, w, h - c * 2, [[0, light], [1, color]], 'v', PIXELART.gradientSteps)
      px.rect(x + c, y, w - c * 2, c, light)
      px.rect(x + c, y + h - c, w - c * 2, c, color)
    } else {
      px.bandGradient(x, y, w, h, [[0, light], [1, color]], 'v', PIXELART.gradientSteps)
    }

    // エッジハイライト
    const edge = this._lighten(color, HAZARD_VFX.lightenEdgeAmount)
    const lineCells = Math.max(1, Math.round(HAZARD_VFX.edgeHighlightLineW))
    px.line(x, y, x + w, y, edge, lineCells)
    px.line(x, y + h, x + w, y + h, edge, lineCells)
    px.line(x, y, x, y + h, edge, lineCells)
    px.line(x + w, y, x + w, y + h, edge, lineCells)
  }

  private _drawSpike(x: number, y: number, w: number, h: number, color: string): void {
    const px = this.px
    px.tri(x, y, w, h, 'up', color)

    const edge = this._lighten(color, HAZARD_VFX.lightenEdgeAmount)
    const lineCells = Math.max(1, Math.round(HAZARD_VFX.edgeHighlightLineW))
    const cx = x + w / 2
    px.line(cx, y, x, y + h, edge, lineCells)
    px.line(cx, y, x + w, y + h, edge, lineCells)
    px.line(x, y + h, x + w, y + h, edge, lineCells)
  }

  private _drawPillar(x: number, y: number, w: number, h: number, color: string): void {
    const px = this.px
    const highlight = this._lighten(color, HAZARD_VFX.pillarHighlightAmount)
    px.bandGradient(x, y, w, h, [
      [0, color],
      [HAZARD_VFX.pillarHighlightStop, highlight],
      [1, color],
    ], 'h', PIXELART.gradientSteps)

    const capColor = this._lighten(color, HAZARD_VFX.lightenEdgeAmount + 10)
    px.rect(x - HAZARD_VFX.pillarCapOffset, y, w + HAZARD_VFX.pillarCapOffset * 2, HAZARD_VFX.pillarCapHeight, capColor)
  }

  private _drawDiamond(cx: number, cy: number, r: number, color: string): void {
    const px = this.px
    px.tri(cx - r, cy - r, r * 2, r, 'up', color)
    px.tri(cx - r, cy, r * 2, r, 'down', color)

    const edge = this._lighten(color, HAZARD_VFX.lightenEdgeAmount + 10)
    const lineCells = Math.max(1, Math.round(HAZARD_VFX.diamondEdgeLineW))
    px.line(cx, cy - r, cx + r, cy, edge, lineCells)
    px.line(cx + r, cy, cx, cy + r, edge, lineCells)
    px.line(cx, cy + r, cx - r, cy, edge, lineCells)
    px.line(cx - r, cy, cx, cy - r, edge, lineCells)
  }

  private _lighten(hex: string, amount: number): string {
    // 非16進数カラー（"red", "rgb(...)" 等）はそのまま返す
    if (!hex.startsWith('#') || hex.length < 7) return hex
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    // NaN チェック（parseInt が失敗した場合）
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
    const rr = Math.max(0, Math.min(255, r + amount))
    const gg = Math.max(0, Math.min(255, g + amount))
    const bb = Math.max(0, Math.min(255, b + amount))
    return `rgb(${rr},${gg},${bb})`
  }

   // ─── アイテム描画 ─────────────────────────────────────────────────
  private _drawItem(item: Item, sx: number): void {
    const bounce = Math.sin(item.pulse) * 4
    const y = item.y + bounce
    const id = 'item_' + item.type
    const glow = SPRITES[id]?.palette.G

    if (glow) {
      this.px.halo((expand, c) => {
        this.px.rect(sx - expand, y - expand, item.w + expand * 2, item.h + expand * 2, c)
      }, glow, PIXELART.haloSteps)
    }
    this.px.sprite(id, sx, y, item.w, item.h)
  }

  // ─── スポーン（ジャンルプラグインのテーブルを参照） ───────────────
  private _spawnHazard(): void {
    const r = this.rules
    const W = this.canvas.width
    const H = this.canvas.height
    const gY = H - BACKGROUND.groundHeight
    const isVertical = r.scrollAxis === 'y'

    const plugin = getGenre(r.genre)
    const pal = plugin.palette
    const table = plugin.spawnTable
    const weights = table.map(e => resolveWeight(e, this.distance, e.weightMaxDist ?? SPAWN.spawnWeightMaxDist))
    // 空テーブルまたは全重みが0の場合は早期 return（#bullet_hell: spawnTable=[] の安全ガード）
    if (table.length === 0 || weights.every(w => w <= 0)) return

    const entry = table[this._weightedRandom(weights)]

    const w = entry.wRange[0] + Math.random() * (entry.wRange[1] - entry.wRange[0])
    const h = entry.hRange[0] + Math.random() * (entry.hRange[1] - entry.hRange[0])

    const allColors = [...r.hazardColors, ...r.safeColors]
    const safeProb = entry.safeChance ?? (r.safeColors.size / allColors.length)
    const isSafe = Math.random() < safeProb
    const color     = entry.colorOverride     ?? (isSafe ? pal.safe    : pal.danger)
    const glowColor = entry.safeColorOverride ?? (isSafe ? pal.safeGlow : pal.dangerGlow)
    const hp = r.features.has('enemy_hp') ? (entry.hpOverride ?? SPAWN.enemyHpAmount) : 1
    const direction = entry.direction ?? 'right'

    // 可動域（左右セーフゾーンを除いた帯）。縦STGで敵がUIゾーンに湧かないようにする。
    // pattern_climb（platformer）は自前の _seedClimbRoom/_buildClimbHazard でハザードを
    // 生成し、この汎用スポーンは通らない（_updateVertical が早期に専用メソッドへ委譲するため）。
    const sz = this.safeZone
    const bandMinX = sz.left + HAZARD_BAND_MARGIN
    const bandMaxX = W - sz.right - HAZARD_BAND_MARGIN

    if (isVertical) {
      // ─── 縦スクロール: 可動域内のランダムX位置に出現 ──────────
      // hazard は screen 座標で管理。direction='right'（既定）は画面上部から出現し下へ流れる
      // （aerial_stg 等の降下型）。direction='left' は画面下部から出現し上へ流れる
      // （aquatic の潜行・platformer の climb など、プレイヤーが「上へ進む」ジャンル用）。
      const spawnX = bandMinX + Math.random() * Math.max(0, bandMaxX - w - bandMinX)
      const spawnY = direction === 'left' ? H + 20 : -h - 20
      const hz = new Hazard(spawnX, spawnY, w, h, color, glowColor, entry.shape, hp, isSafe, 0, direction)
      this._applyGimmickFields(hz, entry)
      this.hazards.push(hz)
      if (entry.isBoss) {
        const bw = this._getWorld()
        for (const sys of getActiveSystems(r.features)) sys.onBossSpawn?.(bw)
      }
      if (r.features.has('item_pickup') && Math.random() < SPAWN.itemDropChance) {
        const itemType = Math.random() < SPAWN.itemExpChance ? 'exp' : 'hp'
        // power_up 有効時は powerDropChance で power アイテムを混入
        const POWER_DROP_CHANCE = (SPAWN as { powerDropChance?: number }).powerDropChance ?? 0.15
        if (r.features.has('power_up') && Math.random() < POWER_DROP_CHANCE) {
          const powerItemX = bandMinX + Math.random() * Math.max(0, bandMaxX - 32 - bandMinX)
          this.items.push(new Item(powerItemX, spawnY, 'power'))
        } else {
          const itemX2 = bandMinX + Math.random() * Math.max(0, bandMaxX - 32 - bandMinX)
          this.items.push(new Item(itemX2, spawnY, itemType))
        }
      }
    } else {
      // ─── 横スクロール: 画面右端からワールド座標で出現 ────────────
      const worldX = this.cameraX + W + SPAWN.hazardSpawnOffsetX
      // gravity === 0 は上下自由飛行ジャンル（STG 等）。プレイヤーが y=0 まで登れるため、
      // air/float 敵を地面基準の帯に固めると画面上部が敵の届かない安全地帯になる（#177）。
      // このモードでは air/float を可動域全高（0〜gY-h）に分布させる。
      const freeFlight = r.gravity === 0
      let y: number
      let floatAmp = 0
      switch (entry.placement) {
        case 'air':
          y = freeFlight
            ? Math.random() * (gY - h)
            : gY - h - SPAWN.airMinOffset - Math.random() * SPAWN.airRandOffset
          break
        case 'float': {
          const ampRange = entry.floatAmpRange
          floatAmp = ampRange
            ? ampRange[0] + Math.random() * (ampRange[1] - ampRange[0])
            : SPAWN.defaultFloatAmp
          // 全高分布時は floatAmp 分の振動で画面外へ抜けないよう内側にクランプする
          y = freeFlight
            ? floatAmp + Math.random() * Math.max(0, gY - h - floatAmp * 2)
            : gY - h - SPAWN.floatMinOffset - Math.random() * SPAWN.floatRandOffset
          break
        }
        default: // 'ground'
          y = gY - h
      }
      // 上下セーフゾーン（横STG）を除いた可動域内へ収める。float は振動分も考慮。
      // 非STG（sz=0）では従来どおり [0, gY-h] に収まり挙動不変。
      const bandTopY = sz.top + floatAmp
      const bandBottomY = Math.min(gY, H - sz.bottom) - h - floatAmp
      if (bandBottomY > bandTopY) y = Math.max(bandTopY, Math.min(bandBottomY, y))
      // 左方向ハザードは画面左外にスポーン
      const spawnX = direction === 'left'
        ? this.cameraX - w - SPAWN.hazardSpawnOffsetX
        : worldX
      const hz = new Hazard(spawnX, y, w, h, color, glowColor, entry.shape, hp, isSafe, floatAmp, direction)
      this._applyGimmickFields(hz, entry)
      this.hazards.push(hz)
      if (entry.isBoss) {
        const bw = this._getWorld()
        for (const sys of getActiveSystems(r.features)) sys.onBossSpawn?.(bw)
      }

      if (r.features.has('item_pickup') && Math.random() < SPAWN.itemDropChance) {
        const type = Math.random() < SPAWN.itemExpChance ? 'exp' : 'hp'
        const itemY = Math.min(gY - SPAWN.itemGroundOffsetY, H - sz.bottom - SPAWN.itemGroundOffsetY)
        // power_up 有効時は powerDropChance で power アイテムを混入
        const POWER_DROP_CHANCE = (SPAWN as { powerDropChance?: number }).powerDropChance ?? 0.15
        if (r.features.has('power_up') && Math.random() < POWER_DROP_CHANCE) {
          this.items.push(new Item(worldX + SPAWN.itemOffsetX, itemY, 'power'))
        } else {
          this.items.push(new Item(worldX + SPAWN.itemOffsetX, itemY, type))
        }
      }
    }
  }

  /**
   * 横スクロールの着地先を判定する（runner/bullet_runner の穴・空中足場・バネ対応）。
   * 通常の地面(gY)に加え、isPlatform/isSpring ハザードへの着地と isHole による
   * 地面の欠落を扱う。足場は世界座標のY位置が動かないため、既存の gY 判定と同じ
   * 「今フレームで足元が到達したか」だけを見れば十分（climb と異なり許容量は不要）。
   *
   * 穴（isHole）は自身の幅が狭いと、地面ラインまで落下しきる前にハザード自体が
   * スクロールで画面外へ抜けてしまうことがある。その瞬間に「重なっているハザードが
   * 無い＝地面」という暗黙のフォールバックへ単純に戻すと、まだ落下中のプレイヤーが
   * 宙で地面に引き戻されてしまう。逆に、一度でも overHole 開始時点の判定を後々まで
   * 引きずると、穴をジャンプで正常に飛び越えた後の何もない地面でも着地できなくなる
   * （狭い穴限定の問題を全ハザード共通の地面判定に波及させてしまう）。
   *
   * 正しい判定は「穴の真上にいる間に、地面ラインへ到達／通過したか」だけを見ること。
   * これが起きた時点で「もう地面には戻れない（穴に落ちた）」と確定させ、その後は
   * 穴のハザードが画面外へ抜けていても地面判定を復活させない（this.inLethalHoleFall）。
   * 逆にジャンプで飛び越え、地面ラインに到達する前に穴を通過し終えていれば、通常通り
   * 何もない地面に着地できる。
   */
  private _resolveHorizontalLanding(p: Player, gY: number, prevFootY: number): {
    surfaceY: number | null
    hazard: Hazard | null
    isSpring: boolean
    overHole: boolean
  } {
    let overHole = false
    let best: Hazard | null = null
    let bestTop = Infinity
    for (const h of this.hazards) {
      const sx = h.x - this.cameraX
      if (p.x + p.w <= sx || p.x >= sx + h.w) continue  // 水平方向に重なっていない
      if (h.isHole) { overHole = true; continue }
      if (!h.isPlatform && !h.isSpring) continue
      const top = h.rect.y
      // isOneWay: 上昇中（vy<0）は素通り、下降中でもまだ足場に潜り込んでいなかった
      // （前フレームの足元Yが足場上端以上）場合のみ着地対象にする（plan/spec-pattern-system.md）
      if (h.isOneWay && (p.vy < 0 || prevFootY > top)) continue
      if (top < bestTop) { bestTop = top; best = h }
    }
    if (best) {
      // 明示的な足場・バネに着地できた＝安全な地面に戻れたのでフラグを解除する
      this.inLethalHoleFall = false
      return { surfaceY: bestTop, hazard: best, isSpring: best.isSpring, overHole }
    }
    if (overHole) {
      if (p.y + p.h >= gY) {
        // 穴の真上で地面ラインに到達＝本来着地するはずの高さまで落ちた。
        // ここで確定的に「落ちた」とみなし、以後は地面へ戻さず落下を継続させる
        this.inLethalHoleFall = true
      }
      return { surfaceY: null, hazard: null, isSpring: false, overHole: true }
    }
    if (this.inLethalHoleFall) {
      // 直前まで穴に落下確定していた。穴のハザード自体が画面外へ抜けても地面には戻さず、
      // 画面外への落下（死亡判定）に委ねる
      return { surfaceY: null, hazard: null, isSpring: false, overHole: true }
    }
    return { surfaceY: gY, hazard: null, isSpring: false, overHole: false }
  }

  /** SpawnEntry のギミックフィールドを生成済み Hazard へ反映する（runner/bullet_runner/platformer/aquatic） */
  private _applyGimmickFields(hz: Hazard, entry: SpawnEntry): void {
    hz.isGimmick = entry.isGimmick ?? false
    hz.isPlatform = entry.isPlatform ?? false
    hz.isSpring = entry.isSpring ?? false
    hz.isHole = entry.isHole ?? false
    hz.conveyorVx = entry.conveyorVx ?? 0
    hz.driftEnabled = entry.driftEnabled ?? false
  }

  /** 重み配列からインデックスを確率選択する */
  private _weightedRandom(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0)
    let rnd = Math.random() * total
    for (let i = 0; i < weights.length; i++) {
      rnd -= weights[i]
      if (rnd <= 0) return i
    }
    return weights.length - 1
  }

  /** Per-genre spawn params with fallback to global HAZARD_SPAWN */
  private _getSpawnParams() {
    const plugin = getGenre(this.rules.genre)
    return {
      baseInterval: plugin.spawnDensity?.baseInterval  ?? HAZARD_SPAWN.baseInterval,
      minInterval:  plugin.spawnDensity?.minInterval   ?? HAZARD_SPAWN.minInterval,
      decayRate:    plugin.spawnDensity?.decayRate     ?? HAZARD_SPAWN.decayRate,
    }
  }

  // ─── パーティクル生成 ─────────────────────────────────────────────
  private _spawnJumpParticles(x: number, y: number): void {
    const color = getGenre(this.rules.genre).particleColors?.jump ?? VFX.jumpParticleColor
    for (let i = 0; i < VFX.jumpParticleCount; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * VFX.jumpParticleSpread
      const speed = VFX.jumpParticleSpeedMin + Math.random() * (VFX.jumpParticleSpeedMax - VFX.jumpParticleSpeedMin)
      this.particles.add(
        x + (Math.random() - 0.5) * VFX.jumpParticleOffsetX, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        VFX.jumpParticleLife, color, VFX.jumpParticleSize,
      )
    }
  }

  private _spawnLandParticles(x: number, y: number): void {
    const color = getGenre(this.rules.genre).particleColors?.land ?? VFX.landParticleColor
    for (let i = 0; i < VFX.landParticleCount; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.9
      const speed = VFX.landParticleSpeedMin + Math.random() * (VFX.landParticleSpeedMax - VFX.landParticleSpeedMin)
      this.particles.add(
        x + (Math.random() - 0.5) * VFX.landParticleOffsetX, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed * VFX.landParticleYRatio,
        VFX.landParticleLife, color, VFX.landParticleSize,
      )
    }
  }

  private _spawnDeathExplosion(x: number, y: number): void {
    const colors = getGenre(this.rules.genre).particleColors?.death ?? VFX.deathParticleColors
    for (let i = 0; i < VFX.deathParticleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.deathParticleSpeedMin + Math.random() * (VFX.deathParticleSpeedMax - VFX.deathParticleSpeedMin)
      const life  = VFX.deathParticleLifeMin + Math.random() * VFX.deathParticleLifeRange
      const size  = VFX.deathParticleSizeMin + Math.random() * VFX.deathParticleSizeRange
      const color = colors[Math.floor(Math.random() * colors.length)]
      this.particles.add(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed + VFX.deathParticleYBoost, life, color, size)
    }
  }

  // 画面座標をアクティブなセーフゾーン（UIゾーン）の外側へ押し出す（仕様 2-H / 4-3 #7）。
  // 演出（パーティクル・スコアポップアップ）がUI帯に被らないよう境界でクリップする。
  private _avoidSafeZoneX(x: number): number {
    const sz = this.safeZone
    return Math.max(sz.left, Math.min(this.canvas.width - sz.right, x))
  }
  private _avoidSafeZoneY(y: number): number {
    const sz = this.safeZone
    return Math.max(sz.top, Math.min(this.canvas.height - sz.bottom, y))
  }

  private _addScorePopup(x: number, y: number, text: string, color: string): void {
    this.scorePopups.push({
      x: this._avoidSafeZoneX(x),
      y: this._avoidSafeZoneY(y),
      text, color, life: UI.popupLifeSec, vy: UI.popupRiseVy,
    })
  }

  // ─── MutableWorld 実装 ───────────────────────────────────────────
  // getter を使うことで配列が filter で置き換わっても参照が失効しない
  private _buildWorld(): MutableWorld {
    const self = this
    return {
      get player()      { return self.player },
      get hazards()     { return self.hazards },
      get items()       { return self.items },
      get bullets()     { return self._bullets },
      get rules()       { return self.rules },
      get distance()    { return self.distance },
      get survivedSec() { return self.survivedSec },
      canvas:           this.canvas,
      ctx:              this.ctx,
      get cameraX()     { return self.cameraX },
      get gameStats()   { return self._gameStats },
      get scrollMode()  { return self.rules.scrollAxis as 'x' | 'y' },
      get stealthHidden() { return self.stealthHidden },
      get climbLavaTopY() { return self.rules.features.has('pattern_climb') ? self.climbLavaTopY : Infinity },
      get patternRoomsCleared() { return self.rules.features.has('pattern_climb') ? self.climbRoomsCleared : 0 },
      setStealthHidden(v) { self.stealthHidden = v },

      addScore(amount)              { self.playScore += amount },
      addDistance(amount)           { self.distance += amount },
      addScorePopup(x, y, text, c) { self._addScorePopup(x, y, text, c) },
      triggerShake(intensity)       { self.shakeIntensity = Math.max(self.shakeIntensity, intensity) },
      addParticle(x, y, vx, vy, life, color, size = 3) {
        // フィーチャー由来のパーティクルはUIゾーン外側へクリップ（仕様 2-H）
        self.particles.add(self._avoidSafeZoneX(x), self._avoidSafeZoneY(y), vx, vy, life, color, size)
      },

      spawnHazard(h)       { self.hazards.push(h) },
      spawnItem(item)      { self.items.push(item) },
      removeHazardById(h)  {
        const i = self.hazards.indexOf(h)
        if (i >= 0) self.hazards.splice(i, 1)
      },

      modifyPlayerHp(delta) {
        const p = self.player
        p.hp = Math.max(0, Math.min(p.maxHp, p.hp + delta))
        if (p.hp <= 0) self._die(p)
      },
      resetCombo() { self._gameStats.combo = 0 },
      setTimescale(scale: number, durationSec?: number) {
        self._timescaleScale = Math.max(0, Math.min(2, scale))  // 0〜2倍に制限
        if (durationSec !== undefined && durationSec > 0) {
          self._timescaleRemaining = durationSec
        } else {
          self._timescaleRemaining = -1  // 永続
        }
      },

      getHazardScreenX(h) {
        return self.rules.scrollAxis === 'x' ? h.x - self.cameraX : h.x
      },
      getPlayerWorldX() {
        return self.rules.scrollAxis === 'x' ? self.player.x + self.cameraX : self.player.x
      },

      setKills(n)  { self._gameStats.kills = n },
      setCombo(n)  {
        self._gameStats.combo = n
        if (n > self._gameStats.maxCombo) self._gameStats.maxCombo = n
      },
      addBeatHit()             { self._gameStats.beatHits++ },
      setBeatHazardInverted(v) { self._gameStats.beatHazardInverted = v },
      addShot()                { self.stats.shots++ },

      addScoreVarsHit()        { self.scoreVarsHits++ },
      addScoreVarsItemCollected() { self.scoreVarsItemsCollected++ },
      addScoreVarsBossKill()   { self.scoreVarsBossKills++ },
      addScoreVarsStealthBonus(amount: number) { self.scoreVarsStealthBonus += amount },
      addScoreVarsColorTouch() { self.scoreVarsColorTouches++ },
      addScoreVarsHitsOnBoss() { self.scoreVarsHitsOnBoss++ },
      setScoreVarsMaxHitCombo(n: number) { if (n > self.scoreVarsMaxHitCombo) self.scoreVarsMaxHitCombo = n },

      // power_up フィーチャー用: ShootFeature が powerBoostTimer を参照
      get powerBoostTimer(): number { return self._powerBoostTimer },
      set powerBoostTimer(v: number) { self._powerBoostTimer = v },
    }
  }

  private _getControl(action: string): string | undefined {
    const c = this.rules.controls
    switch (action) {
      case 'jump':  return c.jump
      case 'left':  return c.moveLeft
      case 'right': return c.moveRight
      case 'shoot': return c.shoot
    }
  }

  private _setControl(action: string, key: string): void {
    const c = this.rules.controls
    switch (action) {
      case 'jump':  c.jump = key; break
      case 'left':  c.moveLeft = key; break
      case 'right': c.moveRight = key; break
      case 'shoot': c.shoot = key; break
    }
  }

  private _isActionDisabled(action: string): boolean {
    const until = this._disabledActions.get(action)
    if (until === undefined) return false
    if (performance.now() < until) return true
    this._disabledActions.delete(action)
    return false
  }

  private _applyLearningEffect(effect: LearningEffect): void {
    switch (effect.type) {
      case 'disableAction': {
        const actionKey = effect.payload
        const durationMs = (effect.durationSec ?? 10) * 1000
        this._disabledActions.set(actionKey, performance.now() + durationMs)
        break
      }

      case 'invertHazard': {
        this._gameStats.beatHazardInverted = true
        if (effect.durationSec != null) {
          this._invertHazardUntil = performance.now() + effect.durationSec * 1000
        }
        soundManager.onGenreLock('rhythm')  // リズム確定演出
        break
      }

      case 'forceFeature': {
        // フィーチャーを有効化（rules.features に追加）
        const featureId = effect.payload as import('../domain/types').FeatureId
        if (!this.rules.features.has(featureId)) {
          this.rules.features.add(featureId)
        }
        break
      }

      case 'changeKey': {
        // payload = "jump:w" のような形式（action:newKey）
        const [action, newKey] = effect.payload.split(':')
        // スタック方式: 各エフェクトが現在のキーをプッシュし、期限切れでポップして復元
        if (!this._keyStack.has(action)) {
          this._keyStack.set(action, [])
        }
        const currentKey = this._getControl(action)
        if (currentKey) {
          const stack = this._keyStack.get(action)
          if (stack) stack.push(currentKey)
        }
        this._setControl(action, newKey)
        if (effect.durationSec != null) {
          this._changeKeyUntil.set(action, performance.now() + effect.durationSec * 1000)
        }
        break
      }
    }
  }
}
