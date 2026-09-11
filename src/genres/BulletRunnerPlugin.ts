/**
 * genres/BulletRunnerPlugin.ts
 * 'bullet_runner' ジャンル（弾幕ランナー）のプラグイン。
 *
 * ネオンで輝くサイバーシティの夜。自動走行 + 射撃。
 * 高速感・スタイリッシュ・カラフルなビジュアル。
 * drawGenreHUD — 敵の頭上のHPバー（緑/黄/赤3色）
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { GenreId } from '../domain/types'
import type { Hazard } from '../game/entities'
import { PixelCanvas } from '../game/render'
import { PIXELART, HAZARD_VFX } from '../data/tunables'
import { drawGimmickHazard } from './shared/gimmickRender'

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const RUNNER_RUN_FRAME_COUNT = 2

export class BulletRunnerPlugin extends GenrePluginBase {
  readonly id: GenreId = 'bullet_runner'

  readonly skyColors    = ['#060010', '#100025'] as const
  readonly groundColors = ['#120030', '#0a001a'] as const
  readonly farLayerColor  = '#110022'
  readonly midLayerColor  = '#0e001c'
  readonly starColor      = '#ff88ff'

  readonly palette = {
    danger: '#ff2266', dangerGlow: '#ff66aa',
    safe:   '#00ffcc', safeGlow:   '#66ffee',
  }

  readonly starConfig = {
    density: 14,
    sizeRange: [1, 2] as [number, number],
    alphaRange: [0.3, 0.7] as [number, number],
  }

  readonly parallax = {
    stars: 0.025,
    far:   0.1,
    mid:   0.3,
  }

  readonly hazardConfig = {
    glowBlur: 18,
    pulseSpeed: 2.5,
    pulseAmplitude: 0.15,
  }

  readonly groundLineAlpha = 0.3
  readonly groundDashAlpha = 0.15

  readonly particleColors = {
    hit:   '#ff44aa',
    death: ['#ff0066', '#ff4400', '#ffff00', '#cc00ff'] as readonly string[],
    jump:  'rgba(200,0,255,0.6)',
    land:  'rgba(0,255,180,0.5)',
  }

  // bullet_runner は Runner と同じパターン方式（PatternRunnerFeature）で自前スポーンするため、
  // spawnTable による重み付きランダム生成は使わない（plan/spec-pattern-system.md）。
  readonly spawnTable: readonly SpawnEntry[] = []

  // パターン系ギミックの配色。敵（palette.danger のピンク赤）と衝突しないよう、
  // 足場=紫、バネ=マゼンタ、トゲ=ネオンオレンジで分離する
  readonly gimmickPalette = {
    platform: { color: '#3a2a5a', glow: '#8844ff' },
    spring:   { color: '#ff44cc', glow: '#ff88ee' },
    spike:    { color: '#ff6600', glow: '#ffaa44' },
  }

  override drawHazard(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, world: MutableWorld): boolean {
    // 倒せる敵（isGimmick も isSpring も持たない diamond 形状）は、壊せないトゲ・足場・バネとは
    // 別の「ふわふわ浮遊する生き物」として描く。バネも diamond 形状を共有するため isSpring で区別する
    if (!hazard.isGimmick && !hazard.isPlatform && !hazard.isSpring && hazard.shape === 'diamond') {
      this._drawFloatingEnemy(ctx, hazard, sx, world)
      return true
    }
    return drawGimmickHazard(ctx, hazard, sx, world.canvas.height)
  }

  /** 倒せる敵: 羽ばたく丸い浮遊体 + 目 + HPバー。地面固定のトゲとは形状・挙動の両方で区別する */
  private _drawFloatingEnemy(ctx: CanvasRenderingContext2D, hazard: Hazard, sx: number, world: MutableWorld): void {
    const px = new PixelCanvas(ctx)
    const y = hazard.rect.y  // floatAmp によるふわふわ上下動を含む
    const w = hazard.w
    const h = hazard.h
    const t = performance.now() / 1000
    const wingFlap = Math.sin(t * 8 + hazard.pulse) * 0.5 + 0.5  // 0〜1

    px.halo((expand, c) => px.circle(sx + w / 2, y + h / 2, w * 0.45 + expand, c), hazard.glowColor, PIXELART.haloSteps)

    // 羽（羽ばたきで開閉）
    const wingSpread = 0.25 + wingFlap * 0.45
    px.withAlpha(0.8, () => {
      px.tri(sx - w * wingSpread, y + h * 0.15, w * wingSpread, h * 0.55, 'right', hazard.glowColor)
      px.tri(sx + w, y + h * 0.15, w * wingSpread, h * 0.55, 'left', hazard.glowColor)
    })

    // 本体（丸い浮遊体）+ 目
    px.circle(sx + w / 2, y + h / 2, w * 0.42, hazard.color)
    px.circle(sx + w * 0.38, y + h * 0.44, w * 0.07, '#ffffff')
    px.circle(sx + w * 0.62, y + h * 0.44, w * 0.07, '#ffffff')

    if (world.rules.features.has('enemy_hp') && hazard.maxHp > 1) {
      const barW = w * (hazard.hp / hazard.maxHp)
      const barColor = barW / w > HAZARD_VFX.hpBarThreshold ? HAZARD_VFX.hpBarHighColor : HAZARD_VFX.hpBarLowColor
      px.rect(sx, y - HAZARD_VFX.hpBarOffsetY, w, HAZARD_VFX.hpBarHeight, `rgba(0,0,0,${HAZARD_VFX.hpBarBgAlpha})`)
      px.rect(sx, y - HAZARD_VFX.hpBarOffsetY, barW, HAZARD_VFX.hpBarHeight, barColor)
    }
  }

  // 背景装飾（巨大なネオンムーン）の位置・色
  private readonly moonConfig = { x: 0.16, yRatio: 0.22, r: 50, color: '#ff88ff', haloColor: '#cc44ff' }

  // 自前 HP バー（drawGenreHUD）を描くため、エンジン汎用バーの二重描画を抑制する
  readonly drawsOwnHpBar = true

  // 敵HPバー（drawGenreHUD）。縦モードの cull 範囲は sideScroller のハザード cull と揃える。
  // 水平方向のマージン（±50）は最大ハザード幅（42）以上であるため、本体が見える領域では必ずバーも描画される。
  private readonly enemyHpBar = {
    height: 4,
    offsetY: 8,
    cullMargin: 50,
    vertMarginTop: 200,
    vertMarginBottom: 100,
    ratioGreen: 0.6,
    ratioYellow: 0.3,
    bg: 'rgba(0,0,0,0.6)',
    green: '#44ff44',
    yellow: '#ffff44',
    red: '#ff4444',
  }

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 巨大なネオンムーン（豪華な夜景の演出）
    const moon = this.moonConfig
    const moonX = W * moon.x
    const moonY = gY * moon.yRatio
    px.halo((expand, c) => px.circle(moonX, moonY, moon.r + expand, c), moon.haloColor, PIXELART.haloSteps)
    px.circle(moonX, moonY, moon.r, moon.color)
    px.withAlpha(0.35, () => {
      px.circle(moonX - moon.r * 0.3, moonY - moon.r * 0.2, moon.r * 0.22, '#e0aaff')
      px.circle(moonX + moon.r * 0.25, moonY + moon.r * 0.3, moon.r * 0.16, '#e0aaff')
    })

    // ネオン都市の遠景シルエット（式は無変更、階段状のシルエットへ）
    px.withAlpha(0.18, () => {
      px.ridge(0, W, gY, (sx) => {
        const wx = sx - offsetX * 0.08
        return (Math.sin(wx * 0.008) * 0.5 + 0.5) * 120 + 60 +
               (Math.sin(wx * 0.02 + 1) * 0.5 + 0.5) * 40
      }, '#080015')
    })

    // ネオン縦ライン（ビル窓）。配置ハッシュは無変更
    const sector = Math.floor(offsetX / 500)
    const colors = ['#ff0088', '#0088ff', '#00ffcc', '#ff8800']
    px.withAlpha(0.5, () => {
      for (let s = sector - 1; s <= sector + 3; s++) {
        const h2 = (s * 2011) & 0xffff
        const bx = s * 500 - offsetX * 0.08 + (h2 % 300)
        px.rect(bx, gY * 0.35, 2, gY * 0.5, colors[h2 % colors.length])
      }
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    this._drawNeonBuildingRow(ctx, offsetX, W, gY, { spacing: 180, jitter: 100, minH: 60, hRange: 100, minW: 28, wRange: 40, alpha: 0.7 })
    // 手前寄りの層: スクロール速度を上げて視差を強調しつつ、地面・プレイヤーより後ろに留める
    this._drawNeonBuildingRow(ctx, offsetX * 1.4, W, gY, { spacing: 130, jitter: 80, minH: 45, hRange: 80, minW: 24, wRange: 34, alpha: 0.85, seedOffset: 3301 })

    const px = new PixelCanvas(ctx)
    // 流れる横ネオンライン（地面近く）。流れる速度・位置の式は無変更
    const t = performance.now() / 1000
    const lineAlpha = 0.12 + Math.sin(t * 3) * 0.04
    const dashStart = -offsetX * 0.5 % 300 - 100
    px.withAlpha(lineAlpha * 3, () => {
      for (let x = dashStart; x < W + 100; x += 50) {
        px.rect(x, gY - 41, 30, 1.5, '#cc00ff')
      }
    })
  }

  /** ネオン看板付きビル群を1列描く（drawMidLayer から奥・手前2層分呼ばれる） */
  private _drawNeonBuildingRow(
    ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number,
    cfg: { spacing: number; jitter: number; minH: number; hRange: number; minW: number; wRange: number; alpha: number; seedOffset?: number },
  ): void {
    const px = new PixelCanvas(ctx)
    const seed = cfg.seedOffset ?? 1447
    const neonColors = ['#ff0088', '#00ccff', '#ff6600']
    const sector = Math.floor(offsetX / cfg.spacing)
    px.withAlpha(cfg.alpha, () => {
      for (let s = sector - 1; s <= sector + Math.ceil(W / cfg.spacing) + 3; s++) {
        const h2 = (s * seed) & 0xffff
        const bx = s * cfg.spacing - offsetX + (h2 % cfg.jitter)
        const bh = cfg.minH + (h2 >> 4) % cfg.hRange
        const bw = cfg.minW + (h2 >> 8) % cfg.wRange
        px.rect(bx, gY - bh, bw, bh, '#0a0018')

        // ネオン看板の光（shadowBlur → px.halo）
        const signColor = neonColors[(s + h2) % neonColors.length]
        px.halo((expand, c) => px.rect(bx + 2 - expand, gY - bh + 8 - expand, bw - 4 + expand * 2, 6 + expand * 2, c),
          signColor, PIXELART.haloSteps)
        px.rect(bx + 2, gY - bh + 8, bw - 4, 6, signColor)
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(200,0,200,0.15)')

    const frame = Math.floor(runCycle * RUNNER_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b'
    px.sprite('player_cyber_runner', 0, 0, w, h, { frame })
  }

  // ─── ジャンル固有HUD: 敵HPバー ─────────────────────────────────────────
  drawGenreHUD(ctx: CanvasRenderingContext2D, world: MutableWorld, W: number, H: number): void {
    const px = new PixelCanvas(ctx)
    const bar = this.enemyHpBar
    for (const h of world.hazards) {
      if (h.maxHp <= 1) continue
      const sx = world.getHazardScreenX(h)
      if (sx < -bar.cullMargin || sx > W + bar.cullMargin) continue
      // 縦モードでは h.y がそのまま画面Y（cameraX=0）なので Y 方向もチェックする
      if (world.rules.scrollAxis === 'y' && (h.rect.y < -bar.vertMarginTop || h.rect.y > H + bar.vertMarginBottom)) continue

      const ratio = h.hp / h.maxHp
      const barY = h.rect.y - bar.offsetY
      // 仕様: >60% 緑 / 30〜60% 黄 / <30% 赤（0.3 ちょうどは黄側）
      const color = ratio > bar.ratioGreen ? bar.green : ratio >= bar.ratioYellow ? bar.yellow : bar.red
      px.rect(sx, barY, h.w, bar.height, bar.bg)
      px.rect(sx, barY, h.w * ratio, bar.height, color)
    }
  }
}

export default new BulletRunnerPlugin()
