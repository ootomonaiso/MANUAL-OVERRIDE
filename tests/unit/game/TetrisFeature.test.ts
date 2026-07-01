import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initialState, createEmptyGrid, spawnPiece, isValidPlacement,
  canPieceDrop, movePiece, rotatePiece, hardDrop, lockPiece, clearLines,
  getBlocks, TETROMINOS, COLS, ROWS, CELL_SIZE, LINE_SCORES
} from '../../../src/game/systems/TetrisFeature'
import type { MutableWorld } from '../../../src/engine/types'

describe('TetrisFeature internal logic', () => {
  let state: ReturnType<typeof initialState>

  beforeEach(() => {
    state = initialState()
  })

  describe('createEmptyGrid', () => {
    it('creates 10x20 grid with null cells', () => {
      const grid = createEmptyGrid()
      expect(grid.length).toBe(ROWS)
      expect(grid[0].length).toBe(COLS)
      expect(grid[0][0]).toBeNull()
    })
  })

  describe('initialState', () => {
    it('initializes with correct defaults', () => {
      expect(state.grid.length).toBe(ROWS)
      expect(state.piece).toBeNull()
      expect(state.bag.length).toBe(0)
      expect(state.bagIdx).toBe(7)
      expect(state.dropTimer).toBe(0)
      expect(state.gameOver).toBe(false)
      expect(state.linesCleared).toBe(0)
      expect(state.totalScore).toBe(0)
      expect(state.initialized).toBe(false)
    })
  })

  describe('TETROMINOS', () => {
    it('has 7 tetromino types', () => {
      expect(TETROMINOS.length).toBe(7)
      const ids = TETROMINOS.map(t => t.id)
      expect(ids).toContain('I')
      expect(ids).toContain('O')
      expect(ids).toContain('T')
      expect(ids).toContain('S')
      expect(ids).toContain('Z')
      expect(ids).toContain('J')
      expect(ids).toContain('L')
    })

    it('each tetromino has 4 rotation states', () => {
      for (const def of TETROMINOS) {
        expect(def.rotations.length).toBe(4)
      }
    })

    it('each rotation state has 4 cells', () => {
      for (const def of TETROMINOS) {
        for (const rotation of def.rotations) {
          expect(rotation.length).toBe(4)
        }
      }
    })
  })

  describe('isValidPlacement', () => {
    it('returns true for valid spawn position', () => {
      spawnPiece(state)
      expect(state.piece).not.toBeNull()
      expect(isValidPlacement(state.grid, state.piece!)).toBe(true)
    })

    it('returns false when piece goes out of bounds (right)', () => {
      spawnPiece(state)
      const piece = state.piece!
      const testPiece = { ...piece, col: COLS }
      expect(isValidPlacement(state.grid, testPiece)).toBe(false)
    })

    it('returns false when piece goes out of bounds (left)', () => {
      spawnPiece(state)
      const piece = state.piece!
      const testPiece = { ...piece, col: -2 }
      expect(isValidPlacement(state.grid, testPiece)).toBe(false)
    })

    it('returns false when piece collides with locked block', () => {
      // Use I piece which has all 4 blocks at same row (dr=1)
      state.bag = ['I', 'I', 'I']
      state.bagIdx = 0

      // First piece: spawn and hard drop to bottom row
      spawnPiece(state)
      state.piece!.row = ROWS - 2  // Place piece so blocks are at rows ROWS-2+1=ROWS-1
      lockPiece(state)
      // Now there should be 4 blocks at row ROWS-1
      expect(state.grid[ROWS - 1][3]).not.toBeNull()
      expect(state.grid[ROWS - 1][4]).not.toBeNull()
      expect(state.grid[ROWS - 1][5]).not.toBeNull()
      expect(state.grid[ROWS - 1][6]).not.toBeNull()

      // Second piece: spawn I piece at row ROWS-4 so blocks lock at ROWS-3
      spawnPiece(state)
      state.piece!.row = ROWS - 4
      lockPiece(state)
      // Now there should be 4 blocks at row ROWS-3
      expect(state.grid[ROWS - 3][3]).not.toBeNull()
      expect(state.grid[ROWS - 3][4]).not.toBeNull()
      expect(state.grid[ROWS - 3][5]).not.toBeNull()
      expect(state.grid[ROWS - 3][6]).not.toBeNull()

      // Third piece: spawn - should be at row=-1
      spawnPiece(state)
      expect(state.piece).not.toBeNull()

      // Test if the piece placed at row 1 collides with the locked piece at row ROWS-3
      // This tests that locked blocks prevent placement
      expect(state.grid[ROWS - 3][4]).not.toBeNull()
      // A test piece at row 0 with I rotation 0 would have blocks at row 1
      if (state.piece) {
        const testPiece = { ...state.piece!, row: 0 }
        expect(isValidPlacement(state.grid, testPiece)).toBe(true) // row 1 is not row ROWS-3
      }

      // But a piece with blocks in row ROWS-3 should be invalid
      const collisionTest = {
        def: TETROMINOS[0], // I piece
        rotation: 0,
        col: 3,
        row: ROWS - 4,  // blocks at row ROWS-4+1=ROWS-3 collides with locked piece
      }
      expect(isValidPlacement(state.grid, collisionTest)).toBe(false)
    })
  })

  describe('spawnPiece', () => {
    it('spawns a piece when no piece exists', () => {
      expect(state.piece).toBeNull()
      spawnPiece(state)
      expect(state.piece).not.toBeNull()
    })

    it('spawns I piece at adjusted column position', () => {
      // Force I piece
      state.bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
      state.bagIdx = 0
      spawnPiece(state)
      expect(state.piece).not.toBeNull()
      // I piece spawns at col = 5 - 2 = 3
      expect(state.piece!.col).toBe(Math.floor(COLS / 2) - 2)
    })

    it('sets gameOver when spawn position is invalid', () => {
      // Fill grid to top
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          state.grid[r][c] = 'gray'
        }
      }
      spawnPiece(state)
      expect(state.gameOver).toBe(true)
      expect(state.piece).toBeNull()
    })
  })

  describe('movePiece', () => {
    beforeEach(() => {
      spawnPiece(state)
    })

    it('moves left successfully', () => {
      const oldCol = state.piece!.col
      const result = movePiece(state, -1)
      expect(result).toBe(true)
      expect(state.piece!.col).toBe(oldCol - 1)
    })

    it('moves right successfully', () => {
      const oldCol = state.piece!.col
      const result = movePiece(state, 1)
      expect(result).toBe(true)
      expect(state.piece!.col).toBe(oldCol + 1)
    })

    it('blocks left move at wall', () => {
      state.piece!.col = 0
      const result = movePiece(state, -1)
      expect(result).toBe(false)
      expect(state.piece!.col).toBe(0)
    })

    it('blocks right move at wall', () => {
      state.piece!.col = COLS - 1
      const result = movePiece(state, 1)
      expect(result).toBe(false)
      expect(state.piece!.col).toBe(COLS - 1)
    })

    it('returns false when no active piece', () => {
      state.piece = null
      expect(movePiece(state, 1)).toBe(false)
    })

    it('returns false when game over', () => {
      spawnPiece(state)
      state.gameOver = true
      expect(movePiece(state, 1)).toBe(false)
    })
  })

  describe('rotatePiece', () => {
    beforeEach(() => {
      spawnPiece(state)
    })

    it('rotates piece clockwise', () => {
      const oldRotation = state.piece!.rotation
      const result = rotatePiece(state)
      expect(result).toBe(true)
      expect(state.piece!.rotation).toBe((oldRotation + 1) % 4)
    })

    it('rotates piece multiple times (4 rotations = original)', () => {
      const originalBlocks = getBlocks(state.piece!)
      rotatePiece(state)
      rotatePiece(state)
      rotatePiece(state)
      rotatePiece(state)
      const finalBlocks = getBlocks(state.piece!)
      expect(finalBlocks).toEqual(originalBlocks)
    })

    it('attempts wall kick when rotation would be invalid', () => {
      // Move piece to wall
      state.piece!.col = COLS - 1
      // Rotation is attempted, wall kick should try to resolve
      rotatePiece(state)
      // Piece should not be out of bounds after wall kick
      const blocks = getBlocks(state.piece!)
      for (const [dc, dr] of blocks) {
        const c = state.piece!.col + dc
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThan(COLS)
      }
    })

    it('returns false when no active piece', () => {
      state.piece = null
      expect(rotatePiece(state)).toBe(false)
    })
  })

  describe('hardDrop', () => {
    beforeEach(() => {
      spawnPiece(state)
    })

    it('drops piece to bottom', () => {
      const oldRow = state.piece!.row
      const dropped = hardDrop(state)
      expect(dropped).toBeGreaterThan(0)
      expect(state.piece!.row).toBe(oldRow + dropped)
      // After hard drop, piece should not be able to drop further
      expect(canPieceDrop(state)).toBe(false)
    })

    it('sets small lockTimer after drop', () => {
      hardDrop(state)
      expect(state.lockTimer).toBe(0.1)
    })

    it('returns 0 when no piece to drop', () => {
      state.piece = null
      expect(hardDrop(state)).toBe(0)
    })
  })

  describe('lockPiece', () => {
    beforeEach(() => {
      spawnPiece(state)
      // Drop piece to bottom
      hardDrop(state)
    })

    it('locks piece to grid', () => {
      expect(state.piece).not.toBeNull()
      lockPiece(state)
      expect(state.piece).toBeNull()
      // Check that blocks are now in grid
      let lockedBlocks = 0
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (state.grid[r][c] !== null) lockedBlocks++
        }
      }
      expect(lockedBlocks).toBe(4)
    })

    it('returns 0 when no piece to lock', () => {
      state.piece = null
      expect(lockPiece(state)).toBe(0)
    })
  })

  describe('clearLines', () => {
    it('clears a complete line', () => {
      // Fill a row completely at the bottom
      for (let c = 0; c < COLS; c++) {
        state.grid[ROWS - 1][c] = 'red'
      }

      const initialGridHeight = state.grid.length
      const lines = clearLines(state)
      expect(lines).toBe(1)
      expect(state.grid.length).toBe(initialGridHeight)
      expect(state.grid[ROWS - 1][0]).toBeNull() // New empty row at top
      expect(state.linesCleared).toBe(1)
      expect(state.totalScore).toBe(LINE_SCORES[1])
    })

    it('clears multiple lines', () => {
      // Fill last 3 rows
      for (let r = ROWS - 3; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          state.grid[r][c] = 'blue'
        }
      }

      const lines = clearLines(state)
      expect(lines).toBe(3)
      expect(state.linesCleared).toBe(3)
      expect(state.totalScore).toBe(LINE_SCORES[3])
    })

    it('does nothing when no complete lines', () => {
      state.grid[ROWS - 1][0] = 'red' // Only one cell
      expect(clearLines(state)).toBe(0)
    })
  })

  describe('canPieceDrop', () => {
    it('returns false when no piece', () => {
      expect(canPieceDrop(state)).toBe(false)
    })

    it('returns true for fresh piece (can drop)', () => {
      spawnPiece(state)
      expect(canPieceDrop(state)).toBe(true)
    })

    it('returns false when piece is at bottom', () => {
      spawnPiece(state)
      hardDrop(state)
      expect(canPieceDrop(state)).toBe(false)
    })

    it('returns false when blocked by locked piece', () => {
      spawnPiece(state)
      lockPiece(state)
      spawnPiece(state)
      // Lock again to create piece below
      lockPiece(state)
      spawnPiece(state)
      // New piece should be blocked by first locked piece at row 0
      if (state.piece) {
        // The new piece at row=-1 should not be able to drop if row 0 is filled
        // But row=-1 with rotation blocks that have dr=1 means r=0
        // which would collide with the locked piece
        expect(canPieceDrop(state)).toBe(false)
      }
    })
  })

  describe('LINE_SCORES', () => {
    it('has correct values [0, 100, 300, 500, 800]', () => {
      expect(LINE_SCORES).toEqual([0, 100, 300, 500, 800])
    })
  })

  describe('getBlocks', () => {
    it('returns blocks for current rotation', () => {
      spawnPiece(state)
      const blocks0 = getBlocks(state.piece!)
      rotatePiece(state)
      const blocks1 = getBlocks(state.piece!)
      // After rotation, blocks should be different (except for O piece)
      if (state.piece!.def.id !== 'O') {
        expect(blocks0).not.toEqual(blocks1)
      } else {
        expect(blocks0).toEqual(blocks1) // O piece is rotation-invariant
      }
    })
  })
})
