/**
 * game/modes/SportsMode.ts
 *
 * ゴール到達レース Mode。
 * 一定距離（ゴールライン）に到達する。時間制限あり。
 * 障害物は減速（死亡しない）。ダッシュで加速（スタミナ消費）。
 *
 * 操作: ArrowRight = 前進, Shift = ダッシュ
 * 勝利: ゴールラインに到達
 * 敗北: タイマーが 0 以下
 */

import type { GameMode } from '../../engine/GameMode'
import type { MutableWorld } from '../../engine/types'
import { PixelCanvas } from '../render'

// ── 定数 ──────────────────────────────────────────────────────────

// トラック
// トラック — 高さのみ使用
const _TRACK_W = 400
const _TRACK_H = 200
const TRACK_Y_RATIO = 0.55

// プレイヤー
const PLAYER_W = 32
const PLAYER_H = 48
const PLAYER_X = 60
const BASE_SPEED = 200       // px/s
const DASH_MULTIPLIER = 1.5
const OBSTACLE_SLOW_MULTIPLIER = 0.5
const SLOW_DURATION_SEC = 2.0

// ダッシュ
const STAMINA_MAX = 100
const STAMINA_DRAIN_PER_SEC = 30
const STAMINA_REGEN_PER_SEC = 20

// ゴール
const GOAL_DISTANCE_M = 400  // メートル（仮）
const GOAL_DISTANCE_PX = 3000 // プレイヤーが進むべきpx距離

// タイマー
const RACE_TIME_SEC = 60

// 障害物
const HAZARD_COUNT = 8
const HAZARD_W_RANGE = [22, 42] as const
const HAZARD_H_RANGE = [30, 55] as const
const HAZARD_SPAWN_DIST_START = 400
const HAZARD_SPAWN_DIST_END = GOAL_DISTANCE_PX - 200

// 視覚
const STADIUM_COLOR_TOP = '#87ceeb'
const STADIUM_COLOR_BOTTOM = '#b0e0ff'
const TRACK_COLOR = '#2d5a27'
const TRACK_LINE_COLOR = '#ddcc88'
const GOAL_CHECKER_SIZE = 16
const CROWD_COLOR = '#5a9a54'
const PLAYER_JERSEY_COLOR = '#dd3333'
const PLAYER_SKIN_COLOR = '#ffcc99'

// UI
const SCOREBOARD_X = 10
const SCOREBOARD_Y = 10
const SCOREBOARD_W = 200
const SCOREBOARD_H = 72
const TIMER_X = 10
const TIMER_Y = 90
const STAMINA_X = 10
const STAMINA_Y = 120
const STAMINA_W = 150
const STAMINA_H = 12

// 記録（localStorage キー）
const BEST_RECORD_KEY = 'sports_best_record'

export interface SportsModeState {
  elapsed: number
  playerX: number
  speed: number
  isDashing: boolean
  stamina: number
  slowTimer: number
  obstacles: { x: number; y: number; w: number; h: number; passed: boolean }[]
  raceStarted: boolean
  bestRecord: number
  initialized: boolean
}

function initialState(): SportsModeState {
  return {
    elapsed: 0,
    playerX: PLAYER_X,
    speed: BASE_SPEED,
    isDashing: false,
    stamina: STAMINA_MAX,
    slowTimer: 0,
    obstacles: [],
    raceStarted: false,
    bestRecord: 99.99,
    initialized: false,
  }
}

function loadBestRecord(): number {
  try {
    const val = localStorage.getItem(BEST_RECORD_KEY)
    if (val) {
      const n = parseFloat(val)
      if (!isNaN(n) && n > 0) return n
    }
  } catch {
    // localStorage 不可でも無視
  }
  return 99.99
}

function saveBestRecord(time: number): void {
  try {
    localStorage.setItem(BEST_RECORD_KEY, time.toFixed(2))
  } catch {
    // 無視
  }
}

function formatTime(sec: number): string {
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

export class SportsMode implements GameMode {
  readonly id = 'sports'

  private state: SportsModeState

  constructor() {
    this.state = initialState()
    this.state.initialized = true
  }

  setup(_world: MutableWorld): void {
    this.state = initialState()
    this.state.bestRecord = loadBestRecord()
    this.state.initialized = true
    this._spawnObstacles()
  }

  update(world: MutableWorld, dt: number): void {
    const input = world.input
    const canvas = world.canvas
    const H = canvas.height
    const W = canvas.width
    const trackY = H * TRACK_Y_RATIO

    if (!this.state.initialized) {
      this.setup(world)
    }

    // ─── レース開始判定 ────────────────────────────────────────
    if (!this.state.raceStarted) {
      if (input.keys.has('ArrowRight') || input.keys.has('Space')) {
        this.state.raceStarted = true
      } else {
        return // 未開始時は elapsed 不进み、入力チェックのみ
      }
    }

    this.state.elapsed += dt

    // ─── タイマー判定（敗北） ─────────────────────────────────
    if (this.state.elapsed >= RACE_TIME_SEC) {
      return // isLost が true を返す
    }

    // ─── 前進処理 ─────────────────────────────────────────────
    // ArrowRight で前進、Shift でダッシュ
    const moving = input.keys.has('ArrowRight')
    this.state.isDashing = moving && input.keys.has('ShiftLeft') && this.state.stamina > 0

    if (moving) {
      let targetSpeed = BASE_SPEED
      if (this.state.isDashing) {
        targetSpeed = BASE_SPEED * DASH_MULTIPLIER
        this.state.stamina = Math.max(0, this.state.stamina - STAMINA_DRAIN_PER_SEC * dt)
      }
      // 減速状態
      if (this.state.slowTimer > 0) {
        this.state.slowTimer -= dt
        targetSpeed *= OBSTACLE_SLOW_MULTIPLIER
      }
      this.state.speed = targetSpeed
      this.state.playerX += this.state.speed * dt
    } else {
      // 非ダッシュ時はスタミナ回復
      if (!this.state.isDashing) {
        this.state.stamina = Math.min(STAMINA_MAX, this.state.stamina + STAMINA_REGEN_PER_SEC * dt)
      }
    }

    // ─── 障害物との衝突判定 ───────────────────────────────────
    for (const obs of this.state.obstacles) {
      if (obs.passed) continue
      const playerRight = this.state.playerX + PLAYER_W
      const playerLeft = this.state.playerX
      const playerTop = trackY - PLAYER_H + 10
      const playerBottom = trackY

      if (playerRight > obs.x && playerLeft < obs.x + obs.w &&
          playerBottom > obs.y && playerTop < obs.y + obs.h) {
        // 衝突: 減速
        this.state.slowTimer = SLOW_DURATION_SEC
        obs.passed = true
        world.triggerShake(0.3)
        world.addScorePopup(this.state.playerX, trackY - PLAYER_H - 10, 'SLOW!', '#ff4444')
      }
    }

    // ─── ゴール判定（勝利） ────────────────────────────────────
    if (this.state.playerX >= GOAL_DISTANCE_PX) {
      // ゴール！記録更新チェック
      if (this.state.elapsed < this.state.bestRecord) {
        this.state.bestRecord = this.state.elapsed
        saveBestRecord(this.state.elapsed)
        world.addScorePopup(W / 2, H / 2 - 40, 'NEW RECORD!', '#ffcc00')
        world.triggerShake(0.5)
      }
      return // isWon が true を返す
    }

    // ─── パーティクル（ダッシュ時） ─────────────────────────────
    if (this.state.isDashing && Math.random() < 0.3) {
      world.addParticle(
        this.state.playerX,
        trackY - PLAYER_H / 2,
        -80 - Math.random() * 40,
        (Math.random() - 0.5) * 30,
        0.2 + Math.random() * 0.2,
        '#ffcc44',
        2,
      )
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const H = world.canvas.height
    const px = new PixelCanvas(ctx)
    const trackY = H * TRACK_Y_RATIO
    const s = this.state

    // ─── 空（グラデーション） ──────────────────────────────────
    px.bandGradient(0, 0, W, trackY,
      [[0, STADIUM_COLOR_TOP], [1, STADIUM_COLOR_BOTTOM]],
      'v', 6,
    )

    // ─── 観客席（遠景） ────────────────────────────────────────
    this._drawStadiumCrowd(px, W, trackY)

    // ─── トラック（芝生） ──────────────────────────────────────
    px.rect(0, trackY, W, H - trackY, TRACK_COLOR)

    // 芝生のライン
    const stripeW = 60
    const startX = -(s.playerX % stripeW)
    px.withAlpha(0.12, () => {
      for (let x = startX; x < W; x += stripeW * 2) {
        px.rect(x, trackY, stripeW, 4, '#3a7a34')
      }
    })

    // レーンライン
    px.withAlpha(0.3, () => {
      px.line(0, trackY + 30, W, trackY + 30, TRACK_LINE_COLOR, 1)
      px.line(0, trackY + 80, W, trackY + 80, TRACK_LINE_COLOR, 1)
      px.line(0, trackY + 130, W, trackY + 130, TRACK_LINE_COLOR, 1)
    })

    // ─── 障害物 ────────────────────────────────────────────────
    for (const obs of s.obstacles) {
      const screenX = obs.x - s.playerX + PLAYER_X
      if (screenX < -obs.w - 20 || screenX > W + 20) continue
      px.rect(screenX, obs.y, obs.w, obs.h, '#dd3333')
      px.rect(screenX + 2, obs.y + 2, obs.w - 4, 4, '#ff5555')
    }

    // ─── プレイヤー ────────────────────────────────────────────
    const playerScreenX = PLAYER_X
    const playerY = trackY - PLAYER_H + 10
    // 影
    px.ellipse(playerScreenX + PLAYER_W / 2, trackY + 2, PLAYER_W * 0.4, 4, 'rgba(0,0,0,0.20)')
    // 体（シャツ）
    px.rect(playerScreenX + 4, playerY + 16, PLAYER_W - 8, 20, PLAYER_JERSEY_COLOR)
    // 頭
    px.rect(playerScreenX + 8, playerY, PLAYER_W - 16, 16, PLAYER_SKIN_COLOR)
    // ヘッドバンド
    px.rect(playerScreenX + 6, playerY + 4, PLAYER_W - 12, 3, '#dd3333')
    // 足（走行アニメ）
    const legCycle = s.elapsed * 8
    const legOffset = Math.sin(legCycle) * 4
    px.rect(playerScreenX + 8, playerY + 36, 6, 12 + legOffset, '#222222')
    px.rect(playerScreenX + PLAYER_W - 14, playerY + 36, 6, 12 - legOffset, '#222222')

    // ダッシュエフェクト
    if (s.isDashing) {
      px.withAlpha(0.4, () => {
        for (let i = 0; i < 3; i++) {
          const lx = playerScreenX - 10 - i * 12 - Math.random() * 8
          const ly = playerY + Math.random() * PLAYER_H
          px.rect(lx, ly, 8 + Math.random() * 6, 2, '#ffcc44')
        }
      })
    }

    // ─── ゴールライン ──────────────────────────────────────────
    const goalScreenX = GOAL_DISTANCE_PX - s.playerX + PLAYER_X
    if (goalScreenX > -40 && goalScreenX < W + 40) {
      this._drawGoalLine(px, goalScreenX, trackY, H)
    }

    // ─── HUD: スコアボード ─────────────────────────────────────
    this._drawScoreboard(px, W, s)

    // ─── HUD: タイマー ─────────────────────────────────────────
    const timeLeft = Math.max(0, RACE_TIME_SEC - s.elapsed)
    const timeColor = timeLeft < 10 ? '#ff4444' : timeLeft < 20 ? '#ffcc44' : '#ffffff'
    px.text(`TIME: ${formatTime(timeLeft)}`, TIMER_X, TIMER_Y, {
      font: 'bold 18px monospace', fill: timeColor,
    })

    // ─── HUD: スタミナ ─────────────────────────────────────────
    px.roundedRect(STAMINA_X, STAMINA_Y, STAMINA_W, STAMINA_H, 'rgba(0,0,0,0.5)', 2)
    const staminaRatio = s.stamina / STAMINA_MAX
    const staminaColor = staminaRatio > 0.5 ? '#44dd88' : staminaRatio > 0.25 ? '#ffcc44' : '#ff4444'
    px.rect(STAMINA_X + 2, STAMINA_Y + 2, (STAMINA_W - 4) * staminaRatio, STAMINA_H - 4, staminaColor)
    px.text('STAMINA', STAMINA_X + STAMINA_W + 8, STAMINA_Y + 10, {
      font: '10px monospace', fill: '#ffffff',
    })

    // ─── 未開始メッセージ ──────────────────────────────────────
    if (!s.raceStarted) {
      px.text('Press ArrowRight or Space to start!', W / 2, H / 2 - 60, {
        font: 'bold 16px monospace', fill: '#ffffff', align: 'center',
      })
    }

    // ─── 距離表示 ──────────────────────────────────────────────
    const distM = Math.floor(s.playerX / (GOAL_DISTANCE_PX / GOAL_DISTANCE_M))
    px.text(`${distM}m / ${GOAL_DISTANCE_M}m`, W / 2, H - 20, {
      font: '12px monospace', fill: 'rgba(255,255,255,0.6)', align: 'center',
    })
  }

  isWon(_world: MutableWorld): boolean {
    return this.state.playerX >= GOAL_DISTANCE_PX
  }

  isLost(_world: MutableWorld): boolean {
    return this.state.elapsed >= RACE_TIME_SEC
  }

  // ─── 内部メソッド ───────────────────────────────────────────────

  private _spawnObstacles(): void {
    const s = this.state
    s.obstacles = []
    const rng = this._hashRng(0x7a3c_1b2d)
    for (let i = 0; i < HAZARD_COUNT; i++) {
      const t = (i + 1) / (HAZARD_COUNT + 1)
      const x = HAZARD_SPAWN_DIST_START + t * (HAZARD_SPAWN_DIST_END - HAZARD_SPAWN_DIST_START)
      const w = HAZARD_W_RANGE[0] + rng() * (HAZARD_W_RANGE[1] - HAZARD_W_RANGE[0])
      const h = HAZARD_H_RANGE[0] + rng() * (HAZARD_H_RANGE[1] - HAZARD_H_RANGE[0])
      // トラック上のランダムなY位置
      const trackTop = 40
      const trackBottom = 160
      const y = trackTop + rng() * (trackBottom - trackTop - h)
      s.obstacles.push({ x, y, w, h, passed: false })
    }
    s.obstacles.sort((a, b) => a.x - b.x)
  }

  private _hashRng(seed: number): () => number {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff
      return (s >>> 0) / 0xffffffff
    }
  }

  private _drawStadiumCrowd(px: PixelCanvas, W: number, trackY: number): void {
    const t = performance.now()
    // 観客席の階段状シルエット
    px.withAlpha(0.3, () => {
      for (let x = 0; x < W; x += 30) {
        const step = ((Math.floor(x / 30) % 4) + 4) % 4
        const h = 20 + step * 15 + Math.sin(x * 0.02) * 8
        px.rect(x, trackY - h - 40, 30, h + 40, CROWD_COLOR)
      }
    })
    // 観客の点滅
    const crowdPhase = (t % 1500) / 1500
    if (crowdPhase > 0.7) {
      const alpha = Math.max(0.1, (crowdPhase - 0.7) / 0.3 * 0.15)
      px.withAlpha(alpha, () => {
        for (let i = 0; i < 30; i++) {
          const cx = (i * 47 + Math.floor(t / 200) * 3) % W
          const cy = trackY - 50 - (i * 13) % 40
          px.circle(cx, cy, 2, '#ffdd88')
        }
      })
    }
  }

  private _drawGoalLine(px: PixelCanvas, x: number, trackY: number, H: number): void {
    const postH = H - trackY
    // ポスト
    px.rect(x - 2, trackY - 5, 6, 10, '#ffffff')
    // ネット（チェック柄）
    const checkerSize = GOAL_CHECKER_SIZE
    for (let row = 0; row < Math.ceil(postH / checkerSize); row++) {
      for (let col = 0; col < 2; col++) {
        const cx = x + col * checkerSize
        const cy = trackY + row * checkerSize
        const isWhite = (row + col) % 2 === 0
        px.rect(cx, cy, checkerSize, checkerSize, isWhite ? '#ffffff' : '#333333')
      }
    }
  }

  private _drawScoreboard(px: PixelCanvas, W: number, s: SportsModeState): void {
    const sbX = SCOREBOARD_X
    const sbY = SCOREBOARD_Y
    const sbW = SCOREBOARD_W
    const sbH = SCOREBOARD_H

    // 枠
    px.rect(sbX - 2, sbY - 2, sbW + 4, 3, '#2d5a27')
    px.rect(sbX - 2, sbY + sbH - 1, sbW + 4, 3, '#2d5a27')
    px.rect(sbX - 2, sbY, 3, sbH + 2, '#2d5a27')
    px.rect(sbX + sbW - 1, sbY, 3, sbH + 2, '#2d5a27')

    // パネル
    px.roundedRect(sbX, sbY, sbW, sbH, 'rgba(255,255,255,0.85)', 3)

    // タイム
    px.text('TIME', sbX + 10, sbY + 14, {
      font: 'bold 11px monospace', fill: '#2d5a27',
    })
    const timeLeft = Math.max(0, RACE_TIME_SEC - s.elapsed)
    px.text(formatTime(timeLeft), sbX + 10, sbY + 32, {
      font: 'bold 18px monospace', fill: timeLeft < 10 ? '#ff4444' : '#1a3a16',
    })

    // BEST
    px.text('BEST', sbX + 110, sbY + 14, {
      font: 'bold 11px monospace', fill: '#2d5a27',
    })
    px.text(formatTime(s.bestRecord), sbX + 110, sbY + 32, {
      font: 'bold 18px monospace', fill: '#cc8800',
    })

    // 位置
    const distM = Math.floor(s.playerX / (GOAL_DISTANCE_PX / GOAL_DISTANCE_M))
    px.text(`${distM}m`, sbX + 10, sbY + 52, {
      font: '12px monospace', fill: '#555555',
    })
  }
}

export default new SportsMode()
