/**
 * genres/HackSlashPlugin.ts
 * 'hack_slash' ジャンル（ハックアンドスラッシュ）のプラグイン。
 *
 * 血染めの荒廃した戦場。深紅と黒の世界。
 * 剣士がコンボを繋ぎ続ける激しい戦闘スタイル。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { BOSS, PIXELART } from '../data/tunables'
import { PixelCanvas } from '../game/render'

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const KNIGHT_RUN_FRAME_COUNT = 2

export class HackSlashPlugin extends GenrePluginBase {
  readonly id: GenreId = 'hack_slash'

  readonly skyColors    = ['#0a0000', '#150000'] as const
  readonly groundColors = ['#1a0000', '#100000'] as const
  readonly farLayerColor  = '#0e0000'
  readonly midLayerColor  = '#1a0200'
  readonly starColor      = '#ff6644'

  readonly palette = {
    danger: '#dd0000', dangerGlow: '#ff4422',
    safe:   '#ffaa00', safeGlow:   '#ffdd66',
  }

  readonly hazardConfig = {
    glowBlur: 16,
    pulseSpeed: 2.0,
    pulseAmplitude: 0.14,
  }

  readonly groundLineAlpha = 0.20
  readonly groundDashAlpha = 0.10

  readonly particleColors = {
    hit:   '#ff1100',
    death: ['#cc0000', '#ff4400', '#880000', '#ff8844'] as readonly string[],
    jump:  'rgba(220,30,0,0.6)',
    land:  'rgba(160,10,0,0.55)',
  }

  // 密度高め・敵ウェーブ感。アイテムドロップあり
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 7, weightEnd: 6, wRange: [24, 46], hRange: [36, 60], safeChance: 0.18 },
    { shape: 'spike',   placement: 'ground', weightStart: 5, weightEnd: 7, wRange: [22, 40], hRange: [35, 58], safeChance: 0.12 },
    { shape: 'diamond', placement: 'float',  weightStart: 3, weightEnd: 5, wRange: [26, 38], hRange: [26, 38], safeChance: 0.45 },
    { shape: 'rect',    placement: 'air',    weightStart: 2, weightEnd: 4, wRange: [28, 48], hRange: [26, 42], safeChance: 0.20 },
    // ボス: 道中はほぼ出現せず、距離が伸びるごとに稀に出現する大型の敵
    { shape: 'rect',    placement: 'ground', weightStart: 0, weightEnd: 0.5, wRange: [BOSS.bossWidth, BOSS.bossWidth], hRange: [BOSS.bossHeight, BOSS.bossHeight], safeChance: 0, hpOverride: BOSS.bossHp, isBoss: true },
  ]

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 遠景：廃墟の城壁・崩れた塔（式は無変更）
    px.withAlpha(0.18, () => {
      px.ridge(-50, W + 50, gY, (sx) => {
        const wx = sx - offsetX * 0.06
        return Math.abs(Math.sin(wx * 0.005)) * 90 + Math.abs(Math.sin(wx * 0.013)) * 40 + 30
      }, this.farLayerColor)
    })

    // 血の月（ブロック円 + 2段ハロー）
    const moonX = W * 0.75, moonY = gY * 0.25
    px.halo((expand, c) => px.circle(moonX, moonY, 60 + expand, c), '#ff2200', PIXELART.haloSteps)
    px.withAlpha(0.7, () => px.circle(moonX, moonY, 60, '#880000'))
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 中景：壊れた柱・廃墟の壁（配置ハッシュは無変更）
    const sector = Math.floor(offsetX / 190)
    px.withAlpha(0.6, () => {
      for (let s = sector - 1; s <= sector + 5; s++) {
        const h = (s * 1789) & 0xffff
        const pxPos = s * 190 - offsetX + (h % 90)
        const pillarH = 55 + (h >> 4) % 70
        const crumble = (h >> 10) & 0x3  // 0~3の崩れ具合

        px.rect(pxPos - 8, gY - pillarH, 16, pillarH, '#220000')

        // 崩れた上部（階段状の欠け）
        if (crumble > 0) {
          for (let c = 0; c < crumble + 1; c++) {
            const cw = 4 + (h >> (c * 3) & 0x5)
            const cx2 = pxPos - 6 + c * 5
            px.rect(cx2, gY - pillarH + 4, cw, 8, '#1a0000')
          }
        }
      }
    })

    // 舞い散る血しぶき状パーティクル（静的）
    const t = performance.now() / 2000
    px.withAlpha(0.5, () => {
      for (let i = 0; i < 10; i++) {
        const bx = ((i * 130 + offsetX * 0.3 + t * 20) % (W + 60)) - 30
        const by = gY - 50 - (i * 37 % 100)
        const br = (2 + (i % 3)) * 2
        px.rect(bx - br / 2, by - br / 2, br, br, '#cc0000')
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now() / 70
    const swordAngle = onGround
      ? Math.sin(runCycle * Math.PI * 4) * 0.3
      : -0.5

    // 影
    px.ellipse(w / 2, h + 2, w * 0.38, 4, 'rgba(80,0,0,0.3)')

    const frame = onGround
      ? (Math.floor(runCycle * KNIGHT_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
      : 'jump'
    px.sprite('player_knight_dark', 0, 0, w, h, { frame })

    // 大剣（本体の箱から大きくはみ出すため専用プリミティブとして残す。
    // player_base の影・StgPlugin の炎と同じ方針。連続回転はそのまま活かせる）
    const hiltX = w * 0.85, hiltY = h * 0.45
    const cos = Math.cos(swordAngle), sin = Math.sin(swordAngle)
    const rotate = (lx: number, ly: number): readonly [number, number] =>
      [hiltX + lx * cos - ly * sin, hiltY + lx * sin + ly * cos]

    px.line(...rotate(0, 0), ...rotate(24, -28), '#ccccee', 1)
    const bladeShimmer = `hsl(${220 + Math.sin(t * 0.05) * 20}, 80%, 75%)`
    px.withAlpha(0.7, () => px.line(...rotate(1, -2), ...rotate(22, -26), bladeShimmer, 1))
    px.line(...rotate(-4, 5), ...rotate(4, -5), '#553300', 1)
  }
}

export default new HackSlashPlugin()
