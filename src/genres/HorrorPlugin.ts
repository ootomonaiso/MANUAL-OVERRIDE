/**
 * genres/HorrorPlugin.ts
 * 'horror' ジャンル（サバイバルホラー）のプラグイン。
 *
 * ほぼ漆黒。視界が限られ、明かりが点滅する。正気を保つ。
 * プレイヤー周囲だけ明るく、暗闇に浮かぶ赤い目がハザード。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { selectPlayerFrame } from './playerBaseAnim'
import type { PlayerAnimState } from '../engine/GenrePlugin'
import { hash01 } from './hashUtil'

// 正気ゲージの最大値
const SANITY_MAX = 100
// 正気ゲージの自然減速度（per sec）
const SANITY_DECAY_RATE = 1.5
// 正気ゲージの初期値
const SANITY_INITIAL = 100
// 明かりの点滅周期（ms）
const LIGHT_FLICKER_PERIOD = 2000
// ビネットの中心半径比
const VIGNETTE_INNER_RATIO = 0.20
// ビネットの外側半径比
const VIGNETTE_OUTER_RATIO = 0.80

export class HorrorPlugin extends GenrePluginBase {
  readonly id: GenreId = 'horror'

  readonly skyColors    = ['#020202', '#050508'] as const
  readonly groundColors = ['#0a0a0d', '#060608'] as const
  readonly farLayerColor  = '#040406'
  readonly midLayerColor  = '#08080a'
  readonly starColor: string | undefined = undefined

  readonly palette = {
    danger: '#cc0000', dangerGlow: '#ff2222',
    safe:   '#1a1a1a', safeGlow:   '#333333',
  }

  readonly hazardConfig = {
    glowBlur: 16,
    pulseSpeed: 0.5,
    pulseAmplitude: 0.15,
  }

  readonly groundLineAlpha = 0.02
  readonly groundDashAlpha = 0.01

  readonly particleColors = {
    hit:   '#ff2222',
    death: ['#cc0000', '#ff2222', '#880000', '#aa0000'] as readonly string[],
    jump:  'rgba(100,0,0,0.2)',
    land:  'rgba(60,0,0,0.15)',
  }

  // 暗闇に浮かぶ目（円形）が主。他に柱・壁
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 5, weightEnd: 4, wRange: [20, 40], hRange: [30, 55], safeChance: 0.05 },
    { shape: 'pillar', placement: 'ground', weightStart: 6, weightEnd: 5, wRange: [14, 22], hRange: [80, 150], safeChance: 0.03 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 3, wRange: [20, 36], hRange: [32, 52], safeChance: 0.02 },
    { shape: 'diamond', placement: 'float', weightStart: 3, weightEnd: 4, wRange: [16, 24], hRange: [16, 24], safeChance: 0.02 },
  ]

  // 正気ゲージの現在値（per-instance 状態。HUD 描画専用）
  private _sanity = SANITY_INITIAL
  // 最後の更新時刻（ms）
  private _lastUpdate = 0

  // ─── 遠景：ほぼ見えない（暗闇）。遠くの明かりが点滅 ───────────
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now()

    // 遠くの明かり（暗く、点滅）
    px.withAlpha(0.125, () => {
      const sector = Math.floor(offsetX * 0.02 / 300)
      for (let s = sector - 1; s <= sector + 3; s++) {
        const h = (s * 3011) & 0xffff
        const lx = s * 300 - offsetX * 0.02 + (h % 150)
        // 点滅：時間関数で決定的
        const flicker = 0.3 + Math.sin(t / LIGHT_FLICKER_PERIOD + s * 2.7) * 0.2
        if (flicker > 0.3) {
          const a = flicker * 0.4
          px.rect(lx, gY * 0.3 + (h >> 8) % (gY * 0.2), 3, 3, `rgba(255,170,102,${a})`)
        }
      }
    })
  }

  // ─── 中景：歪んだ柱・扉のシルエット（暗く） ────────────────────
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 柱の配置（極めて暗く）
    const sector = Math.floor(offsetX / 250)
    px.withAlpha(0.25, () => {
      for (let s = sector - 1; s <= sector + 4; s++) {
        const h = (s * 2579) & 0xffff
        const pxPos = s * 250 - offsetX + (h % 120)
        const pillarH = 90 + (h >> 4) % 60
        // 歪んだ柱（幅が不規則）
        const wTop = 8 + (h & 1) * 4
        const wBot = 10 + ((h >> 1) & 1) * 4
        px.rect(pxPos - wBot / 2, gY - pillarH, wBot, pillarH, this.midLayerColor)
        // 柱頭
        px.rect(pxPos - wTop, gY - pillarH, wTop * 2, 6, this.midLayerColor)

        // 扉のシルエット（ occasional ）
        if ((h >> 6) & 1) {
          const doorH = pillarH * 0.7
          const doorW = 14
          px.rect(pxPos + 20, gY - doorH, doorW, doorH, '#060608')
          // 取っ手（赤い目風）
          const eyeGlow = 0.4 + Math.sin(performance.now() / 800 + s) * 0.3
          px.withAlpha(eyeGlow, () => px.circle(pxPos + 20 + doorW - 3, gY - doorH * 0.5, 2, '#cc0000'))
        }
      }
    })
  }

  // ─── プレイヤー：explorer を暗色で、周囲だけ明かす ────────────
  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number, animState?: PlayerAnimState): void {
    const px = new PixelCanvas(ctx)

    // 影（ほとんど見えない）
    px.withAlpha(0.15, () => px.ellipse(w / 2, h + 2, w * 0.36, 3, 'rgba(0,0,0,0.3)'))

    const s: PlayerAnimState = animState ?? { vx: 0, vy: 0, onGround, runCycle, facing: 1 }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.sprite('player_explorer', 0, 0, w, h, { frame, flipX })

    // 明かりの輪（プレイヤー周囲をわずかに照らす）
    const lightFlicker = 0.5 + Math.sin(performance.now() / LIGHT_FLICKER_PERIOD) * 0.2
    const haloAlpha = Math.max(0.125, lightFlicker * 0.15)
    px.halo((expand, _c) => px.circle(w / 2, h / 2, 20 + expand, `rgba(255,204,136,${haloAlpha})`), '', 3)
  }

  // ─── 前景：強めのビネット + 明かりの点滅 ─────────────────────
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now()

    // 1. 強めのビネット（視界制限）。中心だけ明るく、周囲は漆黒
    const flicker = 0.85 + Math.sin(t / LIGHT_FLICKER_PERIOD * 1.3) * 0.1
    px.bandRadial(
      W / 2, H * 0.42,
      W * VIGNETTE_INNER_RATIO, W * VIGNETTE_OUTER_RATIO,
      [
        [0, 'rgba(0,0,0,0)'],
        [0.5, 'rgba(0,0,0,0)'],
        [1, `rgba(0,0,0,${0.88 * flicker})`],
      ],
      10,
    )

    // 2. 明かりの点滅（ランダムな矩形がちらつく）
    const noiseSeed = Math.floor(t / 200)
    for (let i = 0; i < 4; i++) {
      const seed = noiseSeed + i * 6361
      const hashVal = hash01(seed)
      if (hashVal > 0.95) {
        const nx = hash01(seed + 1) * W
        const ny = hash01(seed + 2) * H
        const nw = 2 + hash01(seed + 3) * 6
        const nh = 2 + hash01(seed + 4) * 4
        px.rect(nx, ny, nw, nh, `rgba(255,221,170,${hashVal * 0.08})`)
      }
    }

    // 3. 走査線（ホラー感）
    for (let y = 0; y < H; y += 4) {
      px.rect(0, y, W, 1, 'rgba(0,0,0,0.06)')
    }
  }

  // ─── ジャンル固有 HUD：正気ゲージ ─────────────────────────────
  drawGenreHUD(ctx: CanvasRenderingContext2D, _world: import('../engine/types').MutableWorld, _W: number, _H: number): void {
    const px = new PixelCanvas(ctx)
    const now = performance.now()

    // 正気ゲージを時間経過で減少
    if (this._lastUpdate > 0) {
      const dt = (now - this._lastUpdate) / 1000
      this._sanity = Math.max(0, this._sanity - SANITY_DECAY_RATE * dt)
    }
    this._lastUpdate = now

    const gaugeW = 140
    const gaugeH = 10
    const gaugeX = 12
    const gaugeY = 12

    // パネル背景
    px.roundedRect(gaugeX - 3, gaugeY - 3, gaugeW + 6, gaugeH + 6, 'rgba(2,2,2,0.7)', 2)

    // ゲージ背景
    px.roundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 'rgba(20,0,0,0.6)', 1)

    // ゲージ充填（右から左へ減っていく）
    const fillRatio = this._sanity / SANITY_MAX
    const fillW = fillRatio * gaugeW
    if (fillW > 0) {
      const gaugeColor = this._sanity > 50 ? '#cc2222' : this._sanity > 25 ? '#881111' : '#550000'
      px.roundedRect(gaugeX + gaugeW - fillW, gaugeY, fillW, gaugeH, gaugeColor, 1)
    }

    // ラベル
    px.text('SANITY', gaugeX + gaugeW / 2, gaugeY - 5, {
      font: 'bold 10px monospace', fill: '#662222', align: 'center',
    })
  }
}

export default new HorrorPlugin()
