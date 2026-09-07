/**
 * genres/SportsPlugin.ts
 * 'sports' ジャンル（スポーツゲーム）のプラグイン。
 *
 * スタジアム。スコアボードとタイム。記録更新。
 * 昼のスタジアム。明るい青空と芝生。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { selectPlayerFrame } from './playerBaseAnim'
import type { PlayerAnimState } from '../engine/GenrePlugin'
import { SportsMode } from '../game/modes/SportsMode'

// ゴールラインの演出周期（ms）
const GOAL_FLASH_PERIOD = 2000
// 観客席の点滅周期（ms）
const CROWD_BOOST_PERIOD = 1500

export class SportsPlugin extends GenrePluginBase {
  readonly id: GenreId = 'sports'

  readonly gameMode = new SportsMode()

  readonly skyColors    = ['#87ceeb', '#b0e0ff'] as const
  readonly groundColors = ['#2d5a27', '#1f4019'] as const
  readonly farLayerColor  = '#4a8a44'
  readonly midLayerColor  = '#3a7a34'
  readonly starColor: string | undefined = undefined

  readonly palette = {
    danger: '#dd3333', dangerGlow: '#ff5555',
    safe:   '#ffcc44', safeGlow:   '#ffee88',
  }

  readonly hazardConfig = {
    glowBlur: 8,
    pulseSpeed: 1.5,
    pulseAmplitude: 0.08,
  }

  readonly groundLineAlpha = 0.25
  readonly groundDashAlpha = 0.12

  readonly particleColors = {
    hit:   '#ff5555',
    death: ['#dd3333', '#ff5555', '#bb2222', '#ff8888'] as readonly string[],
    jump:  'rgba(255,204,68,0.4)',
    land:  'rgba(200,160,40,0.35)',
  }

  // 障害物（rect が主）。芝生上のコーン・ハードル風
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 6, wRange: [22, 42], hRange: [30, 55], safeChance: 0.20 },
    { shape: 'pillar', placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [12, 18], hRange: [55, 100], safeChance: 0.15 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 4, wRange: [20, 38], hRange: [28, 50], safeChance: 0.12 },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 2, wRange: [24, 40], hRange: [20, 36], safeChance: 0.25 },
  ]

  // 記録タイム（秒）。HUD 描画専用
  private _elapsedSec = 0
  // 最後の更新時刻（ms）
  private _lastUpdate = 0
  // 最高記録
  private _bestRecord = 0

  // ─── 遠景：観客席のシルエット（点滅する歓声感） ──────────────
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now()

    // 観客席のシルエット（階段状）
    px.withAlpha(0.30, () => {
      px.ridge(-20, W + 20, gY, (sx) => {
        const wx = sx - offsetX * 0.06
        // 観客席は階段状に高くなる
        const step = ((Math.floor(wx / 30) % 4) + 4) % 4
        return 20 + step * 15 + Math.sin(wx * 0.02) * 8
      }, '#5a9a54')
    })

    // 観客の点滅（歓声エフェクト）
    const crowdPhase = (t % CROWD_BOOST_PERIOD) / CROWD_BOOST_PERIOD
    if (crowdPhase > 0.7) {
      const crowdAlpha = Math.max(0.125, (crowdPhase - 0.7) / 0.3 * 0.12)
      px.withAlpha(crowdAlpha, () => {
        const sector = Math.floor(offsetX * 0.06 / 15)
        for (let s = sector - 1; s <= sector + Math.ceil(W / 15) + 2; s++) {
          const h = (s * 3491) & 0xffff
          const cx = s * 15 - offsetX * 0.06 + (h % 10)
          const cy = gY - 40 - (h >> 8) % 30
          px.circle(cx, cy, 2, '#ffdd88')
        }
      })
    }

    // スタジアムの柱・屋根
    px.withAlpha(0.20, () => {
      const pillarSpan = 300
      const sector = Math.floor(offsetX * 0.06 / pillarSpan)
      for (let s = sector - 1; s <= sector + 3; s++) {
        const pxPos = s * pillarSpan - offsetX * 0.06
        const pillarH = 100
        px.rect(pxPos, gY - pillarH, 6, pillarH, '#6aaa64')
        px.rect(pxPos + pillarSpan - 6, gY - pillarH, 6, pillarH, '#6aaa64')
        // 屋根
        px.rect(pxPos - 10, gY - pillarH - 4, pillarSpan + 20, 6, '#7aba74')
      }
    })
  }

  // ─── 中景：スタジアムの柱・ゴール ─────────────────────────────
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 芝生のライン（地面に沿って）
    const stripeW = 60
    const startX = -(offsetX % stripeW)
    px.withAlpha(0.12, () => {
      for (let x = startX; x <= W; x += stripeW * 2) {
        px.rect(x, gY - 4, stripeW, 4, '#3a7a34')
      }
    })

    // トラックのレーンライン
    px.withAlpha(0.20, () => {
      const laneY = gY - 20
      px.line(0, laneY, W, laneY, '#ddcc88', 1)
      px.line(0, laneY + 15, W, laneY + 15, '#ddcc88', 1)
    })

    // ゴールライン（距離に応じて表示）
    const goalPhase = (Math.floor(offsetX / 500) % 2 === 0)
    if (goalPhase) {
      const goalX = W - (offsetX % 500)
      const t = performance.now()
      const flash = 0.5 + Math.sin(t / GOAL_FLASH_PERIOD) * 0.3
      px.withAlpha(flash, () => {
        px.rect(goalX, gY - 80, 4, 80, '#ffffff')
        // ゴールポスト
        px.rect(goalX - 4, gY - 82, 12, 6, '#ffffff')
      })
    }
  }

  // ─── プレイヤー：base を流用（アスリート風） ──────────────────
  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number, animState?: PlayerAnimState): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,0,0,0.20)')

    const s: PlayerAnimState = animState ?? { vx: 0, vy: 0, onGround, runCycle, facing: 1 }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.sprite('player_base', 0, 0, w, h, { frame, flipX })

    // ヘッドバンド（アスリート風）
    px.rect(w * 0.15, h * 0.1, w * 0.7, 3, '#dd3333')
  }

  // ─── 前景：ゴールラインの演出 ────────────────────────────────
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, _H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now()

    // 天空の雲（ゆっくり流れる）
    px.withAlpha(0.25, () => {
      const cloudSpeed = 0.02
      for (let i = 0; i < 3; i++) {
        const cx = ((i * 300 + t * cloudSpeed) % (W + 100)) - 50
        const cy = 30 + i * 25
        px.circle(cx, cy, 15, '#ffffff')
        px.circle(cx + 12, cy - 5, 10, '#ffffff')
        px.circle(cx + 25, cy, 12, '#ffffff')
      }
    })
  }

  // ─── ジャンル固有 HUD：スコアボード（タイム / 記録） ─────────
  drawGenreHUD(ctx: CanvasRenderingContext2D, _world: import('../engine/types').MutableWorld, W: number, _H: number): void {
    const px = new PixelCanvas(ctx)
    const now = performance.now()

    // タイムの更新
    if (this._lastUpdate > 0) {
      const dt = (now - this._lastUpdate) / 1000
      this._elapsedSec += dt
    }
    this._lastUpdate = now

    // 最高記録の更新
    if (this._elapsedSec > this._bestRecord) {
      this._bestRecord = this._elapsedSec
    }

    const elapsedStr = this._formatTime(this._elapsedSec)
    const bestStr = this._formatTime(this._bestRecord)

    // スコアボードパネル（右上）— 緑の枠 + 白パネル
    const panelX = W - 180
    const panelY = 8
    const panelW = 170
    const panelH = 56

    // 枠（4辺の矩形で描画）
    px.rect(panelX - 2, panelY - 2, panelW + 4, 3, '#2d5a27')   // 上
    px.rect(panelX - 2, panelY + panelH - 1, panelW + 4, 3, '#2d5a27') // 下
    px.rect(panelX - 2, panelY, 3, panelH + 2, '#2d5a27')        // 左
    px.rect(panelX + panelW - 1, panelY, 3, panelH + 2, '#2d5a27')  // 右

    // パネル本体
    px.roundedRect(panelX, panelY, panelW, panelH, 'rgba(255,255,255,0.85)', 3)

    // タイム
    px.text(`TIME`, panelX + 10, panelY + 16, {
      font: 'bold 11px monospace', fill: '#2d5a27',
    })
    px.text(elapsedStr, panelX + 10, panelY + 34, {
      font: 'bold 18px monospace', fill: '#1a3a16',
    })

    // 記録
    px.text(`BEST`, panelX + 100, panelY + 16, {
      font: 'bold 11px monospace', fill: '#2d5a27',
    })
    px.text(bestStr, panelX + 100, panelY + 34, {
      font: 'bold 18px monospace', fill: '#cc8800',
    })

    // 記録更新フラッシュ
    if (this._elapsedSec >= this._bestRecord && this._elapsedSec > 0) {
      const flash = Math.sin(now / 200) > 0
      if (flash) {
        px.text('NEW!', panelX + panelW - 50, panelY + 48, {
          font: 'bold 12px monospace', fill: '#ff3333',
        })
      }
    }
  }

  // 時間を MM:SS.ms 形式でフォーマット
  private _formatTime(sec: number): string {
    const mins = Math.floor(sec / 60)
    const secs = Math.floor(sec % 60)
    const ms = Math.floor((sec % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }
}

export default new SportsPlugin()
