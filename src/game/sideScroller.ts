import type { RuntimeRules, ActionStats, ScoreVars, ManualVersion, LearningRule, LearningEffect } from '../domain/types'
import type { MutableWorld, GameStats } from '../engine/types'
import { Player, Hazard, Item, Bullet, rectsOverlap, type ScorePopup } from './entities'
import { HAZARD_SPAWN, PLAYER_PHYSICS, UPDATE_DISTANCES, DISTANCE_ACCEL } from '../data/gameBalance'
import { VFX, CAMERA, BACKGROUND, HAZARD_VFX, UI, SPAWN, SCORE, PHYSICS } from '../data/tunables'
import { getGenre, getActiveSystems } from '../engine/GameRegistry'
import { resolveWeight } from '../engine/types'
import { soundManager } from '../plugins/SoundManager'
import { evalScoreFormula, getLastFormulaError } from '../domain/scoreCalc'
import { evaluateLearningRules, describeEffect } from '../domain/LearningSystem'
import { GENRES } from '../data/genres'
import { InputManager } from './InputManager'
import { ParticleSystem } from './ParticleSystem'
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
}

// ──────────────────────────────────────────────────────────────────────
// SideScroller — Canvas ゲームエンジン本体
// ──────────────────────────────────────────────────────────────────────
export class SideScroller {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
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

  // ScoreVars 計算用フィールド
  private scoreVarsHits = 0           // 敵撃破時のヒット数（accuracy 計算用）
  private scoreVarsItemsCollected = 0 // アイテム収集総数
  private scoreVarsBossKills = 0      // ボス撃破数
  private scoreVarsStealthBonus = 0   // ステルス継続フレーム数の累積
  private scoreVarsColorTouches = 0   // 安全色タッチ回数
  private deaths = 0                  // 死亡回数（hp 有効時は複数回あり得る）

  // カメラ
  private cameraX = 0

  // スポーン
  private nextSpawnDist = 480
  private updateTriggeredFor = new Set<number>()

  // ─── 入力・パーティクル ──────────────────────────────────────────
  private input = new InputManager()
  private particles = new ParticleSystem()

  // ジャンプ改善
  private coyoteTimer = 0       // 地面を離れてからのフレーム数
  private jumpBufferTimer = 0   // ジャンプ先行入力フレーム数
  private jumpHeld = false      // ジャンプキー押しっぱなし判定

  // ─── 演出 ────────────────────────────────────────────────────────
  private scorePopups: ScorePopup[] = []
  private shakeIntensity = 0
  private shakeX = 0; private shakeY = 0

  // 死亡演出
  private deathTimer = 0
  private deathSlowMo = false

  // プレイヤー演出
  private runCycle = 0           // 走りアニメ位相（0〜1）

  // タイムスケール（setTimescale 用）
  private _timescaleScale = 1.0
  private _timescaleRemaining = -1

  // フレーム内で一度だけ _buildWorld() するためのキャッシュ
  private _frameWorld: MutableWorld | null = null

  // ─── 統計 ────────────────────────────────────────────────────────
  private stats: ActionStats = { jumps: 0, moveRight: 0, moveLeft: 0, shots: 0, ticks: 0 }
  private rafId = 0
  private lastTime = 0

  // ─── LearningSystem ──────────────────────────────────────────────
  private learningRules: LearningRule[] | null = null
  private learningCheckTimer = 0         // 次のチェック予定時刻
  // disableAction エフェクト: action名 → 解除予定時刻(performance.now() ベース)
  private _disabledActions = new Map<string, number>()
  // invertHazard 解除予定時刻（-Infinity = 永続/未設定）
  private _invertHazardUntil = -Infinity
  // changeKey 元キー保存: action名 → 元のキー文字列
  private _originalKeys: Partial<Record<string, string>> = {}
  // changeKey 解除予定時刻: action名 → 解除時刻
  private _changeKeyUntil = new Map<string, number>()
  // 次の getSnapshot() で一度だけ返す通知メッセージ
  private _pendingLearningMsg: string | null = null
  private _pendingFormulaError: string | null = null

  constructor(canvas: HTMLCanvasElement, rules: RuntimeRules) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.rules = rules

    const gY = canvas.height - 80
    this.player = new Player(140, gY)
    this.player.jumpsLeft = rules.features.has('double_jump') ? 2 : 1

    this.input.setGameKeys(rules.controls)
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

    this.rules = rules
    this.input.setGameKeys(rules.controls)
    if (rules.features.has('double_jump')) {
      this.player.jumpsLeft = Math.max(this.player.jumpsLeft, 2)
    }
    // ManualVersion から learningRules を取得
    if (manual?.learningRules) {
      this.learningRules = JSON.parse(JSON.stringify(manual.learningRules))
      this.learningCheckTimer = 0.5  // 0.5秒後に最初のチェック
    } else {
      this.learningRules = null
    }
    // updateRules はループ外から呼ばれるため _frameWorld を使わず直接構築
    const world = this._buildWorld()
    for (const sys of getActiveSystems(rules.features)) {
      sys.onManualUpdated?.(world, '')
    }
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

  /** ウィンドウリサイズ時に呼ぶ。canvas.width/height の変更後に Canvas コンテキスト状態を復元する */
  onResize(): void {
    // canvas サイズ変更で ctx 状態はリセットされる。次フレームの描画が正しく動くよう
    // lastTime をリセットして dt が巨大値にならないようにする
    this.lastTime = performance.now()
  }

  getSnapshot(): GameSnapshot {
    let pending = UPDATE_DISTANCES.findIndex(
      (d, i) => this.distance >= d && !this.updateTriggeredFor.has(i)
    )
    // UPDATE_DISTANCES の範囲外でも無限に更新を続ける（1500px 間隔）
    if (pending < 0) {
      const lastDist = UPDATE_DISTANCES[UPDATE_DISTANCES.length - 1]
      const infiniteInterval = 1500
      if (this.distance >= lastDist) {
        const extraIdx = UPDATE_DISTANCES.length + Math.floor((this.distance - lastDist) / infiniteInterval)
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
    }
  }

  markUpdated(index: number): void {
    this.updateTriggeredFor.add(index)
  }

  getStats(): ActionStats { return this.stats }

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
    }

    const genre = GENRES.find(g => g.id === this.rules.genre)
    const formula = genre?.scoreFormula ?? 'distance * 0.8'
    this.playScore = Math.max(0, Math.round(evalScoreFormula(formula, vars)))
  }

  // ─── メインループ ────────────────────────────────────────────────
  private _loop = (ts: number) => {
    const rawDt = Math.min((ts - this.lastTime) / 1000, 0.05)
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
        const orig = this._originalKeys[action]
        if (orig !== undefined) {
          this._setControl(action, orig)
          delete this._originalKeys[action]
        }
        this._changeKeyUntil.delete(action)
      }
    }

    const r = this.rules
    const H = this.canvas.height
    const dashKey  = r.controls.dash ?? 'Shift'
    const isVertical = r.scrollAxis === 'y'

    if (r.features.has('dash') && this.input.justPressed.has(dashKey)) {
      this.stats.dashes = (this.stats.dashes ?? 0) + 1
    }

    // ─── 距離ベースの自動加速 ─────────────────────────────────────────
    const distanceAccelFactor = 1 + Math.min(this.distance / DISTANCE_ACCEL.fullDist, DISTANCE_ACCEL.maxBonus)
    const effectiveScrollSpeed = r.scrollSpeed * distanceAccelFactor

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

    // ─── 距離スコア加算 ───────────────────────────────────────────
    this.playScore += effectiveScrollSpeed * dt * SCORE.distanceScoreRate
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
    const r = this.rules
    const p = this.player
    const W = this.canvas.width
    const H = this.canvas.height
    const leftKey  = r.controls.moveLeft
    const rightKey = r.controls.moveRight
    const shootKey = (r.controls.shoot ?? 'z').toLowerCase()

    if (this.input.keys.has(leftKey))  this.stats.moveLeft++
    if (this.input.keys.has(rightKey)) this.stats.moveRight++
    p.x += p.vx * dt
    p.x = Math.max(0, Math.min(W - p.w, p.x))
    p.y = Math.max(0, Math.min(H - p.h, p.y + p.vy * dt))
    p.onGround = false
    this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate
    this.distance += speed * dt
    this.cameraX = 0

    for (const h of this.hazards) {
      h.y += speed * dt
      h.pulse += dt * VFX.hazardPulseRate
    }
    this.hazards = this.hazards.filter(h => h.y < H + 200)

    for (const item of this.items) {
      item.y += speed * dt
    }

    if (this.distance >= this.nextSpawnDist) {
      this._spawnHazard()
      const interval = HAZARD_SPAWN.baseInterval * Math.exp(-HAZARD_SPAWN.decayRate * this.distance)
      this.nextSpawnDist += (Math.max(HAZARD_SPAWN.minInterval, interval) / 1000) * speed
    }

    if (p.invincible > 0) p.invincible -= dt
    if (p.invincible <= 0) {
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i]
        if (!rectsOverlap(p.rect, h.rect)) continue
        if (!h.isSafe) {
          this._onPlayerHit(p)
          if (this.dead) return true
        } else {
          for (const sys of getActiveSystems(r.features)) {
            sys.onSafeHazardTouch?.(this._getWorld(), h, h.x)
          }
        }
      }
    }

    if (this.input.justPressed.has(shootKey)) this.stats.shots++
    return false
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
    const shootKey = (r.controls.shoot ?? 'z').toLowerCase()

    if (!r.features.has('auto_run') && this.input.keys.has(leftKey))  this.stats.moveLeft++
    if ( r.features.has('auto_run') || this.input.keys.has(rightKey)) this.stats.moveRight++
    if (p.onGround) {
      this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate
    }

    const isDouble         = r.features.has('double_jump')
    const jumpDisabled     = this._isActionDisabled('jump')
    const jumpJustPressed  = !jumpDisabled && this.input.justPressed.has(jumpKey)
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
    p.y += p.vy * dt

    if (p.y + p.h >= gY) {
      const wasInAir = !p.onGround
      p.y = gY - p.h
      p.vy = 0
      p.onGround = true
      p.jumpsLeft = isDouble ? 2 : 1
      if (wasInAir) {
        p.landSquash = 1.0
        this._spawnLandParticles(p.x + p.w / 2, gY)
        soundManager.onLand()
        getGenre(r.genre).onPlayerLand?.(this._getWorld())
        if (this.jumpBufferTimer > 0) {
          p.vy = PLAYER_PHYSICS.jumpVelocity
          p.onGround = false
          p.jumpsLeft = isDouble ? 1 : 0
          this.jumpBufferTimer = 0
          this.jumpHeld = true
          this.stats.jumps++
          const jw = this._getWorld()
          getGenre(r.genre).onPlayerJump?.(jw)
          for (const sys of getActiveSystems(r.features)) sys.onPlayerJump?.(jw)
        }
      }
    } else {
      p.onGround = false
      p.airTime += dt
    }
    if (p.landSquash > 0) p.landSquash *= PHYSICS.landSquashDecay

    if (!r.features.has('auto_run')) p.x += p.vx * dt
    p.x = Math.max(PHYSICS.playerMinX, Math.min(W * PHYSICS.playerMaxXRatio, p.x))

    this.distance += speed * dt
    this.cameraX = this.distance - CAMERA.leadOffset

    if (this.distance >= this.nextSpawnDist) {
      this._spawnHazard()
      const interval = HAZARD_SPAWN.baseInterval * Math.exp(-HAZARD_SPAWN.decayRate * this.distance)
      this.nextSpawnDist += (Math.max(HAZARD_SPAWN.minInterval, interval) / 1000) * speed
    }

    for (const h of this.hazards) {
      h.pulse += dt * VFX.hazardPulseRate
    }

    if (p.invincible > 0) p.invincible -= dt
    if (p.invincible <= 0) {
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const h = this.hazards[i]
        const sx = h.x - this.cameraX
        const hRect = { ...h.rect, x: sx }
        if (!rectsOverlap(p.rect, hRect)) continue
        const isHazardous = this._gameStats.beatHazardInverted && r.features.has('beat_hazard')
          ? h.isSafe
          : !h.isSafe
        if (isHazardous) {
          this._onPlayerHit(p)
          if (this.dead) return true
        } else {
          for (const sys of getActiveSystems(r.features)) {
            sys.onSafeHazardTouch?.(this._getWorld(), h, sx)
          }
        }
      }
    }

    this.hazards = this.hazards.filter(h => h.x - this.cameraX > SPAWN.hazardCullLeft)

    if (this.input.justPressed.has(shootKey)) this.stats.shots++
    return false
  }

  // ─── 被弾処理 ────────────────────────────────────────────────────
  private _onPlayerHit(p: Player): void {
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
    const gY = H - 80

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
      ctx.globalAlpha = sp.life
      ctx.fillStyle = sp.color
      ctx.font = 'bold 15px "Courier New", monospace'
      ctx.fillText(sp.text, sp.x, sp.y)
    }
    ctx.globalAlpha = 1

    // ─── プレイヤー ───────────────────────────────────────────────
    if (!this.dead) this._drawPlayer()

    ctx.restore()  // shake の restore

    // ─── 死亡オーバーレイ ─────────────────────────────────────────
    if (this.dead) {
      const fadeIn = Math.min(1, this.deathTimer * 2.5)
      ctx.fillStyle = `rgba(0,0,0,${fadeIn * 0.7})`
      ctx.fillRect(0, 0, W, H)

      if (this.deathTimer > 0.4) {
        const alpha = Math.min(1, (this.deathTimer - 0.4) * 3)
        ctx.globalAlpha = alpha
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 36px "Courier New", monospace'
        ctx.textAlign = 'center'
        ctx.fillText('GAME OVER', W / 2, H / 2 - 10)
        ctx.font = '16px "Courier New", monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.fillText('説明書を投げてください', W / 2, H / 2 + 28)
        ctx.textAlign = 'left'
        ctx.globalAlpha = 1
      }
    }
  }

  // ─── 背景描画（プラグイン委譲） ──────────────────────────────────
  private _drawBackground(W: number, H: number, gY: number): void {
    const ctx = this.ctx
    const plugin = getGenre(this.rules.genre)
    const cam = this.cameraX
    const isVertical = this.rules.scrollAxis === 'y'

    if (isVertical) {
      // 縦モード: 全画面を空グラデーションで塗り、地面ラインなし
      const grad = ctx.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, plugin.skyColors[0])
      grad.addColorStop(1, plugin.skyColors[1])
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
      if (plugin.starColor) {
        this._drawStarField(this.distance * CAMERA.parallaxStars, W, H * 0.9, plugin)
      }
      this._drawEnvironmentOverlay(W, H)
      return
    }

    // 空グラデーション
    const grad = ctx.createLinearGradient(0, 0, 0, gY)
    grad.addColorStop(0, plugin.skyColors[0])
    grad.addColorStop(1, plugin.skyColors[1])
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, gY)

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
    const ctx = this.ctx
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
    ctx.fillStyle = plugin.starColor!
    for (let s = sector - 1; s <= sector + 2; s++) {
      const baseX = s * sectorW - offsetX
      for (let i = 0; i < density; i++) {
        const h = (s * 1013 + i * 37) & 0xffff
        const x = baseX + ((h * 1664525 + 1013904223) & 0xffff) % sectorW
        const y = ((h * 22695477 + 1) & 0xffff) % Math.floor(maxY)
        const size = sizeMin + ((h >> 12) % (sizeRange + 1))
        const alpha = alphaMin + ((h >> 8) & 3) * alphaStep
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
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
    const ctx = this.ctx
    const gGrad = ctx.createLinearGradient(0, gY, 0, H)
    gGrad.addColorStop(0, gTop)
    gGrad.addColorStop(1, gBot)
    ctx.fillStyle = gGrad
    ctx.fillRect(0, gY, W, H - gY)

    // 地面ライン
    const plugin = getGenre(this.rules.genre)
    const lineAlpha = plugin.groundLineAlpha ?? BACKGROUND.groundLineAlpha
    const dashAlpha = plugin.groundDashAlpha ?? BACKGROUND.dashAlpha
    ctx.fillStyle = `rgba(255,255,255,${lineAlpha})`
    ctx.fillRect(0, gY, W, BACKGROUND.groundLineHeight)

    // 流れる横ダッシュ模様
    const startX = -(this.cameraX * CAMERA.parallaxGround) % BACKGROUND.dashInterval
    ctx.fillStyle = `rgba(255,255,255,${dashAlpha})`
    for (let x = startX; x < W; x += BACKGROUND.dashInterval) {
      ctx.fillRect(x, gY + BACKGROUND.dashOffsetY, BACKGROUND.dashLength, BACKGROUND.dashHeight)
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

    // ジャンルプラグインに描画を委譲（ここに if/else は一切不要）
    getGenre(this.rules.genre).drawPlayer(ctx, p.w, p.h, p.onGround, this.runCycle)

    ctx.restore()
  }

  // ─── ハザード描画 ─────────────────────────────────────────────────
  private _drawHazard(h: Hazard, sx: number, r: RuntimeRules): void {
    const ctx = this.ctx
    const floatY = h.floatAmp > 0 ? Math.sin(h.pulse) * h.floatAmp : 0

    // ビートリズム反転色
    let color = h.color
    let glow = h.glowColor
    if (this._gameStats.beatHazardInverted && r.features.has('beat_hazard')) {
      color = r.safeColors.has(h.color) ? '#e74c3c' : '#3498db'
      glow = r.safeColors.has(h.color) ? '#ff6b6b' : '#74b9ff'
    }

    const y = h.y + floatY
    const pluginH = getGenre(this.rules.genre)
    const hCfg = pluginH.hazardConfig
    const pulseSpd = hCfg?.pulseSpeed    ?? HAZARD_VFX.pulseSpeed
    const pulseAmp = hCfg?.pulseAmplitude ?? HAZARD_VFX.pulseAmplitude
    const glowBlur = hCfg?.glowBlur      ?? HAZARD_VFX.glowBlur
    const pulse = Math.sin(h.pulse * pulseSpd) * pulseAmp + 1

    ctx.save()

    // グロー効果
    ctx.shadowColor = glow
    ctx.shadowBlur = glowBlur

    ctx.fillStyle = color

    switch (h.shape) {
      case 'spike':
        this._drawSpike(ctx, sx, y, h.w, h.h, color)
        break
      case 'pillar':
        this._drawPillar(ctx, sx, y, h.w, h.h, color)
        break
      case 'diamond':
        this._drawDiamond(ctx, sx + h.w / 2, y + h.h / 2, h.w * 0.5 * pulse, color)
        break
      default:
        this._drawRect(ctx, sx, y, h.w, h.h, color)
    }

    // STG: HP バー
    if (r.features.has('enemy_hp') && h.maxHp > 1) {
      ctx.shadowBlur = 0
      const barW = h.w * (h.hp / h.maxHp)
      ctx.fillStyle = `rgba(0,0,0,${HAZARD_VFX.hpBarBgAlpha})`
      ctx.fillRect(sx, y - HAZARD_VFX.hpBarOffsetY, h.w, HAZARD_VFX.hpBarHeight)
      ctx.fillStyle = barW / h.w > HAZARD_VFX.hpBarThreshold ? HAZARD_VFX.hpBarHighColor : HAZARD_VFX.hpBarLowColor
      ctx.fillRect(sx, y - HAZARD_VFX.hpBarOffsetY, barW, HAZARD_VFX.hpBarHeight)
    }

    ctx.restore()
  }

  private _drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    // グラデーション付き
    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, this._lighten(color, HAZARD_VFX.lightenTopAmount))
    grad.addColorStop(1, color)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.roundRect ? ctx.roundRect(x, y, w, h, HAZARD_VFX.rectCornerRadius) : ctx.rect(x, y, w, h)
    ctx.fill()

    // エッジハイライト
    ctx.strokeStyle = this._lighten(color, HAZARD_VFX.lightenEdgeAmount)
    ctx.lineWidth = HAZARD_VFX.edgeHighlightLineW
    ctx.stroke()
  }

  private _drawSpike(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    const cx = x + w / 2
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(cx, y)
    ctx.lineTo(x, y + h)
    ctx.lineTo(x + w, y + h)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = this._lighten(color, HAZARD_VFX.lightenEdgeAmount)
    ctx.lineWidth = HAZARD_VFX.edgeHighlightLineW
    ctx.stroke()
  }

  private _drawPillar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    const grad = ctx.createLinearGradient(x, y, x + w, y)
    grad.addColorStop(0, color)
    grad.addColorStop(HAZARD_VFX.pillarHighlightStop, this._lighten(color, HAZARD_VFX.pillarHighlightAmount))
    grad.addColorStop(1, color)
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = this._lighten(color, HAZARD_VFX.lightenEdgeAmount + 10)
    ctx.fillRect(x - HAZARD_VFX.pillarCapOffset, y, w + HAZARD_VFX.pillarCapOffset * 2, HAZARD_VFX.pillarCapHeight)
  }

  private _drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r, cy)
    ctx.lineTo(cx, cy + r)
    ctx.lineTo(cx - r, cy)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = this._lighten(color, HAZARD_VFX.lightenEdgeAmount + 10)
    ctx.lineWidth = HAZARD_VFX.diamondEdgeLineW
    ctx.stroke()
  }

  private _lighten(hex: string, amount: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const rr = Math.min(255, r + amount)
    const gg = Math.min(255, g + amount)
    const bb = Math.min(255, b + amount)
    return `rgb(${rr},${gg},${bb})`
  }

  // ─── アイテム描画 ─────────────────────────────────────────────────
  private _drawItem(item: Item, sx: number): void {
    const ctx = this.ctx
    const bounce = Math.sin(item.pulse) * 4
    const y = item.y + bounce

    ctx.save()
    if (item.type === 'exp') {
      ctx.shadowColor = '#ffcc00'
      ctx.shadowBlur = 12
      ctx.fillStyle = '#ffcc00'
      // 星形
      this._drawStar(ctx, sx + 11, y + 11, 10, 5, 5)
    } else {
      ctx.shadowColor = '#ff8888'
      ctx.shadowBlur = 12
      ctx.fillStyle = '#ff5555'
      ctx.beginPath()
      ctx.arc(sx + 11, y + 11, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffaaaa'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('♥', sx + 11, y + 15)
    }
    ctx.restore()
  }

  private _drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r1: number, r2: number, points: number): void {
    ctx.beginPath()
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2
      const r = i % 2 === 0 ? r1 : r2
      i === 0 ? ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
               : ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
    }
    ctx.closePath()
    ctx.fill()
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
    const entry = table[this._weightedRandom(weights)]

    const w = entry.wRange[0] + Math.random() * (entry.wRange[1] - entry.wRange[0])
    const h = entry.hRange[0] + Math.random() * (entry.hRange[1] - entry.hRange[0])

    const allColors = [...r.hazardColors, ...r.safeColors]
    const safeProb = entry.safeChance ?? (r.safeColors.size / allColors.length)
    const isSafe = Math.random() < safeProb
    const color     = entry.colorOverride     ?? (isSafe ? pal.safe    : pal.danger)
    const glowColor = entry.safeColorOverride ?? (isSafe ? pal.safeGlow : pal.dangerGlow)
    const hp = r.features.has('enemy_hp') ? (entry.hpOverride ?? SPAWN.enemyHpAmount) : 1

    if (isVertical) {
      // ─── 縦スクロール: 画面上端からランダムX位置に出現 ──────────
      // hazard は screen 座標で管理（y が増加 → 下に落ちる）
      const spawnX = Math.random() * (W - w - 20) + 10
      const spawnY = -h - 20  // 画面外上部
      this.hazards.push(new Hazard(spawnX, spawnY, w, h, color, glowColor, entry.shape, hp, isSafe, 0))
      if (entry.isBoss) {
        const bw = this._getWorld()
        for (const sys of getActiveSystems(r.features)) sys.onBossSpawn?.(bw)
      }
      if (r.features.has('item_pickup') && Math.random() < SPAWN.itemDropChance) {
        const itemType = Math.random() < SPAWN.itemExpChance ? 'exp' : 'hp'
        const itemX = Math.random() * (W - 32) + 16
        this.items.push(new Item(itemX, spawnY, itemType))
      }
    } else {
      // ─── 横スクロール: 画面右端からワールド座標で出現 ────────────
      const worldX = this.cameraX + W + SPAWN.hazardSpawnOffsetX
      let y: number
      let floatAmp = 0
      switch (entry.placement) {
        case 'air':
          y = gY - h - SPAWN.airMinOffset - Math.random() * SPAWN.airRandOffset
          break
        case 'float': {
          y = gY - h - SPAWN.floatMinOffset - Math.random() * SPAWN.floatRandOffset
          const ampRange = entry.floatAmpRange
          floatAmp = ampRange
            ? ampRange[0] + Math.random() * (ampRange[1] - ampRange[0])
            : SPAWN.defaultFloatAmp
          break
        }
        default: // 'ground'
          y = gY - h
      }
      this.hazards.push(new Hazard(worldX, y, w, h, color, glowColor, entry.shape, hp, isSafe, floatAmp))
      if (entry.isBoss) {
        const bw = this._getWorld()
        for (const sys of getActiveSystems(r.features)) sys.onBossSpawn?.(bw)
      }

      if (r.features.has('item_pickup') && Math.random() < SPAWN.itemDropChance) {
        const type = Math.random() < SPAWN.itemExpChance ? 'exp' : 'hp'
        this.items.push(new Item(worldX + SPAWN.itemOffsetX, gY - SPAWN.itemGroundOffsetY, type))
      }
    }
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

  private _addScorePopup(x: number, y: number, text: string, color: string): void {
    this.scorePopups.push({ x, y, text, color, life: UI.popupLifeSec, vy: UI.popupRiseVy })
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

      addScore(amount)              { self.playScore += amount },
      addScorePopup(x, y, text, c) { self._addScorePopup(x, y, text, c) },
      triggerShake(intensity)       { self.shakeIntensity = Math.max(self.shakeIntensity, intensity) },
      addParticle(x, y, vx, vy, life, color, size = 3) {
        self.particles.add(x, y, vx, vy, life, color, size)
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

      addScoreVarsHit()        { self.scoreVarsHits++ },
      addScoreVarsItemCollected() { self.scoreVarsItemsCollected++ },
      addScoreVarsBossKill()   { self.scoreVarsBossKills++ },
      addScoreVarsStealthBonus(amount: number) { self.scoreVarsStealthBonus += amount },
      addScoreVarsColorTouch() { self.scoreVarsColorTouches++ },
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
        if (!(action in this._originalKeys)) {
          this._originalKeys[action] = this._getControl(action)
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
