/**
 * genres/StealthActionPlugin.ts
 * 'stealth_action' ジャンル（ステルスアクション）のプラグイン。
 *
 * 暗い街・施設。見張りの警戒範囲（円錐）を避け、静止で隠密する。
 * 深夜の青黒とアスファルト。見張り兵の円錐がゆっくり回転する。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { selectPlayerFrame } from './playerBaseAnim'
import type { PlayerAnimState } from '../engine/GenrePlugin'

// 見張りの警戒円錐の回転速度（rad/s）
const GUARD_ROTATION_SPEED = 0.3
// 警戒円錐の角度幅（rad）
const CONE_ANGLE = Math.PI * 0.35
// 隠密ゲージの最大値
const STEALTH_MAX = 100
// 隠密ゲージの増加速度（per sec、静止時のみ）
const STEALTH_REGEN_RATE = 8
// 隠密ゲージの減衰速度（per frame）
const STEALTH_DECAY_RATE = 15
// 半透明演出の閾値
const STEALTH_GHOST_THRESHOLD = 50
// エッジグローの閾値
const STEALTH_GLOW_THRESHOLD = 30

export class StealthActionPlugin extends GenrePluginBase {
  readonly id: GenreId = 'stealth_action'

  readonly skyColors    = ['#05070d', '#0a0f1a'] as const
  readonly groundColors = ['#0d1118', '#080c12'] as const
  readonly farLayerColor  = '#0a0e18'
  readonly midLayerColor  = '#0f1420'
  readonly starColor: string | undefined = undefined

  readonly palette = {
    danger: '#cc2222', dangerGlow: '#ff4444',
    safe:   '#224466', safeGlow:   '#4488aa',
  }

  readonly hazardConfig = {
    glowBlur: 8,
    pulseSpeed: 0.6,
    pulseAmplitude: 0.05,
  }

  readonly groundLineAlpha = 0.06
  readonly groundDashAlpha = 0.03

  readonly particleColors = {
    hit:   '#ff4444',
    death: ['#cc2222', '#ff4444', '#881111', '#ff6666'] as readonly string[],
    jump:  'rgba(34,68,102,0.35)',
    land:  'rgba(20,40,60,0.3)',
  }

  // 見張り（pillar 型が主）。安全領域は狭め
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'pillar', placement: 'ground', weightStart: 8, weightEnd: 7, wRange: [14, 22], hRange: [80, 140], safeChance: 0.05 },
    { shape: 'rect',   placement: 'ground', weightStart: 4, weightEnd: 5, wRange: [24, 44], hRange: [34, 58], safeChance: 0.10 },
    { shape: 'spike',  placement: 'ground', weightStart: 1, weightEnd: 3, wRange: [22, 38], hRange: [34, 54], safeChance: 0.08 },
  ]

  // 隠密ゲージの現在値（per-instance 状態。HUD 描画専用）
  private _stealthGauge = 0

  // ─── 遠景：建物の窓（点灯した窓が点滅） ───────────────────────
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now() / 1500

    // 建物のシルエット（暗い）
    px.withAlpha(0.30, () => {
      const sector = Math.floor(offsetX * 0.03 / 180)
      for (let s = sector - 1; s <= sector + 4; s++) {
        const h = (s * 1999) & 0xffff
        const bx = s * 180 - offsetX * 0.03 + (h % 80)
        const bh = 80 + (h >> 4) % 70
        const bw = 30 + (h >> 8) % 40
        px.rect(bx, gY - bh, bw, bh, this.farLayerColor)

        // 窓の灯り（ハッシュから決定論的に配置、点滅）
        const winCount = 2 + (h & 3)
        for (let wi = 0; wi < winCount; wi++) {
          const wx = bx + 4 + wi * (bw - 8) / Math.max(1, winCount - 1)
          const wy = gY - bh + 8 + ((h >> (wi + 4)) % 30)
          // 点滅：時間関数 + 窓固有の位相
          const flicker = 0.3 + Math.sin(t * 0.8 + s * 2.3 + wi * 1.1) * 0.25
          if (flicker > 0.35) {
            px.withAlpha(flicker * 0.6, () => px.rect(wx, wy, 3, 4, '#ffdd88'))
          }
        }
      }
    })
  }

  // ─── 中景：見張りの警戒円錐 ──────────────────────────────────
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now()

    // 見張り兵の配置
    const sector = Math.floor(offsetX / 220)
    for (let s = sector - 1; s <= sector + 4; s++) {
      const h = (s * 2347) & 0xffff
      const gx = s * 220 - offsetX + (h % 100)
      const guardH = 70 + (h >> 4) % 50

      // 見張り兵のシルエット
      px.withAlpha(0.60, () => {
        px.rect(gx - 5, gY - guardH, 10, guardH, '#0a0e18')
        // 頭
        px.circle(gx, gY - guardH - 6, 6, '#0a0e18')
      })

      // 警戒円錐（半透明の扇形、ゆっくり回転）
      const angle = (t / 1000) * GUARD_ROTATION_SPEED + s * 1.7
      const coneLen = 120 + (h >> 8) % 60
      const startA = angle - CONE_ANGLE / 2
      const endA = angle + CONE_ANGLE / 2

      // 円錐の描画（arcBlocks でブロック円弧を表現）
      px.withAlpha(0.12, () => {
        px.arcBlocks(gx, gY - guardH, coneLen, startA, endA, '#cc4422', 2)
      })
      // 円錐の中心線（より明るく）
      const midA = angle
      const ex = gx + coneLen * Math.cos(midA)
      const ey = (gY - guardH) + coneLen * Math.sin(midA)
      px.line(gx, gY - guardH, ex, ey, 'rgba(255,102,68,0.12)', 1)
    }
  }

  // ─── プレイヤー：explorer を暗色で、隠密時は半透明 ────────────
  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number, animState?: PlayerAnimState): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.36, 4, 'rgba(0,0,0,0.30)')

    // 隠密中の半透明演出（ゲージが閾値以上なら半透明）
    const stealthAlpha = this._stealthGauge >= STEALTH_GHOST_THRESHOLD ? 0.45 : 1.0
    const s: PlayerAnimState = animState ?? { vx: 0, vy: 0, onGround, runCycle, facing: 1 }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.withAlpha(stealthAlpha, () => {
      px.sprite('player_explorer', 0, 0, w, h, { frame, flipX })
    })

    // 隠密中のエッジグロー（ゲージが閾値以上）
    if (this._stealthGauge >= STEALTH_GLOW_THRESHOLD) {
      const glowAlpha = Math.max(0.125, (this._stealthGauge - STEALTH_GLOW_THRESHOLD) / 70 * 0.25)
      px.halo((expand, _c) => px.rect(-expand, -expand, w + expand * 2, h + expand * 2, `rgba(68,136,204,${glowAlpha})`), '', 2)
    }
  }

  // ─── 前景：暗闇のビネット ────────────────────────────────────
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)

    // 強めのビネット（視界制限）。中心だけ明るく、四隅が暗い
    const vignetteStrength = 0.55
    px.bandRadial(
      W / 2, H * 0.45,
      Math.min(W, H) * 0.15, Math.max(W, H) * 0.65,
      [
        [0, 'rgba(0,0,0,0)'],
        [0.4, 'rgba(0,0,0,0)'],
        [1, `rgba(0,0,0,${vignetteStrength})`],
      ],
      8,
    )
  }

  // ─── ジャンル固有 HUD：隠密ゲージ ─────────────────────────────
  drawGenreHUD(ctx: CanvasRenderingContext2D, world: import('../engine/types').MutableWorld, W: number, _H: number): void {
    const px = new PixelCanvas(ctx)

    // 隠密ゲージを更新（静止時のみ回復）
    const vx = world.player.vx
    if (Math.abs(vx) < 10) {
      this._stealthGauge = Math.min(STEALTH_MAX, this._stealthGauge + STEALTH_REGEN_RATE * 0.016)
    } else {
      this._stealthGauge = Math.max(0, this._stealthGauge - STEALTH_DECAY_RATE * 0.016)
    }

    const gaugeW = 160
    const gaugeH = 12
    const gaugeX = W - gaugeW - 12
    const gaugeY = 12

    // パネル背景
    px.roundedRect(gaugeX - 4, gaugeY - 4, gaugeW + 8, gaugeH + 8, 'rgba(5,7,13,0.7)', 2)

    // ゲージ背景
    px.roundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 'rgba(15,20,32,0.8)', 1)

    // ゲージ充填（左から右へ）
    const fillW = (this._stealthGauge / STEALTH_MAX) * gaugeW
    if (fillW > 0) {
      const gaugeColor = this._stealthGauge >= STEALTH_GHOST_THRESHOLD ? '#44aaff' : '#2266aa'
      px.roundedRect(gaugeX, gaugeY, fillW, gaugeH, gaugeColor, 1)
    }

    // ラベル
    px.text('STEALTH', gaugeX + gaugeW / 2, gaugeY - 6, {
      font: 'bold 10px monospace', fill: '#6688aa', align: 'center',
    })
  }
}

export default new StealthActionPlugin()
