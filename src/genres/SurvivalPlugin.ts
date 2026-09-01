/**
 * genres/SurvivalPlugin.ts
 * 'survival' ジャンル（サバイバルゲーム）のプラグイン。
 *
 * 荒廃した森林。暗い緑・茶色で生存感を演出。
 * HPアイテム・食料・武器が出現、左右両方向から敵が迫る。
 *
 * drawGenreHUD  — hungerバー / XP進行バー / レベル / 武器ダメージ表示
 * onHazardDestroyed — 敵撃破時に食料/武器をドロップ
 */

import { GenrePluginBase } from '../engine/GenrePluginBase'
import type { SpawnEntry, MutableWorld } from '../engine/types'
import type { GenreId } from '../domain/types'
import type { Hazard } from '../game/entities'
import { Item } from '../game/entities'
import { SURVIVAL } from '../data/tunables'
import { PixelCanvas } from '../game/render'

// HUD描画の定数（survival.json から読み込み）
const HUD_BAR_HEIGHT = SURVIVAL.hudBarHeight
const HUD_TEXT_SIZE = SURVIVAL.hudTextSize
const HUD_TOP_OFFSET = SURVIVAL.hudTopOffset
const HUD_BAR_WIDTH = SURVIVAL.hudBarWidth

// プレイヤーの走りアニメーションのフレーム数（run_a / run_b の2枚）
const SURVIVAL_RUN_FRAME_COUNT = 2

export class SurvivalPlugin extends GenrePluginBase {
  readonly id: GenreId = 'survival'

  readonly skyColors    = ['#050e05', '#0a1a08'] as const
  readonly groundColors = ['#0d1a09', '#070f05'] as const
  readonly farLayerColor  = '#0a1a08'
  readonly midLayerColor  = '#081408'
  readonly starColor: string | undefined = undefined

  readonly palette = {
    danger: '#cc4400', dangerGlow: '#ff7722',
    safe:   '#22aa44', safeGlow:   '#66ff88',
  }

  readonly hazardConfig = {
    glowBlur: 8,
    pulseSpeed: 0.9,
    pulseAmplitude: 0.06,
  }

  readonly groundLineAlpha = 0.12
  readonly groundDashAlpha = 0.06

  readonly particleColors = {
    hit:   '#ff6600',
    death: ['#cc3300', '#ff6600', '#884400', '#442200'] as readonly string[],
    jump:  'rgba(80,120,40,0.6)',
    land:  'rgba(60,100,30,0.5)',
  }

  // HPアイテムが多め、障害物はタフ寄り。左方向から来る敵も混在。
  readonly spawnTable: readonly SpawnEntry[] = [
    // 右から来る通常敵
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 6, wRange: [28, 52], hRange: [38, 65], safeChance: 0.30 },
    { shape: 'pillar', placement: 'ground', weightStart: 3, weightEnd: 5, wRange: [16, 24], hRange: [70, 130], safeChance: 0.20 },
    { shape: 'spike',  placement: 'ground', weightStart: 2, weightEnd: 4, wRange: [25, 42], hRange: [35, 55], safeChance: 0.15 },
    { shape: 'rect',   placement: 'air',    weightStart: 0, weightEnd: 2, wRange: [26, 45], hRange: [25, 40], safeChance: 0.25 },
    // 左から来る敵（両方向攻撃対応）
    { shape: 'rect',   placement: 'ground', weightStart: 0, weightEnd: 4, wRange: [28, 48], hRange: [38, 65], safeChance: 0.20, direction: 'left' },
    { shape: 'spike',  placement: 'ground', weightStart: 0, weightEnd: 3, wRange: [25, 38], hRange: [35, 55], safeChance: 0.15, direction: 'left' },
  ]

  onGenreLocked(world: MutableWorld): void {
    // ジャンル確定時に状態を初期化
    const p = world.player
    p.hunger = SURVIVAL.maxHunger
    p.level = 1
    p.weaponDamage = SURVIVAL.meleeDamage
  }

  // spawnDensity is sourced from JSON config (survival.json) — see genres/index.ts merge

  drawFarLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 霧がかかった暗い丘シルエット。式は無変更、サンプリングを px.ridge の階段状にする
    const px = new PixelCanvas(ctx)
    px.withAlpha(0.18, () => {
      px.ridge(-40, W + 40, gY, (sx) => {
        const wx = sx - offsetX
        return Math.sin(wx * 0.004) * 70 + Math.sin(wx * 0.009) * 35 + Math.sin(wx * 0.019) * 18 + 95
      }, this.farLayerColor)
    })
  }

  drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 枯れ木のシルエット。配置ハッシュは無変更、同じスプライトをサイズ違いで使い回す
    const px = new PixelCanvas(ctx)
    const sector = Math.floor(offsetX / 180)
    px.withAlpha(0.5, () => {
      for (let s = sector - 1; s <= sector + 5; s++) {
        const h = (s * 1783) & 0xffff
        const tx = s * 180 - offsetX + (h % 100)
        const treeH = 55 + (h >> 4) % 60
        const treeW = treeH * (16 / 24) // tree_dead.json のアスペクト比（16x24）を維持
        px.sprite('tree_dead', tx - treeW / 2, gY - treeH, treeW, treeH)
      }
    })
  }

  drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, onGround: boolean, runCycle: number): void {
    const px = new PixelCanvas(ctx)

    // 影（スプライト外に残す。player_base と同じ方針）
    px.ellipse(w / 2, h + 2, w * 0.38, 4, 'rgba(0,0,0,0.3)')

    const frame = onGround
      ? (Math.floor(runCycle * SURVIVAL_RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
      : 'jump'
    px.sprite('player_survival', 0, 0, w, h, { frame })
  }

  // ─── ジャンル固有HUD: hungerバー / XPバー / レベル / 武器ダメージ ─
  drawGenreHUD(ctx: CanvasRenderingContext2D, world: MutableWorld, W: number, _H: number): void {
    const px = new PixelCanvas(ctx)
    const p = world.player
    const padding = SURVIVAL.hudPanelPadding
    const x = W - HUD_BAR_WIDTH - HUD_TOP_OFFSET
    let y = HUD_TOP_OFFSET
    const font = `bold ${HUD_TEXT_SIZE}px "Courier New", monospace`

    // 背景パネル（角丸を除去し、1セルの枠線を添える）
    px.rect(x - padding, y, HUD_BAR_WIDTH + padding * 2, 80, SURVIVAL.hudPanelBgColor)

    // ── hungerバー ──
    px.text('HUNGER', x, y + HUD_TEXT_SIZE, { font, fill: SURVIVAL.hudLabelColor })
    y += HUD_TEXT_SIZE + 4

    const hungerRatio = p.hunger / SURVIVAL.maxHunger
    const hungerColor = hungerRatio > 0.5 ? SURVIVAL.hudHungerColorHigh : hungerRatio > 0.25 ? SURVIVAL.hudHungerColorMid : SURVIVAL.hudHungerColorLow
    px.rect(x, y, HUD_BAR_WIDTH, HUD_BAR_HEIGHT, SURVIVAL.hudBarBgColor)
    px.rect(x, y, HUD_BAR_WIDTH * hungerRatio, HUD_BAR_HEIGHT, hungerColor)
    y += HUD_BAR_HEIGHT + 6

    // ── XPバー ──
    // p.currentLevelXp / p.nextLevelXp は SurvivalFeature で同期済み
    const xpRatio = p.nextLevelXp > 0 ? Math.min(1, p.currentLevelXp / p.nextLevelXp) : 0

    px.text(`Lv.${p.level}`, x, y + HUD_TEXT_SIZE, { font, fill: SURVIVAL.hudLabelColor })
    px.text(`${p.currentLevelXp}/${p.nextLevelXp}`, x + HUD_BAR_WIDTH - 40, y + HUD_TEXT_SIZE, { font, fill: SURVIVAL.hudXpTextColor })
    y += HUD_TEXT_SIZE + 4

    px.rect(x, y, HUD_BAR_WIDTH, HUD_BAR_HEIGHT, SURVIVAL.hudBarBgColor)
    px.rect(x, y, HUD_BAR_WIDTH * xpRatio, HUD_BAR_HEIGHT, SURVIVAL.hudXpBarColor)
    y += HUD_BAR_HEIGHT + 6

    // ── 武器ダメージ ──
    px.text(`ATK: ${p.weaponDamage}`, x, y + HUD_TEXT_SIZE, { font, fill: SURVIVAL.hudAtkTextColor })
  }

  // ─── 敵撃破時に食料/武器ドロップ ─────────────────────────────────
  onHazardDestroyed(world: MutableWorld, hazard: Hazard): void {
    const sx = hazard.x + hazard.w / 2
    const sy = hazard.y

    // アイテムサイズに依存しないオフセット計算
    // Item.w = 22, Item.h = 22 なので、中心に配置するため w/2 を引く
    const halfItemW = 11

    // 食料ドロップ
    if (Math.random() < SURVIVAL.foodDropChance) {
      world.spawnItem(new Item(sx - halfItemW, sy, 'food'))
    }

    // 武器ドロップ（食料より上にドロップ）
    if (Math.random() < SURVIVAL.weaponDropChance) {
      world.spawnItem(new Item(sx - halfItemW, sy - 22, 'weapon'))
    }
  }
}

export default new SurvivalPlugin()
