/**
 * game/systems/TetrisFeature.ts
 *
 * テトリスゲームロジック + FeatureSystem 実装。
 * 'tetris' ジャンル確定時にアクティブになり、横スクロールの代わりに
 * テトリスのゲームプレイを提供する。
 *
 * アーキテクチャ:
 *   - 純粋関数 (createEmptyGrid, spawnPiece, etc.) → ユニットテスト対象
 *   - TetrisFeature クラス → FeatureSystem としてゲームループと統合
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

// ============================================================
// 定数
// ============================================================

/** グリッドの列数（標準テトリス） */
export const COLS = 10

/** グリッドの行数（標準テトリス） */
export const ROWS = 20

/** 1セルの描画サイズ px */
export const CELL_SIZE = 24

/** ライン消去スコア [0, 1ライン, 2ライン, 3ライン, 4ライン(テトリス)] */
export const LINE_SCORES = [0, 100, 300, 500, 800]

/** ドロップ間隔（秒）。level 0 のデフォルト値 */
const DEFAULT_DROP_INTERVAL = 0.8

/** ドロップ間隔の最小値（高速化の下限） */
const MIN_DROP_INTERVAL = 0.05

/** レベルアップに必要なライン数 */
const LINES_PER_LEVEL = 10

/** ソフトドロップ速度（秒あたりの行数） */
export const SOFT_DROP_SPEED = 15

/** HUD 横オフセット（プレビュー領域の右余白） */
const HUD_OFFSET_X = 20

/** プレビュー領域の縦オフセット */
const PREVIEW_OFFSET_Y = 40

/** HUD 領域の縦オフセット */
const HUD_OFFSET_Y = 120

/** HUD 行間 */
const HUD_LINE_HEIGHT = 22

/** セルのハイライト・シャドウの太さ */
const HIGHLIGHT_THICKNESS = 2

// ============================================================
// 型定義
// ============================================================

/** テトリミノ定義 */
export interface TetrominoDef {
  id: string
  color: string
  /** 回転状態ごとのブロック配置 [[rowOffset, colOffset], ...] */
  rotations: number[][][]
}

/** アクティブピース */
export interface ActivePiece {
  def: TetrominoDef
  rotation: number
  col: number
  row: number
}

/** テトリス内部状態 */
export interface TetrisState {
  grid: (string | null)[][]
  piece: ActivePiece | null
  nextPieceId: string | null
  bag: string[]
  bagIdx: number
  gameOver: boolean
  linesCleared: number
  level: number
  totalScore: number
  softDropActive: boolean
  initialized: boolean
  /** 連続ライン消去ストリーク数 */
  currentStreak: number
  /** 自然ドロップタイマー */
  dropTimer: number
  /** ゲームオーバー通知済みフラグ（毎フレームの modifyPlayerHp 呼び出しを防止） */
  deathNotified: boolean
}

// ============================================================
// テトリミノ定義（7種）
// ============================================================

export const TETROMINOS: TetrominoDef[] = [
  {
    id: 'I', color: '#00f0f0',
    rotations: [
      [[0, 0], [0, 1], [0, 2], [0, 3]],
      [[0, 0], [1, 0], [2, 0], [3, 0]],
      [[0, 0], [0, 1], [0, 2], [0, 3]],
      [[0, 0], [1, 0], [2, 0], [3, 0]],
    ],
  },
  {
    id: 'O', color: '#f0f000',
    rotations: [
      [[0, 0], [0, 1], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 0], [1, 1]],
    ],
  },
  {
    id: 'T', color: '#a000f0',
    rotations: [
      [[0, 0], [0, 1], [0, 2], [1, 1]],
      [[0, 0], [1, 0], [2, 0], [1, 1]],
      [[1, 0], [1, 1], [1, 2], [0, 1]],
      [[0, 0], [1, 0], [2, 0], [1, -1]],
    ],
  },
  {
    id: 'S', color: '#00f000',
    rotations: [
      [[0, 1], [0, 2], [1, 0], [1, 1]],
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[0, 1], [0, 2], [1, 0], [1, 1]],
      [[0, 0], [1, 0], [1, 1], [2, 1]],
    ],
  },
  {
    id: 'Z', color: '#f00000',
    rotations: [
      [[0, 0], [0, 1], [1, 1], [1, 2]],
      [[0, 1], [1, 0], [1, 1], [2, 0]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
      [[0, 1], [1, 0], [1, 1], [2, 0]],
    ],
  },
  {
    id: 'J', color: '#0000f0',
    rotations: [
      [[0, 0], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [0, 1], [1, 0], [2, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 2]],
      [[0, 0], [1, 0], [2, 0], [2, -1]],
    ],
  },
  {
    id: 'L', color: '#f0a000',
    rotations: [
      [[0, 2], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [1, 0], [2, 0], [2, 1]],
      [[0, 0], [0, 1], [0, 2], [1, 0]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
    ],
  },
]

// ============================================================
// 純粋関数（ユニットテスト対象）
// ============================================================

/** 空のグリッドを作成する */
export function createEmptyGrid(): (string | null)[][] {
  const grid: (string | null)[][] = []
  for (let r = 0; r < ROWS; r++) {
    grid.push(new Array(COLS).fill(null))
  }
  return grid
}

/** 初期状態を作成する */
export function initialState(): TetrisState {
  return {
    grid: createEmptyGrid(),
    piece: null,
    nextPieceId: null,
    bag: [],
    bagIdx: TETROMINOS.length,
    gameOver: false,
    linesCleared: 0,
    level: 0,
    totalScore: 0,
    softDropActive: false,
    initialized: false,
    currentStreak: 0,
    dropTimer: 0,
    deathNotified: false,
  }
}

/** バッファードロップ（7-bag）から次のピースIDを取得する */
export function fetchNextPieceId(state: TetrisState): string {
  if (state.bagIdx >= state.bag.length) {
    // バッグを再充填
    state.bag = TETROMINOS.map(t => t.id)
    // Fisher-Yates シャッフル
    for (let i = state.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]]
    }
    state.bagIdx = 0
  }
  const id = state.bag[state.bagIdx]
  state.bagIdx++
  return id
}

/** 現在の回転状態のブロック配置を取得 */
export function getBlocks(piece: ActivePiece): number[][] {
  return piece.def.rotations[piece.rotation]
}

/** 指定位置にピースが配置可能か判定する */
export function isValidPlacement(
  grid: (string | null)[][],
  piece: ActivePiece,
): boolean {
  const blocks = getBlocks(piece)
  for (const [rowOff, colOff] of blocks) {
    const r = piece.row + rowOff
    const c = piece.col + colOff
    // 横方向の境界外
    if (c < 0 || c >= COLS) return false
    // 縦方向の下端超え（上端はグリッド上でもOK）
    if (r >= ROWS) return false
    // 既にブロックが配置されている
    if (r >= 0 && grid[r][c] !== null) return false
  }
  return true
}

/** 新しいピースを生成する */
export function spawnPiece(state: TetrisState): void {
  // nextPiece があればそれを現在のピースに
  let id: string
  if (state.nextPieceId) {
    id = state.nextPieceId
    state.nextPieceId = null
  } else {
    id = fetchNextPieceId(state)
  }

  const def = TETROMINOS.find(t => t.id === id)
  if (!def) return
  const col = id === 'I' ? Math.floor(COLS / 2) - 2 : Math.floor(COLS / 2) - 1
  const piece: ActivePiece = { def, rotation: 0, col, row: -1 }

  if (!isValidPlacement(state.grid, piece)) {
    state.gameOver = true
    state.piece = null
    return
  }

  state.piece = piece
  // 次のピースを準備
  state.nextPieceId = fetchNextPieceId(state)
}

/** 横移動（delta: -1=左, +1=右） */
export function movePiece(state: TetrisState, delta: number): boolean {
  if (!state.piece || state.gameOver) return false
  const origCol = state.piece.col
  state.piece.col += delta
  if (isValidPlacement(state.grid, state.piece)) return true
  state.piece.col = origCol
  return false
}

/** 時計回りに回転 */
export function rotatePiece(state: TetrisState): boolean {
  if (!state.piece || state.gameOver) return false
  const origRotation = state.piece.rotation
  state.piece.rotation = (state.piece.rotation + 1) % 4

  if (isValidPlacement(state.grid, state.piece)) return true

  // 壁蹴り: ±1列シフトで再試行
  for (const kick of [-1, 1, -2, 2]) {
    const origCol = state.piece.col
    state.piece.col += kick
    if (isValidPlacement(state.grid, state.piece)) return true
    state.piece.col = origCol
  }

  // 全蹴り失敗で回転を元に戻す
  state.piece.rotation = origRotation
  return false
}

/** ピースがさらに下にドロップ可能か判定 */
export function canPieceDrop(state: TetrisState): boolean {
  if (!state.piece) return false
  const testRow = state.piece.row + 1
  const origRow = state.piece.row
  state.piece.row = testRow
  const valid = isValidPlacement(state.grid, state.piece)
  state.piece.row = origRow
  return valid
}

/** ハードドロップ（最下部まで即座に落下） */
export function hardDrop(state: TetrisState): number {
  if (!state.piece || state.gameOver) return 0
  let dropped = 0
  while (canPieceDrop(state)) {
    state.piece.row++
    dropped++
  }
  lockPiece(state)
  return dropped
}

/** アクティブピースをグリッドに固定する */
export function lockPiece(state: TetrisState): number {
  if (!state.piece) return 0
  const blocks = getBlocks(state.piece)
  for (const [rowOff, colOff] of blocks) {
    const r = state.piece.row + rowOff
    const c = state.piece.col + colOff
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      state.grid[r][c] = state.piece.def.color
    }
  }
  state.piece = null
  return 0
}

/** 満タンの行を消去し、スコアを加算する */
export function clearLines(state: TetrisState): number {
  let lines = 0
  for (let r = ROWS - 1; r >= 0; r--) {
    if (state.grid[r].every(cell => cell !== null)) {
      state.grid.splice(r, 1)
      state.grid.unshift(new Array(COLS).fill(null))
      lines++
      r++ // 同じ行インデックスを再チェック
    }
  }

  if (lines > 0) {
    state.linesCleared += lines
    state.currentStreak++
    // ストリークボーナス（連続消去でスコア上昇）
    const streakBonus = state.currentStreak > 1 ? lines * 50 * (state.currentStreak - 1) : 0
    state.totalScore += (LINE_SCORES[Math.min(lines, 4)] ?? 0) * (state.level + 1) + streakBonus

    // レベルアップ判定
    const newLevel = Math.floor(state.linesCleared / LINES_PER_LEVEL)
    if (newLevel > state.level) {
      state.level = newLevel
    }
  } else {
    state.currentStreak = 0
  }

  return lines
}

/** ドロップ間隔をレベルに応じて計算する */
export function getDropInterval(level: number): number {
  const interval = DEFAULT_DROP_INTERVAL * Math.pow(0.75, level)
  return Math.max(MIN_DROP_INTERVAL, interval)
}

// ============================================================
// FeatureSystem 実装
// ============================================================

/** テトリス Feature を担当する FeatureId */
const TETRIS_FEATURE_ID = 'tetris'

export class TetrisFeature implements FeatureSystem {
  readonly handles = TETRIS_FEATURE_ID

  private _state: TetrisState = initialState()
  /** テトリスボードの描画オフセット（Canvas上の位置） */
  private _boardX = 0
  private _boardY = 0

  onInit(world: MutableWorld): void {
    this._state = initialState()
    this._state.initialized = true
    // 最初のピースを生成
    spawnPiece(this._state)
    // ボード位置を Canvas 中央に配置
    const W = world.canvas.width
    const H = world.canvas.height
    this._boardX = (W - COLS * CELL_SIZE) / 2
    this._boardY = (H - ROWS * CELL_SIZE) / 2
  }

  onManualUpdated(_world: MutableWorld, _versionKey: string): void {
    // 説明書更新時は状態をリセット
    this._state = initialState()
    this._state.initialized = true
    spawnPiece(this._state)
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    // テトリスゲームオーバー時にメインゲームへ死亡を通知（1回限り）
    if (this._state.gameOver && !this._state.deathNotified) {
      this._state.deathNotified = true
      world.modifyPlayerHp(-999)
      return
    }
    if (this._state.gameOver) return

    const r = world.rules
    const controls = r.controls

    // ─── 入力処理 ──────────────────────────────────────────────
    // 左移動
    if (input.justPressed.has(controls.moveLeft)) {
      movePiece(this._state, -1)
    }
    // 右移動
    if (input.justPressed.has(controls.moveRight)) {
      movePiece(this._state, 1)
    }
    // 回転
    if (input.justPressed.has(controls.jump)) {
      rotatePiece(this._state)
    }
    // ハードドロップ
    const moveDownKey = controls.moveDown ?? 'ArrowDown'
    if (input.justPressed.has(moveDownKey)) {
      const dropped = hardDrop(this._state)
      this._state.totalScore += dropped * 2 // HUD 表示同期
      world.addScore(dropped * 2) // ハードドロップボーナス
      // hardDrop は内部で lockPiece を呼ぶため、ライン消去も実行する
      const prevScore = this._state.totalScore
      const lines = clearLines(this._state)
      if (lines > 0) {
        const delta = this._state.totalScore - prevScore
        world.addScore(delta)
        world.triggerShake(lines * 2)
      }
      spawnPiece(this._state)
    }

    // ソフトドロップ（下キー長押し）
    const softDropSpeed = SOFT_DROP_SPEED
    this._state.softDropActive = input.keys.has(moveDownKey)
    if (this._state.softDropActive && this._state.piece) {
      this._state.dropTimer += dt * softDropSpeed
      const piece = this._state.piece
      while (this._state.dropTimer >= 1 && canPieceDrop(this._state)) {
        piece.row++
        this._state.dropTimer -= 1
        this._state.totalScore += 1 // HUD 表示同期
        world.addScore(1) // ソフトドロップボーナス
      }
      // 落下不能になったら即座にロック
      if (this._state.piece && !canPieceDrop(this._state)) {
        const prevScore = this._state.totalScore
        lockPiece(this._state)
        const lines = clearLines(this._state)
        if (lines > 0) {
          const delta = this._state.totalScore - prevScore
          world.addScore(delta)
          world.triggerShake(lines * 2)
        }
        spawnPiece(this._state)
        // dropTimer をリセットして次のピースに蓄積値が持ち込まれないようにする
        this._state.dropTimer = 0
      }
    }

    // ─── 自然ドロップ ──────────────────────────────────────────
    if (!this._state.softDropActive) {
      const interval = getDropInterval(this._state.level)
      this._state.dropTimer += dt / interval
      if (this._state.dropTimer >= 1) {
        this._state.dropTimer = 0
        if (this._state.piece && canPieceDrop(this._state)) {
          this._state.piece.row++
        } else if (this._state.piece) {
          // ドロップ不可 → 固定して次のピース
          const prevScore = this._state.totalScore
          lockPiece(this._state)
          const lines = clearLines(this._state)
          if (lines > 0) {
            // clearLines が state.totalScore に既に加算済みなので、差分のみ world に反映
            const delta = this._state.totalScore - prevScore
            world.addScore(delta)
            world.triggerShake(lines * 2)
          }
          spawnPiece(this._state)
        }
      }
    }

  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const H = world.canvas.height
    this._boardX = (W - COLS * CELL_SIZE) / 2
    this._boardY = (H - ROWS * CELL_SIZE) / 2

    this._drawBoard(ctx)
    this._drawGhostPiece(ctx)
    this._drawActivePiece(ctx)
    this._drawNextPiece(ctx, W, H)
    this._drawHUD(ctx, W, H)
  }

  private _drawBoard(ctx: CanvasRenderingContext2D): void {
    const { grid } = this._state
    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(this._boardX - 2, this._boardY - 2, COLS * CELL_SIZE + 4, ROWS * CELL_SIZE + 4)

    // グリッド線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath()
      ctx.moveTo(this._boardX, this._boardY + r * CELL_SIZE)
      ctx.lineTo(this._boardX + COLS * CELL_SIZE, this._boardY + r * CELL_SIZE)
      ctx.stroke()
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath()
      ctx.moveTo(this._boardX + c * CELL_SIZE, this._boardY)
      ctx.lineTo(this._boardX + c * CELL_SIZE, this._boardY + ROWS * CELL_SIZE)
      ctx.stroke()
    }

    // 配置済みブロック
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c]
        if (cell !== null) {
          this._drawCell(ctx, c, r, cell)
        }
      }
    }
  }

  private _drawCell(ctx: CanvasRenderingContext2D, col: number, row: number, color: string): void {
    const x = this._boardX + col * CELL_SIZE
    const y = this._boardY + row * CELL_SIZE
    const pad = 1

    // メイン塗り
    ctx.fillStyle = color
    ctx.fillRect(x + pad, y + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2)

    // ハイライト（上・左）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.fillRect(x + pad, y + pad, CELL_SIZE - pad * 2, HIGHLIGHT_THICKNESS)
    ctx.fillRect(x + pad, y + pad, HIGHLIGHT_THICKNESS, CELL_SIZE - pad * 2)

    // シャドウ（下・右）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.fillRect(x + pad, y + CELL_SIZE - pad - HIGHLIGHT_THICKNESS, CELL_SIZE - pad * 2, HIGHLIGHT_THICKNESS)
    ctx.fillRect(x + CELL_SIZE - pad - HIGHLIGHT_THICKNESS, y + pad, HIGHLIGHT_THICKNESS, CELL_SIZE - pad * 2)
  }

  private _drawActivePiece(ctx: CanvasRenderingContext2D): void {
    if (!this._state.piece) return
    const blocks = getBlocks(this._state.piece)
    for (const [rowOff, colOff] of blocks) {
      const r = this._state.piece.row + rowOff
      const c = this._state.piece.col + colOff
      if (r >= 0 && r < ROWS) {
        this._drawCell(ctx, c, r, this._state.piece.def.color)
      }
    }
  }

  private _drawGhostPiece(ctx: CanvasRenderingContext2D): void {
    if (!this._state.piece) return
    const ghost = { ...this._state.piece }
    // 最下部までドロップ（ROWS を最大反復回数としてガード）
    for (let i = 0; i < ROWS; i++) {
      const testRow = ghost.row + 1
      ghost.row = testRow
      if (!isValidPlacement(this._state.grid, ghost)) {
        ghost.row = testRow - 1
        break
      }
    }

    const blocks = getBlocks(ghost)
    ctx.globalAlpha = 0.2
    for (const [rowOff, colOff] of blocks) {
      const r = ghost.row + rowOff
      const c = ghost.col + colOff
      if (r >= 0 && r < ROWS) {
        this._drawCell(ctx, c, r, ghost.def.color)
      }
    }
    ctx.globalAlpha = 1
  }

  private _drawNextPiece(ctx: CanvasRenderingContext2D, _W: number, _H: number): void {
    if (!this._state.nextPieceId) return
    const def = TETROMINOS.find(t => t.id === this._state.nextPieceId)
    if (!def) return
    const blocks = def.rotations[0]

    // プレビュー領域
    const previewX = this._boardX + COLS * CELL_SIZE + HUD_OFFSET_X
    const previewY = this._boardY + PREVIEW_OFFSET_Y
    const previewW = 4 * CELL_SIZE
    const previewH = 4 * CELL_SIZE

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(previewX - 2, previewY - 2, previewW + 4, previewH + 4)

    // ラベル
    ctx.fillStyle = '#aaaaaa'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('NEXT', previewX + previewW / 2, previewY - 6)

    // ブロック描画（中央揃え）
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity
    for (const [r, c] of blocks) {
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
    }
    const pieceW = (maxC - minC + 1) * CELL_SIZE
    const pieceH = (maxR - minR + 1) * CELL_SIZE
    const offsetX = previewX + (previewW - pieceW) / 2 - minC * CELL_SIZE
    const offsetY = previewY + (previewH - pieceH) / 2 - minR * CELL_SIZE

    for (const [r, c] of blocks) {
      const x = offsetX + c * CELL_SIZE
      const y = offsetY + r * CELL_SIZE
      const pad = 1
      ctx.fillStyle = def.color
      ctx.fillRect(x + pad, y + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.fillRect(x + pad, y + pad, CELL_SIZE - pad * 2, 2)
    }
  }

  private _drawHUD(ctx: CanvasRenderingContext2D, _W: number, _H: number): void {
    const hudX = this._boardX + COLS * CELL_SIZE + HUD_OFFSET_X
    const hudY = this._boardY + HUD_OFFSET_Y

    ctx.fillStyle = '#cccccc'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'left'

    const lines = [
      `SCORE: ${this._state.totalScore}`,
      `LINES: ${this._state.linesCleared}`,
      `LEVEL: ${this._state.level}`,
    ]

    if (this._state.currentStreak > 1) {
      lines.push(`STREAK: x${this._state.currentStreak}`)
    }

    lines.forEach((line, i) => {
      ctx.fillText(line, hudX, hudY + i * HUD_LINE_HEIGHT)
    })
  }

 }
