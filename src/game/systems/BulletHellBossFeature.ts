import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap } from '../entities'
import { BULLET_HELL } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'
import { applyPlayerHitEffect } from './playerHitEffect'

/** ボスの弾幕パターン種別 */
type BossPattern = 'radial' | 'fan' | 'aimed'

interface BulletHellState {
  enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; r: number }>
  hitCombo: number
  hitsOnBoss: number
  maxHitCombo: number
  patternTimer: number
  fireTimer: number
  patternIndex: number
  time: number
}

const PATTERN_ORDER: BossPattern[] = ['radial', 'fan', 'aimed']

// ── 実装固有定数（config 外。マジックナンバー排除） ──────────────────
const CULL_MARGIN_FACTOR = 4
const HIT_POPUP_OFFSET = 16
const HIT_POPUP_TEXT = '+1'
const HIT_POPUP_COLOR = '#ffdd00'
const BULLET_GLOW_BLUR = 6
const BULLET_STROKE_WIDTH = 2

export class BulletHellBossFeature implements FeatureSystem {
  readonly handles = ['boss_stationary'] as const

  private state: BulletHellState = this._fresh()

  private _fresh(): BulletHellState {
    return {
      enemyBullets: [],
      hitCombo: 0,
      hitsOnBoss: 0,
      maxHitCombo: 0,
      patternTimer: 0,
      fireTimer: 0,
      patternIndex: 0,
      time: 0,
    }
  }

  onInit(): void { this.state = this._fresh() }

  onManualUpdated(): void {
    // 説明書更新（ジャンル確定後も続くカード選択）では弾幕の一時状態のみ
    // 初期化する。hitCombo / hitsOnBoss / maxHitCombo はセッション全体の
    // 連続命中記録として保持する（ShootFeature.onManualUpdated の kills/combo
    // 保持と同様の意図、#179 参照）。
    this.state.enemyBullets = []
    this.state.fireTimer = 0
    this.state.patternTimer = 0
    this.state.patternIndex = 0
    // time は update ループ内で加算を続けるため更新しない
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('boss_stationary')) return

    const s = this.state
    s.time += dt

    const W = world.canvas.width
    const H = world.canvas.height
    const bh = BULLET_HELL

    // ── パターン切替 ───────────────────────────────────────────
    s.patternTimer += dt
    if (s.patternTimer >= bh.pattern.patternCycleSec) {
      s.patternTimer -= bh.pattern.patternCycleSec
      s.patternIndex = (s.patternIndex + 1) % PATTERN_ORDER.length
    }
    const pattern = PATTERN_ORDER[s.patternIndex]

    // ── 弾発射 ─────────────────────────────────────────────────
    const bossX = W / 2
    const bossY = bh.boss.yRatio * H
    s.fireTimer = Math.min(s.fireTimer + dt, bh.bullet.fireIntervalSec)
    if (s.fireTimer >= bh.bullet.fireIntervalSec && s.enemyBullets.length < bh.bullet.maxBullets) {
      s.fireTimer -= bh.bullet.fireIntervalSec
      const speed = bh.bullet.speed
      const count = this._patternCount(pattern)
      for (let i = 0; i < count && s.enemyBullets.length < bh.bullet.maxBullets; i++) {
        const angle = this._patternAngle(pattern, i, count, world)
        s.enemyBullets.push({
          x: bossX,
          y: bossY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: bh.bullet.radius,
        })
      }
    }

    // ── 敵弾移動 + 画面外カリング ──────────────────────────────
    for (let i = s.enemyBullets.length - 1; i >= 0; i--) {
      const b = s.enemyBullets[i]
      b.x += b.vx * dt
      b.y += b.vy * dt
      const margin = bh.bullet.radius * CULL_MARGIN_FACTOR
      if (b.x < -margin || b.x > W + margin || b.y < -margin || b.y > H + margin) {
        s.enemyBullets.splice(i, 1)
      }
    }

    // ── 敵弾 × プレイヤー 衝突判定 ──────────────────────────────
    const p = world.player
    if (p.invincible <= 0) {
      // 弾幕ゲーム用の小さな当たり判定（中心の点）。全矩形では大きすぎる
      const hb = bh.playerHitbox.radius
      const hitbox = {
        x: p.x + p.w / 2 - hb,
        y: p.y + p.h / 2 - hb,
        w: hb * 2,
        h: hb * 2,
      }
      for (let i = s.enemyBullets.length - 1; i >= 0; i--) {
        const b = s.enemyBullets[i]
        const bulletRect = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }
        if (rectsOverlap(hitbox, bulletRect, 0)) {
          applyPlayerHitEffect(world, { particleCount: 6 })
          s.hitCombo = 0
          s.enemyBullets.splice(i, 1)
          break  // 1フレームに1被弾のみ（無敵時間で連続被弾を防止）
        }
      }
    }

    // ── 自機弾 × ボス 衝突判定 ─────────────────────────────────
    const bossRect = {
      x: bossX - bh.boss.w / 2,
      y: bossY - bh.boss.h / 2,
      w: bh.boss.w,
      h: bh.boss.h,
    }
    for (const b of world.bullets) {
      if (!b.alive) continue
      if (rectsOverlap(b.rect, bossRect, 0)) {
        b.alive = false
        s.hitsOnBoss++
        s.hitCombo++
        if (s.hitCombo > s.maxHitCombo) s.maxHitCombo = s.hitCombo
        world.addScoreVarsHitsOnBoss()
        world.setScoreVarsMaxHitCombo(s.maxHitCombo)
        // 小スコアポップアップ
        world.addScorePopup(bossX, bossY - bh.boss.h / 2 - HIT_POPUP_OFFSET, HIT_POPUP_TEXT, HIT_POPUP_COLOR)
        // SE（onEnemyHit が利用可能なら）
        soundManager.onEnemyHit?.()
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('boss_stationary')) return

    const bh = BULLET_HELL
    const W = world.canvas.width
    const H = world.canvas.height
    const s = this.state
    const bossX = W / 2
    const bossY = bh.boss.yRatio * H
    const sway = Math.sin(s.time * bh.boss.swaySpeed) * bh.boss.swayAmp

    // ── ボス描画（少女シルエット） ──────────────────────────────
    this._drawBoss(ctx, bossX, bossY + sway)

    // ── 敵弾描画 ────────────────────────────────────────────────
    ctx.save()
    ctx.shadowColor = bh.bullet.rimColor
    ctx.shadowBlur = BULLET_GLOW_BLUR
    ctx.lineWidth = BULLET_STROKE_WIDTH
    for (const b of s.enemyBullets) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fillStyle = bh.bullet.fillColor
      ctx.fill()
      ctx.strokeStyle = bh.bullet.rimColor
      ctx.stroke()
    }
    ctx.shadowBlur = 0
    ctx.restore()
  }

  // ─── 内部: パターン種別に応じた弾数 ──────────────────────────────
  private _patternCount(pattern: BossPattern): number {
    switch (pattern) {
      case 'radial': return BULLET_HELL.pattern.radialCount
      case 'fan':    return BULLET_HELL.pattern.fanCount
      case 'aimed':  return BULLET_HELL.pattern.aimedCount
    }
  }

  // ─── 内部: パターン種別に応じた角度を計算 ─────────────────────────
  private _patternAngle(
    pattern: BossPattern,
    index: number,
    count: number,
    world: MutableWorld,
  ): number {
    const bh = BULLET_HELL
    switch (pattern) {
      case 'radial': {
        // 全方向 360° に均等配置
        return (index / count) * Math.PI * 2
      }
      case 'fan': {
        // 下方扇形（-π/2 が上、π/2 が下）。プレイヤー方向=下 = +y = π/2
        const center = Math.PI / 2
        const spread = bh.pattern.fanSpreadDeg * Math.PI / 180
        const step = count > 1 ? spread / (count - 1) : 0
        return center - spread / 2 + step * index
      }
      case 'aimed': {
        // プレイヤー中心を狙い、spreadDeg で拡散
        const px = world.player.x + world.player.w / 2
        const py = world.player.y + world.player.h / 2
        const baseAngle = Math.atan2(py - BULLET_HELL.boss.yRatio * world.canvas.height, px - world.canvas.width / 2)
        const spread = bh.pattern.aimedSpreadDeg * Math.PI / 180
        const step = count > 1 ? spread / (count - 1) : 0
        return baseAngle - spread / 2 + step * index
      }
    }
  }

  // ─── 内部: 少女シルエット描画（東方風） ───────────────────────────
  private _drawBoss(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const r = BULLET_HELL.boss.w / 2
    const headR = r * 0.28

    // 頭
    ctx.fillStyle = '#f0d0e0'
    ctx.beginPath()
    ctx.arc(x, y - r * 0.35, headR, 0, Math.PI * 2)
    ctx.fill()

    // 髪（両サイドの流れ）
    ctx.fillStyle = '#2a1a3a'
    ctx.beginPath()
    ctx.ellipse(x - headR * 0.9, y - r * 0.2, headR * 0.5, r * 0.45, -0.15, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + headR * 0.9, y - r * 0.2, headR * 0.5, r * 0.45, 0.15, 0, Math.PI * 2)
    ctx.fill()

    // 髪の前髪
    ctx.beginPath()
    ctx.ellipse(x, y - r * 0.55, headR * 1.1, headR * 0.6, 0, Math.PI, Math.PI * 2)
    ctx.fill()

    // 体（ドレス/マント風）
    ctx.fillStyle = '#e8a0b0'
    ctx.beginPath()
    ctx.moveTo(x - headR * 0.6, y - r * 0.05)
    ctx.lineTo(x - r * 0.85, y + r * 0.85)
    ctx.lineTo(x + r * 0.85, y + r * 0.85)
    ctx.lineTo(x + headR * 0.6, y - r * 0.05)
    ctx.closePath()
    ctx.fill()

    // 胸元のリボン
    ctx.fillStyle = '#ff6080'
    ctx.beginPath()
    ctx.moveTo(x, y - r * 0.05)
    ctx.lineTo(x - r * 0.2, y + r * 0.15)
    ctx.lineTo(x + r * 0.2, y + r * 0.15)
    ctx.closePath()
    ctx.fill()

    // 両腕
    ctx.fillStyle = '#f0d0e0'
    ctx.beginPath()
    ctx.ellipse(x - r * 0.55, y + r * 0.15, r * 0.12, r * 0.3, -0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + r * 0.55, y + r * 0.15, r * 0.12, r * 0.3, 0.3, 0, Math.PI * 2)
    ctx.fill()

    // 頭上の光輪（控えめに）
    ctx.strokeStyle = 'rgba(255,220,180,0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.ellipse(x, y - r * 0.7, r * 0.45, r * 0.1, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}
