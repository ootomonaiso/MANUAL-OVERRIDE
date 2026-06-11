/**
 * game/systems/PuzzleFeature.ts
 * パズル系フィーチャーを担当。
 *
 * ✅ grid_stop:    move/solveフェーズを交互に切り替え、solveフェーズ中は
 *                  scrollSpeed を 0 にして画面をグリッド配置モードで停止する
 * ✅ puzzle_solve: solve→moveの切り替わりでプレイヤーがターゲットセルに
 *                  重なっているかを判定し、正解ならコンボ加算+スコア、
 *                  不正解ならコンボリセットする
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { PLAYER_PHYSICS } from '../../data/gameBalance'

const GRID_SIZE = 60
const MOVE_PHASE_SEC = 2.5
const SOLVE_PHASE_SEC = 2.0
const SOLVE_SCORE = 200

type Phase = 'move' | 'solve'

interface PuzzleState {
  phase: Phase
  timer: number
  baseScrollSpeed: number | null
  targetX: number
}

function initialState(): PuzzleState {
  return { phase: 'move', timer: MOVE_PHASE_SEC, baseScrollSpeed: null, targetX: 0 }
}

export class PuzzleFeature implements FeatureSystem {
  readonly handles = ['grid_stop', 'puzzle_solve'] as const

  private state: PuzzleState = initialState()

  onInit(world: MutableWorld): void {
    this.state = initialState()
    this.state.baseScrollSpeed = world.rules.scrollSpeed
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    const r = world.rules
    if (!r.features.has('grid_stop')) return

    if (this.state.baseScrollSpeed === null) {
      this.state.baseScrollSpeed = r.scrollSpeed
    }

    this.state.timer -= dt
    if (this.state.timer > 0) return

    if (this.state.phase === 'move') {
      // move → solve: 画面を停止し、グリッド上にターゲットセルを表示する
      this.state.phase = 'solve'
      this.state.timer = SOLVE_PHASE_SEC
      r.scrollSpeed = 0

      const minX = PLAYER_PHYSICS.playerMinX
      const maxX = world.canvas.width * PLAYER_PHYSICS.playerMaxXRatio
      const cells = Math.max(1, Math.floor((maxX - minX) / GRID_SIZE))
      const cell = Math.floor(Math.random() * cells)
      this.state.targetX = minX + cell * GRID_SIZE
      return
    }

    // solve → move: スクロールを再開し、正誤判定を行う
    this.state.phase = 'move'
    this.state.timer = MOVE_PHASE_SEC
    r.scrollSpeed = this.state.baseScrollSpeed ?? r.scrollSpeed

    if (!r.features.has('puzzle_solve')) return

    const p = world.player
    const center = p.x + p.w / 2
    const hit = center >= this.state.targetX && center <= this.state.targetX + GRID_SIZE

    if (hit) {
      world.setCombo(world.gameStats.combo + 1)
      world.addScore(SOLVE_SCORE)
      world.addScorePopup(p.x + p.w, p.y - 30, `CORRECT! +${SOLVE_SCORE}`, '#ffd700')
      world.addParticle(p.x + p.w / 2, p.y, 0, -80, 0.4, '#ffd700', 4)
    } else {
      world.resetCombo()
      world.addScorePopup(p.x + p.w, p.y - 30, 'MISS', '#888888')
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('grid_stop')) return
    if (this.state.phase !== 'solve') return

    const gY = world.canvas.height - 80
    ctx.save()
    ctx.globalAlpha = 0.35
    ctx.fillStyle = '#ffd700'
    ctx.fillRect(this.state.targetX, 0, GRID_SIZE, gY)
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#ffaa00'
    ctx.lineWidth = 2
    ctx.strokeRect(this.state.targetX, 0, GRID_SIZE, gY)
    ctx.restore()
  }

  onManualUpdated(world: MutableWorld): void {
    this.state = initialState()
    this.state.baseScrollSpeed = world.rules.scrollSpeed
  }
}
