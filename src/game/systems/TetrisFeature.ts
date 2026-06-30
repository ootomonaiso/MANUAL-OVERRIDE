/**
 * game/systems/TetrisFeature.ts
 * テトリスモードのゲームロジックを担当する FeatureSystem。
 *
 * tetris_mode feature が有効な場合に起動し、以下の処理を行う:
 * - 10x20 のグリッド管理
 * - 7種類のテトリミノの生成・回転・移動
 * - ライン消去とスコア計算
 * - ゲームオーバー判定（積み上がり）
 * - Canvas へのテトリスボード描画
 *
 * 操作:
 * - ArrowLeft / ArrowRight: 左右移動
 * - ArrowUp: 回転（時計回り）
 * - ArrowDown: ソフトドロップ（加速落下）
 * - Space: ハードドロップ（即座に落下）
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { ScrollDirection } from '../../domain/types'
import { TETRIS_COLORS } from './tetris-colors'

// ─── グリッド定数 ───────────────────────────────────────────────────
const COLS = 10
const ROWS = 20
const CELL_SIZE = 24

// ─── テトリミノ定義 ─────────────────────────────────────────────────
type TetrominoId = keyof typeof TETRIS_COLORS

interface TetrominoDef {
  id: TetrominoId
  color: string
  // 各回転状態のブロック座標 (col, row)
  rotations: number[][][]
}

const TETROMINOS: TetrominoDef[] = [
  {
    id: 'I', color: TETRIS_COLORS.I,
    // Iピースは2状態のみ（0↔1を交互に使用）
    rotations: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],   // State 0: 水平
      [[2, 0], [2, 1], [2, 2], [2, 3]],   // State 1: 垂直
      [[0, 1], [1, 1], [2, 1], [3, 1]],   // State 2: 水平（State 0と同じ）
      [[2, 0], [2, 1], [2, 2], [2, 3]],   // State 3: 垂直（State 1と同じ）
    ],
  },
  {
    id: 'O', color: TETRIS_COLORS.O,
    // Oピースは回転不変（4状態すべて同一）
    rotations: [
      [[0, 0], [1, 0], [0, 1], [1, 1]],   // State 0
      [[0, 0], [1, 0], [0, 1], [1, 1]],   // State 1
      [[0, 0], [1, 0], [0, 1], [1, 1]],   // State 2
      [[0, 0], [1, 0], [0, 1], [1, 1]],   // State 3
    ],
  },
  {
    id: 'T', color: TETRIS_COLORS.T,
    rotations: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 0], [1, 0], [2, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 1], [0, 2]],
    ],
  },
  {
    id: 'S', color: TETRIS_COLORS.S,
    // Sピースは2状態のみ（標準SRS準拠）
    rotations: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],   // State 0
      [[0, 0], [0, 1], [1, 1], [1, 2]],   // State 1
      [[1, 0], [2, 0], [0, 1], [1, 1]],   // State 2 = State 0
      [[0, 0], [0, 1], [1, 1], [1, 2]],   // State 3 = State 1
    ],
  },
  {
    id: 'Z', color: TETRIS_COLORS.Z,
    // Zピースは2状態のみ（標準SRS準拠）
    rotations: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],   // State 0
      [[1, 0], [0, 1], [1, 1], [0, 2]],   // State 1
      [[0, 0], [1, 0], [1, 1], [2, 1]],   // State 2 = State 0
      [[1, 0], [0, 1], [1, 1], [0, 2]],   // State 3 = State 1
    ],
  },
  {
    id: 'J', color: TETRIS_COLORS.J,
    rotations: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 0], [1, 0], [2, 0], [2, 1]],
      [[0, 0], [0, 1], [1, 1], [0, 2]],
    ],
  },
  {
    id: 'L', color: TETRIS_COLORS.L,
    rotations: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 0], [1, 0], [2, 0], [0, 1]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  },
]

// ─── 内部状態 ───────────────────────────────────────────────────────
type CellColor = string | null

interface ActivePiece {
  def: TetrominoDef
  rotation: number   // 0〜3
  col: number        // ピボット列
  row: number        // ピボット行
}

interface TetrisState {
  grid: CellColor[][]
  piece: ActivePiece | null
  bag: TetrominoId[]
  bagIdx: number
  dropTimer: number
  gameOver: boolean
  linesCleared: number
  lastLinesCleared: number
  totalScore: number
  softDropActive: boolean
  lockTimer: number
  lockDelay: number
  lockResets: number       // H1: lock-delay reset counter
  moveDelay: number
  moveTimer: number
  spawnX: number
  spawnY: number
  boardWidth: number
  boardHeight: number
  initialized: boolean
  // H2: streak of consecutive line clears (cumulative line count over streak)
  currentStreak: number
}

const DROP_INTERVAL = 0.8        // 自動落下間隔 (秒)
const SOFT_DROP_INTERVAL = 0.05  // ソフトドロップ間隔 (秒)
const LOCK_DELAY = 1.5           // ロックディレイ (秒)
const LOCK_RESETS_MAX = 15       // H1: ロックディレイのリセット上限
const MOVE_DELAY = 0.1           // 移動リピートディレイ (秒)
const LINE_SCORES = [0, 100, 300, 500, 800] // ライン消去スコア [0, 1, 2, 3, 4]

function createEmptyGrid(): CellColor[][] {
  return Array.from({ length: ROWS }, () => Array<CellColor>(COLS).fill(null))
}

function initialState(): TetrisState {
  return {
    grid: createEmptyGrid(),
    piece: null,
    bag: [],
    bagIdx: TETROMINOS.length,
    dropTimer: 0,
    gameOver: false,
    linesCleared: 0,
    lastLinesCleared: 0,
    totalScore: 0,
    softDropActive: false,
    lockTimer: 0,
    lockDelay: LOCK_DELAY,
    lockResets: 0,          // H1: lock-delay reset counter
    moveDelay: MOVE_DELAY,
    moveTimer: 0,
    spawnX: 0,
    spawnY: 0,
    boardWidth: COLS * CELL_SIZE,
    boardHeight: ROWS * CELL_SIZE,
    initialized: false,
    currentStreak: 0,       // H2: line-count streak for combo
  }
}

// ─── バッグランダム（7-bag） ────────────────────────────────────────
function shuffleBag(bag: TetrominoId[]): void {
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
}

function getNextPieceId(state: TetrisState): TetrominoId {
  if (state.bagIdx >= state.bag.length) {
    state.bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
    shuffleBag(state.bag)
    state.bagIdx = 0
  }
  return state.bag[state.bagIdx++]
}

// ─── ピース操作 ─────────────────────────────────────────────────────
function getBlocks(piece: ActivePiece): [number, number][] {
  return piece.def.rotations[piece.rotation] as [number, number][]
}

function spawnPiece(state: TetrisState): void {
  const id = getNextPieceId(state)
  const def = TETROMINOS.find(t => t.id === id) ?? TETROMINOS[0]
  // Iピースは4幅なので中央寄せのためcolを調整
  const spawnCol = id === 'I' ? Math.floor(COLS / 2) - 2 : Math.floor(COLS / 2) - 1
  const piece: ActivePiece = {
    def,
    rotation: 0,
    col: spawnCol,
    row: -1,
  }

  // 配置可能かチェック
  if (!isValidPlacement(state.grid, piece)) {
    state.gameOver = true
    state.piece = null
    return
  }

  state.piece = piece
  state.dropTimer = 0
  state.lockTimer = 0
  state.lockResets = 0      // H1: reset lock reset counter on new piece
  state.softDropActive = false
  state.moveTimer = 0       // M3-I9: prevent auto-repeat carryover from previous piece
}

function isValidPlacement(grid: CellColor[][], piece: ActivePiece): boolean {
  const blocks = getBlocks(piece)
  for (const [dc, dr] of blocks) {
    const c = piece.col + dc
    const r = piece.row + dr
    if (c < 0 || c >= COLS || r >= ROWS) return false
    if (r >= 0 && grid[r][c] !== null) return false
  }
  return true
}

function rotatePiece(state: TetrisState): boolean {
  if (!state.piece || state.gameOver) return false
  const oldRotation = state.piece.rotation
  state.piece.rotation = (state.piece.rotation + 1) % 4

  if (!isValidPlacement(state.grid, state.piece)) {
    // 壁蹴り: 水平方向 [-1, 1, -2, 2]
    for (const kick of [-1, 1, -2, 2]) {
      const testPiece = { ...state.piece, col: state.piece.col + kick }
      if (isValidPlacement(state.grid, testPiece)) {
        state.piece.col = testPiece.col
        return true
      }
    }
    // Iピースは垂直方向のキックも試す（標準SRS準拠）
    if (state.piece.def.id === 'I') {
      for (const kick of [-2, -1, 1, 2]) {
        const testPiece = { ...state.piece, row: state.piece.row + kick }
        if (isValidPlacement(state.grid, testPiece)) {
          state.piece.row = testPiece.row
          return true
        }
      }
    }
    // 失敗: 回転元に戻す
    state.piece.rotation = oldRotation
    return false
  }
  return true
}

function movePiece(state: TetrisState, dcol: number): boolean {
  if (!state.piece || state.gameOver) return false
  const testPiece = { ...state.piece, col: state.piece.col + dcol }
  if (isValidPlacement(state.grid, testPiece)) {
    state.piece.col = testPiece.col
    return true
  }
  return false
}

function hardDrop(state: TetrisState, _world?: MutableWorld): number {
  if (!state.piece || state.gameOver) return 0
  let dropped = 0
  while (true) {
    const testPiece = { ...state.piece, row: state.piece.row + 1 }
    if (isValidPlacement(state.grid, testPiece)) {
      state.piece.row++
      dropped++
    } else {
      break
    }
  }
  // H9+H1-I9: only set lockTimer when piece actually dropped
  // prevents Space spam from resetting lock delay infinitely
  if (dropped > 0) {
    state.lockTimer = 0.1  // 100ms lock delay after hard drop
    state.lockResets = 0
  }
  return dropped
}

function lockPiece(state: TetrisState, world?: MutableWorld): number {
  if (!state.piece) return 0
  const blocks = getBlocks(state.piece)
  for (const [dc, dr] of blocks) {
    const c = state.piece.col + dc
    const r = state.piece.row + dr
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      state.grid[r][c] = state.piece.def.color
    }
  }
  state.piece = null
  const lines = clearLines(state, world)
  // H2: update streak - add line count on clear, reset to 0 on no-clear
  if (lines > 0) {
    state.currentStreak += lines
  } else {
    state.currentStreak = 0
  }
  return lines
}

function clearLines(state: TetrisState, world?: MutableWorld): number {
  let lines = 0
  for (let r = ROWS - 1; r >= 0; r--) {
    if (state.grid[r].every(cell => cell !== null)) {
      state.grid.splice(r, 1)
      state.grid.unshift(Array<CellColor>(COLS).fill(null))
      lines++
      r++ // 同じ行を再チェック
    }
  }

  if (lines > 0) {
    state.linesCleared += lines
    const score = LINE_SCORES[Math.min(lines, LINE_SCORES.length - 1)]
    state.totalScore += score
    // world.addScore でスコアを報告（他のFeatureと一貫性）
    if (world) {
      world.addScore(score)
    }
  }
  return lines
}

function canPieceDrop(state: TetrisState): boolean {
  if (!state.piece) return false
  const testPiece = { ...state.piece, row: state.piece.row + 1 }
  return isValidPlacement(state.grid, testPiece)
}

// ─── FeatureSystem 実装 ─────────────────────────────────────────────
export class TetrisFeature implements FeatureSystem {
  readonly handles = 'tetris_mode' as const

  private state: TetrisState = initialState()
  // H7: save scrollDirection and scrollSpeed on init to restore on disable
  private savedScrollDirection: ScrollDirection = 'horizontal'
  private savedScrollSpeed: number = 3
  private firstInit = true
  // M3: cache canvas dimensions to avoid per-frame recalculation
  private _lastCanvasW = 0
  private _lastCanvasH = 0

  onInit(world: MutableWorld): void {
    this.state = initialState()
    // Invalidate dimension cache so _calcBoardPosition recalculates after state reset
    this._lastCanvasW = 0
    this._lastCanvasH = 0
    this._calcBoardPosition(world.canvas.width, world.canvas.height)
    this.state.initialized = true
    // H7: save scrollDirection and scrollSpeed only on first init
    // onManualUpdated calls onInit again, must not overwrite saved values
    if (this.firstInit) {
      this.savedScrollDirection = world.rules.scrollDirection
      this.savedScrollSpeed = world.rules.scrollSpeed
      this.firstInit = false
    }
    // スクロール停止
    world.rules.scrollSpeed = 0
    // 最初のピースを生成
    spawnPiece(this.state)
  }

  onManualUpdated(world: MutableWorld, versionKey: string): void {
    void versionKey
    this.onInit(world)
  }

  onDisable(world: MutableWorld): void {
    // テトリスモード終了時に状態を復元
    world.rules.scrollSpeed = this.savedScrollSpeed
    // H7: restore scrollDirection
    world.rules.scrollDirection = this.savedScrollDirection
    world.player.vx = 0
    world.player.vy = 0
    this.state.gameOver = true
    // Reset firstInit so next onInit saves fresh values
    this.firstInit = true
  }

  preUpdate(world: MutableWorld, _input: InputSnapshot, _dt: number): void {
    // H6: guard with feature flag
    if (!world.rules.features.has('tetris_mode')) return
    // テトリスモード時はプレイヤー移動を無効化
    world.player.vx = 0
    world.player.vy = 0
    world.hazards.length = 0
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    // M1: guard with feature flag (consistent with preUpdate and render)
    if (!world.rules.features.has('tetris_mode')) return
    // Zero player velocity after physics to prevent MovementFeature bleed-through
    world.player.vx = 0
    world.player.vy = 0
    if (!this.state.initialized) {
      this.state.initialized = true
      this._calcBoardPosition(world.canvas.width, world.canvas.height)
      spawnPiece(this.state)
      world.rules.scrollSpeed = 0
    }

    if (this.state.gameOver) {
      // ゲームオーバー時は何もしない
      return
    }

    if (!this.state.piece) {
      spawnPiece(this.state)
      return
    }

    const keys = input.keys
    const justPressed = input.justPressed

    // ─── 入力処理 ─────────────────────────────────────────────
    // 移動リピート
    this.state.moveTimer += dt

    // 左右移動（null安全アクセス）
    const leftKey = world.rules.controls.moveLeft ?? 'ArrowLeft'
    const rightKey = world.rules.controls.moveRight ?? 'ArrowRight'
    const upKey = world.rules.controls.moveUp ?? 'ArrowUp'
    const downKey = world.rules.controls.moveDown ?? 'ArrowDown'
    const spaceKey = world.rules.controls.jump ?? 'Space'

    if (justPressed.has(leftKey) || (keys.has(leftKey) && this.state.moveTimer >= this.state.moveDelay)) {
      if (movePiece(this.state, -1)) {
        this.state.moveTimer = 0
        // H1: only reset lockTimer if under the reset limit
        if (!canPieceDrop(this.state) && this.state.lockResets < LOCK_RESETS_MAX) {
          this.state.lockTimer = 0
          this.state.lockResets++
        }
      }
    }
    if (justPressed.has(rightKey) || (keys.has(rightKey) && this.state.moveTimer >= this.state.moveDelay)) {
      if (movePiece(this.state, 1)) {
        this.state.moveTimer = 0
        // H1: only reset lockTimer if under the reset limit
        if (!canPieceDrop(this.state) && this.state.lockResets < LOCK_RESETS_MAX) {
          this.state.lockTimer = 0
          this.state.lockResets++
        }
      }
    }

    // 回転
    if (justPressed.has(upKey)) {
      if (rotatePiece(this.state)) {
        // H1: only reset lockTimer if under the reset limit
        if (!canPieceDrop(this.state) && this.state.lockResets < LOCK_RESETS_MAX) {
          this.state.lockTimer = 0
          this.state.lockResets++
        }
      }
    }

    // ソフトドロップ
    this.state.softDropActive = keys.has(downKey)

    // ハードドロップ
    if (justPressed.has(spaceKey)) {
      const dropCells = hardDrop(this.state, world)
      const hardDropScore = dropCells * 2
      this.state.totalScore += hardDropScore
      world.addScore(hardDropScore)
      // H9: hardDrop now sets lockTimer=0.1, letting the lock-delay flow handle it
      // Do NOT return here; let the lock-delay flow below handle the lock + spawn
    }

    // ─── 落下処理 ─────────────────────────────────────────────
    const interval = this.state.softDropActive ? SOFT_DROP_INTERVAL : DROP_INTERVAL
    this.state.dropTimer += dt

    if (this.state.dropTimer >= interval) {
      this.state.dropTimer = 0

      if (canPieceDrop(this.state)) {
        const p = this.state.piece
        if (p) {
          p.row++
        }
        this.state.lockTimer = 0  // 落下成功でロックタイマーリセット
        if (this.state.softDropActive) {
          this.state.totalScore += 1
          world.addScore(1)
        }
      } else {
        // 地面に到達: ロックディレイ開始
        if (this.state.lockTimer === 0) {
          this.state.lockTimer = this.state.lockDelay
        }
      }
    }

    // ロックディレイ
    if (!canPieceDrop(this.state) && this.state.lockTimer > 0) {
      this.state.lockTimer -= dt
      if (this.state.lockTimer <= 0) {
        lockPiece(this.state, world)
        // H-fix: report combo/streak immediately after lock, BEFORE spawnPiece
        // so we can properly reset combo when streak breaks
        if (this.state.currentStreak > 0) {
          world.setCombo(this.state.currentStreak)
        } else {
          world.resetCombo()
        }
        if (this.state.piece === null && !this.state.gameOver) {
          spawnPiece(this.state)
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    // H6: guard with feature flag
    if (!this.state.initialized || !world.rules.features.has('tetris_mode')) return

    const W = world.canvas.width
    const H = world.canvas.height
    // Safety net for unexpected canvas resize (rare; normally set in onInit)
    this._calcBoardPosition(W, H)

    const { spawnX, spawnY, boardWidth, boardHeight } = this.state

    ctx.save()

    // ─── ボード背景 ───────────────────────────────────────────
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(spawnX - 4, spawnY - 4, boardWidth + 8, boardHeight + 8)

    // ─── グリッド線 ───────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    for (let c = 0; c <= COLS; c++) {
      const x = spawnX + c * CELL_SIZE
      ctx.beginPath()
      ctx.moveTo(x, spawnY)
      ctx.lineTo(x, spawnY + boardHeight)
      ctx.stroke()
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = spawnY + r * CELL_SIZE
      ctx.beginPath()
      ctx.moveTo(spawnX, y)
      ctx.lineTo(spawnX + boardWidth, y)
      ctx.stroke()
    }

    // ─── 固定ブロック ─────────────────────────────────────────
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = this.state.grid[r][c]
        if (color === null) continue
        this._drawBlock(ctx, spawnX + c * CELL_SIZE, spawnY + r * CELL_SIZE, color)
      }
    }

    // ─── 現在操作中のピース ───────────────────────────────────
    if (this.state.piece && !this.state.gameOver) {
      const blocks = getBlocks(this.state.piece)
      for (const [dc, dr] of blocks) {
        const c = this.state.piece.col + dc
        const r = this.state.piece.row + dr
        if (r < 0) continue
        this._drawBlock(ctx, spawnX + c * CELL_SIZE, spawnY + r * CELL_SIZE, this.state.piece.def.color)
      }

      // ゴースト（落下予測位置）
      const ghost = { ...this.state.piece }
      while (true) {
        const testGhost = { ...ghost, row: ghost.row + 1 }
        if (isValidPlacement(this.state.grid, testGhost)) {
          ghost.row++
        } else {
          break
        }
      }
      const ghostBlocks = getBlocks(ghost)
      // M3: use save/restore for globalAlpha to prevent corruption
      ctx.save()
      ctx.globalAlpha = 0.2
      for (const [dc, dr] of ghostBlocks) {
        const c = ghost.col + dc
        const r = ghost.row + dr
        if (r < 0) continue
        this._drawBlock(ctx, spawnX + c * CELL_SIZE, spawnY + r * CELL_SIZE, this.state.piece.def.color)
      }
      ctx.restore()
    }

    // ─── ボーダー ─────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2
    ctx.strokeRect(spawnX - 2, spawnY - 2, boardWidth + 4, boardHeight + 4)

    // ─── スコア表示 ───────────────────────────────────────────
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 14px "Courier New", monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`SCORE: ${this.state.totalScore}`, spawnX + boardWidth + 100, spawnY + 20)
    ctx.fillText(`LINES: ${this.state.linesCleared}`, spawnX + boardWidth + 100, spawnY + 40)

    // ─── ゲームオーバー表示 ───────────────────────────────────
    if (this.state.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.fillRect(spawnX, spawnY, boardWidth, boardHeight)

      ctx.fillStyle = '#ff4444'
      ctx.font = 'bold 28px "Courier New", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('GAME OVER', spawnX + boardWidth / 2, spawnY + boardHeight / 2 - 10)

      ctx.fillStyle = '#ffffff'
      ctx.font = '16px "Courier New", monospace'
      ctx.fillText(`Score: ${this.state.totalScore}`, spawnX + boardWidth / 2, spawnY + boardHeight / 2 + 20)
      ctx.fillText(`Lines: ${this.state.linesCleared}`, spawnX + boardWidth / 2, spawnY + boardHeight / 2 + 45)
      ctx.textAlign = 'left'
    }

    ctx.restore()
  }

  onPlayerHit(): void {
    // テトリスモードでは被弾処理は行わない
  }

  // ─── 内部メソッド ───────────────────────────────────────────
  private _calcBoardPosition(W: number, H: number): void {
    // M3: skip if canvas dimensions haven't changed
    if (W === this._lastCanvasW && H === this._lastCanvasH) return
    this._lastCanvasW = W
    this._lastCanvasH = H
    const boardW = COLS * CELL_SIZE
    const boardH = ROWS * CELL_SIZE
    this.state.spawnX = Math.floor((W - boardW) / 2)
    this.state.spawnY = Math.floor((H - boardH) / 2)
    this.state.boardWidth = boardW
    this.state.boardHeight = boardH
  }

  private _drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const inset = 1
    // メインブロック
    ctx.fillStyle = color
    ctx.fillRect(x + inset, y + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2)

    // ハイライト（上部・左部）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.fillRect(x + inset, y + inset, CELL_SIZE - inset * 2, 3)
    ctx.fillRect(x + inset, y + inset, 3, CELL_SIZE - inset * 2)

    // シャドウ（下部・右部）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.fillRect(x + inset, y + CELL_SIZE - inset - 3, CELL_SIZE - inset * 2, 3)
    ctx.fillRect(x + CELL_SIZE - inset - 3, y + inset, 3, CELL_SIZE - inset * 2)
  }
}

// テスト用に内部関数をエクスポート
export {
  TETROMINOS,
  COLS,
  ROWS,
  CELL_SIZE,
  LINE_SCORES,
  createEmptyGrid,
  initialState,
  spawnPiece,
  isValidPlacement,
  getBlocks,
  rotatePiece,
  movePiece,
  hardDrop,
  lockPiece,
  clearLines,
  canPieceDrop,
  getNextPieceId,
}

// 型エクスポート（テスト用）
export type { CellColor, ActivePiece, TetrisState, TetrominoDef, TetrominoId }
