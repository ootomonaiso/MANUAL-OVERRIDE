/**
 * game/modes/PlatformerMode.ts
 *
 * 縦スクロールプラットフォーム Mode。
 * 下から溶岩が追いかけてくる中、プラットフォームを駆け上って高みを目指す。
 *
 * - プレイヤー: 画面中央X固定、物理（重力+ジャンプ）、二段ジャンプ可
 * - カメラ: 上昇追従（プレイヤーが画面上部1/3に来たら追従）
 * - 溶岩: 画面下部から上昇、10秒ごとに加速
 * - プラットフォーム: normal/spring/conveyor/crumble の4種類
 * - 勝利: totalClimb >= 3000px
 * - 敗北: 溶岩に接触
 */

import type { GameMode } from '../../engine/GameMode'
import type { MutableWorld } from '../../engine/types'
import { PixelCanvas } from '../render'

// ── 定数 ──────────────────────────────────────────────────────────

// プレイヤー
const PLAYER_W = 24
const PLAYER_H = 32
const GRAVITY = 1200
const JUMP_VEL = -500
const MOVE_SPEED = 250
const DOUBLE_JUMP_VEL = -420
const MAX_DOUBLE_JUMPS = 2

// カメラ
const CAMERA_TRIGGER_RATIO = 1 / 3   // 画面の上部 1/3 に来たら追従

// 溶岩
const LAVA_INITIAL_Y = 900           // 初期位置（画面外下）
const LAVA_INITIAL_SPEED = 30        // px/s
const LAVA_ACCEL_INTERVAL = 10       // 秒ごと
const LAVA_ACCEL_AMOUNT = 5          // px/s 増加
const LAVA_MAX_SPEED = 200           // 最大速度

// プラットフォーム
const PLATFORM_GAP_MIN = 80
const PLATFORM_GAP_MAX = 150
const PLATFORM_W_MIN = 60
const PLATFORM_W_MAX = 120
const PLATFORM_H = 12
const PLATFORM_X_MARGIN = 30
const JUMP_AIRTIME_SEC = 1.31
const MAX_PLATFORM_H_GAP = MOVE_SPEED * JUMP_AIRTIME_SEC * 0.8

// 溶岩波状
const LAVA_BUMP_COUNT = 4
const LAVA_BUMP_AMP = 6

// 崩壊
const CRUMBLE_DELAY = 0.5

// 勝利
const WIN_ALTITUDE = 3000

// 色
const COLOR_NORMAL = '#2d7a2d'
const COLOR_SPRING = '#ffcc00'
const COLOR_CONVEYOR = '#4488dd'
const COLOR_CRUMBLE = '#aa4422'
const COLOR_LAVA = '#ff6622'
const COLOR_LAVA_GLOW = '#ff9944'

// 描画
const HUD_FONT = '16px monospace'

// 内部プラットフォーム型
interface Platform {
  x: number
  y: number
  w: number
  type: 'normal' | 'spring' | 'conveyor' | 'crumble'
  conveyorDir: 1 | -1
  crumbleTimer: number
  crumbleTriggered: boolean
  visible: boolean
}

interface PlatformerModeState {
  platforms: Platform[]
  totalClimb: number       // 最大到達高度（px）
  lavaY: number
  lavaSpeed: number
  lavaAccelTimer: number
  cameraY: number
  initialized: boolean
  gameStarted: boolean
  spawnCounter: number
  nextGap: number
}

function initialState(): PlatformerModeState {
  return {
    platforms: [],
    totalClimb: 0,
    lavaY: LAVA_INITIAL_Y,
    lavaSpeed: LAVA_INITIAL_SPEED,
    lavaAccelTimer: 0,
    cameraY: 0,
    initialized: false,
    gameStarted: false,
    spawnCounter: 0,
    nextGap: PLATFORM_GAP_MIN + Math.random() * (PLATFORM_GAP_MAX - PLATFORM_GAP_MIN),
  }
}

/** ランダム数生成（決定論的） */
function _rand(): number {
  return Math.random()
}

/** 乱数に基づくプラットフォーム種別選択 */
function _pickPlatformType(): Platform['type'] {
  const r = _rand()
  if (r < 0.60) return 'normal'
  if (r < 0.75) return 'spring'
  if (r < 0.90) return 'conveyor'
  return 'crumble'
}

/** プラットフォームの幅を乱数で決定 */
function _pickPlatformW(): number {
  return PLATFORM_W_MIN + Math.floor(_rand() * (PLATFORM_W_MAX - PLATFORM_W_MIN))
}

export class PlatformerMode implements GameMode {
  readonly id = 'platformer'

  private state: PlatformerModeState = initialState()
  private _playerX = 200
  private _playerY = 400
  private _vy = 0
  private _vx = 0
  private _onGround = false
  private _jumpsLeft = MAX_DOUBLE_JUMPS
  private _initialized = false

  private _maxAltitude = 0

  setup(world: MutableWorld): void {
    this.state = initialState()
    this.state.initialized = true
    this._playerX = 200
    this._playerY = 400
    this._vy = 0
    this._vx = 0
    this._onGround = false
    this._jumpsLeft = MAX_DOUBLE_JUMPS
    this._maxAltitude = 0
    this._initialized = true

    // C1: プレイヤーの足元に開始プラットフォームを配置
    this.state.platforms.push({
      x: this._playerX - 20,
      y: this._playerY + PLAYER_H + 2,
      w: 80,
      type: 'normal',
      conveyorDir: 1,
      crumbleTimer: 0,
      crumbleTriggered: false,
      visible: true,
    })
    // カメラを地面付近に合わせる
    this.state.cameraY = this._playerY + PLAYER_H - world.canvas.height * 0.6
  }

  update(world: MutableWorld, dt: number): void {
    const canvas = world.canvas
    const W = canvas.width
    const H = canvas.height
    const input = world.input

    if (!this._initialized) {
      this.setup(world)
    }

    // ─── ゲーム開始待機 ────────────────────────────────────────
    if (!this.state.gameStarted) {
      if (input.keys.has('Space')) {
        this.state.gameStarted = true
      } else {
        return
      }
    }

    // ─── 溶岩更新 ─────────────────────────────────────────────
    this.state.lavaY -= this.state.lavaSpeed * dt
    this.state.lavaAccelTimer += dt
    if (this.state.lavaAccelTimer >= LAVA_ACCEL_INTERVAL) {
      this.state.lavaAccelTimer -= LAVA_ACCEL_INTERVAL
      this.state.lavaSpeed = Math.min(LAVA_MAX_SPEED, this.state.lavaSpeed + LAVA_ACCEL_AMOUNT)
    }

    // ─── プレイヤー物理 ───────────────────────────────────────
    // 左右移動
    this._vx = 0
    if (input.keys.has('ArrowLeft')) {
      this._vx = -MOVE_SPEED
    } else if (input.keys.has('ArrowRight')) {
      this._vx = MOVE_SPEED
    }

    // 重力
    this._vy += GRAVITY * dt

    // ジャンプ
    if (input.justPressed.has('Space')) {
      if (this._jumpsLeft > 0) {
        this._vy = this._jumpsLeft === MAX_DOUBLE_JUMPS ? JUMP_VEL : DOUBLE_JUMP_VEL
        this._jumpsLeft--
        this._onGround = false
      }
    }

    // 位置更新
    this._playerX += this._vx * dt
    this._playerY += this._vy * dt

    // X 制限
    if (this._playerX < 100) {
      this._playerX = 100
      this._vx = 0
    }
    if (this._playerX + PLAYER_W > W - 100) {
      this._playerX = W - 100 - PLAYER_W
      this._vx = 0
    }

    // ─── プラットフォーム衝突（上面のみ） ─────────────────────
    this._onGround = false
    for (const plat of this.state.platforms) {
      if (!plat.visible) continue

      const platTop = plat.y
      const platLeft = plat.x
      const platRight = plat.x + plat.w

      // プレイヤーが平台上部にいて、下に落下中
      const playerBottom = this._playerY + PLAYER_H
      const playerPrevBottom = playerBottom - this._vy * dt

      if (playerPrevBottom <= platTop + 2 && playerBottom >= platTop &&
          this._playerX + PLAYER_W > platLeft && this._playerX < platRight &&
          this._vy >= 0) {
        this._playerY = platTop - PLAYER_H
        this._vy = 0
        this._onGround = true
        this._jumpsLeft = MAX_DOUBLE_JUMPS

        // conveyor 効果
        if (plat.type === 'conveyor') {
          this._playerX += plat.conveyorDir * 20 * dt
        }

        // spring 効果
        if (plat.type === 'spring') {
          this._vy = -800
          this._jumpsLeft = MAX_DOUBLE_JUMPS - 1
          this._onGround = false
        }

        // crumble 効果
        if (plat.type === 'crumble' && !plat.crumbleTriggered) {
          plat.crumbleTriggered = true
          plat.crumbleTimer = CRUMBLE_DELAY
        }
      }
    }

    // crumble プラットフォームのタイマー
    for (const plat of this.state.platforms) {
      if (plat.crumbleTriggered && plat.crumbleTimer > 0) {
        plat.crumbleTimer -= dt
        if (plat.crumbleTimer <= 0) {
          plat.visible = false
        }
      }
    }

    // ─── カメラ更新 ───────────────────────────────────────────
    const playerScreenY = this._playerY - this.state.cameraY
    if (playerScreenY < H * CAMERA_TRIGGER_RATIO) {
      const delta = (H * CAMERA_TRIGGER_RATIO) - playerScreenY
      this.state.cameraY += delta
    }

    // C2: 最大到達高度をプレイヤーのスクリーンYから計算
    // プレイヤーが上に行くほど _playerY は小さくなる
    const currentAltitude = -this._playerY
    if (currentAltitude > this._maxAltitude) {
      this._maxAltitude = currentAltitude
    }
    this.state.totalClimb = this._maxAltitude

    // ─── プラットフォーム生成 ─────────────────────────────────
    const cameraTop = this.state.cameraY
    const generateUpTo = cameraTop - H * 1.5  // 画面外の上部まで
    while (this.state.platforms.length === 0 ||
           this.state.platforms[this.state.platforms.length - 1].y > generateUpTo) {
      const lastPlat = this.state.platforms[this.state.platforms.length - 1]
      const newPlat = this._spawnPlatform(W, lastPlat.x, lastPlat.y)
      this.state.platforms.push(newPlat)
    }

    // 画面外のプラットフォームを削除（メモリリーク防止）
    const cameraBottom = cameraTop + H * 1.5
    this.state.platforms = this.state.platforms.filter(p => p.y < cameraBottom + 200)

    // ─── 溶岩接触判定（敗北） ─────────────────────────────────
    if (this._playerY + PLAYER_H >= this.state.lavaY) {
      world.triggerShake(0.5)
      return  // isLost が true
    }

    // ─── 勝利判定 ─────────────────────────────────────────────
    if (this.state.totalClimb >= WIN_ALTITUDE) {
      // isWon は外で判定
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const canvas = world.canvas
    const W = canvas.width
    const H = canvas.height
    const px = new PixelCanvas(ctx)
    const s = this.state

    // ─── 背景（青空グラデ） ────────────────────────────────────
    px.bandGradient(0, 0, W, H,
      [[0, '#1a88e8'], [1, '#4db8ff']], 'v', 12)

    // ─── 雲（背景） ────────────────────────────────────────────
    const cloudOffset = -s.cameraY * 0.1
    px.withAlpha(0.7, () => {
      const clouds = [
        { x: 0.1, y: 0.1 }, { x: 0.35, y: 0.05 },
        { x: 0.6, y: 0.15 }, { x: 0.8, y: 0.08 },
      ]
      for (const c of clouds) {
        const cx = c.x * W + Math.sin(cloudOffset * 0.01 + c.x * 10) * 10
        const cy = c.y * H + cloudOffset * 0.05
        px.rect(cx - 30, cy - 12, 60, 20, 'rgba(255,255,255,0.6)')
        px.rect(cx - 20, cy - 18, 40, 12, 'rgba(255,255,255,0.7)')
      }
    })

    // ─── プラットフォーム描画 ──────────────────────────────────
    for (const plat of s.platforms) {
      if (!plat.visible) continue
      const screenY = plat.y - s.cameraY
      if (screenY < -PLATFORM_H || screenY > H + PLATFORM_H) continue

      const color = plat.type === 'normal' ? COLOR_NORMAL
        : plat.type === 'spring' ? COLOR_SPRING
        : plat.type === 'conveyor' ? COLOR_CONVEYOR
        : COLOR_CRUMBLE

      px.rect(plat.x, screenY, plat.w, PLATFORM_H, color)

      // 上面ハイライト
      px.rect(plat.x, screenY, plat.w, 2, 'rgba(255,255,255,0.3)')

      // conveyor 矢印
      if (plat.type === 'conveyor') {
        const arrowX = plat.x + plat.w / 2 + plat.conveyorDir * 10
        px.tri(arrowX, screenY + 2, 8, PLATFORM_H - 4,
          plat.conveyorDir > 0 ? 'right' : 'left', 'rgba(255,255,255,0.5)')
      }

      // crumble 演出（崩壊直前は点滅）
      if (plat.crumbleTriggered && plat.crumbleTimer > 0) {
        const flash = Math.sin(performance.now() * 0.02) > 0
        if (flash) {
          px.withAlpha(0.4, () => {
            px.rect(plat.x, screenY, plat.w, PLATFORM_H, '#ffffff')
          })
        }
      }
    }

    // ─── プレイヤー描画 ───────────────────────────────────────
    const playerScreenX = this._playerX
    const playerScreenY = this._playerY - s.cameraY
    px.rect(playerScreenX, playerScreenY, PLAYER_W, PLAYER_H, '#ffffff')
    // 目
    px.rect(playerScreenX + 4, playerScreenY + 6, 4, 4, '#222222')
    px.rect(playerScreenX + PLAYER_W - 8, playerScreenY + 6, 4, 4, '#222222')

    // 二段ジャンプ中のエフェクト
    if (this._jumpsLeft < MAX_DOUBLE_JUMPS && !this._onGround) {
      px.withAlpha(0.4, () => {
        px.circle(playerScreenX + PLAYER_W / 2, playerScreenY + PLAYER_H + 4, 6, '#ffcc44')
      })
    }

    // ─── 溶岩描画 ─────────────────────────────────────────────
    const lavaScreenY = s.lavaY - s.cameraY
    if (lavaScreenY < H + 20) {
      // 溶岩本体
      px.rect(0, lavaScreenY, W, H - lavaScreenY + 20, COLOR_LAVA)

      // 波状先端
      const bumpW = W / LAVA_BUMP_COUNT
      for (let i = 0; i < LAVA_BUMP_COUNT; i++) {
        const bx = i * bumpW + bumpW / 2
        const bumpH = LAVA_BUMP_AMP * Math.sin(performance.now() * 0.003 + i * 1.5)
        const topY = lavaScreenY + bumpH
        px.rect(bx - bumpW / 2 + 2, topY, bumpW - 4, lavaScreenY - topY + 20, COLOR_LAVA)
      }

      // グロー
      px.halo(
        (expand, color) => px.rect(-expand, lavaScreenY - expand, W + expand * 2, 8 + expand * 2, color),
        COLOR_LAVA_GLOW, 3,
      )
    }

    // ─── HUD ──────────────────────────────────────────────────
    // 高度
    px.text(`ALT: ${Math.floor(s.totalClimb)}px`, 12, 16, {
      font: HUD_FONT, fill: '#ffffff',
    })

    // 溶岩距離バー（右下）
    this._drawLavaBar(px, W, H, s)

    // ─── 未開始メッセージ ──────────────────────────────────────
    if (!s.gameStarted) {
      px.text('Press Space to start!', W / 2, H / 2 - 40, {
        font: 'bold 18px monospace', fill: '#ffffff', align: 'center',
      })
      px.text('Arrow keys: Move | Space: Jump (double jump)', W / 2, H / 2, {
        font: '12px monospace', fill: 'rgba(255,255,255,0.6)', align: 'center',
      })
    }
  }

  isWon(_world: MutableWorld): boolean {
    return this.state.totalClimb >= WIN_ALTITUDE
  }

  isLost(_world: MutableWorld): boolean {
    return this._playerY + PLAYER_H >= this.state.lavaY
  }

  // ─── 内部: プラットフォーム生成 ────────────────────────────────

  private _spawnPlatform(W: number, prevX: number, prevY: number): Platform {
    const platW = PLATFORM_W_MIN + Math.floor(_rand() * (PLATFORM_W_MAX - PLATFORM_W_MIN))
    // X: 前プラットフォームの X 付近に制限（到達可能範囲内 + プレイヤー到達可能帯内）
    // プレイヤー X クランプは [100, W-100-PLAYER_W]。着地条件: playerLeft < platRight && playerRight > platLeft
    const landMinX = 100 - platW + 1
    const landMaxX = W - 100 - 1
    const minX = Math.max(PLATFORM_X_MARGIN, landMinX, prevX - MAX_PLATFORM_H_GAP)
    const maxX = Math.min(W - PLATFORM_X_MARGIN - platW, landMaxX, prevX + platW + MAX_PLATFORM_H_GAP)
    const platX = minX + Math.random() * Math.max(1, maxX - minX)
    // Y: 前より上（80〜150px 間隔）
    const platY = prevY - (PLATFORM_GAP_MIN + _rand() * (PLATFORM_GAP_MAX - PLATFORM_GAP_MIN))
    // 種類
    const type = _pickPlatformType()
    return {
      x: platX,
      y: platY,
      w: platW,
      type,
      conveyorDir: _rand() < 0.5 ? 1 : -1,
      crumbleTimer: 0,
      crumbleTriggered: false,
      visible: true,
    }
  }

  // ─── 内部: 溶岩バー描画 ────────────────────────────────────────

  private _drawLavaBar(px: PixelCanvas, W: number, H: number, s: PlatformerModeState): void {
    const barW = 160
    const barH = 14
    const barX = W - barW - 16
    const barY = H - barH - 16
    const playerBottom = this._playerY + PLAYER_H
    const distToLava = playerBottom - s.lavaY  // 負=安全、正=危険

    // バー背景
    px.roundedRect(barX, barY, barW, barH, 'rgba(0,0,0,0.6)', 2)

    // 距離に応じた色
    const absDist = Math.abs(distToLava)
    let barColor: string
    if (absDist <= 100) {
      barColor = '#ff4444'  // 赤: 危険
    } else if (absDist <= 300) {
      barColor = '#ffcc44'  // 黄: 注意
    } else {
      barColor = '#4488ff'  // 青: 安全
    }

    // 充填率（最大300pxを満タンとする）
    const fillRatio = Math.min(1, absDist / 300)
    px.rect(barX + 2, barY + 2, (barW - 4) * fillRatio, barH - 4, barColor)

    // ラベル
    px.text('LAVA', barX + barW / 2, barY - 14, {
      font: '10px monospace', fill: barColor, align: 'center',
    })
  }
}

export default new PlatformerMode()
