/**
 * game/systems/PuzzleFeature.ts
 * スライド移動パズルをジャンル確定後に出題する。
 *
 * lights_out: ジャンル確定時にスクロールを停止し、スライドパズルを Canvas オーバーレイで表示。
 *             上下左右キーで壁/障害物/境界にぶつかるまで一直線に滑る。
 *             プレイヤー駒がゴールマスに止まったら正解 → コンボ+1 + クリア演出 → 即次の問題
 *             時間切れ → HP-1 + ダメージ演出 → 即次の問題 (HP=0 でゲームオーバー)
 *             スペースキーで現在の問題を初期配置に戻せる（残機を減らさず回数無制限の救済措置）。
 *
 * 描画は puzzle テーマの白系「方眼紙」背景に統一する。全画面を白背景＋薄いグリッド罫線で
 * 敷き直すことで、横スクロール本体（base プレイヤー・地面）を覆い隠しつつ装飾盤面を重ねる。
 *
 * パズル中は横スクロール本体の操作（左右移動・ジャンプ）を無効化する。
 * - preUpdate / update でプレイヤー速度を 0 に固定し、ハザードを除去する
 * - ジャンプ抑止は SideScroller 側で lights_out を判定して行う
 *
 * 盤面生成は方式C（目標手数つき生成）: ランダムに壁を配置し、BFS で「スライド1手 =
 * ある方向に壁/境界へぶつかるまで直進」を1ステップとした最短手数を求め、サイズ別の
 * 目標手数範囲に収まる盤面のみ採用する。範囲外は破棄して再試行し、上限到達時は
 * 目標範囲に最も近い盤面へフォールバックする（無限ループ防止）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { PuzzleGridConfig } from '../../framework/config-types'
import { PUZZLE, PIXELART } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'
import { PixelCanvas } from '../render'

// 角落とし矩形の切り欠き量（セル数）。ドット絵の角丸表現として全パネル/セルで共通使用
const CUT_CELLS = 1

// ─── 型・定数 ─────────────────────────────────────────────────────────────────

type Cell = [number, number]

// スライド方向（行差, 列差）: 上・下・左・右
const DIRS: readonly Cell[] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
]

interface GeneratedBoard {
  walls: boolean[][]
  start: Cell
  goal: Cell
}

interface SlidePuzzleState {
  active: boolean
  gridN: number
  walls: boolean[][]
  playerCell: Cell
  startCell: Cell
  goalCell: Cell
  timer: number
  timeLimit: number
  baseScrollSpeed: number
  puzzleCount: number
  solvedCount: number
  // スライドアニメーション（移動中のみ非 null）
  animFrom: Cell | null
  animTo: Cell | null
  animProgress: number
  animDuration: number
  // 演出タイマー（秒）。0 より大きい間だけ該当エフェクトを描画する。
  solveFx: number
  damageFx: number
  animTime: number
}

// ─── モジュールレベル純粋関数 ────────────────────────────────────────────────

function _selectGridConfig(puzzleCount: number): PuzzleGridConfig {
  const configs = PUZZLE.grids
  const t = Math.min(1, puzzleCount / PUZZLE.weightMaxDist)
  const weights = configs.map(g => g.weightStart + (g.weightEnd - g.weightStart) * t)
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < configs.length; i++) {
    r -= weights[i]
    if (r <= 0) return configs[i]
  }
  return configs[configs.length - 1]
}

// 指定方向に壁/障害物/境界へぶつかるまで直進した到達セルを返す（スライド1手）。
function _slideDest(walls: boolean[][], n: number, from: Cell, dr: number, dc: number): Cell {
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

// スライド規則での start→goal の最短手数を BFS で求める。到達不能なら Infinity。
function _bfsMinMoves(walls: boolean[][], n: number, start: Cell, goal: Cell): number {
  if (start[0] === goal[0] && start[1] === goal[1]) return 0
  const visited = new Set<number>()
  const key = (r: number, c: number): number => r * n + c
  visited.add(key(start[0], start[1]))
  let frontier: Cell[] = [start]
  let moves = 0
  while (frontier.length > 0) {
    moves++
    const next: Cell[] = []
    for (const cell of frontier) {
      for (const [dr, dc] of DIRS) {
        const dest = _slideDest(walls, n, cell, dr, dc)
        if (dest[0] === cell[0] && dest[1] === cell[1]) continue
        if (dest[0] === goal[0] && dest[1] === goal[1]) return moves
        const k = key(dest[0], dest[1])
        if (!visited.has(k)) {
          visited.add(k)
          next.push(dest)
        }
      }
    }
    frontier = next
  }
  return Infinity
}

function _randomWalls(n: number, wallRatio: number): boolean[][] {
  return Array.from({ length: n }, () =>
    Array.from({ length: n }, () => Math.random() < wallRatio),
  )
}

// 方式C: 目標手数範囲に収まる盤面を生成。上限到達時は最も範囲に近い盤面を返す。
function _generateBoard(cfg: PuzzleGridConfig): GeneratedBoard {
  const n = cfg.n
  let best: GeneratedBoard | null = null
  let bestDeviation = Infinity
  // best が解ける盤面かどうか。全試行が解なしだった場合に詰み盤面を返さないための番兵。
  let bestSolvable = false
  for (let attempt = 0; attempt < PUZZLE.maxGenAttempts; attempt++) {
    const walls = _randomWalls(n, PUZZLE.wallRatio)
    const free: Cell[] = []
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!walls[r][c]) free.push([r, c])
      }
    }
    if (free.length < 2) continue

    const start = free[Math.floor(Math.random() * free.length)]
    let goal = start
    while (goal === start) goal = free[Math.floor(Math.random() * free.length)]

    const moves = _bfsMinMoves(walls, n, start, goal)
    if (moves >= cfg.minMoves && moves <= cfg.maxMoves) {
      return { walls, start, goal }
    }
    // 解なし(Infinity)は最大の乖離として扱い、解ありの盤面を優先する。
    const deviation = moves === Infinity
      ? n * n
      : moves < cfg.minMoves ? cfg.minMoves - moves : moves - cfg.maxMoves
    if (deviation < bestDeviation) {
      bestDeviation = deviation
      best = { walls, start, goal }
      bestSolvable = moves !== Infinity
    }
  }
  // best が解ける盤面のときのみ採用する。全試行が解なし（best が詰み盤面）だった場合は
  // 保証済みフォールバックへ差し替え、プレイヤーへ詰み盤面を絶対に渡さない。
  return best !== null && bestSolvable ? best : _fallbackBoard(n)
}

// 生成が全滅した場合の安全網（実用上ほぼ到達しない）。
function _fallbackBoard(n: number): GeneratedBoard {
  const walls = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  return { walls, start: [0, 0], goal: [0, n - 1] }
}

// 制限時間スケール。第1問(puzzleCount=0)で 1.0、timeHalfLifeSteps 問ごとに半減し、
// timeScaleMin で下げ止まる非線形（指数）グラデーション。
// 既定: 第1問=100%, 第50問(pc=49)=50%, 第99問(pc=98)=25% 到達 → 以降は据え置き。
function _timeScale(puzzleCount: number): number {
  const decayed = Math.pow(0.5, puzzleCount / PUZZLE.timeHalfLifeSteps)
  return Math.max(PUZZLE.timeScaleMin, decayed)
}

function _gridOffset(canvasW: number, canvasH: number, n: number, cellPx: number): [number, number] {
  return [Math.floor((canvasW - n * cellPx) / 2), Math.floor((canvasH - n * cellPx) / 2)]
}

function _easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

// 盤面生成まわりの純粋関数をユニットテストから検証するための公開口。実行コードからは使用しない。
export const puzzleTestInternals = {
  generateBoard: _generateBoard,
  bfsMinMoves: _bfsMinMoves,
  fallbackBoard: _fallbackBoard,
}

// ─── FeatureSystem 実装 ───────────────────────────────────────────────────────

export class PuzzleFeature implements FeatureSystem {
  readonly handles = ['lights_out'] as const

  // 視覚・演出定数（ハードコーディング禁止のため readonly フィールドへ集約）
  private readonly _solvedShakeIntensity = 6
  private readonly _timeUpShakeIntensity = 14
  private readonly _cellGap = 4
  private readonly _cellRadius = 8
  private readonly _timerBarH = 12
  private readonly _timerBarAboveGrid = 30
  private readonly _headerAboveGrid = 96
  private readonly _subHeaderAboveGrid = 66
  private readonly _heartsBelowGrid = 32
  private readonly _hintBelowGrid = 64
  private readonly _popupOffsetY = 70
  // 盤面外（方眼紙背景・装飾パネル）
  private readonly _paperColor = '#f0f0f0'
  private readonly _paperGridSize = 40
  private readonly _paperGridAlpha = 0.1
  private readonly _paperGridColor = '#5a5a78'
  private readonly _panelPadding = 26
  private readonly _panelRadius = 18
  // パズル配色（白系テーマ）
  private readonly _cellEmptyColor = '#ffffff'
  private readonly _cellEmptyBorder = '#c4c4d6'
  private readonly _wallColor = '#3b3b5c'
  private readonly _wallTopColor = '#56567f'
  private readonly _goalColor = '#1ea96b'
  private readonly _pieceColor = '#ff8a3d'
  private readonly _pieceColorDark = '#d4631a'
  private readonly _pieceOutline = '#7a3200'
  private readonly _inkColor = '#2a2a3a'
  private readonly _inkSubColor = '#6a6a82'
  // スライドアニメーション速度
  private readonly _slidePerCellSec = 0.035
  private readonly _slideMinSec = 0.1
  // 演出時間
  private readonly _solveFxDuration = 0.5
  private readonly _damageFxDuration = 0.5
  // パーティクル
  private readonly _solveParticleCount = 26
  private readonly _solveParticleSpeed = 240
  private readonly _solveParticleLife = 0.8
  private readonly _solveParticleSize = 6
  private readonly _damageParticleCount = 18
  private readonly _damageParticleSpeed = 200
  private readonly _damageParticleLife = 0.6
  private readonly _damageParticleSize = 5

  private _state: SlidePuzzleState = this._initialState()

  private _initialState(): SlidePuzzleState {
    return {
      active: false,
      gridN: 4,
      walls: [],
      playerCell: [0, 0],
      startCell: [0, 0],
      goalCell: [0, 0],
      timer: 0,
      timeLimit: 0,
      baseScrollSpeed: 0,
      puzzleCount: 0,
      solvedCount: 0,
      animFrom: null,
      animTo: null,
      animProgress: 0,
      animDuration: 0,
      solveFx: 0,
      damageFx: 0,
      animTime: 0,
    }
  }

  onInit(world: MutableWorld): void {
    this._state = this._initialState()
    this._state.baseScrollSpeed = world.rules.scrollSpeed
    world.rules.scrollSpeed = 0
    this._state.active = true
    // 入力キー名はジャンル確定後に変化しないため初期化時にキャッシュする。
    const c = world.rules.controls
    this._controls = {
      up: c.moveUp ?? 'ArrowUp',
      down: c.moveDown ?? 'ArrowDown',
      left: c.moveLeft,
      right: c.moveRight,
      reset: c.jump,
    }
    this._startPuzzle()
  }

  onDisable(world: MutableWorld): void {
    world.rules.scrollSpeed = this._state.baseScrollSpeed
    this._state.active = false
  }

  // 物理計算前にプレイヤーを静止させ、横スクロールの慣性を打ち消す。
  preUpdate(world: MutableWorld, _input: InputSnapshot, _dt: number): void {
    if (!world.rules.features.has('lights_out') || !this._state.active) return
    world.player.vx = 0
    world.player.vy = 0
  }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('lights_out') || !this._state.active) return

    // デバッグ補助: 開発ビルドでのみパズル状態を window へ公開する（テスト・動作確認用）。
    // 本番ビルドでは import.meta.env.DEV が false になりこの行は除去される。
    if (import.meta.env.DEV) (window as unknown as { __puzzleState?: SlidePuzzleState }).__puzzleState = this._state

    // パズル中は横スクロール本体のエンティティを抑止する
    world.player.vx = 0
    world.player.vy = 0
    if (world.hazards.length > 0) world.hazards.length = 0

    this._state.animTime += dt
    if (this._state.solveFx > 0) this._state.solveFx = Math.max(0, this._state.solveFx - dt)
    if (this._state.damageFx > 0) this._state.damageFx = Math.max(0, this._state.damageFx - dt)

    // スライド中はアニメーションを進め、完了時にゴール到達を判定する。
    if (this._state.animTo !== null) {
      this._state.animProgress += dt / this._state.animDuration
      if (this._state.animProgress >= 1) {
        this._state.playerCell = this._state.animTo
        this._state.animFrom = null
        this._state.animTo = null
        this._state.animProgress = 0
        if (this._isOnGoal()) {
          this._handleSolved(world)
          return
        }
      }
    } else if (input.justPressed.has(this._controls.reset)) {
      this._resetToStart()
    } else {
      this._handleDirectionInput(input)
    }

    this._state.timer -= dt
    if (this._state.timer <= 0) this._handleTimeUp(world)
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('lights_out') || !this._state.active) return

    const { gridN, walls, goalCell, timer, timeLimit, animTime } = this._state
    const W = world.canvas.width
    const H = world.canvas.height
    const cellPx = PUZZLE.cellPx
    const [ox, oy] = _gridOffset(W, H, gridN, cellPx)
    const gridPx = gridN * cellPx
    const px = new PixelCanvas(ctx)

    const gap = this._cellGap
    const inner = cellPx - gap * 2

    // ─── 方眼紙の背景（白系 + 罫線）─────────────────────────────
    // 旧来の暗オーバーレイをやめ、puzzle テーマの白背景＋薄いグリッド罫線を敷く。
    // これが横スクロール本体（base プレイヤー・地面）も覆い隠す。
    this._drawPaperBackground(px, W, H)

    // ─── 盤面パネル（外周の装飾枠） ─────────────────────────────
    this._drawBoardPanel(px, ox, oy, gridPx, animTime)

    // ─── ヘッダー（問題番号・正解数） ───────────────────────────
    px.text(`第 ${this._state.puzzleCount + 1} 問`, W / 2, oy - this._headerAboveGrid, {
      font: 'bold 30px "Courier New", monospace', fill: this._inkColor, align: 'center',
    })
    px.text(`ゴールへ滑り込め   正解数 ${this._state.solvedCount}`, W / 2, oy - this._subHeaderAboveGrid, {
      font: 'bold 16px "Courier New", monospace', fill: this._inkSubColor, align: 'center',
    })

    // ─── セル描画（空きマス・壁） ───────────────────────────────
    for (let r = 0; r < gridN; r++) {
      for (let c = 0; c < gridN; c++) {
        const x = ox + c * cellPx + gap
        const y = oy + r * cellPx + gap
        if (walls[r][c]) {
          this._drawWall(px, x, y, inner)
        } else {
          px.roundedRect(x, y, inner, inner, this._cellEmptyColor, CUT_CELLS)
          this._strokeRoundedRect(px, x, y, inner, inner, this._cellEmptyBorder, 1)
        }
      }
    }

    // ─── ゴールマス（脈動するターゲット） ───────────────────────
    this._drawGoal(px, ox + goalCell[1] * cellPx + cellPx / 2, oy + goalCell[0] * cellPx + cellPx / 2, inner, animTime)

    // ─── プレイヤー駒（スライド中は補間位置） ───────────────────
    // 補間移動の計算式（_renderCell）は無変更。描画時の座標のみ px.roundedRect 側でスナップされる
    {
      const [pr, pc] = this._renderCell()
      this._drawPiece(px, ox + pc * cellPx + cellPx / 2, oy + pr * cellPx + cellPx / 2, inner, animTime)
    }

    // ─── タイマーバー（グリッド上部） ───────────────────────────
    const ratio = Math.max(0, timer / timeLimit)
    const barY = oy - this._timerBarAboveGrid
    px.roundedRect(ox, barY, gridPx, this._timerBarH, '#d2d2e0', CUT_CELLS)
    px.roundedRect(ox, barY, Math.max(0, gridPx * ratio), this._timerBarH, ratio > 0.33 ? '#2bb36a' : '#e23b3b', CUT_CELLS)

    // タイマー秒数
    px.text(`${Math.ceil(Math.max(0, timer))}s`, ox, barY - 4, {
      font: 'bold 16px monospace', fill: ratio > 0.33 ? this._inkColor : '#c62828', align: 'left', baseline: 'bottom',
    })

    // ─── 残機ハート（グリッド下部・中央） ──────────────────────
    const hp = world.player.hp
    const maxHp = world.player.maxHp
    let hearts = ''
    for (let i = 0; i < maxHp; i++) hearts += i < hp ? '♥' : '♡'
    px.text(hearts, W / 2, oy + gridPx + this._heartsBelowGrid, {
      font: 'bold 24px monospace', fill: '#e2395a', align: 'center', baseline: 'top',
    })

    // ─── 操作ヒント ─────────────────────────────────────────────
    px.text('↑ ↓ ← → : 移動      SPACE : リセット', W / 2, oy + gridPx + this._hintBelowGrid, {
      font: 'bold 14px "Courier New", monospace', fill: this._inkSubColor, align: 'center', baseline: 'top',
    })

    // ─── クリア演出（フラッシュ + CLEAR!） ─────────────────────
    if (this._state.solveFx > 0) {
      const a = this._state.solveFx / this._solveFxDuration
      px.rect(0, 0, W, H, `rgba(46, 204, 113, ${0.28 * a})`)
      px.text('CLEAR!', W / 2, oy + gridPx / 2, {
        font: `bold ${Math.round(56 + (1 - a) * 24)}px "Courier New", monospace`,
        fill: '#1ea96b', stroke: { color: '#0f5132', width: 6 },
        align: 'center', baseline: 'middle', alpha: Math.min(1, a * 1.5),
      })
    }

    // ─── ダメージ演出（赤フラッシュ + TIME UP） ────────────────
    if (this._state.damageFx > 0) {
      const a = this._state.damageFx / this._damageFxDuration
      px.rect(0, 0, W, H, `rgba(220, 30, 40, ${0.32 * a})`)
      px.text('TIME UP', W / 2, oy + gridPx / 2, {
        font: 'bold 48px "Courier New", monospace',
        fill: '#e23b3b', stroke: { color: '#7a1015', width: 6 },
        align: 'center', baseline: 'middle', alpha: Math.min(1, a * 1.5),
      })
    }
  }

  // ─── 描画ヘルパー ───────────────────────────────────────────────────────────

  // 白系の方眼紙背景（横スクロール本体を覆い隠し、puzzle テーマの罫線を敷く）。
  // 16-PuzzlePlugin.md と同じ _paperGridSize(=40) を使っており、両者の格子は揃っている。
  private _drawPaperBackground(px: PixelCanvas, W: number, H: number): void {
    px.rect(0, 0, W, H, this._paperColor)
    const step = this._paperGridSize
    px.withAlpha(this._paperGridAlpha, () => {
      for (let x = step; x < W; x += step) px.line(x, 0, x, H, this._paperGridColor, 1)
      for (let y = step; y < H; y += step) px.line(0, y, W, y, this._paperGridColor, 1)
    })
  }

  // 盤面外周の装飾パネル（角落としカード + 二重枠 + 四隅オーナメント）。
  // shadowBlur によるドロップシャドウは D3 に該当しないため（形状に沿う影であり全画面の
  // 均一な塗りではない）本来はハロー等で表現したいが、方向性のある影を近似する適切な
  // プリミティブが無いため今回は省略した（懸念点参照）。
  private _drawBoardPanel(px: PixelCanvas, ox: number, oy: number, gridPx: number, animTime: number): void {
    const pad = this._panelPadding
    const x = ox - pad
    const y = oy - pad
    const w = gridPx + pad * 2
    const h = gridPx + pad * 2
    const cut = Math.max(1, Math.round(this._panelRadius / Math.max(1, PIXELART.size)))

    // 白カード
    px.roundedRect(x, y, w, h, '#fbfbfe', cut)

    // 二重枠
    this._strokeRoundedRect(px, x, y, w, h, this._inkColor, 3)
    this._strokeRoundedRect(px, x + 6, y + 6, w - 12, h - 12, this._cellEmptyBorder, 1.5)

    // 四隅のオーナメント（パズルピース風の小タイル、僅かに脈動）
    const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(animTime * 2))
    const s = 9
    px.withAlpha(0.55 + 0.35 * pulse, () => {
      for (const [cx, cy] of [[x + 14, y + 14], [x + w - 14, y + 14], [x + 14, y + h - 14], [x + w - 14, y + h - 14]] as Cell[]) {
        px.roundedRect(cx - s / 2, cy - s / 2, s, s, '#1ea96b', 1)
      }
    })
  }

  // 壁（立体ブロック表現。TetrisFeature の px.block と共通）。
  private _drawWall(px: PixelCanvas, x: number, y: number, inner: number): void {
    px.block(x, y, inner, inner, this._wallColor)
  }

  // ゴールマス（脈動するターゲット）。arc → px.circle / px.arcBlocks に置換。脈動の式は無変更
  private _drawGoal(px: PixelCanvas, cx: number, cy: number, inner: number, animTime: number): void {
    const pulse = 0.7 + 0.3 * Math.sin(animTime * 4)
    const rad = inner / 2 - 2
    px.withAlpha(0.12 + 0.1 * pulse, () => px.circle(cx, cy, rad, '#1ea96b'))
    px.arcBlocks(cx, cy, rad * (0.7 + 0.08 * pulse), 0, Math.PI * 2, this._goalColor, 1)
    px.arcBlocks(cx, cy, rad * 0.4, 0, Math.PI * 2, this._goalColor, 1)
    px.circle(cx, cy, rad * 0.16, this._goalColor)
  }

  // プレイヤー駒（立体タイル + 光沢 + 中央スタッド）。補間移動の計算式は無変更
  private _drawPiece(px: PixelCanvas, cx: number, cy: number, inner: number, animTime: number): void {
    const size = inner * 0.82
    const half = size / 2
    const cut = Math.max(1, Math.round(this._cellRadius / Math.max(1, PIXELART.size)))

    // 本体（縦の帯グラデーション。角落としで角丸を表現）
    px.bandGradient(cx - half, cy - half, size, size, [[0, this._pieceColor], [1, this._pieceColorDark]], 'v', PIXELART.gradientSteps)
    // 角落とし: 4隅のセルを背景色で欠けさせる代わりに、輪郭線で角丸を示す
    this._strokeRoundedRect(px, cx - half, cy - half, size, size, this._pieceOutline, 2.5)

    // 光沢（上側ハイライト）
    px.withAlpha(0.45, () => {
      px.roundedRect(cx - half + 4, cy - half + 4, size - 8, size * 0.32, '#ffffff', Math.max(1, cut - 1))
    })

    // 中央スタッド（パズルピースのつまみ風、微かに脈動）
    const pulse = 0.9 + 0.1 * Math.sin(animTime * 6)
    px.circle(cx, cy + size * 0.06, half * 0.34 * pulse, '#fff4e6')
    px.arcBlocks(cx, cy + size * 0.06, half * 0.34 * pulse, 0, Math.PI * 2, this._pieceOutline, 1)
  }

  // 角落とし矩形の輪郭のみ（roundedRect は塗りつぶしのみのため、直線4本で枠を近似する）
  private _strokeRoundedRect(px: PixelCanvas, x: number, y: number, w: number, h: number, color: string, lineWidthPx: number): void {
    const thickness = Math.max(1, Math.round(lineWidthPx / Math.max(1, PIXELART.size)))
    px.line(x, y, x + w, y, color, thickness)
    px.line(x, y + h, x + w, y + h, color, thickness)
    px.line(x, y, x, y + h, color, thickness)
    px.line(x + w, y, x + w, y + h, color, thickness)
  }

  onManualUpdated(world: MutableWorld, _versionKey: string): void {
    // ジャンル確定（ルール差し替え）時にエンジンが呼ぶのは onManualUpdated のみで
    // onInit は実行時には呼ばれない。他フィーチャー同様、ここで初期化を行う。
    this.onInit(world)
  }

  // ─── プライベートヘルパー ───────────────────────────────────────────────────

  private _startPuzzle(): void {
    const cfg = _selectGridConfig(this._state.puzzleCount)
    let board = _generateBoard(cfg)
    // _generateBoard は解ける盤面を返す契約だが、将来の回帰・想定外経路に対する最終防衛線として
    // ここで解けることを再検証する。万一詰み盤面が来たら保証済みフォールバックへ差し替え、
    // プレイヤーが絶対にクリア不能な盤面を見ないようにする。
    if (_bfsMinMoves(board.walls, cfg.n, board.start, board.goal) === Infinity) {
      board = _fallbackBoard(cfg.n)
    }
    this._state.gridN = cfg.n
    // 出題が進むほど制限時間を逓減させる（第50問で半分、第100問で1/4で下げ止まり）。
    const timeLimit = cfg.timeSec * _timeScale(this._state.puzzleCount)
    this._state.timeLimit = timeLimit
    this._state.timer = timeLimit
    this._state.walls = board.walls
    this._state.playerCell = board.start
    this._state.startCell = board.start
    this._state.goalCell = board.goal
    this._state.animFrom = null
    this._state.animTo = null
    this._state.animProgress = 0
  }

  // スペースキーで現在の問題を初期配置に戻す（残機は減らさず回数無制限。盤面・タイマーは維持）。
  // 壁配置で身動きが取れなくなった場合の救済措置。
  private _resetToStart(): void {
    this._state.playerCell = this._state.startCell
    this._state.animFrom = null
    this._state.animTo = null
    this._state.animProgress = 0
  }

  // 押された方向にスライドを開始する（壁/境界まで直進）。移動が無ければ何もしない。
  private _handleDirectionInput(input: InputSnapshot): void {
    const dir = this._pressedDirection(input)
    if (dir === null) return
    const { walls, gridN, playerCell } = this._state
    const dest = _slideDest(walls, gridN, playerCell, dir[0], dir[1])
    if (dest[0] === playerCell[0] && dest[1] === playerCell[1]) return
    const dist = Math.abs(dest[0] - playerCell[0]) + Math.abs(dest[1] - playerCell[1])
    this._state.animFrom = playerCell
    this._state.animTo = dest
    this._state.animProgress = 0
    this._state.animDuration = Math.max(this._slideMinSec, dist * this._slidePerCellSec)
    soundManager.onPuzzleSlide()
  }

  private _pressedDirection(input: InputSnapshot): Cell | null {
    const ctrl = this._controls
    if (input.justPressed.has(ctrl.up)) return DIRS[0]
    if (input.justPressed.has(ctrl.down)) return DIRS[1]
    if (input.justPressed.has(ctrl.left)) return DIRS[2]
    if (input.justPressed.has(ctrl.right)) return DIRS[3]
    return null
  }

  // 方向キー名・リセットキー名。onInit 時に world.rules.controls からキャッシュする。
  private _controls = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', reset: 'Space' }

  private _isOnGoal(): boolean {
    return this._state.playerCell[0] === this._state.goalCell[0]
      && this._state.playerCell[1] === this._state.goalCell[1]
  }

  // 描画用セル座標（スライド中は from→to を補間した連続座標）。
  private _renderCell(): [number, number] {
    const { animFrom, animTo, animProgress, playerCell } = this._state
    if (animFrom === null || animTo === null) return [playerCell[0], playerCell[1]]
    const t = _easeOut(Math.min(1, animProgress))
    return [
      animFrom[0] + (animTo[0] - animFrom[0]) * t,
      animFrom[1] + (animTo[1] - animFrom[1]) * t,
    ]
  }

  private _handleSolved(world: MutableWorld): void {
    const newCombo = world.gameStats.combo + 1
    world.setCombo(newCombo)
    this._state.solvedCount++
    soundManager.onCombo(newCombo)
    soundManager.onPuzzleClear()

    const cx = world.canvas.width / 2
    const cy = world.canvas.height / 2
    world.addScorePopup(cx, cy - this._popupOffsetY, `CLEAR!  +${newCombo} COMBO`, '#ffd700')
    world.triggerShake(this._solvedShakeIntensity)
    this._state.solveFx = this._solveFxDuration

    for (let i = 0; i < this._solveParticleCount; i++) {
      const angle = (Math.PI * 2 * i) / this._solveParticleCount + Math.random() * 0.3
      const speed = this._solveParticleSpeed * (0.5 + Math.random() * 0.8)
      world.addParticle(
        cx, cy,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        this._solveParticleLife * (0.7 + Math.random() * 0.6),
        i % 2 === 0 ? '#ffd700' : '#ffffff',
        this._solveParticleSize,
      )
    }
    this._state.puzzleCount++
    this._startPuzzle()
  }

  private _handleTimeUp(world: MutableWorld): void {
    world.resetCombo()
    world.modifyPlayerHp(-1)
    soundManager.onHit()

    const cx = world.canvas.width / 2
    const cy = world.canvas.height / 2
    world.addScorePopup(cx, cy - this._popupOffsetY, 'TIME UP...', '#ff5566')
    world.triggerShake(this._timeUpShakeIntensity)
    this._state.damageFx = this._damageFxDuration

    for (let i = 0; i < this._damageParticleCount; i++) {
      const angle = (Math.PI * 2 * i) / this._damageParticleCount + Math.random() * 0.3
      const speed = this._damageParticleSpeed * (0.5 + Math.random() * 0.7)
      world.addParticle(
        cx, cy,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        this._damageParticleLife,
        '#ff3344',
        this._damageParticleSize,
      )
    }

    if (world.player.hp <= 0) {
      this._state.active = false
      return
    }
    this._state.puzzleCount++
    this._startPuzzle()
  }
}
