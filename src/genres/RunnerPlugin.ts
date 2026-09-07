/**
 * genres/RunnerPlugin.ts
 * 'runner' ジャンル（エンドレスランナー）のプラグイン。
 *
 * 高速で走り続ける。速度感・モーションが主役。
 * 夜の街。速度ライン・パララックス・サイバーランナー。
 */

import { DarkThemePlugin } from './BasePlugin'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { selectPlayerFrame } from './playerBaseAnim'
import type { PlayerAnimState } from '../engine/GenrePlugin'

// スクロール速度ボーナス（px/s）。速さを強調
const SCROLL_SPEED_BONUS = 80
// 速度ラインの最小長さ（px）
const SPEED_LINE_MIN_LEN = 40
// 速度ラインの最大追加長（px）
const SPEED_LINE_MAX_LEN = 120

export class RunnerPlugin extends DarkThemePlugin {
  readonly id: GenreId = 'runner'

  readonly skyColors: readonly [string, string] = ['#1a1a2e', '#16213e']
  readonly groundColors: readonly [string, string] = ['#0f0f1a', '#0a0a12']
  readonly farLayerColor = '#1a1a3a'
  readonly midLayerColor = '#121228'
  readonly starColor: string | undefined = '#ff4466' // レーサー風の赤星
  readonly palette = {
    danger: '#ee2244', dangerGlow: '#ff5577',
    safe:   '#22ccaa', safeGlow:   '#44ffcc',
  }

  readonly hazardConfig = {
    glowBlur: 10,
    pulseSpeed: 2.0,
    pulseAmplitude: 0.12,
  }

  readonly groundLineAlpha = 0.30
  readonly groundDashAlpha = 0.15

  readonly scrollSpeedBonus = SCROLL_SPEED_BONUS

  readonly particleColors = {
    hit:   '#ff5577',
    death: ['#ee2244', '#ff5577', '#cc1133', '#ff8899'] as readonly string[],
    jump:  'rgba(34,204,170,0.5)',
    land:  'rgba(20,150,120,0.4)',
  }

  // 障害物（rect / pillar）。速度感を出すため低め・細長い
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 6, wRange: [18, 36], hRange: [35, 60], safeChance: 0.15 },
    { shape: 'pillar', placement: 'ground', weightStart: 5, weightEnd: 7, wRange: [10, 18], hRange: [65, 130], safeChance: 0.10 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 5, wRange: [20, 38], hRange: [38, 60], safeChance: 0.08 },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 3, wRange: [22, 40], hRange: [20, 36], safeChance: 0.20 },
  ]

  // ─── 遠景：高速で流れる街のシルエット（パララックス強め） ─────
  override drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 街のシルエット（強めパララックス 0.12）
    px.withAlpha(0.25, () => {
      px.ridge(-30, W + 30, gY, (sx) => {
        const wx = sx - offsetX * 0.12
        return 25 + ((wx * 0.01 | 0) & 0xf) * 12 + Math.sin(wx * 0.008) * 35
      }, this.farLayerColor)
    })

    // 高速で流れる背景のスピードライン
    const t = performance.now() / 800
    px.withAlpha(0.20, () => {
      for (let i = 0; i < 8; i++) {
        const lineY = gY - 60 - i * 25
        const phase = (t * 0.6 + i * 0.25) % 1
        const lx = W * phase - (offsetX * 0.12 % W)
        px.rect(lx, lineY, 60 + i * 10, 1, '#334466')
      }
    })
  }

  // ─── 中景：街灯・看板（高速で流れる） ────────────────────────
  override drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 道路の白線（高速で流れる）
    const dashInterval = 50
    const startX = -(offsetX % dashInterval)
    px.withAlpha(0.45, () => {
      for (let x = startX; x < W; x += dashInterval) {
        px.rect(x, gY - 16, 28, 2, '#ccccaa')
      }
    })

    // 街灯（配置ハッシュ）
    const sector = Math.floor(offsetX / 200)
    px.withAlpha(0.50, () => {
      for (let s = sector - 1; s <= sector + 5; s++) {
        const h = (s * 2141) & 0xffff
        const lx = s * 200 - offsetX + (h % 80)
        const poleH = 80 + (h >> 4) % 40
        // 街灯の柱
        px.rect(lx - 2, gY - poleH, 4, poleH, '#1a1a30')
        // 街灯の光
        const glow = 0.5 + Math.sin(performance.now() / 600 + s * 2.3) * 0.2
        px.withAlpha(glow, () => px.circle(lx, gY - poleH - 4, 5, '#ffdd88'))
        // 光の拡散
        px.withAlpha(glow * 0.3, () => px.circle(lx, gY - poleH - 4, 12, '#ffdd88'))
      }
    })
  }

  // ─── プレイヤー：cyber_runner を流用 ─────────────────────────
  override drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number, animState?: PlayerAnimState): void {
    const px = new PixelCanvas(ctx)

    // 影（速度感で横に伸びる）
    px.ellipse(w / 2 + 4, h + 2, w * 0.45, 3, 'rgba(0,0,0,0.25)')

    const s: PlayerAnimState = animState ?? { vx: 0, vy: 0, onGround, runCycle, facing: 1 }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.sprite('player_cyber_runner', 0, 0, w, h, { frame, flipX })

    // 速度線の尾（走っている感）
    const tailLen = 15 + Math.sin(runCycle * Math.PI * 4) * 5
    px.withAlpha(0.3, () => {
      px.rect(-tailLen, h * 0.3, tailLen, 3, '#22ccaa')
      px.rect(-tailLen + 3, h * 0.5, tailLen - 3, 2, '#118877')
    })
  }

  // ─── 前景：速度ライン（水平の光線） ──────────────────────────
  override drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now() / 600

    // 水平の速度ライン（画面を横切る）
    px.withAlpha(0.12, () => {
      for (let i = 0; i < 10; i++) {
        const seed = Math.floor(t + i * 3.7)
        const y = ((seed * 97) % H)
        const len = SPEED_LINE_MIN_LEN + (seed % SPEED_LINE_MAX_LEN)
        const x = ((seed * 151) % W)
        const alpha = 0.12 + (seed % 10) * 0.01
        px.rect(x, y, len, 1, `rgba(255,68,102,${alpha})`)
      }
    })

    // 画面端のモーションブラー（左右から流入する線）
    px.withAlpha(0.15, () => {
      for (let i = 0; i < 4; i++) {
        const y = H * 0.2 + i * H * 0.2
        const phase = (t * 0.8 + i * 0.5) % 1
        const bx = W * phase
        px.rect(bx, y, 40, 1, '#4466aa')
      }
    })
  }

  // ─── ジャンル固有 HUD：距離 / 最高速度 ───────────────────────
  override drawGenreHUD(ctx: CanvasRenderingContext2D, world: import('../engine/types').MutableWorld, _W: number, _H: number): void {
    const px = new PixelCanvas(ctx)
    const distance = Math.floor(world.distance)
    const speed = Math.floor(world.rules.scrollSpeed)

    const font = 'bold 14px monospace'
    const padding = 6

    // パネル背景（左上）
    const panelX = 8
    const panelY = 8
    const panelW = 150
    const panelH = 38
    px.roundedRect(panelX, panelY, panelW, panelH, 'rgba(26,26,46,0.7)', 2)

    // 距離
    px.text(`DST:${distance}`, panelX + padding, panelY + 15, {
      font, fill: '#22ccaa',
    })
    // 速度
    px.text(`SPD:${speed}`, panelX + padding, panelY + 32, {
      font, fill: '#ff4466',
    })
  }
}

export default new RunnerPlugin()
