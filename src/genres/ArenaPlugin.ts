/**
 * genres/ArenaPlugin.ts
 * 'arena' ジャンル（アリーナバトル）のプラグイン。
 *
 * 暗闘技場。松明の橙色と血の赤。
 * 重厚なアーチ・砂地・鎧の戦士。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { BOSS } from '../data/tunables'
import { PixelCanvas } from '../game/render'

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const GLADIATOR_RUN_FRAME_COUNT = 2

export class ArenaPlugin extends GenrePluginBase {
  readonly id: GenreId = 'arena'

  readonly skyColors    = ['#0a0000', '#180000'] as const
  readonly groundColors = ['#1a0a00', '#120600'] as const
  readonly farLayerColor  = '#140200'
  readonly midLayerColor  = '#1c0a00'
  readonly starColor      = '#ff4422'

  readonly palette = {
    danger: '#cc0000', dangerGlow: '#ff4422',
    safe:   '#ffaa00', safeGlow:   '#ffdd66',
  }

  readonly hazardConfig = {
    glowBlur: 14,
    pulseSpeed: 1.4,
    pulseAmplitude: 0.12,
  }

  readonly groundLineAlpha = 0.18
  readonly groundDashAlpha = 0.09

  readonly particleColors = {
    hit:   '#ff2200',
    death: ['#cc0000', '#ff4400', '#880000', '#ff8800'] as readonly string[],
    jump:  'rgba(200,60,0,0.55)',
    land:  'rgba(150,30,0,0.5)',
  }

  // 大型の敵兵・柱・障壁が多め
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 6, wRange: [30, 58], hRange: [42, 70], safeChance: 0.15 },
    { shape: 'pillar', placement: 'ground', weightStart: 4, weightEnd: 6, wRange: [18, 26], hRange: [80, 140], safeChance: 0.10 },
    { shape: 'spike',  placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [28, 46], hRange: [40, 62], safeChance: 0.10 },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 3, wRange: [30, 50], hRange: [28, 44], safeChance: 0.20 },
    // ボス: 道中はほぼ出現せず、距離が伸びるごとに稀に出現する大型の敵
    { shape: 'rect',   placement: 'ground', weightStart: 0, weightEnd: 0.5, wRange: [BOSS.bossWidth, BOSS.bossWidth], hRange: [BOSS.bossHeight, BOSS.bossHeight], safeChance: 0, hpOverride: BOSS.bossHp, isBoss: true },
  ]

  // spawnDensity is sourced from JSON config (arena.json) — see genres/index.ts merge

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 闘技場のアーチのシルエット（配置ハッシュ・間隔は無変更）
    const archSpan = 200
    const sector = Math.floor(offsetX * 0.06 / archSpan)
    px.withAlpha(0.22, () => {
      for (let s = sector - 1; s <= sector + 4; s++) {
        const ax = s * archSpan - offsetX * 0.06 + 30
        const archH = 130
        const archW = archSpan * 0.75
        // 柱
        px.rect(ax - 4, gY - archH, 8, archH, this.farLayerColor)
        px.rect(ax + archW - 4, gY - archH, 8, archH, this.farLayerColor)
        // アーチ上部（ブロック半円 = 階段状アーチ）
        px.halfCircle(ax + archW / 2, gY - archH, archW / 2, 'up', this.farLayerColor)
      }
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 中景：石柱（配置ハッシュは無変更）
    const sector = Math.floor(offsetX / 180)
    px.withAlpha(0.55, () => {
      for (let s = sector - 1; s <= sector + 5; s++) {
        const h = (s * 1873) & 0xffff
        const pxPos = s * 180 - offsetX + (h % 80)
        const pillarH = 60 + (h >> 4) % 50
        px.rect(pxPos - 7, gY - pillarH, 14, pillarH, this.midLayerColor)
      }
    })

    // 松明の炎エフェクト（駆動式は無変更）
    const t = performance.now() / 800
    for (let s = sector - 1; s <= sector + 5; s++) {
      const h = (s * 1873) & 0xffff
      const pxPos = s * 180 - offsetX + (h % 80)
      const pillarH = 60 + (h >> 4) % 50
      const flicker = 0.5 + Math.sin(t + s) * 0.3
      px.withAlpha(flicker * 0.6, () => px.circle(pxPos, gY - pillarH - 8, 7, '#ff8800'))
      px.withAlpha(flicker * 0.3, () => px.circle(pxPos, gY - pillarH - 10, 4, '#ffdd00'))
    }
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, _onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.38, 4, 'rgba(0,0,0,0.35)')

    const frame = Math.floor(runCycle * GLADIATOR_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b'
    px.sprite('player_gladiator', 0, 0, w, h, { frame })

    // 剣（本体の箱を大きく超えて右へ伸びるため専用プリミティブとして残す。
    // 04/05/08 と同じ方針）
    px.line(w - 2, h * 0.35, w + 16, h * 0.22, '#dddddd', 1)
  }
}

export default new ArenaPlugin()
