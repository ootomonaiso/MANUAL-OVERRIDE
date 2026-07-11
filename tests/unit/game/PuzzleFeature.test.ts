import { describe, it, expect } from 'vitest'
import { PUZZLE } from '../../../src/data/tunables'
import { puzzleTestInternals } from '../../../src/game/systems/PuzzleFeature'

const { generateBoard, bfsMinMoves, fallbackBoard } = puzzleTestInternals

// スライドパズルの回帰テスト。第30問「ゴールへ滑り込め」で、氷すべりルールでは
// 到達不能（詰み）の盤面が実際に配信されていた事例を受けての防止線。
describe('PuzzleFeature 盤面生成は常に解ける', () => {
  it('全グリッド設定で、生成盤面はスライドで必ずゴール到達可能（Infinity を返さない）', () => {
    for (const cfg of PUZZLE.grids) {
      for (let i = 0; i < 300; i++) {
        const b = generateBoard(cfg)
        const moves = bfsMinMoves(b.walls, cfg.n, b.start, b.goal)
        expect(moves, `n=${cfg.n} で詰み盤面が生成された`).not.toBe(Infinity)
      }
    }
  })

  it('フォールバック盤面はどのサイズでも解ける', () => {
    for (const cfg of PUZZLE.grids) {
      const b = fallbackBoard(cfg.n)
      expect(bfsMinMoves(b.walls, cfg.n, b.start, b.goal)).not.toBe(Infinity)
    }
  })

  it('bfsMinMoves は詰み盤面を Infinity と判定する（実際に報告された第30問の盤面）', () => {
    const n = 8
    const walls = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
    // 壁座標 [row, col]。プレイヤーは左下 (7,0)、ゴールは右辺 (5,7)。
    const wallCells: [number, number][] = [
      [0, 1], [0, 5], [1, 2], [2, 7], [3, 5], [4, 2], [5, 0], [5, 3], [6, 5], [6, 7], [7, 6],
    ]
    for (const [r, c] of wallCells) walls[r][c] = true
    expect(bfsMinMoves(walls, n, [7, 0], [5, 7])).toBe(Infinity)
  })
})
