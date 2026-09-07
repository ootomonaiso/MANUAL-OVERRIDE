/**
 * game/modes/RacingMode.ts
 *
 * 競争相手レース Mode。
 * 他プレイヤー（AI 競争相手 3 体）が同じトラックを走行。
 * 速度で順位が決まる。ダッシュで加速。障害物は減速。
 *
 * 操作: ArrowRight = 前進, Shift = ダッシュ
 * 勝利: 1位でゴールラインに到達
 * 敗北: 最下位でゴール or タイマー 0 以下
 */

import type { GameMode } from '../../engine/GameMode'
import type { MutableWorld } from '../../engine/types'
import { PixelCanvas } from '../render'

// ── 定数 ──────────────────────────────────────────────────────────

// トラック
// トラック — レーン構成のみ使用
const _TRACK_W = 400
const LANE_COUNT = 3
const LANE_HEIGHT = 60
const LANE_GAP = 10

// プレイヤー
const PLAYER_W = 36
const PLAYER_H = 56
const PLAYER_X = 60
const BASE_SPEED = 250
const DASH_MULTIPLIER = 1.5
const OBSTACLE_SLOW_MULTIPLIER = 0.5
const SLOW_DURATION_SEC = 1.5

// ダッシュ
const STAMINA_MAX = 100
const STAMINA_DRAIN_PER_SEC = 40
const STAMINA_REGEN_PER_SEC = 25

// レース
const RACE_TIME_SEC = 60
const TRACK_LENGTH_PX = 4000

// AI
const AI_COUNT = 3
const AI_SPEEDS = [BASE_SPEED * 0.9, BASE_SPEED * 1.0, BASE_SPEED * 1.1]
const AI_LANE_OFFSETS = [-1, 0, 1]

// 障害物
const HAZARD_COUNT = 10
const HAZARD_W_RANGE = [18, 36] as const
const HAZARD_H_RANGE = [32, 55] as const
const HAZARD_SPAWN_DIST_START = 500
const HAZARD_SPAWN_DIST_END = TRACK_LENGTH_PX - 200

// 視覚
const SKY_TOP = '#08060a'
const SKY_BOTTOM = '#100c14'
const TRACK_COLOR = '#1a1410'
const LANE_LINE_COLOR = 'rgba(255,255,200,0.3)'
const AI_COLORS = ['#ff4444', '#4488ff', '#44cc44']
const PLAYER_COLOR = '#ffcc00'
const NEON_COLOR = '#ff8800'

// UI
const RANK_PANEL_X = 10
const RANK_PANEL_Y = 10
const RANK_PANEL_W = 120
const RANK_PANEL_H = 40
const TIMER_X = 10
const TIMER_Y = 60
const STAMINA_X = 10
const STAMINA_Y = 88
const STAMINA_W = 150
const STAMINA_H = 10

export interface RacingModeState {
  elapsed: number
  playerX: number
  playerSpeed: number
  isDashing: boolean
  stamina: number
  slowTimer: number
  aiPositions: { x: number; lane: number; speed: number }[]
  obstacles: { x: number; y: number; w: number; h: number; lane: number }[]
  raceStarted: boolean
  finished: boolean
  finishRank: number
  initialized: boolean
}

function initialState(): RacingModeState {
  return {
    elapsed: 0,
    playerX: 0,
    playerSpeed: BASE_SPEED,
    isDashing: false,
    stamina: STAMINA_MAX,
    slowTimer: 0,
    aiPositions: [],
    obstacles: [],
    raceStarted: false,
    finished: false,
    finishRank: 0,
    initialized: false,
  }
}

function formatTime(sec: number): string {
  const mins = Math.floor(sec / 60)
  const secs = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

export class RacingMode implements GameMode {
  readonly id = 'racing'

  private state: RacingModeState

  constructor() {
    this.state = initialState()
    this.state.initialized = true
  }

  setup(world: MutableWorld): void {
    this.state = initialState()
    this.state.initialized = true
    this._initAI(world)
    this._spawnObstacles()
  }

  update(world: MutableWorld, dt: number): void {
    const input = world.input
    const canvas = world.canvas
    const H = canvas.height
    const W = canvas.width

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
      return
    }

    // ─── プレイヤー更新 ────────────────────────────────────────
    if (this.state.finished) return

    const moving = input.keys.has('ArrowRight')
    this.state.isDashing = moving && input.keys.has('ShiftLeft') && this.state.stamina > 0

    if (moving) {
      let targetSpeed = BASE_SPEED
      if (this.state.isDashing) {
        targetSpeed = BASE_SPEED * DASH_MULTIPLIER
        this.state.stamina = Math.max(0, this.state.stamina - STAMINA_DRAIN_PER_SEC * dt)
      }
      if (this.state.slowTimer > 0) {
        this.state.slowTimer -= dt
        targetSpeed *= OBSTACLE_SLOW_MULTIPLIER
      }
      this.state.playerSpeed = targetSpeed
      this.state.playerX += this.state.playerSpeed * dt
    } else {
      if (!this.state.isDashing) {
        this.state.stamina = Math.min(STAMINA_MAX, this.state.stamina + STAMINA_REGEN_PER_SEC * dt)
      }
    }

    // ─── 障害物のカリング（プレイヤーを過ぎた障害物を削除） ────
    for (let i = this.state.obstacles.length - 1; i >= 0; i--) {
      const obs = this.state.obstacles[i]
      // プレイヤーの左端を過ぎた障害物は削除（画面外 + マージン）
      if (obs.x < this.state.playerX - PLAYER_W * 2) {
        this.state.obstacles.splice(i, 1)
      }
    }

    // ─── 障害物の動的スポーン（カリングされた分を補填） ────────
    this._respawnObstacles(world)

    // ─── AI 更新 ───────────────────────────────────────────────
    for (let i = 0; i < AI_COUNT; i++) {
      const ai = this.state.aiPositions[i]
      // AI は一定速度で走行（若干の揺らぎ）
      const jitter = 1 + (Math.sin(this.state.elapsed * 2 + i * 3) * 0.05)
      ai.x += ai.speed * jitter * dt
    }

    // ─── 障害物との衝突判定 ────────────────────────────────────
    for (const obs of this.state.obstacles) {
      const playerRight = this.state.playerX + PLAYER_W
      if (playerRight > obs.x && this.state.playerX < obs.x + obs.w) {
        if (this.state.slowTimer <= 0) {
          this.state.slowTimer = SLOW_DURATION_SEC
          world.triggerShake(0.2)
          world.addScorePopup(
            this.state.playerX + PLAYER_W / 2,
            H * 0.6 - 20,
            'SLOW!', '#ff4444',
          )
        }
      }
    }

    // ─── ゴール判定 ────────────────────────────────────────────
    const allFinished = this.state.playerX >= TRACK_LENGTH_PX
    if (allFinished && !this.state.finished) {
      this.state.finished = true
      // 順位計算
      const allPositions = [
        { name: 'player', x: this.state.playerX },
        ...this.state.aiPositions.map((ai, i) => ({ name: `ai${i}`, x: ai.x })),
      ]
      allPositions.sort((a, b) => b.x - a.x)
      this.state.finishRank = allPositions.findIndex(p => p.name === 'player') + 1

      if (this.state.finishRank === 1) {
        world.addScorePopup(W / 2, H / 2 - 40, '1ST PLACE!', '#ffcc00')
      } else {
        world.addScorePopup(W / 2, H / 2 - 40, `${this.state.finishRank}TH PLACE`, '#ff8888')
      }
    }

    // ─── ダッシュパーティクル ──────────────────────────────────
    if (this.state.isDashing && Math.random() < 0.3) {
      const trackTop = H * 0.3
      world.addParticle(
        this.state.playerX,
        trackTop + LANE_HEIGHT / 2,
        -100 - Math.random() * 50,
        (Math.random() - 0.5) * 20,
        0.2 + Math.random() * 0.2,
        '#ff8800',
        2,
      )
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const H = world.canvas.height
    const px = new PixelCanvas(ctx)
    const s = this.state

    // ─── 空（夜景） ────────────────────────────────────────────
    px.bandGradient(0, 0, W, H,
      [[0, SKY_TOP], [1, SKY_BOTTOM]],
      'v', 6,
    )

    // ─── 星 ────────────────────────────────────────────────────
    px.withAlpha(0.4, () => {
      for (let i = 0; i < 20; i++) {
        const sx = (i * 137) % W
        const sy = (i * 97) % (H * 0.3)
        const twinkle = 0.3 + Math.sin(performance.now() / 1000 + i * 1.7) * 0.3
        px.withAlpha(twinkle, () => px.circle(sx, sy, 1, '#ffee88'))
      }
    })

    // ─── トラック ──────────────────────────────────────────────
    const trackTop = H * 0.3
    px.rect(0, trackTop, W, H - trackTop, TRACK_COLOR)

    // レーン区切り線
    for (let i = 0; i <= LANE_COUNT; i++) {
      const y = trackTop + i * (LANE_HEIGHT + LANE_GAP) - LANE_GAP / 2
      const dashOffset = -(s.playerX * 0.5) % 40
      px.withAlpha(0.35, () => {
        for (let x = dashOffset; x < W; x += 40) {
          px.rect(x, y, 20, 2, LANE_LINE_COLOR)
        }
      })
    }

    // ─── 障害物 ────────────────────────────────────────────────
    for (const obs of s.obstacles) {
      const screenX = obs.x - s.playerX
      if (screenX < -obs.w - 20 || screenX > W + 20) continue
      const laneY = trackTop + obs.lane * (LANE_HEIGHT + LANE_GAP) + LANE_GAP / 2
      px.rect(screenX, laneY, obs.w, obs.h, '#ff8800')
      px.rect(screenX + 2, laneY + 2, obs.w - 4, 4, '#ffcc44')
    }

    // ─── AI 競争相手 ───────────────────────────────────────────
    for (let i = 0; i < AI_COUNT; i++) {
      const ai = s.aiPositions[i]
      const screenX = ai.x - s.playerX
      if (screenX < -PLAYER_W * 2 || screenX > W + PLAYER_W * 2) continue
      const laneY = trackTop + AI_LANE_OFFSETS[i] * (LANE_HEIGHT + LANE_GAP) + LANE_GAP / 2
      this._drawCar(px, screenX, laneY, PLAYER_W, PLAYER_H, AI_COLORS[i], false)
    }

    // ─── プレイヤー ────────────────────────────────────────────
    const playerLane = 1 // 中央レーン
    const playerY = trackTop + playerLane * (LANE_HEIGHT + LANE_GAP) + LANE_GAP / 2
    this._drawCar(px, PLAYER_X, playerY, PLAYER_W, PLAYER_H, PLAYER_COLOR, true)

    // ダッシュエフェクト
    if (s.isDashing) {
      px.withAlpha(0.4, () => {
        for (let i = 0; i < 4; i++) {
          const lx = PLAYER_X - 12 - i * 10 - Math.random() * 8
          const ly = playerY + Math.random() * PLAYER_H
          px.rect(lx, ly, 10 + Math.random() * 6, 3, NEON_COLOR)
        }
      })
    }

    // ─── ゴールライン ──────────────────────────────────────────
    const goalScreenX = TRACK_LENGTH_PX - s.playerX
    if (goalScreenX > -50 && goalScreenX < W + 50) {
      this._drawGoalLine(px, goalScreenX, trackTop, H)
    }

    // ─── HUD: 順位 ─────────────────────────────────────────────
    this._drawRankPanel(px, W, s)

    // ─── HUD: タイマー ─────────────────────────────────────────
    const timeLeft = Math.max(0, RACE_TIME_SEC - s.elapsed)
    const timeColor = timeLeft < 10 ? '#ff4444' : timeLeft < 20 ? '#ffcc44' : '#ffffff'
    px.text(`TIME: ${formatTime(timeLeft)}`, TIMER_X, TIMER_Y, {
      font: 'bold 16px monospace', fill: timeColor,
    })

    // ─── HUD: スタミナ ─────────────────────────────────────────
    px.roundedRect(STAMINA_X, STAMINA_Y, STAMINA_W, STAMINA_H, 'rgba(0,0,0,0.5)', 2)
    const staminaRatio = s.stamina / STAMINA_MAX
    const staminaColor = staminaRatio > 0.5 ? '#44dd88' : staminaRatio > 0.25 ? '#ffcc44' : '#ff4444'
    px.rect(STAMINA_X + 2, STAMINA_Y + 2, (STAMINA_W - 4) * staminaRatio, STAMINA_H - 4, staminaColor)
    px.text('DASH', STAMINA_X + STAMINA_W + 8, STAMINA_Y + 9, {
      font: '10px monospace', fill: '#ffffff',
    })

    // ─── 未開始メッセージ ──────────────────────────────────────
    if (!s.raceStarted) {
      px.text('Press ArrowRight or Space to start!', W / 2, H / 2 - 60, {
        font: 'bold 16px monospace', fill: '#ffffff', align: 'center',
      })
    }

    // ─── 距離表示 ──────────────────────────────────────────────
    const distM = Math.floor(s.playerX / (TRACK_LENGTH_PX / 500))
    px.text(`${distM}m / 500m`, W / 2, H - 16, {
      font: '12px monospace', fill: 'rgba(255,255,255,0.5)', align: 'center',
    })
  }

  isWon(_world: MutableWorld): boolean {
    return this.state.finished && this.state.finishRank === 1
  }

  isLost(_world: MutableWorld): boolean {
    if (this.state.elapsed >= RACE_TIME_SEC) return true
    if (this.state.finished && this.state.finishRank > 1) return true
    return false
  }

  // ─── 内部メソッド ───────────────────────────────────────────────

  private _initAI(_world: MutableWorld): void {
    const s = this.state
    s.aiPositions = []
    for (let i = 0; i < AI_COUNT; i++) {
      s.aiPositions.push({
        x: -50 + i * 30, // 若干ずらしてスタート
        lane: AI_LANE_OFFSETS[i],
        speed: AI_SPEEDS[i],
      })
    }
  }

  private _spawnObstacles(): void {
    const s = this.state
    s.obstacles = []
    const rng = this._hashRng(0x3d5e_9a1c)
    for (let i = 0; i < HAZARD_COUNT; i++) {
      const t = (i + 1) / (HAZARD_COUNT + 1)
      const x = HAZARD_SPAWN_DIST_START + t * (HAZARD_SPAWN_DIST_END - HAZARD_SPAWN_DIST_START)
      const w = HAZARD_W_RANGE[0] + rng() * (HAZARD_W_RANGE[1] - HAZARD_W_RANGE[0])
      const h = HAZARD_H_RANGE[0] + rng() * (HAZARD_H_RANGE[1] - HAZARD_H_RANGE[0])
      const lane = Math.floor(rng() * LANE_COUNT)
      s.obstacles.push({ x, y: 0, w, h, lane })
    }
  }

  private _respawnObstacles(world: MutableWorld): void {
    const s = this.state

    // 必要に応じて障害物を前方にスポーン
    const targetCount = HAZARD_COUNT
    if (s.obstacles.length < targetCount) {
      const needCount = targetCount - s.obstacles.length
      const W = world.canvas.width
      for (let i = 0; i < needCount; i++) {
        const w = HAZARD_W_RANGE[0] + Math.random() * (HAZARD_W_RANGE[1] - HAZARD_W_RANGE[0])
        const h = HAZARD_H_RANGE[0] + Math.random() * (HAZARD_H_RANGE[1] - HAZARD_H_RANGE[0])
        const lane = Math.floor(Math.random() * LANE_COUNT)
        const spawnX = s.playerX + W * 0.5 + Math.random() * W * 0.5
        s.obstacles.push({ x: spawnX, y: 0, w, h, lane })
      }
    }
  }

  private _hashRng(seed: number): () => number {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff
      return (s >>> 0) / 0xffffffff
    }
  }

  private _drawCar(px: PixelCanvas, x: number, y: number, w: number, h: number, color: string, isPlayer: boolean): void {
    // 影
    px.ellipse(x + w / 2, y + h + 2, w * 0.4, 4, 'rgba(0,0,0,0.3)')
    // 車体
    px.rect(x + 2, y + 8, w - 4, h - 16, color)
    // ルーフ
    px.rect(x + 6, y + 4, w - 12, 12, isPlayer ? '#ffffff' : this._darkenColor(color, 40))
    // ウィンドシールド
    px.rect(x + 8, y + 6, w - 16, 6, 'rgba(100,200,255,0.5)')
    // ヘッドライト
    px.rect(x + 4, y + h - 8, 6, 4, '#ffffcc')
    px.rect(x + w - 10, y + h - 8, 6, 4, '#ffffcc')
    // テールライト
    px.rect(x + 4, y + 8, 4, 4, '#ff3333')
    px.rect(x + w - 8, y + 8, 4, 4, '#ff3333')
  }

  private _darkenColor(color: string, amount: number): string {
    // 簡易色暗化（hex 文字列から RGB を減算）
    const hex = color.replace('#', '')
    const r = Math.max(0, parseInt(hex.substring(0, 2), 16) - amount)
    const g = Math.max(0, parseInt(hex.substring(2, 4), 16) - amount)
    const b = Math.max(0, parseInt(hex.substring(4, 6), 16) - amount)
    return `rgb(${r},${g},${b})`
  }

  private _drawGoalLine(px: PixelCanvas, x: number, trackTop: number, H: number): void {
    const postH = H - trackTop
    // ポスト
    px.rect(x - 2, trackTop - 5, 6, 10, '#ffffff')
    // チェック柄ネット
    const checkerSize = 12
    for (let row = 0; row < Math.ceil(postH / checkerSize); row++) {
      for (let col = 0; col < 2; col++) {
        const cx = x + col * checkerSize
        const cy = trackTop + row * checkerSize
        const isWhite = (row + col) % 2 === 0
        px.rect(cx, cy, checkerSize, checkerSize, isWhite ? '#ffffff' : '#333333')
      }
    }
  }

  private _drawRankPanel(px: PixelCanvas, W: number, s: RacingModeState): void {
    const rpX = RANK_PANEL_X
    const rpY = RANK_PANEL_Y
    const rpW = RANK_PANEL_W
    const rpH = RANK_PANEL_H

    px.roundedRect(rpX, rpY, rpW, rpH, 'rgba(8,6,10,0.75)', 2)

    // 順位表示
    if (s.finished) {
      const rankText = s.finishRank === 1 ? '1ST' : s.finishRank === 2 ? '2ND' : '3RD'
      const rankColor = s.finishRank === 1 ? '#ffcc00' : '#ff8888'
      px.text(`${rankText}!`, rpX + 12, rpY + 16, {
        font: 'bold 18px monospace', fill: rankColor,
      })
    } else {
      // 現在順位を計算
      const allPositions = [
        { name: 'player', x: s.playerX },
        ...s.aiPositions.map((ai) => ({ name: 'ai', x: ai.x })),
      ]
      allPositions.sort((a, b) => b.x - a.x)
      const currentRank = allPositions.findIndex(p => p.name === 'player') + 1
      const rankText = currentRank === 1 ? '1ST' : currentRank === 2 ? '2ND' : '3RD'
      px.text(`${rankText}`, rpX + 12, rpY + 16, {
        font: 'bold 18px monospace', fill: '#ffcc00',
      })
    }

    // AI 位置
    for (let i = 0; i < AI_COUNT; i++) {
      const ai = s.aiPositions[i]
      const distM = Math.floor(ai.x / (TRACK_LENGTH_PX / 500))
      px.text(`AI${i + 1}: ${distM}m`, rpX + 12 + i * 40, rpY + 34, {
        font: '9px monospace', fill: AI_COLORS[i],
      })
    }
  }
}

export default new RacingMode()
