/**
 * game/modes/IdleMode.ts
 *
 * 放置ゲーム Mode。
 * 死亡・障害物なし。資源が時間経過で自動増加（パッシブインカム）。
 * クリック/タップでアクティブインカム。アップグレードで購入増加率UP。
 * 目標: 資源の最大化（スコア＝累積資源）。
 *
 * 操作: Space / クリック = 資源獲得
 *       1-5 キー = アップグレード購入
 * 勝利: なし（isWon 常に false）
 * 敗北: なし（isLost 常に false）
 */

import type { GameMode } from '../../engine/GameMode'
import type { MutableWorld } from '../../engine/types'
import { PixelCanvas } from '../render'

// ── 定数 ──────────────────────────────────────────────────────────

// パッシブインカム
const PASSIVE_PER_SEC = 2.5
// アクティブインカム（クリック/Space）
const ACTIVE_PER_CLICK = 5
// クリック連射クールダウン（秒）
const CLICK_COOLDOWN_SEC = 0.15

// アップグレード定義
const UPGRADE_COUNT = 5
const UPGRADE_BASE_COST = 50
const UPGRADE_COST_MULTIPLIER = 2.5
const UPGRADE_PROD_MULTIPLIER = 1.5

// 視覚定数
const BLOCK_HEIGHT = 8
const MAX_PILE_HEIGHT = 120
const BLOCK_COLORS = ['#c8b898', '#b8a888', '#a89878', '#d0c0a0'] as const
const RESOURCE_MAX_DISPLAY = 9999

// UI レイアウト
const UPGRADE_BTN_COUNT = UPGRADE_COUNT
const UPGRADE_BTN_W = 110
const UPGRADE_BTN_H = 36
const UPGRADE_BTN_GAP = 8
const UPGRADE_BTN_Y = 10

const RESOURCE_PANEL_X = 10
const RESOURCE_PANEL_Y = 10
const RESOURCE_PANEL_W = 220
const RESOURCE_PANEL_H = 60

// パーティクル
const UPGRADE_PARTICLE_COLORS = ['#ffcc44', '#ff8844', '#ffdd88', '#ffeecc'] as const

export interface IdleModeState {
  resources: number
  totalEarned: number
  productionPerSec: number
  autoClickerRate: number
  activeUpgrades: number
  elapsed: number          // 通算経過秒（performance.now 依存なし）
  lastClickTime: number    // 前回のクリック時刻（秒単位）
  particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[]
  scorePopups: { x: number; y: number; text: string; color: string; life: number }[]
  shakeIntensity: number
  initialized: boolean
}

function initialState(): IdleModeState {
  return {
    resources: 0,
    totalEarned: 0,
    productionPerSec: PASSIVE_PER_SEC,
    autoClickerRate: 0,
    activeUpgrades: 0,
    elapsed: 0,
    lastClickTime: -CLICK_COOLDOWN_SEC - 1,  // 初回クリックを即座に許可
    particles: [],
    scorePopups: [],
    shakeIntensity: 0,
    initialized: false,
  }
}

function getUpgradeCost(index: number): number {
  return Math.floor(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_MULTIPLIER, index))
}

export class IdleMode implements GameMode {
  readonly id = 'idle'

  private state: IdleModeState = initialState()

  setup(world: MutableWorld): void {
    this.state = initialState()
    this.state.initialized = true
    // IdleMode は死亡・障害物なし。既存のハザードを全削除。
    world.hazards.length = 0
  }

  update(world: MutableWorld, dt: number): void {
    const input = world.input

    if (!this.state.initialized) {
      this.setup(world)
    }

    this.state.elapsed += dt

    // ─── パッシブインカム ──────────────────────────────────────
    const passiveGain = PASSIVE_PER_SEC * dt
    this.state.resources += passiveGain
    this.state.totalEarned += passiveGain

    // ─── アクティブインカム（Space / クリック） ────────────────
    if (input.justPressed.has('Space')) {
      if (this.state.elapsed - this.state.lastClickTime >= CLICK_COOLDOWN_SEC) {
        const clickGain = ACTIVE_PER_CLICK * this.state.productionPerSec
        this.state.resources += clickGain
        this.state.totalEarned += clickGain
        this.state.lastClickTime = this.state.elapsed
        world.addScore(clickGain)
        world.addScorePopup(world.canvas.width / 2, world.canvas.height / 2 - 40, `+${Math.floor(clickGain)}`, '#ffcc44')
        this._spawnClickParticles(world)
      }
    }

    // ─── アップグレード購入（1-5 キー） ─────────────────────────
    for (let i = 0; i < UPGRADE_COUNT; i++) {
      const key = `${i + 1}`
      if (input.justPressed.has(key)) {
        this._tryPurchaseUpgrade(world, i)
      }
    }

    // ─── パーティクル更新 ─────────────────────────────────────
    this._updateParticles(world, dt)

    // ─── シェイク更新 ─────────────────────────────────────────
    if (this.state.shakeIntensity > 0) {
      this.state.shakeIntensity *= 0.9
      if (this.state.shakeIntensity < 0.01) {
        this.state.shakeIntensity = 0
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const H = world.canvas.height
    const px = new PixelCanvas(ctx)
    const s = this.state

    // ─── 背景（明るいクリーム色） ──────────────────────────────
    px.bandGradient(0, 0, W, H,
      [[0, '#f5f5f0'], [1, '#f0f0e8']],
      'v', 8,
    )

    // ─── 資源の山（画面下部） ──────────────────────────────────
    const pileH = Math.min(MAX_PILE_HEIGHT, s.resources * 0.5)
    if (pileH > 0) {
      const pileX = W - 100
      const gY = H - 40
      const blockCount = Math.floor(pileH / BLOCK_HEIGHT)
      for (let i = 0; i < blockCount; i++) {
        const by = gY - (i + 1) * BLOCK_HEIGHT
        const widthSpread = Math.max(10, 60 - i * 2)
        const bx = pileX - widthSpread / 2 + (i % 3) * 4
        const color = BLOCK_COLORS[i % BLOCK_COLORS.length]
        px.rect(bx, by, widthSpread, BLOCK_HEIGHT, color)
      }
    }

    // ─── 資源パネル（左上） ────────────────────────────────────
    const resourceStr = s.resources >= RESOURCE_MAX_DISPLAY
      ? `${RESOURCE_MAX_DISPLAY}+`
      : Math.floor(s.resources).toLocaleString()
    px.roundedRect(RESOURCE_PANEL_X, RESOURCE_PANEL_Y, RESOURCE_PANEL_W, RESOURCE_PANEL_H,
      'rgba(245,245,240,0.9)', 4)
    px.rect(RESOURCE_PANEL_X, RESOURCE_PANEL_Y, RESOURCE_PANEL_W, 3, '#d8d0c0')
    px.rect(RESOURCE_PANEL_X, RESOURCE_PANEL_Y + RESOURCE_PANEL_H - 3, RESOURCE_PANEL_W, 3, '#d8d0c0')
    px.rect(RESOURCE_PANEL_X, RESOURCE_PANEL_Y, 3, RESOURCE_PANEL_H, '#d8d0c0')
    px.rect(RESOURCE_PANEL_X + RESOURCE_PANEL_W - 3, RESOURCE_PANEL_Y, 3, RESOURCE_PANEL_H, '#d8d0c0')

    px.text(`$ ${resourceStr}`, RESOURCE_PANEL_X + 12, RESOURCE_PANEL_Y + 18, {
      font: 'bold 22px serif', fill: '#665533',
    })
    px.text(`+${s.productionPerSec.toFixed(1)}/s`, RESOURCE_PANEL_X + 12, RESOURCE_PANEL_Y + 44, {
      font: '13px serif', fill: '#88aa66',
    })

    // ─── アップグレードボタン（上部） ───────────────────────────
    const totalBtnWidth = UPGRADE_BTN_COUNT * UPGRADE_BTN_W + (UPGRADE_BTN_COUNT - 1) * UPGRADE_BTN_GAP
    const startX = (W - totalBtnWidth) / 2

    for (let i = 0; i < UPGRADE_COUNT; i++) {
      const bx = startX + i * (UPGRADE_BTN_W + UPGRADE_BTN_GAP)
      const cost = getUpgradeCost(i)
      const canAfford = s.resources >= cost && s.activeUpgrades > i
      const isMaxed = s.activeUpgrades <= i

      const bgColor = isMaxed ? 'rgba(180,170,150,0.6)'
        : canAfford ? 'rgba(255,220,150,0.8)'
        : 'rgba(200,190,170,0.5)'
      px.roundedRect(bx, UPGRADE_BTN_Y, UPGRADE_BTN_W, UPGRADE_BTN_H, bgColor, 3)

      const borderColor = isMaxed ? '#b8a888'
        : canAfford ? '#cc8844'
        : '#a09888'
      px.rect(bx, UPGRADE_BTN_Y, UPGRADE_BTN_W, 2, borderColor)
      px.rect(bx, UPGRADE_BTN_Y + UPGRADE_BTN_H - 2, UPGRADE_BTN_W, 2, borderColor)

      const label = isMaxed ? `MAX (${i + 1})` : `Lv.${i + 1}`
      px.text(label, bx + UPGRADE_BTN_W / 2, UPGRADE_BTN_Y + 8, {
        font: 'bold 11px monospace', fill: '#554433', align: 'center',
      })

      const costText = isMaxed ? '—' : `$${cost}`
      px.text(costText, bx + UPGRADE_BTN_W / 2, UPGRADE_BTN_Y + 24, {
        font: '10px monospace', fill: canAfford ? '#cc6622' : '#aa8866', align: 'center',
      })
    }

    // ─── パーティクル ──────────────────────────────────────────
    for (const p of s.particles) {
      px.circle(p.x, p.y, p.size, p.color)
    }

    // ─── スコアポップアップ ────────────────────────────────────
    for (const sp of s.scorePopups) {
      const alpha = Math.min(1, sp.life / 0.5)
      px.text(sp.text, sp.x, sp.y, {
        font: 'bold 14px monospace', fill: sp.color, alpha,
      })
    }

    // ─── ヒントテキスト ────────────────────────────────────────
    px.text('Space=獲得  1-5=アップグレード', W / 2, H - 16, {
      font: '11px monospace', fill: 'rgba(100,80,60,0.5)', align: 'center',
    })
  }

  isWon(_world: MutableWorld): boolean {
    return false
  }

  isLost(_world: MutableWorld): boolean {
    return false
  }

  // ─── 内部メソッド ───────────────────────────────────────────────

  private _tryPurchaseUpgrade(world: MutableWorld, index: number): void {
    const s = this.state
    if (s.activeUpgrades > index) return  // already purchased this upgrade
    if (s.activeUpgrades >= UPGRADE_COUNT) return

    const cost = getUpgradeCost(index)
    if (s.resources < cost) return

    s.resources -= cost
    s.activeUpgrades = index + 1

    // 生産速度更新
    let newProduction = PASSIVE_PER_SEC
    for (let i = 0; i < s.activeUpgrades; i++) {
      newProduction *= UPGRADE_PROD_MULTIPLIER
    }
    s.productionPerSec = newProduction

    // 演出
    world.addScore(cost * 0.1)
    world.triggerShake(0.2)

    const upgradeText = `UPGRADE Lv.${index + 1}!`
    world.addScorePopup(world.canvas.width / 2, world.canvas.height / 2 - 80, upgradeText, '#ff8844')

    // パーティクル
    const cx = world.canvas.width / 2
    const cy = world.canvas.height / 2
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const speed = 60 + Math.random() * 80
      world.addParticle(
        cx, cy,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0.5 + Math.random() * 0.3,
        UPGRADE_PARTICLE_COLORS[Math.floor(Math.random() * UPGRADE_PARTICLE_COLORS.length)],
        3,
      )
    }
  }

  private _spawnClickParticles(world: MutableWorld): void {
    const cx = world.canvas.width / 2
    const cy = world.canvas.height / 2
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 60
      this.state.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.2,
        color: '#ffcc44',
        size: 2 + Math.random() * 2,
      })
    }
  }

  private _updateParticles(world: MutableWorld, dt: number): void {
    const s = this.state
    s.particles = s.particles.filter(p => {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 100 * dt
      p.life -= dt
      return p.life > 0
    })

    s.scorePopups = s.scorePopups.filter(sp => {
      sp.y -= 30 * dt
      sp.life -= dt
      return sp.life > 0
    })
  }
}

export default new IdleMode()
