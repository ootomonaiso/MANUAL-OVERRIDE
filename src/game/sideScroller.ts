import type { RuntimeRules, ActionStats } from '../domain/types'
import type { MutableWorld, InputSnapshot, GameStats } from '../engine/types'
import { Player, Hazard, Item, Bullet, rectsOverlap, type ScorePopup } from './entities'
import { HAZARD_SPAWN, PLAYER_PHYSICS, UPDATE_DISTANCES } from '../data/gameBalance'
import { VFX, CAMERA, BACKGROUND, HAZARD_VFX, UI, SPAWN, SCORE, PHYSICS } from '../data/tunables'
import { getGenre, getActiveSystems } from '../engine/GameRegistry'
import { resolveWeight } from '../engine/types'
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
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }

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

  // カメラ
  private cameraX = 0
  // 縦スクロールモード用: 色踏みのミスカウント
  private colorTouchMisses = 0

  // スポーン
  private nextSpawnDist = 480
  private updateTriggeredFor = new Set<number>()

  // ─── 入力 ───────────────────────────────────────────────────────
  private keys = new Set<string>()
  private prevKeys = new Set<string>()
  private justPressed = new Set<string>()
  private justReleased = new Set<string>()

  // ジャンプ改善
  private coyoteTimer = 0       // 地面を離れてからのフレーム数
  private jumpBufferTimer = 0   // ジャンプ先行入力フレーム数
  private jumpHeld = false      // ジャンプキー押しっぱなし判定

  // ─── 演出 ────────────────────────────────────────────────────────
  private particles: Particle[] = []
  private scorePopups: ScorePopup[] = []
  private shakeIntensity = 0
  private shakeX = 0; private shakeY = 0

  // 死亡演出
  private deathTimer = 0
  private deathSlowMo = false

  // プレイヤー演出
  private runCycle = 0           // 走りアニメ位相（0〜1）

  // ─── 統計 ────────────────────────────────────────────────────────
  private stats: ActionStats = { jumps: 0, moveRight: 0, moveLeft: 0, shots: 0, ticks: 0 }
  private rafId = 0
  private lastTime = 0

  // イベントハンドラ（解除用に保持）
  private _onKeyDown: (e: KeyboardEvent) => void
  private _onKeyUp: (e: KeyboardEvent) => void

  constructor(canvas: HTMLCanvasElement, rules: RuntimeRules) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.rules = rules

    const gY = canvas.height - 80
    this.player = new Player(140, gY)
    this.player.jumpsLeft = rules.features.has('double_jump') ? 2 : 1

    // イベントハンドラ登録（解除できるよう名前付き関数で保持）
    this._onKeyDown = (e: KeyboardEvent) => {
      const key = this._normalizeKey(e)
      this.keys.add(key)
      // ゲームで使うキーのみ preventDefault
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'z', 'Z'].includes(key)) {
        e.preventDefault()
      }
    }
    this._onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(this._normalizeKey(e))
    }
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }

  // ─── キー正規化 ──────────────────────────────────────────────────
  private _normalizeKey(e: KeyboardEvent): string {
    // Space bar: e.key === ' '
    if (e.key === ' ') return 'Space'
    return e.key
  }

  // ルール更新
  updateRules(rules: RuntimeRules): void {
    this.rules = rules
    if (rules.features.has('double_jump')) {
      this.player.jumpsLeft = Math.max(this.player.jumpsLeft, 2)
    }
    const world = this._buildWorld()
    for (const sys of getActiveSystems(rules.features)) {
      sys.onManualUpdated?.(world, '')
    }
  }

  start(): void {
    this.lastTime = performance.now()
    this.rafId = requestAnimationFrame(this._loop)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
  }

  setPaused(v: boolean): void { this.paused = v }

  getSnapshot(): GameSnapshot {
    const pending = UPDATE_DISTANCES.findIndex(
      (d, i) => this.distance >= d && !this.updateTriggeredFor.has(i)
    )
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
    }
  }

  markUpdated(index: number): void {
    this.updateTriggeredFor.add(index)
    this.paused = false
  }

  getStats(): ActionStats { return this.stats }

  // ─── メインループ ────────────────────────────────────────────────
  private _loop = (ts: number) => {
    let dt = Math.min((ts - this.lastTime) / 1000, 0.05)
    this.lastTime = ts

    this._computeInputEdges()

    if (!this.paused) {
      if (!this.dead) {
        this._update(dt)
      } else {
        this._updateDeathEffect(dt)
      }
    }

    this._render()

    this.prevKeys = new Set(this.keys)
    this.rafId = requestAnimationFrame(this._loop)
  }

  private _computeInputEdges(): void {
    this.justPressed.clear()
    this.justReleased.clear()
    for (const k of this.keys) {
      if (!this.prevKeys.has(k)) this.justPressed.add(k)
    }
    for (const k of this.prevKeys) {
      if (!this.keys.has(k)) this.justReleased.add(k)
    }
  }

  // ─── 更新 ────────────────────────────────────────────────────────
  private _update(dt: number): void {
    this.survivedSec += dt
    this.stats.ticks++

    const r = this.rules
    const p = this.player
    const W = this.canvas.width
    const H = this.canvas.height
    const gY = H - BACKGROUND.groundHeight

    const jumpKey  = r.controls.jump
    const leftKey  = r.controls.moveLeft
    const rightKey = r.controls.moveRight
    const shootKey = r.controls.shoot ?? 'z'

    const isVertical = r.scrollAxis === 'y'

    // ─── Pre-physics: 移動 Feature が vx をセット ────────────────────
    {
      const preWorld = this._buildWorld()
      const preInput: InputSnapshot = {
        keys: this.keys,
        justPressed: this.justPressed,
        justReleased: this.justReleased,
      }
      for (const sys of getActiveSystems(r.features)) {
        sys.preUpdate?.(preWorld, preInput, dt)
      }
    }

    if (isVertical) {
      // ════════════════════════════════════════════════════════
      // 縦スクロールモード
      // 障害物が上から降ってくる。プレイヤーは画面下部を左右に移動。
      // ════════════════════════════════════════════════════════
      // vx は MovementFeature.preUpdate() がセット済み
      if (this.keys.has(leftKey))  this.stats.moveLeft++
      if (this.keys.has(rightKey)) this.stats.moveRight++
      p.x += p.vx * dt
      p.x = Math.max(0, Math.min(W - p.w, p.x))

      // 縦モードでは重力なし。プレイヤーは画面下に固定
      p.y = H - BACKGROUND.groundHeight - p.h - 8
      p.vy = 0
      p.onGround = true
      this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate

      // スクロール距離（時間経過でカウント）
      this.distance += r.scrollSpeed * dt
      this.cameraX = 0  // 横カメラは動かない

      // ─── ハザード降下 ─────────────────────────────────────
      for (const h of this.hazards) {
        h.y += r.scrollSpeed * dt
        h.pulse += dt * VFX.hazardPulseRate
      }
      this.hazards = this.hazards.filter(h => h.y < H + 200)

      // ─── スポーン（上端から） ─────────────────────────────
      if (this.distance >= this.nextSpawnDist) {
        this._spawnHazard()
        const interval = HAZARD_SPAWN.baseInterval *
          Math.exp(-HAZARD_SPAWN.decayRate * this.distance)
        const ms = Math.max(HAZARD_SPAWN.minInterval, interval)
        this.nextSpawnDist += (ms / 1000) * r.scrollSpeed
      }

      // ─── 衝突判定（縦モード: 両者スクリーン座標） ───────────
      if (p.invincible > 0) p.invincible -= dt
      if (p.invincible <= 0) {
        const collWorld = this._buildWorld()
        for (let i = this.hazards.length - 1; i >= 0; i--) {
          const h = this.hazards[i]
          if (!rectsOverlap(p.rect, h.rect)) continue

          if (!h.isSafe) {
            this._onPlayerHit(p)
            if (this.dead) return
          } else {
            for (const sys of getActiveSystems(r.features)) {
              sys.onSafeHazardTouch?.(collWorld, h, h.x)
            }
          }
        }
      }

      // シュート入力統計のみここで取得（shoot 処理は feature system に委譲）
      if (this.justPressed.has(shootKey)) this.stats.shots++

    } else {
      // ════════════════════════════════════════════════════════
      // 横スクロールモード（従来）
      // ════════════════════════════════════════════════════════
      // vx は MovementFeature.preUpdate() がセット済み
      if (!r.features.has('auto_run') && this.keys.has(leftKey))  this.stats.moveLeft++
      if ( r.features.has('auto_run') || this.keys.has(rightKey)) this.stats.moveRight++
      if (p.onGround) {
        this.runCycle += Math.abs(p.vx) * dt * VFX.runCycleRate
      }

      // ─── ジャンプ ─────────────────────────────────────────
      const isDouble         = r.features.has('double_jump')
      const jumpJustPressed  = this.justPressed.has(jumpKey)
      const jumpJustReleased = this.justReleased.has(jumpKey)

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
          this._spawnJumpParticles(p.x + p.w / 2, p.y + p.h)
        }
      }
      if (jumpJustReleased && p.vy < 0 && this.jumpHeld) {
        p.vy *= PLAYER_PHYSICS.jumpCutMultiplier
        this.jumpHeld = false
      }
      if (!this.keys.has(jumpKey)) this.jumpHeld = false

      // ─── 重力 ─────────────────────────────────────────────
      const gravMult = p.vy > 0 ? PLAYER_PHYSICS.fallGravityMult : 1.0
      p.vy += r.gravity * gravMult * dt
      p.y  += p.vy * dt

      if (p.y + p.h >= gY) {
        const wasInAir = !p.onGround
        p.y = gY - p.h
        p.vy = 0
        p.onGround = true
        p.jumpsLeft = isDouble ? 2 : 1
        if (wasInAir) {
          p.landSquash = 1.0
          this._spawnLandParticles(p.x + p.w / 2, gY)
          if (this.jumpBufferTimer > 0) {
            p.vy = PLAYER_PHYSICS.jumpVelocity
            p.onGround = false
            p.jumpsLeft = isDouble ? 1 : 0
            this.jumpBufferTimer = 0
            this.jumpHeld = true
            this.stats.jumps++
          }
        }
      } else {
        p.onGround = false
        p.airTime += dt
      }
      if (p.landSquash > 0) p.landSquash *= PHYSICS.landSquashDecay

      // auto_run はスクロールで進む。画面上のX座標は変えない
      if (!r.features.has('auto_run')) p.x += p.vx * dt
      p.x = Math.max(PHYSICS.playerMinX, Math.min(W * PHYSICS.playerMaxXRatio, p.x))

      // ─── スクロール ───────────────────────────────────────
      this.distance += r.scrollSpeed * dt
      this.cameraX = this.distance - CAMERA.leadOffset

      // ─── ハザードスポーン ─────────────────────────────────
      if (this.distance >= this.nextSpawnDist) {
        this._spawnHazard()
        const interval = HAZARD_SPAWN.baseInterval *
          Math.exp(-HAZARD_SPAWN.decayRate * this.distance)
        const ms = Math.max(HAZARD_SPAWN.minInterval, interval)
        this.nextSpawnDist += (ms / 1000) * r.scrollSpeed
      }

      for (const h of this.hazards) {
        h.pulse += dt * VFX.hazardPulseRate
      }

      // ─── 衝突判定 ─────────────────────────────────────────
      if (p.invincible > 0) p.invincible -= dt
      if (p.invincible <= 0) {
        const collWorld = this._buildWorld()
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
            if (this.dead) return
          } else {
            for (const sys of getActiveSystems(r.features)) {
              sys.onSafeHazardTouch?.(collWorld, h, sx)
            }
          }
        }
      }

      // 画面外ハザード除去
      this.hazards = this.hazards.filter(h => h.x - this.cameraX > SPAWN.hazardCullLeft)

      // シュート入力統計のみここで取得（shoot 処理は feature system に委譲）
      if (this.justPressed.has(shootKey)) this.stats.shots++
    }

    // ════════════════════════════════════════════════════════
    // 以降は横・縦モード共通
    // ════════════════════════════════════════════════════════

    // ─── Feature システム（GameRegistry 経由で全システムをディスパッチ） ──
    const world = this._buildWorld()
    const inputSnapshot: InputSnapshot = {
      keys: this.keys,
      justPressed: this.justPressed,
      justReleased: this.justReleased,
    }
    for (const sys of getActiveSystems(r.features)) {
      sys.update(world, inputSnapshot, dt)
    }

    // ─── アイテムクリーンアップ ───────────────────────────────────
    // 収集・パルスアニメは RpgFeature.update() が担当。ここは dead / 画面外除去のみ。
    this.items = this.items.filter(i => i.alive && i.x - this.cameraX > SPAWN.itemCullLeft)

    // ─── パーティクル更新 ─────────────────────────────────────────
    for (const pt of this.particles) {
      pt.x  += pt.vx * dt
      pt.y  += pt.vy * dt
      pt.vy += VFX.particleGravity * dt
      pt.life -= dt
    }
    this.particles = this.particles.filter(p => p.life > 0)

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
    this.playScore += r.scrollSpeed * dt * SCORE.distanceScoreRate
  }

  // ─── 死亡演出更新 ────────────────────────────────────────────────
  private _updateDeathEffect(dt: number): void {
    this.deathTimer += dt
    for (const pt of this.particles) {
      pt.x  += pt.vx * dt * VFX.deathSlowMoFactor
      pt.y  += pt.vy * dt * VFX.deathSlowMoFactor
      pt.vy += VFX.deathParticleGravity * dt * VFX.deathSlowMoFactor
      pt.life -= dt
    }
    this.particles = this.particles.filter(p => p.life > 0)
    this.shakeIntensity *= VFX.deathShakeDecay
    this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * 2
    this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * 2
  }

  // ─── 被弾処理 ────────────────────────────────────────────────────
  private _onPlayerHit(p: Player): void {
    const world = this._buildWorld()
    for (const sys of getActiveSystems(this.rules.features)) {
      sys.onPlayerHit?.(world)
    }
    // どのシステムも死亡を処理しなかった場合（hp feature なし）は即死
    if (!this.dead) {
      this._die(p)
    }
  }

  private _die(p: Player): void {
    this.dead = true
    this.shakeIntensity = VFX.deathShakeIntensity
    this._spawnDeathExplosion(p.x + p.w / 2, p.y + p.h / 2)
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
      const fWorld = this._buildWorld()
      for (const sys of getActiveSystems(r.features)) {
        sys.render?.(ctx, fWorld)
      }
    }

    // ─── パーティクル ─────────────────────────────────────────────
    for (const pt of this.particles) {
      const alpha = pt.life / pt.maxLife
      ctx.globalAlpha = alpha
      ctx.fillStyle = pt.color
      const sz = pt.size * (0.5 + alpha * 0.5)
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, sz, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

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

  // ─── 弾描画 ───────────────────────────────────────────────────────
  private _drawBullet(sx: number, sy: number): void {
    const ctx = this.ctx
    const isVertical = this.rules.scrollAxis === 'y'
    ctx.save()
    ctx.shadowColor = '#ffff88'
    ctx.shadowBlur = 10
    if (isVertical) {
      // 縦モード: 上向き弾（縦長楕円）
      const grad = ctx.createLinearGradient(sx, sy, sx, sy - 14)
      grad.addColorStop(0, '#ffff44')
      grad.addColorStop(1, '#ff8844')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(sx + 2, sy - 7, 2.5, 7, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // 横モード: 右向き弾（横長楕円）
      const grad = ctx.createLinearGradient(sx, sy, sx + 14, sy)
      grad.addColorStop(0, '#ffff44')
      grad.addColorStop(1, '#ff8844')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(sx + 7, sy + 2, 7, 2.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
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
  private _addParticle(x: number, y: number, vx: number, vy: number, life: number, color: string, size = 4): void {
    this.particles.push({ x, y, vx, vy, life, maxLife: life, color, size })
  }

  private _spawnJumpParticles(x: number, y: number): void {
    const plugin = getGenre(this.rules.genre)
    const color = plugin.particleColors?.jump ?? VFX.jumpParticleColor
    for (let i = 0; i < VFX.jumpParticleCount; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * VFX.jumpParticleSpread
      const speed = VFX.jumpParticleSpeedMin + Math.random() * (VFX.jumpParticleSpeedMax - VFX.jumpParticleSpeedMin)
      this._addParticle(
        x + (Math.random() - 0.5) * VFX.jumpParticleOffsetX, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        VFX.jumpParticleLife, color, VFX.jumpParticleSize,
      )
    }
  }

  private _spawnLandParticles(x: number, y: number): void {
    const plugin = getGenre(this.rules.genre)
    const color = plugin.particleColors?.land ?? VFX.landParticleColor
    for (let i = 0; i < VFX.landParticleCount; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 0.9
      const speed = VFX.landParticleSpeedMin + Math.random() * (VFX.landParticleSpeedMax - VFX.landParticleSpeedMin)
      this._addParticle(
        x + (Math.random() - 0.5) * VFX.landParticleOffsetX, y,
        Math.cos(angle) * speed, Math.sin(angle) * speed * VFX.landParticleYRatio,
        VFX.landParticleLife, color, VFX.landParticleSize,
      )
    }
  }

  private _spawnDeathExplosion(x: number, y: number): void {
    const plugin = getGenre(this.rules.genre)
    const colors = plugin.particleColors?.death ?? VFX.deathParticleColors
    for (let i = 0; i < VFX.deathParticleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = VFX.deathParticleSpeedMin + Math.random() * (VFX.deathParticleSpeedMax - VFX.deathParticleSpeedMin)
      const life  = VFX.deathParticleLifeMin + Math.random() * VFX.deathParticleLifeRange
      const size  = VFX.deathParticleSizeMin + Math.random() * VFX.deathParticleSizeRange
      const color = colors[Math.floor(Math.random() * colors.length)]
      this._addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed + VFX.deathParticleYBoost, life, color, size)
    }
  }

  private _addScorePopup(x: number, y: number, text: string, color: string): void {
    this.scorePopups.push({ x, y, text, color, life: UI.popupLifeSec, vy: UI.popupRiseVy })
  }

  // ─── MutableWorld 実装 ───────────────────────────────────────────
  private _buildWorld(): MutableWorld {
    const self = this
    return {
      player:      this.player,
      hazards:     this.hazards,
      items:       this.items,
      bullets:     this._bullets,
      rules:       this.rules,
      distance:    this.distance,
      survivedSec: this.survivedSec,
      canvas:      this.canvas,
      ctx:         this.ctx,
      cameraX:     this.cameraX,
      gameStats:   this._gameStats,

      addScore(amount)              { self.playScore += amount },
      addScorePopup(x, y, text, c) { self._addScorePopup(x, y, text, c) },
      triggerShake(intensity)       { self.shakeIntensity = Math.max(self.shakeIntensity, intensity) },
      addParticle(x, y, vx, vy, life, color, size = 3) {
        self.particles.push({ x, y, vx, vy, life, maxLife: life, color, size })
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
      resetCombo()                   { self._gameStats.combo = 0 },
      setTimescale(_s, _d)           { /* TODO: timescale implementation */ },

      setKills(n)                    { self._gameStats.kills = n },
      setCombo(n)                    {
        self._gameStats.combo = n
        if (n > self._gameStats.maxCombo) self._gameStats.maxCombo = n
      },
      addBeatHit()                   { self._gameStats.beatHits++ },
      setBeatHazardInverted(v)       { self._gameStats.beatHazardInverted = v },
    }
  }
}
