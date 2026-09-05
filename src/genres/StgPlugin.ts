/**
 * genres/StgPlugin.ts
 * 'stg' ジャンル（宇宙シューティング）のプラグイン。
 *
 * 敵は単純な図形ではなく、エイリアン戦闘機（diamond）と装甲砲艦（rect）として
 * 描き分ける。画面前景には走査線・ビネット・コックピットHUD枠・流れる光条などの
 * SF 装飾を重ねて密度を上げる。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { Hazard } from '../game/entities'
import { PixelCanvas } from '../game/render'
import { PIXELART } from '../data/tunables'

// エンジン炎の明滅（2フレーム相当）を切り替える速さ。sideScroller から渡される
// runCycle / hazard.pulse は連続値のため、この係数を掛けてから floor%2 で判定する
const FLAME_FLICKER_RATE = 6

export class StgPlugin extends GenrePluginBase {
  readonly id = 'stg' as const
  readonly skyColors    = ['#000005', '#05050f'] as const
  readonly groundColors = ['#05050a', '#020205'] as const
  readonly farLayerColor  = '#050520'
  readonly midLayerColor  = '#050520'
  readonly starColor      = '#ffffff'
  readonly palette = {
    danger: '#e17055', dangerGlow: '#fd79a8',
    safe:   '#0984e3', safeGlow:   '#74b9ff',
  }

  // SF らしいヒット・死亡エフェクト色
  readonly particleColors = {
    hit:   '#88ffff',
    death: ['#88ffff', '#4488ff', '#ffffff', '#aa66ff'] as readonly string[],
    jump:  'rgba(120,200,255,0.6)',
    land:  'rgba(80,140,255,0.5)',
  }

  // 上下左右に動ける宇宙戦の敵配置。地面を持たず空中・浮遊で構成し、
  // 距離後半ほど密度が増す（weightStart 低め → weightEnd 高め）。
  // hpOverride: enemy_hp 有効時の敵HPを2に固定（1800→1100 の高密度と合わせて調整）。
  // safeChance: 0 で安全敵（青）を完全排除（STG では敵はすべて危険）。
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'diamond', placement: 'float', weightStart: 3, weightEnd: 6, wRange: [26, 40], hRange: [26, 40], floatAmpRange: [60, 130], hpOverride: 2, safeChance: 0 },
    { shape: 'rect',    placement: 'air',   weightStart: 2, weightEnd: 5, wRange: [24, 42], hRange: [24, 40], hpOverride: 2, safeChance: 0 },
    { shape: 'diamond', placement: 'float', weightStart: 1, weightEnd: 5, wRange: [20, 30], hRange: [20, 30], floatAmpRange: [90, 170], pulseSpeed: 3.0, hpOverride: 2, safeChance: 0 },
    { shape: 'rect',    placement: 'float', weightStart: 0, weightEnd: 4, wRange: [18, 30], hRange: [18, 30], floatAmpRange: [40, 110], hpOverride: 2, safeChance: 0 },
  ]

  // spawnDensity is sourced from JSON config (stg.json) — see genres/index.ts merge
  // scrollSpeedBonus: STG は敵を撃てる時間を稼ぐため、スクロールを軽く減速する。
  // -80 は BASE_SCROLL_SPEED(300) + tempo bonus に対して相対的に -27% の補正。
  readonly scrollSpeedBonus = -80

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 遠方の恒星（巨大なグロー）。セクター移動でゆっくり横切る
    const sunX = ((-offsetX * 0.08) % (W * 2.2) + W * 2.2) % (W * 2.2) - W * 0.4
    const sunY = gY * 0.26
    px.bandRadial(sunX, sunY, 0, 200, [
      [0, 'rgba(180,210,255,0.55)'],
      [0.25, 'rgba(90,130,255,0.20)'],
      [1, 'transparent'],
    ], PIXELART.gradientSteps)
    px.circle(sunX, sunY, 12, 'rgba(230,240,255,0.85)')

    // 遠景の星雲（ディザで表現。既定はディザ・後退条件は 00-rendering-system.md §8 D8）
    const nebulae: readonly [number, string][] = [
      [0.30, '#3344ff'],
      [0.62, '#aa33cc'],
    ]
    for (const [phase, color] of nebulae) {
      const nx = (((-offsetX * 0.15 + phase * W * 3) % (W * 1.5)) + W * 1.5) % (W * 1.5) - W * 0.25
      px.withAlpha(0.4, () => {
        px.dither(nx - 240, gY * 0.4 - 240, 480, 480, color, 'transparent', 0.35)
      })
    }

    // 明るい瞬く星（決定的配置 + 時間で明滅）
    const t = performance.now() / 1000
    const sector = Math.floor(offsetX / 360)
    for (let s = sector - 1; s <= sector + 2; s++) {
      for (let i = 0; i < 4; i++) {
        const hsh = ((s * 73856093) ^ (i * 19349663)) >>> 0
        const bx = s * 360 - offsetX * 0.12 + (hsh % 360)
        const by = (hsh >>> 9) % Math.floor(gY * 0.7)
        if (bx < 0 || bx > W) continue
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + (hsh % 100)))
        px.withAlpha(twinkle * 0.9, () => {
          px.rect(bx - 1.6, by - 1.6, 3.2, 3.2, '#cfe6ff')
        })
      }
    }
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 遠くを横切る惑星（セクターごとに決定的に配置）
    const sector = Math.floor(offsetX / 900)
    for (let s = sector - 1; s <= sector + 2; s++) {
      const h = (s * 2654435761) >>> 0
      const planetX = s * 900 - offsetX * 0.5 + (h % 400)
      const planetY = gY * 0.18 + ((h >>> 6) % Math.floor(gY * 0.45))
      const pr = 28 + (h >>> 12) % 46
      if (planetX < -pr * 2 || planetX > W + pr * 2) continue
      const hue = (h >>> 18) % 360
      // リング（一部の惑星のみ）。惑星本体より先に描き、本体で中央を隠すことで
      // 左右にはみ出すリングとして見せる
      if ((h & 3) === 0) {
        px.ellipse(planetX, planetY, pr * 1.6, pr * 0.4, `hsla(${hue}, 50%, 70%, 0.3)`)
      }
      px.bandRadial(planetX, planetY, 0, pr, [
        [0, `hsla(${hue}, 60%, 55%, 0.5)`],
        [1, `hsla(${hue}, 70%, 18%, 0.5)`],
      ], PIXELART.gradientSteps)
    }
    // 近めの星雲光
    const nx = (-offsetX * 0.3) % W
    px.withAlpha(0.3, () => {
      px.dither(nx - 220, gY * 0.55 - 220, 440, 440, '#5566ff', 'transparent', 0.3)
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    // エンジン炎（スプライトの箱からはみ出すため、専用プリミティブとして別描画する。
    // 影を専用プリミティブとして残した player_base の方針を踏襲）
    const flicker = Math.floor(runCycle * FLAME_FLICKER_RATE) % 2 === 0
    const flame = w * (flicker ? 0.32 : 0.42)
    for (const ny of [h * 0.32, h * 0.68]) {
      // 自機は右向き、炎は左（後方）へ伸びる。tip(左)が細く、付け根(右)が太い
      px.tri(-flame, ny - h * 0.06, flame + w * 0.05, h * 0.12, 'left', '#66ddff')
    }

    px.sprite('player_stg', 0, 0, w, h)
  }

  // ─── 敵描画（デフォルト図形を上書きしてメカニカルな見た目にする） ─────
  drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, sx: number, world: MutableWorld): boolean {
    const floatY = h.floatAmp > 0 ? Math.sin(h.pulse) * h.floatAmp : 0
    const x = sx
    const y = h.y + floatY
    const pulse = Math.sin(h.pulse * 3) * 0.5 + 0.5  // 0〜1

    if (h.shape === 'diamond') {
      this._drawInterceptor(ctx, x, y, h.w, h.h, h.color, h.glowColor, pulse, h.pulse)
    } else {
      this._drawGunship(ctx, x, y, h.w, h.h, h.color, h.glowColor, pulse, h.pulse)
    }

    // enemy_hp 有効時はセグメント式HPバーを描く
    if (world.rules.features.has('enemy_hp') && h.maxHp > 1) {
      this._drawHpBar(ctx, x, y - 9, h.w, h.hp, h.maxHp)
    }
    return true
  }

  // diamond → エイリアン戦闘機（左を向いて突進してくる）
  private _drawInterceptor(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, hgt: number,
    color: string, glow: string, pulse: number, phase: number,
  ): void {
    const px = new PixelCanvas(ctx)
    const cx = x + w / 2
    const cy = y + hgt / 2

    // 後方エンジン炎（右側＝進行方向の逆）。本体スプライトの箱からはみ出すため別描画
    const ef = Math.floor(phase * FLAME_FLICKER_RATE) % 2 === 0 ? 0.7 : 0.95
    px.tri(x + w * 0.82, cy - hgt * 0.14, w * 0.5 * ef, hgt * 0.28, 'right', glow)

    px.sprite('enemy_stg_interceptor', x, y, w, hgt, {
      slots: { main: color, shade: this._shade(color, -55), light: this._shade(color, 65) },
    })

    // 中央の発光コア（脈動する単眼）
    const r = hgt * (0.14 + pulse * 0.05)
    px.halo((expand, c) => px.circle(cx + w * 0.18, cy, r + expand, c), glow, PIXELART.haloSteps)
    px.circle(cx + w * 0.18, cy, r, glow)
  }

  // rect → 装甲砲艦（左前方に主砲、後方にスラスター）
  private _drawGunship(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, hgt: number,
    color: string, glow: string, pulse: number, phase: number,
  ): void {
    const px = new PixelCanvas(ctx)
    const cy = y + hgt / 2

    // 後方スラスター炎（本体の箱からはみ出すため別描画）
    const ef = Math.floor(phase * FLAME_FLICKER_RATE) % 2 === 0 ? 0.6 : 0.9
    for (const ny of [y + hgt * 0.3, y + hgt * 0.7]) {
      px.tri(x + w * 0.96, ny - hgt * 0.08, w * 0.4 * ef, hgt * 0.16, 'right', glow)
    }

    px.sprite('enemy_stg_gunship', x, y, w, hgt, {
      slots: { main: color, shade: this._shade(color, -55), light: this._shade(color, 60), glow },
    })

    // 中央の発光センサーアイ（脈動）
    const r = hgt * (0.12 + pulse * 0.04)
    px.halo((expand, c) => px.circle(x + w * 0.45, cy, r + expand, c), glow, PIXELART.haloSteps)
    px.circle(x + w * 0.45, cy, r, glow)
  }

  // セグメント式の小型HPバー
  private _drawHpBar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, hp: number, maxHp: number,
  ): void {
    const px = new PixelCanvas(ctx)
    const segGap = 1
    const segW = (w - segGap * (maxHp - 1)) / maxHp
    for (let i = 0; i < maxHp; i++) {
      const sxi = x + i * (segW + segGap)
      const filled = i < hp
      const color = filled
        ? (hp / maxHp > 0.4 ? '#7CFC8A' : '#ff7043')
        : 'rgba(255,255,255,0.15)'
      px.rect(sxi, y, segW, 3, color)
    }
  }

  // ─── 前景装飾（コックピットHUD・走査線・ビネット・流れる光条） ─────────
  drawForeground(ctx: CanvasRenderingContext2D, offsetX: number, W: number, H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)

    // 高速で流れる前景の光条（手前のスペースダスト）
    const sector = Math.floor(offsetX / 220)
    for (let s = sector - 1; s <= sector + 2; s++) {
      for (let i = 0; i < 2; i++) {
        const hsh = ((s * 40503) ^ (i * 12289)) >>> 0
        const lx = s * 220 - offsetX * 1.4 + (hsh % 220)
        if (lx < -40 || lx > W) continue
        const ly = (hsh >>> 8) % H
        const len = 22 + (hsh >>> 4) % 30
        px.line(lx, ly, lx + len, ly, 'rgba(150,210,255,0.16)', 1)
      }
    }


    // ビネット（画面四隅を暗く落とす）
    px.bandRadial(W / 2, H / 2, H * 0.38, W * 0.72, [
      [0, 'transparent'],
      [1, 'rgba(0,0,12,0.55)'],
    ], PIXELART.gradientSteps)

    // コックピットHUD：四隅のブラケットと上端の目盛り
    const m = 14, b = 22
    const corners: readonly [number, number, number, number][] = [
      [m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1],
    ]
    for (const [cxp, cyp, dx, dy] of corners) {
      px.line(cxp + dx * b, cyp, cxp, cyp, 'rgba(120,230,255,0.5)', 1)
      px.line(cxp, cyp, cxp, cyp + dy * b, 'rgba(120,230,255,0.5)', 1)
    }
    // 上端のスキャナー目盛り
    for (let tx = W * 0.18; tx < W * 0.82; tx += 26) {
      const tall = (Math.round(tx) % 78 === 0)
      px.line(tx, m, tx, m + (tall ? 8 : 4), 'rgba(120,230,255,0.25)', 1)
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

export default new StgPlugin()
