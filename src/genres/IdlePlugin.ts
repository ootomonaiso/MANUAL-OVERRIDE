/**
 * genres/IdlePlugin.ts
 * 'idle' ジャンル（放置ゲーム）のプラグイン。
 *
 * 落ち着いた場所。何もせずとも資源が積み上がる。
 * 明るいクリームと温かい茶。プレイヤーはのんびり過ごす。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { selectPlayerFrame } from './playerBaseAnim'
import type { PlayerAnimState } from '../engine/GenrePlugin'
import { IdleMode } from '../game/modes/IdleMode'

// 資源の自動増加量（per sec）
const RESOURCE_RATE = 2.5
// 資源の最大表示数（キャップ）
const RESOURCE_MAX_DISPLAY = 9999
// 積み上げブロックの高さ（px）
const BLOCK_HEIGHT = 8
// 資源山の最大高さ（px）
const MAX_PILE_HEIGHT = 120
// 積み上げブロックの色（フレーム毎に再割当しないようモジュールレベルで定義）
const BLOCK_COLORS = ['#c8b898', '#b8a888', '#a89878', '#d0c0a0']

export class IdlePlugin extends GenrePluginBase {
  readonly id: GenreId = 'idle'

  readonly gameMode = new IdleMode()

  readonly skyColors    = ['#f5f5f0', '#e8e8e0'] as const
  readonly groundColors = ['#d8d0c0', '#c8c0b0'] as const
  readonly farLayerColor  = '#e0d8c8'
  readonly midLayerColor  = '#d0c8b8'
  readonly starColor: string | undefined = undefined

  readonly palette = {
    danger: '#cc6655', dangerGlow: '#dd8877',
    safe:   '#88aa66', safeGlow:   '#aacc88',
  }

  readonly hazardConfig = {
    glowBlur: 4,
    pulseSpeed: 0.3,
    pulseAmplitude: 0.03,
  }

  readonly groundLineAlpha = 0.08
  readonly groundDashAlpha = 0.04

  readonly particleColors = {
    hit:   '#dd8877',
    death: ['#cc6655', '#dd8877', '#aa5544', '#eeaa99'] as readonly string[],
    jump:  'rgba(136,170,102,0.3)',
    land:  'rgba(100,130,70,0.25)',
  }

  // 障害物は少ない（baseInterval 大）。安全領域広め
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 4, weightEnd: 3, wRange: [24, 44], hRange: [30, 52], safeChance: 0.35 },
    { shape: 'pillar', placement: 'ground', weightStart: 2, weightEnd: 2, wRange: [14, 20], hRange: [60, 110], safeChance: 0.30 },
    { shape: 'spike',  placement: 'ground', weightStart: 1, weightEnd: 1, wRange: [20, 36], hRange: [30, 50], safeChance: 0.25 },
  ]

  // 累積資源数（per-instance 状態。HUD 描画専用）
  private _resources = 0
  // 最後の更新時刻（ms）
  private _lastUpdate = 0

  // ─── 遠景：穏やかな丘・建物のシルエット（明るい） ─────────────
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 丘のシルエット（緩やかなカーブ）
    px.withAlpha(0.25, () => {
      px.ridge(-20, W + 20, gY, (sx) => {
        const wx = sx - offsetX * 0.05
        return Math.sin(wx * 0.004) * 40 + Math.sin(wx * 0.009) * 20 + 60
      }, this.farLayerColor)
    })

    // 遠くの建物のシルエット（ village ）
    px.withAlpha(0.15, () => {
      const sector = Math.floor(offsetX * 0.05 / 120)
      for (let s = sector - 1; s <= sector + 4; s++) {
        const h = (s * 1877) & 0xffff
        const bx = s * 120 - offsetX * 0.05 + (h % 60)
        const bh = 30 + (h >> 4) % 40
        const bw = 16 + (h >> 8) % 20
        px.rect(bx, gY - bh, bw, bh, '#d8d0c0')
        // 屋根（三角）
        px.tri(bx - 2, gY - bh, bw + 4, 10, 'up', '#c8c0b0')
      }
    })
  }

  // ─── 中景：積み上がる資源の山 ────────────────────────────────
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 資源の増加（時間経過で）
    const now = performance.now()
    if (this._lastUpdate > 0) {
      const dt = (now - this._lastUpdate) / 1000
      this._resources = Math.min(RESOURCE_MAX_DISPLAY, this._resources + RESOURCE_RATE * dt)
    }
    this._lastUpdate = now

    // 積み上げブロック（右下に山として描画）
    const pileH = Math.min(MAX_PILE_HEIGHT, this._resources * 0.5)
    if (pileH > 0) {
      const pileX = W - 80
      const blockCount = Math.floor(pileH / BLOCK_HEIGHT)
      for (let i = 0; i < blockCount; i++) {
        const by = gY - (i + 1) * BLOCK_HEIGHT
        // 幅は下の層ほど広げる（山型）
        const widthSpread = Math.max(10, 50 - i * 2)
        const bx = pileX - widthSpread / 2 + (i % 3) * 4
        const color = BLOCK_COLORS[i % BLOCK_COLORS.length]
        px.rect(bx, by, widthSpread, BLOCK_HEIGHT, color)
      }
    }

    // 地面の草パターン（穏やか）
    const grassSpacing = 20
    const startX = -(offsetX % grassSpacing)
    px.withAlpha(0.10, () => {
      for (let gx = startX; gx <= W; gx += grassSpacing) {
        const gh = 4 + Math.sin(gx * 0.1 + now / 2000) * 2
        px.rect(gx, gY - gh, 2, gh, '#88aa66')
      }
    })
  }

  // ─── プレイヤー：base を流用（のんびり） ──────────────────────
  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number, animState?: PlayerAnimState): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,0,0,0.15)')

    const s: PlayerAnimState = animState ?? { vx: 0, vy: 0, onGround, runCycle, facing: 1 }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.sprite('player_base', 0, 0, w, h, { frame, flipX })

    // 小さな帽子（のんびり感）
    px.rect(w * 0.2, -2, w * 0.6, 4, '#886644')
    px.rect(w * 0.3, -6, w * 0.4, 4, '#886644')
  }

  // ─── 前景：穏やかな光のエフェクト ────────────────────────────
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now()

    // 柔らかな光のエフェクト（太陽の光線）
    px.withAlpha(0.15, () => {
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 4 + Math.sin(t / 5000 + i) * 0.1
        const len = H * 1.5
        const startX = W * 0.7
        const startY = -20
        const endX = startX + Math.cos(angle) * len
        const endY = startY + Math.sin(angle) * len
        px.line(startX, startY, endX, endY, '#ffeecc', 3)
      }
    })
  }

  // ─── ジャンル固有 HUD：累積資源数 / 自動増加分 ────────────────
  drawGenreHUD(ctx: CanvasRenderingContext2D, _world: import('../engine/types').MutableWorld, W: number, _H: number): void {
    const px = new PixelCanvas(ctx)

    // 資源表示パネル（右上）
    const panelX = W - 170
    const panelY = 8
    const panelW = 160
    const panelH = 44
    px.roundedRect(panelX, panelY, panelW, panelH, 'rgba(245,245,240,0.8)', 3)

    // 資源数
    const resourceStr = this._resources >= RESOURCE_MAX_DISPLAY
      ? `${RESOURCE_MAX_DISPLAY}+`
      : Math.floor(this._resources).toLocaleString()
    px.text(`$ ${resourceStr}`, panelX + 8, panelY + 16, {
      font: 'bold 16px serif', fill: '#665533',
    })

    // 増加率
    px.text(`+${RESOURCE_RATE}/s`, panelX + 8, panelY + 36, {
      font: '11px serif', fill: '#88aa66',
    })
  }
}

export default new IdlePlugin()
