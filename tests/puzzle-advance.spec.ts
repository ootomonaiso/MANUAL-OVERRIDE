/**
 * puzzle-advance.spec.ts
 * パズル（lights_out / スライドパズル）ジャンルで「正解すると次の問題へ進む」ことを実機で検証する。
 *
 * 矢印キーでプレイヤー駒を壁・境界にぶつかるまで滑らせ、ゴールマスに止めて解く。
 * solvedCount / puzzleCount が増えること（＝次の問題へ進むこと）を確認する回帰テスト。
 *
 * 盤面状態は開発ビルドの window.__puzzleState から読み取る（DEBUG 補助）。
 * 解法は「スライド1手＝壁/境界にぶつかるまで直進」を1ステップとした BFS で求める
 * （src/game/systems/PuzzleFeature.ts の盤面生成アルゴリズムと同じ規則）。
 */
import { test, expect } from '@playwright/test'

type Cell = [number, number]

interface PuzzleState {
  active: boolean
  gridN: number
  walls: boolean[][]
  playerCell: Cell
  goalCell: Cell
  puzzleCount: number
  solvedCount: number
}

const DIRS: { key: string; dr: number; dc: number }[] = [
  { key: 'ArrowUp', dr: -1, dc: 0 },
  { key: 'ArrowDown', dr: 1, dc: 0 },
  { key: 'ArrowLeft', dr: 0, dc: -1 },
  { key: 'ArrowRight', dr: 0, dc: 1 },
]

function slideDest(walls: boolean[][], n: number, from: Cell, dr: number, dc: number): Cell {
  let r = from[0]
  let c = from[1]
  for (;;) {
    const nr = r + dr
    const nc = c + dc
    if (nr < 0 || nr >= n || nc < 0 || nc >= n) break
    if (walls[nr][nc]) break
    r = nr
    c = nc
  }
  return [r, c]
}

/** スライド規則で start→goal への最短手順（押すべき矢印キー列）を BFS で求める */
function solveSlidePath(walls: boolean[][], n: number, start: Cell, goal: Cell): string[] {
  const key = (cell: Cell): number => cell[0] * n + cell[1]
  const visited = new Set<number>([key(start)])
  const prev = new Map<number, { from: Cell; dirKey: string }>()
  let frontier: Cell[] = [start]
  while (frontier.length > 0) {
    const next: Cell[] = []
    for (const cell of frontier) {
      for (const dir of DIRS) {
        const dest = slideDest(walls, n, cell, dir.dr, dir.dc)
        if (dest[0] === cell[0] && dest[1] === cell[1]) continue
        const k = key(dest)
        if (visited.has(k)) continue
        visited.add(k)
        prev.set(k, { from: cell, dirKey: dir.key })
        if (dest[0] === goal[0] && dest[1] === goal[1]) {
          const path: string[] = []
          let cur = k
          while (prev.has(cur)) {
            const step = prev.get(cur)!
            path.unshift(step.dirKey)
            cur = key(step.from)
          }
          return path
        }
        next.push(dest)
      }
    }
    frontier = next
  }
  return []
}

test('正解すると次の問題へ進む（solvedCount が増える）', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  // デバッグパネルで puzzle ジャンルを強制
  await page.selectOption('.debug-select', 'puzzle')
  await page.click('.debug-ok')

  // ジャンル確定の演出（reveal ~2800ms）が消えてからキー操作可能になる
  await page.waitForTimeout(3300)

  const read = (): Promise<PuzzleState | null> =>
    page.evaluate(() => {
      const s = (window as unknown as { __puzzleState?: PuzzleState }).__puzzleState
      if (!s) return null
      return {
        active: s.active,
        gridN: s.gridN,
        walls: s.walls.map(row => [...row]),
        playerCell: [...s.playerCell] as Cell,
        goalCell: [...s.goalCell] as Cell,
        puzzleCount: s.puzzleCount,
        solvedCount: s.solvedCount,
      }
    })

  const before = await read()
  expect(before, 'パズルが起動していること').not.toBeNull()
  expect(before!.active).toBe(true)
  expect(before!.solvedCount).toBe(0)

  const path = solveSlidePath(before!.walls, before!.gridN, before!.playerCell, before!.goalCell)
  expect(path.length, '解が存在すること').toBeGreaterThan(0)

  // 矢印キーで実際に滑らせてゴールまで導く。
  // keyboard.press() は keydown/keyup を即座に連続発火するため、ゲーム側の
  // 毎フレーム入力ポーリング（InputManager.tick）の前に押下が解除され justPressed
  // を取りこぼすことがある。down→待機→up で1フレーム以上キー押下状態を跨がせる。
  for (const key of path) {
    await page.keyboard.down(key)
    await page.waitForTimeout(50)
    await page.keyboard.up(key)
    await page.waitForTimeout(250)
  }

  await page.waitForTimeout(300)
  const after = await read()
  expect(after, 'パズル状態が読めること').not.toBeNull()
  // 正解 → 次の問題へ進んでいること
  expect(after!.solvedCount, '正解数が増えていること').toBe(1)
  expect(after!.puzzleCount, '出題カウントが進んでいること').toBeGreaterThan(before!.puzzleCount)
  expect(after!.active, 'パズルが継続していること').toBe(true)
})
