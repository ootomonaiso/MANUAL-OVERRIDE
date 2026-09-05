/**
 * genres/AerialStgPlugin.ts
 * 'aerial_stg' ジャンル（縦スクロールシューティング）のプラグイン。
 *
 * 雲の上の空・高高度の大気圏内。上空から見下ろした雲海が上から下へ流れる背景。
 * プレイヤーは高高度を飛ぶ戦闘機で、上から迫る敵機・爆撃機・ミサイルを撃ち落とす。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { Hazard } from '../game/entities'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { PIXELART } from '../data/tunables'

// 炎の明滅（2値点滅）の頻度。新しい状態は追加せず、既存の値に掛けて floor%2 で判定する
const FLAME_FLICKER_RATE = 6

export class AerialStgPlugin extends GenrePluginBase {
  readonly id: GenreId = 'aerial_stg'

  // 機体を機首=上で描くため、縦スクロール時の engine 側 -90° 回転を無効化する（#102 の二重回転回避）
  readonly spriteFacesUp = true

  // STG バランス修正: 敵の速度を緩やかに（ユーザー指摘: 敵速すぎ）
  readonly scrollSpeedBonus = -80

  readonly skyColors    = ['#050a18', '#0d1f3c'] as const
  readonly groundColors = ['#091520', '#091520'] as const
  readonly farLayerColor  = '#0a1830'
  readonly midLayerColor  = '#0c1424'
  readonly starColor      = '#dfe8ff'

  readonly palette = {
    danger: '#ff4b4b', dangerGlow: '#ff8a6a',
    safe:   '#3fa0ff', safeGlow:   '#9fd0ff',
  }

  // engine が drawFarLayer/drawMidLayer に distance*parallax を offsetX として渡す。
  // far=遠景雲の Y スクロール量(=distance)、mid=中景雲(=distance×1.5 で遠景より速い)。
  readonly parallax = {
    stars: 0.02,
    far:   1.0,
    mid:   1.5,
  }

  readonly starConfig = {
    density: 18,
    sizeRange: [1, 2] as [number, number],
    alphaRange: [0.3, 0.7] as [number, number],
  }

  readonly hazardConfig = {
    glowBlur: 14,
    pulseSpeed: 2.0,
    pulseAmplitude: 0.1,
  }

  readonly particleColors = {
    hit:   '#ffb08a',
    death: ['#ff5a3c', '#ff9a3c', '#ffd23c', '#ffffff'] as readonly string[],
    jump:  'rgba(120,200,255,0.6)',
    land:  'rgba(80,150,220,0.5)',
  }

  // 縦モードでも遠景・中景レイヤー（空・雲）を描画する
  readonly verticalBackgroundLayers = true

  // ─── 描画カラー（ハードコード回避のため readonly に集約） ──────────
  private readonly jetColors = {
    flameCore: '#bfe6ff', flameMid: '#ff9a3c', flameTip: 'rgba(255,180,80,0.5)',
  }
  private readonly bomberColors = { engine: '#ff7a3c' }
  private readonly missileColors = { flame: '#ffce6a' }

  // 遠景: 空グラデーション（深い夜空→明るい青）
  private readonly farSkyGrad = {
    top: '#0a1628',
    bot: '#1a4a7a',
  }

  // 遠景雲（薄く・小さく・Math.sin 決定的擬似ランダム配置）
  private readonly farCloudCfg = {
    count:      7,
    tileH:      320,
    minR:       5,
    rangeR:     12,
    alphaBase:  0.16,
    alphaRange: 0.20,
    colors: ['#dcebfa', '#c8daf0'] as readonly string[],
  }

  // 中景雲塊（ブロック塊、全画面に散らばる）
  private readonly midCloudCfg = {
    count:      5,
    tileH:      240,
    minR:       20,
    rangeR:     36,
    alphaBase:  0.30,
    alphaRange: 0.30,
    colors: ['#f0f8ff', '#a0b9d2'] as readonly string[],
  }

  private readonly hudColors = {
    bracket:  'rgba(0,255,136,0.65)',
    vignette: 'rgba(0,0,0,0.55)',
  }

  private readonly hpBar = {
    segGap: 2, height: 4, offsetY: 10, threshold: 0.4,
    high: '#5ad65a', low: '#d65a5a', bg: 'rgba(0,0,0,0.5)',
  }

  // 縦モード: 全ハザードが画面上端からスポーン。placement は無視される。
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'diamond', placement: 'air', weightStart: 2, weightEnd: 6, wRange: [24, 34], hRange: [26, 38], safeChance: 0, hpOverride: 2 },
    { shape: 'rect',    placement: 'air', weightStart: 1, weightEnd: 4, wRange: [40, 60], hRange: [24, 36], safeChance: 0, hpOverride: 2 },
    { shape: 'pillar',  placement: 'air', weightStart: 1, weightEnd: 5, wRange: [12, 18], hRange: [40, 64], safeChance: 0, hpOverride: 2 },
  ]

  // ════════════════════════════════════════════════════════════════
  // 背景（高高度の空・雲海）
  // ════════════════════════════════════════════════════════════════

  // 遠景: 空グラデーション + 遠景雲（薄く・小さく）。上から下へ流れる。
  // engine が渡す offsetX = distance * parallax.far を Y スクロール量として使う。
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)
    const scrollY = offsetX   // Y 方向スクロール量（distance × parallax.far）
    const H  = gY
    const sg = this.farSkyGrad
    const c  = this.farCloudCfg

    // 空グラデーション: 上部 #0a1628（深い夜空）→ 下部 #1a4a7a（明るい青）
    px.bandGradient(0, 0, W, H, [[0, sg.top], [1, sg.bot]], 'v', PIXELART.gradientSteps)

    // 遠景の雲: タイル分割して Y スクロール、Math.sin ベース決定的配置
    const sector = Math.floor(scrollY / c.tileH)
    const rows   = Math.ceil(H / c.tileH) + 2
    for (let s = sector + 1; s >= sector - rows; s--) {
      const baseY = scrollY - s * c.tileH
      for (let i = 0; i < c.count; i++) {
        const seed = s * 83.7 + i * 29.3
        const cx   = this._rand(seed)             * W
        const cy   = baseY + this._rand(seed + 1) * c.tileH
        if (cy + c.minR + c.rangeR < 0 || cy - c.minR - c.rangeR > H) continue
        const r  = c.minR + this._rand(seed + 2) * c.rangeR
        const a  = c.alphaBase + this._rand(seed + 3) * c.alphaRange
        const ci = Math.floor(this._rand(seed + 4) * c.colors.length)
        px.withAlpha(a, () => this._drawCloud(px, cx, cy, r, c.colors[ci]))
      }
    }
  }

  // 中景: 雲塊（ブロック円の組み合わせ）を全画面に散らばらせる。
  // engine が渡す offsetX = distance * parallax.mid を Y スクロール量として使う（遠景より速い）。
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)
    const scrollY = offsetX   // distance × 1.5（遠景より速い Y スクロール）
    const H       = gY
    const c       = this.midCloudCfg
    const sector  = Math.floor(scrollY / c.tileH)
    const rows    = Math.ceil(H / c.tileH) + 2

    for (let s = sector + 1; s >= sector - rows; s--) {
      const baseY = scrollY - s * c.tileH
      for (let i = 0; i < c.count; i++) {
        const seed = s * 61.3 + i * 19.7
        const cx   = this._rand(seed)             * W
        const cy   = baseY + this._rand(seed + 1) * c.tileH
        if (cy + c.minR + c.rangeR < 0 || cy - c.minR - c.rangeR > H) continue
        const r  = c.minR + this._rand(seed + 2) * c.rangeR
        const a  = c.alphaBase + this._rand(seed + 3) * c.alphaRange
        const ci = Math.floor(this._rand(seed + 4) * c.colors.length)
        px.withAlpha(a, () => this._drawCloud(px, cx, cy, r, c.colors[ci]))
      }
    }
  }

  // 前景: ビネット + 四隅 HUD ブラケット（横スクロール前提の演出は廃止）。
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)
    const hc = this.hudColors
    const m = 18, len = 26
    const corners = [
      [m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1],
    ] as const
    for (const [cx, cy, dx, dy] of corners) {
      px.line(cx, cy + dy * len, cx, cy, hc.bracket, 1)
      px.line(cx, cy, cx + dx * len, cy, hc.bracket, 1)
    }
    px.bandRadial(W / 2, H / 2, Math.min(W, H) * 0.35, Math.max(W, H) * 0.72, [
      [0, 'rgba(0,0,0,0)'],
      [1, hc.vignette],
    ], PIXELART.gradientSteps)
  }

  // 雲の塊（ブロック円の組み合わせ。ドット絵らしい明瞭な塊で表現する）
  private _drawCloud(px: PixelCanvas, cx: number, cy: number, r: number, color: string): void {
    const lobes = [[-r, 0.2 * r, 0.7], [0, -0.2 * r, 1.0], [r, 0.15 * r, 0.75], [r * 1.8, 0.3 * r, 0.5]] as const
    for (const [dx, dy, rr] of lobes) {
      px.circle(cx + dx, cy + dy, r * rr, color)
    }
  }

  // Math.sin ベースの決定的擬似乱数（0..1）。配置がフレーム間で飛ばないよう一切変更しない
  private _rand(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }

  // ════════════════════════════════════════════════════════════════
  // プレイヤー（近代戦闘機・俯瞰視点）
  // ════════════════════════════════════════════════════════════════

  // 縦スクロール時 sideScroller._drawPlayer() が -90° 回転を適用し、
  // 「ローカル座標で右向き」を前提としている。本プラグインは元々「機首が上」で
  // 描いており、回転後は機首が左を向いてしまう不具合があった（Q5 で確認・修正承認）。
  // スプライトは右向きで作り、回転後に正しく上を向くようにする。
  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)
    const cy = h / 2
    const jc = this.jetColors

    // 後方エンジン炎（機体の箱からはみ出すため専用プリミティブとして残す。
    // player_base の影・StgPlugin の炎と同じ方針）
    const flicker = Math.floor(runCycle * FLAME_FLICKER_RATE) % 2 === 0
    const flameLen = flicker ? h * 0.22 : h * 0.30
    px.tri(-flameLen, cy - h * 0.14, flameLen + w * 0.42, h * 0.28, 'left', jc.flameTip)
    px.tri(-flameLen * 0.6, cy - h * 0.08, flameLen * 0.6 + w * 0.42, h * 0.16, 'left', jc.flameMid)
    px.tri(-flameLen * 0.3, cy - h * 0.04, flameLen * 0.3 + w * 0.42, h * 0.08, 'left', jc.flameCore)

    px.sprite('player_aerial', 0, 0, w, h)
  }

  // ════════════════════════════════════════════════════════════════
  // ハザード（敵機・爆撃機・ミサイル）
  // ════════════════════════════════════════════════════════════════

  drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, world: MutableWorld): boolean {
    const px = new PixelCanvas(ctx)
    const x  = sx
    const y  = hazard.y
    const w  = hazard.w
    const hh = hazard.h

    px.halo((expand, c) => px.rect(x - expand, y - expand, w + expand * 2, hh + expand * 2, c),
      hazard.glowColor, PIXELART.haloSteps)

    switch (hazard.shape) {
      case 'rect':   this._drawBomber(px, x, y, w, hh, hazard.color); break
      case 'pillar': this._drawMissile(px, x, y, w, hh, hazard.color, hazard.pulse); break
      default:       this._drawEnemyFighter(px, x, y, w, hh, hazard.color)
    }

    if (world.rules.features.has('enemy_hp') && hazard.maxHp > 1) {
      this._drawHpBar(px, x, y, w, hazard.hp, hazard.maxHp)
    }
    return true
  }

  // diamond → 敵戦闘機（機首が下・赤みがかったシルエット）
  private _drawEnemyFighter(px: PixelCanvas, x: number, y: number, w: number, h: number, color: string): void {
    px.sprite('enemy_aerial_fighter', x, y, w, h, {
      slots: { main: color, shade: this._shade(color, -55), light: this._shade(color, 55) },
    })
  }

  // rect → 爆撃機（横長・重装甲・複数エンジン）
  private _drawBomber(px: PixelCanvas, x: number, y: number, w: number, h: number, color: string): void {
    px.sprite('enemy_aerial_bomber', x, y, w, h, {
      slots: { main: color, shade: this._shade(color, -55), light: this._shade(color, 55) },
    })
    const bc = this.bomberColors
    for (const fx of [0.22, 0.40, 0.60, 0.78]) {
      px.circle(x + w * fx, y + h * 0.62, Math.max(2, w * 0.03), bc.engine)
    }
  }

  // pillar → ミサイル（細長い円筒・後方に炎）
  private _drawMissile(px: PixelCanvas, x: number, y: number, w: number, h: number, color: string, pulse: number): void {
    const mc = this.missileColors
    // 炎（本体の箱の外・上方向にはみ出すため別描画）
    const flicker = Math.floor(pulse * FLAME_FLICKER_RATE) % 2 === 0
    const jitter = flicker ? 0 : w * 0.15
    px.withAlpha(0.8, () => {
      px.tri(x + w * 0.30, y - 12 - jitter, w * 0.40, 12 + jitter, 'up', mc.flame)
    })

    px.sprite('enemy_aerial_missile', x, y, w, h, {
      slots: { main: color, shade: this._shade(color, -55) },
    })
  }

  // enemy_hp 用セグメント式 HP バー
  private _drawHpBar(px: PixelCanvas, x: number, y: number, w: number, hp: number, maxHp: number): void {
    const b    = this.hpBar
    const segW = (w - b.segGap * (maxHp - 1)) / maxHp
    const barY = y - b.offsetY
    const color = hp / maxHp > b.threshold ? b.high : b.low
    for (let i = 0; i < maxHp; i++) {
      const segX = x + i * (segW + b.segGap)
      px.rect(segX, barY, segW, b.height, b.bg)
      if (i < hp) px.rect(segX, barY, segW, b.height, color)
    }
  }

  // hex 色を amount だけ増減した rgb 文字列を返す（非 hex はそのまま返す）
  private _shade(hex: string, amount: number): string {
    if (!hex.startsWith('#') || hex.length < 7) return hex
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
    const cl = (v: number): number => Math.max(0, Math.min(255, v + amount))
    return `rgb(${cl(r)},${cl(g)},${cl(b)})`
  }
}

export default new AerialStgPlugin()
