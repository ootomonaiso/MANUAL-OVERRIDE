/**
 * genres/TowerDefPlugin.ts
 * 'tower_def' ジャンル（タワーディフェンス）のプラグイン。
 *
 * 左側に守る拠点（城門）があり、右から敵が波状に迫る。
 * 夜空の青黒と石畳の灰。プレイヤーは拠点のそばで立ち、
 * 決定的ハッシュで配置されたタワーが最寄りの敵を自動撃破する。
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { selectPlayerFrame } from './playerBaseAnim'
import type { PlayerAnimState } from '../engine/GenrePlugin'
import { TowerDefMode } from '../game/modes/TowerDefMode'

// 拠点（城門）の幅。左端に固定配置
const CASTLE_GATE_WIDTH = 48
// タワー配置の間隔（px）。決定的ハッシュでずらす
const TOWER_SPACING = 160
// タワー初期数（HUD 表示用の仮値）
const TOWER_INITIAL_COUNT = 8
// タワー数減衰の距離係数（HUD 表示用の仮値）
const TOWER_DECAY_PER_DIST = 800

export class TowerDefPlugin extends GenrePluginBase {
  readonly id: GenreId = 'tower_def'

  readonly gameMode = new TowerDefMode()

  readonly skyColors    = ['#0a0f1a', '#0d1420'] as const
  readonly groundColors = ['#1a2030', '#0f1420'] as const
  readonly farLayerColor  = '#0e1222'
  readonly midLayerColor  = '#181e30'
  readonly starColor: string | undefined = '#4466aa'

  readonly palette = {
    danger: '#dd5522', dangerGlow: '#ff8844',
    safe:   '#4488cc', safeGlow:   '#66aaff',
  }

  readonly hazardConfig = {
    glowBlur: 10,
    pulseSpeed: 1.0,
    pulseAmplitude: 0.06,
  }

  readonly groundLineAlpha = 0.12
  readonly groundDashAlpha = 0.06

  readonly particleColors = {
    hit:   '#ff8844',
    death: ['#dd5522', '#ff8844', '#aa3311', '#ffaa66'] as readonly string[],
    jump:  'rgba(68,136,204,0.45)',
    land:  'rgba(40,70,120,0.4)',
  }

  // 敵兵・壁・砲塔（中景に描画）が混在
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 7, wRange: [28, 50], hRange: [38, 65], safeChance: 0.15 },
    { shape: 'pillar', placement: 'ground', weightStart: 4, weightEnd: 6, wRange: [16, 24], hRange: [70, 130], safeChance: 0.10 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 4, wRange: [24, 42], hRange: [36, 58], safeChance: 0.10 },
    { shape: 'rect',   placement: 'air',    weightStart: 1, weightEnd: 3, wRange: [26, 44], hRange: [24, 40], safeChance: 0.20 },
  ]

  // ─── 遠景：城壁・塔のシルエット ────────────────────────────────
  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 遠くの城壁と塔のシルエット（視差 0.04）
    const parallax = offsetX * 0.04
    const towerSpan = 240
    const sector = Math.floor(parallax / towerSpan)
    px.withAlpha(0.20, () => {
      for (let s = sector - 1; s <= sector + 4; s++) {
        const tx = s * towerSpan - parallax + 20
        const tw = towerSpan * 0.6
        // 壁
        px.rect(tx, gY - 90, tw, 90, this.farLayerColor)
        // 塔（壁の上に）
        const towerW = 28
        const towerH = 50 + ((s * 1733) & 0xff) % 30
        px.rect(tx + tw / 2 - towerW / 2, gY - 90 - towerH, towerW, towerH, this.farLayerColor)
        // 塔の頂部（三角）
        px.tri(tx + tw / 2 - towerW / 2, gY - 90 - towerH, towerW, 14, 'up', this.farLayerColor)
      }
    })

    // 夜空の星（少数、青白）
    const t = performance.now() / 2000
    px.withAlpha(0.4, () => {
      for (let i = 0; i < 12; i++) {
        const h = (i * 3571) & 0xffff
        const sx = (h % W)
        const sy = (h >> 8) % (gY * 0.5)
        const twinkle = 0.4 + Math.sin(t + i * 1.7) * 0.3
        px.withAlpha(twinkle, () => px.circle(sx, sy, 1, '#88aaff'))
      }
    })
  }

  // ─── 中景：並ぶタワー（砲塔） ──────────────────────────────────
  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // タワーの配置（決定的ハッシュ）
    const sector = Math.floor(offsetX / TOWER_SPACING)
    px.withAlpha(0.70, () => {
      for (let s = sector - 1; s <= sector + 5; s++) {
        const h = (s * 2267) & 0xffff
        const tx = s * TOWER_SPACING - offsetX + (h % 60)
        const th = 40 + (h >> 4) % 30
        // 砲塔の台座
        px.rect(tx - 8, gY - th, 16, th, this.midLayerColor)
        // 砲塔の頭（四角い砲身）
        px.rect(tx - 6, gY - th - 10, 12, 10, '#2a3050')
        // 砲口（赤い光）
        const glow = 0.5 + Math.sin(performance.now() / 500 + s * 3.1) * 0.3
        px.withAlpha(glow, () => px.circle(tx + 7, gY - th - 5, 3, '#ff6644'))
      }
    })

    // 地面の石畳パターン
    const tileW = 32
    const startX = -(offsetX % tileW)
    px.withAlpha(0.08, () => {
      for (let tx = startX; tx <= W; tx += tileW) {
        px.line(tx, gY - 1, tx, gY, '#2a3050', 1)
      }
    })
  }

  // ─── プレイヤー：gladiator を左寄りに配置 ─────────────────────
  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number, animState?: PlayerAnimState): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.36, 4, 'rgba(0,0,0,0.35)')

    const s: PlayerAnimState = animState ?? { vx: 0, vy: 0, onGround, runCycle, facing: 1 }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.sprite('player_gladiator', 0, 0, w, h, { frame, flipX })

    // 盾（左側。拠点を守るイメージ）
    px.rect(-4, h * 0.2, 5, h * 0.45, '#334466')
    px.rect(-3, h * 0.25, 3, h * 0.35, '#445577')
  }

  // ─── 前景：左端に拠点（城門）を描く ────────────────────────────
  drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, gY: number): void {
    const px = new PixelCanvas(ctx)

    // 城門（左端に固定）
    const gateX = 4
    const gateW = CASTLE_GATE_WIDTH
    const gateH = gY * 0.75
    // 門柱
    px.rect(gateX, gY - gateH, 8, gateH, '#1a2040')
    px.rect(gateX + gateW - 8, gY - gateH, 8, gateH, '#1a2040')
    // 門の上部（アーチ）
    px.halfCircle(gateX + gateW / 2, gY - gateH, gateW / 2 - 4, 'up', '#1a2040')
    // 門の開口部（暗い）
    const openingW = gateW - 20
    const openingH = gateH * 0.6
    px.rect(gateX + 10, gY - openingH, openingW, openingH, '#050810')
    // 門の装飾（横梁）
    px.rect(gateX, gY - gateH + 6, gateW, 4, '#2a3050')

    // 被弾時の点滅（実際には被弾状態ではなく、環境パルス）
    const hitFlash = Math.sin(performance.now() / 150)
    if (hitFlash > 0.7) {
      px.withAlpha((hitFlash - 0.7) * 0.8, () => {
        px.rect(gateX - 2, gY - gateH - 2, gateW + 4, gateH + 4, '#ff4422')
      })
    }
  }

  // ─── ジャンル固有 HUD：タワー残数 / 撃破数 ────────────────────
  drawGenreHUD(ctx: CanvasRenderingContext2D, world: import('../engine/types').MutableWorld, _W: number, _H: number): void {
    const px = new PixelCanvas(ctx)
    const stats = world.gameStats
    const kills = stats.kills
    // タワー残数は仮に distance に応じて減る演出（実際の tower count は FeatureSystem 側で管理）
    const towerCount = Math.max(0, TOWER_INITIAL_COUNT - Math.floor(world.distance / TOWER_DECAY_PER_DIST))

    const font = `bold ${14}px monospace`
    const padding = 6

    // 背景パネル（左上）
    const panelX = 8
    const panelY = 8
    const panelW = 150
    const panelH = 40
    px.roundedRect(panelX, panelY, panelW, panelH, 'rgba(10,15,26,0.75)', 2)

    // タワー残数（ cosmetic approximation — 実際の tower count は FeatureSystem 側で管理）
    px.text(`TWR:${towerCount}`, panelX + padding, panelY + 14, {
      font, fill: '#66aaff',
    })
    // 撃破数
    px.text(`KIL:${kills}`, panelX + padding, panelY + 32, {
      font, fill: '#ff8844',
    })
  }
}

export default new TowerDefPlugin()
