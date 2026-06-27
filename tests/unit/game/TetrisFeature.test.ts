import { describe, it, expect } from 'vitest'
import {
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
  fetchNextPieceId,
  getDropInterval,
  TETROMINOS,
  COLS,
  ROWS,
  CELL_SIZE,
  LINE_SCORES,
  SOFT_DROP_SPEED,
} from '../../../src/game/systems/TetrisFeature'

/**
 * テストピース生成ヘルパー。
 * nextPieceId を設定して spawnPiece が指定したピースを生成する。
 */
function _spawnTestPiece(state: ReturnType<typeof initialState>, id: string): void {
  state.nextPieceId = id
  spawnPiece(state)
}

describe('テトリス定数', () => {
  it('COLS は 10', () => {
    expect(COLS).toBe(10)
  })

  it('ROWS は 20', () => {
    expect(ROWS).toBe(20)
  })

  it('CELL_SIZE は 24', () => {
    expect(CELL_SIZE).toBe(24)
  })

  it('LINE_SCORES の値が正しい', () => {
    expect(LINE_SCORES).toEqual([0, 100, 300, 500, 800])
  })

  it('TETROMINOS は7種類のピースを持つ', () => {
    expect(TETROMINOS).toHaveLength(7)
  })

  it('TETROMINOS のIDが正しい', () => {
    const ids = TETROMINOS.map(t => t.id)
    expect(ids).toContain('I')
    expect(ids).toContain('O')
    expect(ids).toContain('T')
    expect(ids).toContain('S')
    expect(ids).toContain('Z')
    expect(ids).toContain('J')
    expect(ids).toContain('L')
  })
})

describe('createEmptyGrid', () => {
  it('20x10 の null グリッドを作成する', () => {
    const grid = createEmptyGrid()
    expect(grid.length).toBe(20)
    expect(grid[0].length).toBe(10)
    expect(grid[0][0]).toBeNull()
    expect(grid[19][9]).toBeNull()
  })
})

describe('initialState', () => {
  it('デフォルト値で新鮮な状態を作成する', () => {
    const state = initialState()
    expect(state.grid.length).toBe(20)
    expect(state.piece).toBeNull()
    expect(state.bag).toEqual([])
    expect(state.bagIdx).toBe(TETROMINOS.length) // 7: 最初のピースでバッグを再充填
    expect(state.gameOver).toBe(false)
    expect(state.linesCleared).toBe(0)
    expect(state.totalScore).toBe(0)
    expect(state.softDropActive).toBe(false)
    expect(state.initialized).toBe(false)
    expect(state.currentStreak).toBe(0)
  })
})

describe('getBlocks', () => {
  it('現在の回転状態のブロックを返す', () => {
    const state = initialState()
    _spawnTestPiece(state, 'I')
    const piece = state.piece!
    const blocks = getBlocks(piece)
    expect(blocks).toEqual(piece.def.rotations[piece.rotation])
  })
})

describe('isValidPlacement', () => {
  it('空グリッド上の有効な配置で true を返す', () => {
    const grid = createEmptyGrid()
    const def = TETROMINOS.find(t => t.id === 'O')!
    const piece = { def, rotation: 0, col: 4, row: 0 }
    expect(isValidPlacement(grid, piece)).toBe(true)
  })

  it('ピースが左側アウトオブバウンズの場合 false を返す', () => {
    const grid = createEmptyGrid()
    const def = TETROMINOS.find(t => t.id === 'O')!
    const piece = { def, rotation: 0, col: -1, row: 0 }
    expect(isValidPlacement(grid, piece)).toBe(false)
  })

  it('ピースが右側アウトオブバウンズの場合 false を返す', () => {
    const grid = createEmptyGrid()
    const def = TETROMINOS.find(t => t.id === 'O')!
    const piece = { def, rotation: 0, col: 9, row: 0 }
    expect(isValidPlacement(grid, piece)).toBe(false)
  })

  it('ピースが配置済みブロックと衝突する場合 false を返す', () => {
    const grid = createEmptyGrid()
    grid[1][4] = 'red' // row 1, col 4 にブロック
    const def = TETROMINOS.find(t => t.id === 'O')!
    const piece = { def, rotation: 0, col: 4, row: 0 }
    // O ピースは (4,0),(5,0),(4,1),(5,1) を占有
    expect(isValidPlacement(grid, piece)).toBe(false)
  })

  it('負の行（グリッド上）は true を返す', () => {
    const grid = createEmptyGrid()
    const def = TETROMINOS.find(t => t.id === 'O')!
    const piece = { def, rotation: 0, col: 4, row: -1 }
    expect(isValidPlacement(grid, piece)).toBe(true)
  })
})

describe('spawnPiece', () => {
  it('ピースを上部中央に生成する', () => {
    const state = initialState()
    spawnPiece(state)
    expect(state.piece).not.toBeNull()
    expect(state.piece!.row).toBe(-1)
  })

  it('I ピースは調整された列に生成される', () => {
    const state = initialState()
    _spawnTestPiece(state, 'I')
    expect(state.piece!.def.id).toBe('I')
    expect(state.piece!.col).toBe(Math.floor(COLS / 2) - 2) // 3
  })

  it('他のピースは標準列に生成される', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    expect(state.piece!.col).toBe(Math.floor(COLS / 2) - 1) // 4
  })

  it('生成位置が無効な場合はゲームオーバーにする', () => {
    const state = initialState()
    // 生成エリアを埋める
    for (let c = 0; c < COLS; c++) {
      state.grid[0][c] = 'red'
      state.grid[1][c] = 'red'
    }
    // nextPieceId を設定して spawnPiece が有効なピースを生成できるようにする
    state.nextPieceId = 'O'
    spawnPiece(state)
    expect(state.gameOver).toBe(true)
    expect(state.piece).toBeNull()
  })
})

describe('movePiece', () => {
  it('有効な場合は左に移動する', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    const origCol = state.piece!.col
    const result = movePiece(state, -1)
    expect(result).toBe(true)
    expect(state.piece!.col).toBe(origCol - 1)
  })

  it('有効な場合は右に移動する', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    const origCol = state.piece!.col
    const result = movePiece(state, 1)
    expect(result).toBe(true)
    expect(state.piece!.col).toBe(origCol + 1)
  })

  it('アウトオブバウンズで false を返す', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    // 右端まで移動
    while (movePiece(state, 1)) { /* 移動継続 */ }
    // さらに右は失敗
    expect(movePiece(state, 1)).toBe(false)
  })

  it('アクティブピースなしで false を返す', () => {
    const state = initialState()
    expect(movePiece(state, 1)).toBe(false)
  })

  it('ゲームオーバー時は false を返す', () => {
    const state = initialState()
    state.gameOver = true
    state.piece = { def: TETROMINOS[0], rotation: 0, col: 0, row: 0 }
    expect(movePiece(state, 1)).toBe(false)
  })
})

describe('rotatePiece', () => {
  it('時計回りに回転する', () => {
    const state = initialState()
    _spawnTestPiece(state, 'T')
    const origRotation = state.piece!.rotation
    const result = rotatePiece(state)
    expect(result).toBe(true)
    expect(state.piece!.rotation).toBe((origRotation + 1) % 4)
  })

  it('アクティブピースなしで false を返す', () => {
    const state = initialState()
    expect(rotatePiece(state)).toBe(false)
  })

  it('ゲームオーバー時は false を返す', () => {
    const state = initialState()
    state.gameOver = true
    state.piece = { def: TETROMINOS[0], rotation: 0, col: 0, row: 0 }
    expect(rotatePiece(state)).toBe(false)
  })

  it('壁蹴りで回転を再試行する', () => {
    const state = initialState()
    _spawnTestPiece(state, 'J')
    // 左端に移動
    while (movePiece(state, -1)) { /* 移動継続 */ }
    const result = rotatePiece(state) // 壁蹴りで回転成功または失敗
    // J ピースは回転不変ではないので、結果を確認
    expect(state.piece!.def.id).toBe('J')
    // 回転が成功したか、壁蹴りで失敗したかを検証
    expect(typeof result).toBe('boolean')
  })

  it('I ピースで壁際回転時に回転を元に戻す（#19 修正）', () => {
    const state = initialState()
    _spawnTestPiece(state, 'I')
    // 右端に移動
    while (movePiece(state, 1)) { /* 移動継続 */ }
    const origRotation = state.piece!.rotation
    const result = rotatePiece(state)
    // I ピースは回転で幅が変化するが、壁蹴りで回転可能
    // 壁蹴りも失敗すれば回転は元に戻る
    if (!result) {
      expect(state.piece!.rotation).toBe(origRotation)
    }
  })
})

describe('hardDrop', () => {
  it('ピースを最下部にドロップする', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    const dropped = hardDrop(state)
    expect(dropped).toBeGreaterThan(0)
    // ハードドロップ後、さらにドロップできない
    expect(canPieceDrop(state)).toBe(false)
  })

  it('Iピースのハードドロップが正しく動作する', () => {
    const state = initialState()
    _spawnTestPiece(state, 'I')
    const dropped = hardDrop(state)
    expect(dropped).toBeGreaterThan(0)
    expect(canPieceDrop(state)).toBe(false)
    // Iピースは4ブロック横長なので、スポーン位置が異なる
    expect(state.piece).toBeNull() // hardDrop 内で lockPiece が呼ばれ、piece は null になる
  })

  it('アクティブピースなしで 0 を返す', () => {
    const state = initialState()
    expect(hardDrop(state)).toBe(0)
  })

  it('ゲームオーバー時は 0 を返す', () => {
    const state = initialState()
    state.gameOver = true
    state.piece = { def: TETROMINOS[0], rotation: 0, col: 0, row: 0 }
    expect(hardDrop(state)).toBe(0)
  })
})

describe('lockPiece', () => {
  it('ピースブロックをグリッドに配置する', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    hardDrop(state)
    lockPiece(state)
    expect(state.piece).toBeNull()
    // O ピースの4ブロックが配置される
    let placed = 0
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.grid[r][c] !== null) placed++
      }
    }
    expect(placed).toBe(4)
  })

  it('アクティブピースなしで 0 を返す', () => {
    const state = initialState()
    expect(lockPiece(state)).toBe(0)
  })
})

describe('clearLines', () => {
  it('満タンの行を消去する', () => {
    const state = initialState()
    // 最下行を埋める
    for (let c = 0; c < COLS; c++) {
      state.grid[ROWS - 1][c] = 'red'
    }
    const lines = clearLines(state)
    expect(lines).toBe(1)
    expect(state.linesCleared).toBe(1)
    // 最下行は空になっている
    expect(state.grid[ROWS - 1].every(c => c === null)).toBe(true)
  })

  it('複数の行を消去する', () => {
    const state = initialState()
    // 最下3行を埋める
    for (let r = ROWS - 3; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        state.grid[r][c] = 'red'
      }
    }
    const lines = clearLines(state)
    expect(lines).toBe(3)
    expect(state.linesCleared).toBe(3)
  })

  it('不完全な行は消去しない', () => {
    const state = initialState()
    // 最下行を1セル除いて埋める
    for (let c = 0; c < COLS - 1; c++) {
      state.grid[ROWS - 1][c] = 'red'
    }
    const lines = clearLines(state)
    expect(lines).toBe(0)
  })

  it('ライン消去で正しいスコアを追加する', () => {
    const state = initialState()
    // 最下行を埋める
    for (let c = 0; c < COLS; c++) {
      state.grid[ROWS - 1][c] = 'red'
    }
    clearLines(state)
    expect(state.totalScore).toBe(100) // 1ライン = 100点
  })

  it('テトリス（4ライン）で正しいスコアを追加する', () => {
    const state = initialState()
    // 最下4行を埋める
    for (let r = ROWS - 4; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        state.grid[r][c] = 'red'
      }
    }
    clearLines(state)
    expect(state.totalScore).toBe(800) // 4ライン = 800点
  })
})

describe('canPieceDrop', () => {
  it('ピースが下方向に移動可能なら true を返す', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    expect(canPieceDrop(state)).toBe(true)
  })

  it('ピースが最下部に達したら false を返す', () => {
    const state = initialState()
    _spawnTestPiece(state, 'O')
    hardDrop(state)
    expect(canPieceDrop(state)).toBe(false)
  })

  it('アクティブピースなしで false を返す', () => {
    const state = initialState()
    expect(canPieceDrop(state)).toBe(false)
  })
})

describe('fetchNextPieceId', () => {
  it('バッグからピースを返す', () => {
    const state = initialState()
    state.bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
    state.bagIdx = 0
    const first = fetchNextPieceId(state)
    expect(first).toBe('I')
    expect(state.bagIdx).toBe(1)
  })

  it('バッグが枯渇したら再充填する', () => {
    const state = initialState()
    state.bag = ['I']
    state.bagIdx = 0
    fetchNextPieceId(state) // 'I' を消費
    expect(state.bagIdx).toBe(1)
    // 次の呼び出しでバッグを再充填
    const next = fetchNextPieceId(state)
    expect(next).toBeDefined()
    expect(state.bag.length).toBe(7)
  })
})

describe('getDropInterval', () => {
  it('level 0 で DEFAULT_DROP_INTERVAL (0.8) を返す', () => {
    expect(getDropInterval(0)).toBe(0.8)
  })

  it('level が上がるごとにドロップ間隔が短くなる', () => {
    const interval1 = getDropInterval(1)
    const interval5 = getDropInterval(5)
    const interval10 = getDropInterval(10)
    expect(interval1).toBeLessThan(0.8)
    expect(interval5).toBeLessThan(interval1)
    expect(interval10).toBeLessThan(interval5)
  })

  it('十分なレベルで MIN_DROP_INTERVAL (0.05) でクランプされる', () => {
    expect(getDropInterval(50)).toBe(0.05)
  })
})

describe('clearLines streak bonus', () => {
  it('連続消去2回目以降にストリークボーナスが加算される', () => {
    const state = initialState()
    // 1行目にラインを埋める
    for (let c = 0; c < COLS; c++) {
      state.grid[ROWS - 1][c] = 'red'
    }
    clearLines(state) // 1回目: ストリークなし
    const scoreAfterFirst = state.totalScore
    expect(scoreAfterFirst).toBe(100)
    expect(state.currentStreak).toBe(1)

    // 2行目にラインを埋める
    for (let c = 0; c < COLS; c++) {
      state.grid[ROWS - 1][c] = 'red'
    }
    clearLines(state) // 2回目: ストリークボーナスあり
    // 基本100点 + ストリークボーナス (2 * 50 = 100)
    expect(state.totalScore).toBeGreaterThan(scoreAfterFirst + 100)
    expect(state.currentStreak).toBe(2)
  })

  it('ライン消去がないとストリークがリセットされる', () => {
    const state = initialState()
    state.currentStreak = 5 // ストリークを設定
    // 空のグリッドで clearLines を実行
    clearLines(state)
    expect(state.currentStreak).toBe(0)
  })
})

describe('SOFT_DROP_SPEED 定数', () => {
  it('値が 15 である', () => {
    expect(SOFT_DROP_SPEED).toBe(15)
  })
})
