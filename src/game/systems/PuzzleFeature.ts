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
import { PUZZLE } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'

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
    }
  }
  return best ?? _fallbackBoard(n)
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

    const gap = this._cellGap
    const inner = cellPx - gap * 2

    ctx.save()

    // ─── 方眼紙の背景（白系 + 罫線）─────────────────────────────
    // 旧来の暗オーバーレイをやめ、puzzle テーマの白背景＋薄いグリッド罫線を敷く。
    // これが横スクロール本体（base プレイヤー・地面）も覆い隠す。
    this._drawPaperBackground(ctx, W, H)

    // ─── 盤面パネル（外周の装飾枠） ─────────────────────────────
    this._drawBoardPanel(ctx, ox, oy, gridPx, animTime)

    // ─── ヘッダー（問題番号・正解数） ───────────────────────────
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = this._inkColor
    ctx.font = 'bold 30px "Courier New", monospace'
    ctx.fillText(`第 ${this._state.puzzleCount + 1} 問`, W / 2, oy - this._headerAboveGrid)
    ctx.fillStyle = this._inkSubColor
    ctx.font = 'bold 16px "Courier New", monospace'
    ctx.fillText(`ゴールへ滑り込め   正解数 ${this._state.solvedCount}`, W / 2, oy - this._subHeaderAboveGrid)

    // ─── セル描画（空きマス・壁） ───────────────────────────────
    for (let r = 0; r < gridN; r++) {
      for (let c = 0; c < gridN; c++) {
        const x = ox + c * cellPx + gap
        const y = oy + r * cellPx + gap
        if (walls[r][c]) {
          this._drawWall(ctx, x, y, inner)
        } else {
          ctx.fillStyle = this._cellEmptyColor
          this._roundRect(ctx, x, y, inner, inner, this._cellRadius)
          ctx.fill()
          ctx.strokeStyle = this._cellEmptyBorder
          ctx.lineWidth = 1.5
          this._roundRect(ctx, x, y, inner, inner, this._cellRadius)
          ctx.stroke()
        }
      }
    }

    // ─── ゴールマス（脈動するターゲット） ───────────────────────
    this._drawGoal(ctx, ox + goalCell[1] * cellPx + cellPx / 2, oy + goalCell[0] * cellPx + cellPx / 2, inner, animTime)

    // ─── プレイヤー駒（スライド中は補間位置） ───────────────────
    {
      const [pr, pc] = this._renderCell()
      this._drawPiece(ctx, ox + pc * cellPx + cellPx / 2, oy + pr * cellPx + cellPx / 2, inner, animTime)
    }

    // ─── タイマーバー（グリッド上部） ───────────────────────────
    const ratio = Math.max(0, timer / timeLimit)
    const barY = oy - this._timerBarAboveGrid
    ctx.fillStyle = '#d2d2e0'
    this._roundRect(ctx, ox, barY, gridPx, this._timerBarH, this._timerBarH / 2)
    ctx.fill()
    ctx.fillStyle = ratio > 0.33 ? '#2bb36a' : '#e23b3b'
    this._roundRect(ctx, ox, barY, Math.max(0, gridPx * ratio), this._timerBarH, this._timerBarH / 2)
    ctx.fill()

    // タイマー秒数
    ctx.fillStyle = ratio > 0.33 ? this._inkColor : '#c62828'
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`${Math.ceil(Math.max(0, timer))}s`, ox, barY - 4)

    // ─── 残機ハート（グリッド下部・中央） ──────────────────────
    const hp = world.player.hp
    const maxHp = world.player.maxHp
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = 'bold 24px monospace'
    let hearts = ''
    for (let i = 0; i < maxHp; i++) hearts += i < hp ? '♥' : '♡'
    ctx.fillStyle = '#e2395a'
    ctx.fillText(hearts, W / 2, oy + gridPx + this._heartsBelowGrid)

    // ─── 操作ヒント ─────────────────────────────────────────────
    ctx.fillStyle = this._inkSubColor
    ctx.font = 'bold 14px "Courier New", monospace'
    ctx.fillText('↑ ↓ ← → : 移動      SPACE : リセット', W / 2, oy + gridPx + this._hintBelowGrid)

    // ─── クリア演出（フラッシュ + CLEAR!） ─────────────────────
    if (this._state.solveFx > 0) {
      const a = this._state.solveFx / this._solveFxDuration
      ctx.fillStyle = `rgba(46, 204, 113, ${0.28 * a})`
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.globalAlpha = Math.min(1, a * 1.5)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `bold ${Math.round(56 + (1 - a) * 24)}px "Courier New", monospace`
      ctx.lineWidth = 6
      ctx.strokeStyle = '#0f5132'
      ctx.strokeText('CLEAR!', W / 2, oy + gridPx / 2)
      ctx.fillStyle = '#1ea96b'
      ctx.fillText('CLEAR!', W / 2, oy + gridPx / 2)
      ctx.restore()
    }

    // ─── ダメージ演出（赤フラッシュ + TIME UP） ────────────────
    if (this._state.damageFx > 0) {
      const a = this._state.damageFx / this._damageFxDuration
      ctx.fillStyle = `rgba(220, 30, 40, ${0.32 * a})`
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.globalAlpha = Math.min(1, a * 1.5)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 48px "Courier New", monospace'
      ctx.lineWidth = 6
      ctx.strokeStyle = '#7a1015'
      ctx.strokeText('TIME UP', W / 2, oy + gridPx / 2)
      ctx.fillStyle = '#e23b3b'
      ctx.fillText('TIME UP', W / 2, oy + gridPx / 2)
      ctx.restore()
    }

    ctx.restore()
  }

  // ─── 描画ヘルパー ───────────────────────────────────────────────────────────

  // 白系の方眼紙背景（横スクロール本体を覆い隠し、puzzle テーマの罫線を敷く）。
  private _drawPaperBackground(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.fillStyle = this._paperColor
    ctx.fillRect(0, 0, W, H)
    ctx.save()
    ctx.globalAlpha = this._paperGridAlpha
    ctx.strokeStyle = this._paperGridColor
    ctx.lineWidth = 1
    const step = this._paperGridSize
    ctx.beginPath()
    for (let x = step; x < W; x += step) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
    }
    for (let y = step; y < H; y += step) {
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
    }
    ctx.stroke()
    ctx.restore()
  }

  // 盤面外周の装飾パネル（影付きカード + 二重枠 + 四隅オーナメント）。
  private _drawBoardPanel(ctx: CanvasRenderingContext2D, ox: number, oy: number, gridPx: number, animTime: number): void {
    const pad = this._panelPadding
    const x = ox - pad
    const y = oy - pad
    const w = gridPx + pad * 2
    const h = gridPx + pad * 2

    ctx.save()
    // 影付きの白カード
    ctx.shadowColor = 'rgba(40, 40, 70, 0.25)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 8
    ctx.fillStyle = '#fbfbfe'
    this._roundRect(ctx, x, y, w, h, this._panelRadius)
    ctx.fill()
    ctx.restore()

    // 二重枠
    ctx.strokeStyle = this._inkColor
    ctx.lineWidth = 3
    this._roundRect(ctx, x, y, w, h, this._panelRadius)
    ctx.stroke()
    ctx.strokeStyle = this._cellEmptyBorder
    ctx.lineWidth = 1.5
    this._roundRect(ctx, x + 6, y + 6, w - 12, h - 12, this._panelRadius - 4)
    ctx.stroke()

    // 四隅のオーナメント（パズルピース風の小タイル、僅かに脈動）
    const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(animTime * 2))
    const s = 9
    ctx.fillStyle = `rgba(30, 169, 107, ${0.55 + 0.35 * pulse})`
    for (const [cx, cy] of [[x + 14, y + 14], [x + w - 14, y + 14], [x + 14, y + h - 14], [x + w - 14, y + h - 14]] as Cell[]) {
      this._roundRect(ctx, cx - s / 2, cy - s / 2, s, s, 2)
      ctx.fill()
    }
  }

  // 壁（立体ブロック）。
  private _drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, inner: number): void {
    ctx.save()
    ctx.shadowColor = 'rgba(20, 20, 40, 0.3)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
    ctx.fillStyle = this._wallColor
    this._roundRect(ctx, x, y, inner, inner, this._cellRadius)
    ctx.fill()
    ctx.restore()
    // 上面ベベル
    ctx.fillStyle = this._wallTopColor
    this._roundRect(ctx, x, y, inner, inner * 0.42, this._cellRadius)
    ctx.fill()
  }

  // ゴールマス（脈動するターゲット）。
  private _drawGoal(ctx: CanvasRenderingContext2D, cx: number, cy: number, inner: number, animTime: number): void {
    const pulse = 0.7 + 0.3 * Math.sin(animTime * 4)
    const rad = inner / 2 - 2
    ctx.save()
    ctx.fillStyle = `rgba(30, 169, 107, ${0.12 + 0.1 * pulse})`
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = this._goalColor
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, rad * (0.7 + 0.08 * pulse), 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, rad * 0.4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = this._goalColor
    ctx.beginPath()
    ctx.arc(cx, cy, rad * 0.16, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // プレイヤー駒（視認性の高い意匠: 立体タイル + 光沢 + 中央スタッド）。
  private _drawPiece(ctx: CanvasRenderingContext2D, cx: number, cy: number, inner: number, animTime: number): void {
    const size = inner * 0.82
    const half = size / 2
    const r = this._cellRadius
    ctx.save()
    // ふわっと浮く影
    ctx.shadowColor = 'rgba(120, 50, 0, 0.35)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 3
    // 本体（縦グラデーション）
    const grad = ctx.createLinearGradient(cx, cy - half, cx, cy + half)
    grad.addColorStop(0, this._pieceColor)
    grad.addColorStop(1, this._pieceColorDark)
    ctx.fillStyle = grad
    this._roundRect(ctx, cx - half, cy - half, size, size, r)
    ctx.fill()
    ctx.restore()

    // 輪郭
    ctx.strokeStyle = this._pieceOutline
    ctx.lineWidth = 2.5
    this._roundRect(ctx, cx - half, cy - half, size, size, r)
    ctx.stroke()

    // 光沢（上側ハイライト）
    ctx.save()
    ctx.globalAlpha = 0.45
    ctx.fillStyle = '#ffffff'
    this._roundRect(ctx, cx - half + 4, cy - half + 4, size - 8, size * 0.32, r - 2)
    ctx.fill()
    ctx.restore()

    // 中央スタッド（パズルピースのつまみ風、微かに脈動）
    const pulse = 0.9 + 0.1 * Math.sin(animTime * 6)
    ctx.fillStyle = '#fff4e6'
    ctx.beginPath()
    ctx.arc(cx, cy + size * 0.06, half * 0.34 * pulse, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = this._pieceOutline
    ctx.lineWidth = 2
    ctx.stroke()
  }

  onManualUpdated(world: MutableWorld, _versionKey: string): void {
    // ジャンル確定（ルール差し替え）時にエンジンが呼ぶのは onManualUpdated のみで
    // onInit は実行時には呼ばれない。他フィーチャー同様、ここで初期化を行う。
    this.onInit(world)
  }

  // ─── プライベートヘルパー ───────────────────────────────────────────────────

  private _startPuzzle(): void {
    const cfg = _selectGridConfig(this._state.puzzleCount)
    const board = _generateBoard(cfg)
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

  private _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rad = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rad, y)
    ctx.arcTo(x + w, y, x + w, y + h, rad)
    ctx.arcTo(x + w, y + h, x, y + h, rad)
    ctx.arcTo(x, y + h, x, y, rad)
    ctx.arcTo(x, y, x + w, y, rad)
    ctx.closePath()
  }
}
