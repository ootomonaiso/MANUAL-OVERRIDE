/**
 * game/modes/TowerDefMode.ts
 *
 * タワーディフェンス Mode。
 * 画面左に拠点（城門）。右から敵が波状に接近。
 * タワーを配置して敵を撃破。全ウェーブを耐え切ったらクリア。
 *
 * 操作: 1-3 = タワータイプ選択, Space = プレイヤー位置にタワー配置
 * 勝利: 全ウェーブ（5/5）を耐え切ったらクリア
 * 敗北: 敵が拠点に到達
 */

import type { GameMode } from '../../engine/GameMode'
import type { MutableWorld } from '../../engine/types'
import { PixelCanvas } from '../render'

// ── 定数 ──────────────────────────────────────────────────────────

// 拠点
const CASTLE_X = 20
const CASTLE_W = 48
const CASTLE_H = 160
const BASE_HP_MAX = 100

// タワー
const TOWER_TYPES = 3
const TOWER_RANGE = 180
const TOWER_ATTACK_INTERVAL = [0.5, 1.0, 0.8] as const  // 秒
const TOWER_DAMAGE = [20, 50, 10] as const                // ダメージ
const TOWER_COST = [50, 150, 100] as const                // コスト
const TOWER_PROJECTILE_SPEED = 400                        // px/s

// 敵
const ENEMY_BASE_HP = 30
const ENEMY_SPEED = 40
const ENEMY_SPAWN_INTERVAL = 1.5  // 秒
const ENEMY_SIZE = 20

// ウェーブ
const WAVE_COUNT = 5
const ENEMIES_PER_WAVE = [5, 8, 12, 16, 20] as const
const WAVE_GAP_SEC = 5.0
const BOSS_WAVE = 5  // 最終ウェーブにボス出現

// 金貨
const GOLD_START = 200
const GOLD_PER_KILL = 15
const GOLD_PER_WAVE_CLEAR = 50

// 視覚
const SKY_TOP = '#0a0f1a'
const SKY_BOTTOM = '#0d1420'
const GROUND_COLOR = '#1a2030'
const ENEMY_COLOR = '#dd5522'
const CASTLE_COLOR = '#1a2040'
const CASTLE_DOOR_COLOR = '#050810'
const PARTICLE_COLORS = ['#ff8844', '#ffcc44', '#ff6644', '#ffeecc'] as const

// UI
const HUD_X = 10
const HUD_Y = 10
const HUD_W = 220
const HUD_H = 80
const TOWER_SELECT_Y = 10
const TOWER_SELECT_X = 10
const TOWER_SELECT_BTN_W = 70
const TOWER_SELECT_BTN_H = 32
const TOWER_SELECT_GAP = 6

// 射撃エフェクト
const PROJECTILE_SIZE = 4
const HIT_PARTICLE_COUNT = 5

// 敵エンティティの内部ID型
interface EnemyEntity {
  x: number
  y: number
  hp: number
  maxHp: number
  speed: number
  slowTimer: number
  alive: boolean
  id: number
}

export interface TowerDefModeState {
  // 経済
  gold: number
  // ウェーブ
  currentWave: number
  waveTimer: number
  waveInProgress: boolean
  enemiesSpawnedThisWave: number
  waveClearBonusGiven: boolean
  // 敵
  enemies: EnemyEntity[]
  // タワー
  towers: {
    x: number; y: number; type: number
    shootTimer: number; targetId: number | null
  }[]
  // 射撃
  projectiles: {
    x: number; y: number; targetId: number
    speed: number; damage: number; type: number
    life: number
  }[]
  // パーティクル
  particles: {
    x: number; y: number; vx: number; vy: number
    life: number; color: string; size: number
  }[]
  // ゲーム状態
  baseHp: number
  totalKills: number
  selectedTowerType: number
  gameStarted: boolean
  waveAnnounceTimer: number
  initialized: boolean
}

function initialState(): TowerDefModeState {
  return {
    gold: GOLD_START,
    currentWave: 0,
    waveTimer: 0,
    waveInProgress: false,
    enemiesSpawnedThisWave: 0,
    waveClearBonusGiven: false,
    enemies: [],
    towers: [],
    projectiles: [],
    particles: [],
    baseHp: BASE_HP_MAX,
    totalKills: 0,
    selectedTowerType: 0,
    gameStarted: false,
    waveAnnounceTimer: 0,
    initialized: false,
  }
}

function formatWave(n: number): string {
  return `${n}/${WAVE_COUNT}`
}

export class TowerDefMode implements GameMode {
  readonly id = 'tower_def'

  private state: TowerDefModeState
  private _nextEnemyId = 0

  constructor() {
    this.state = initialState()
    this.state.initialized = true
  }

  setup(_world: MutableWorld): void {
    this.state = initialState()
    this.state.initialized = true
    this._nextEnemyId = 0
  }

  update(world: MutableWorld, dt: number): void {
    const input = world.input
    const canvas = world.canvas
    const W = canvas.width
    const H = canvas.height
    const groundY = H * 0.7

    if (!this.state.initialized) {
      this.setup(world)
    }

    // ─── ゲーム開始判定 ────────────────────────────────────────
    if (!this.state.gameStarted) {
      if (input.keys.has('Space')) {
        this.state.gameStarted = true
        this._startWave(1)
      } else {
        return
      }
    }

    this.state.waveTimer += dt

    // ─── ウェーブ管理 ──────────────────────────────────────────
    if (!this.state.waveInProgress) {
      // ウェーブ間の待機
      if (this.state.waveTimer >= WAVE_GAP_SEC) {
        this.state.waveTimer = 0
        if (this.state.currentWave < WAVE_COUNT) {
          this._startWave(this.state.currentWave + 1)
        }
      }
      // 全ウェーブクリア判定（勝利）
      if (this.state.currentWave >= WAVE_COUNT && !this.state.waveInProgress) {
        return // isWon が true
      }
      // ウェーブ告知タイマー
      if (this.state.waveAnnounceTimer > 0) {
        this.state.waveAnnounceTimer -= dt
      }
    } else {
      // ウェーブ中: 敵スポーン
      const waveIdx = this.state.currentWave - 1
      const expectedCount = ENEMIES_PER_WAVE[waveIdx]
      if (this.state.enemiesSpawnedThisWave < expectedCount) {
        if (this.state.waveTimer >= ENEMY_SPAWN_INTERVAL) {
          this.state.waveTimer = 0
          this._spawnEnemy(W, groundY, waveIdx)
          this.state.enemiesSpawnedThisWave++
        }
      }

      // 敵が全滅したらウェーブクリア
      const aliveEnemies = this.state.enemies.filter(e => e.alive)
      if (aliveEnemies.length === 0 && this.state.enemiesSpawnedThisWave >= expectedCount) {
        this.state.waveInProgress = false
        this.state.waveTimer = 0
        this.state.waveClearBonusGiven = false
        // ボーナス金貨
        this.state.gold += GOLD_PER_WAVE_CLEAR
        world.addScorePopup(W / 2, H / 2 - 60, `WAVE ${this.state.currentWave} CLEAR! +${GOLD_PER_WAVE_CLEAR}G`, '#ffcc44')
        if (this.state.currentWave >= WAVE_COUNT) {
          world.addScorePopup(W / 2, H / 2, 'ALL WAVES CLEARED!', '#ffdd44')
        }
      }
    }

    // ─── 敵更新 ────────────────────────────────────────────────
    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue

      // 減速状態
      let speed = enemy.speed
      if (enemy.slowTimer > 0) {
        enemy.slowTimer -= dt
        speed *= 0.5
      }

      // 左へ移動
      enemy.x -= speed * dt

      // 拠点に到達
      if (enemy.x <= CASTLE_X + CASTLE_W) {
        enemy.alive = false
        this.state.baseHp -= 10
        world.triggerShake(0.5)
        world.addScorePopup(CASTLE_X + CASTLE_W, groundY - 40, '-10 HP', '#ff4444')
        if (this.state.baseHp <= 0) {
          this.state.baseHp = 0
          return // isLost が true
        }
      }
    }

    // 死んだ敵を削除
    this.state.enemies = this.state.enemies.filter(e => e.alive)

    // ─── タワー更新（自動攻撃） ─────────────────────────────────
    for (const tower of this.state.towers) {
      tower.shootTimer -= dt
      if (tower.shootTimer <= 0) {
        const target = this._findNearestTarget(tower)
        if (target !== null) {
          this._fireProjectile(tower, target)
          tower.shootTimer = TOWER_ATTACK_INTERVAL[tower.type]
          tower.targetId = target
        }
      }
    }

    // ─── 射撃更新 ──────────────────────────────────────────────
    for (const proj of this.state.projectiles) {
      // ターゲットを探す
      const target = this.state.enemies.find(e => e.alive && e.id === proj.targetId)
      if (!target) {
        proj.life = 0 // ターゲットがいないので消滅
        continue
      }

      const dx = target.x - proj.x
      const dy = target.y - proj.y
      const dist = Math.hypot(dx, dy)

      if (dist < ENEMY_SIZE) {
        // 命中
        target.hp -= proj.damage
        if (target.hp <= 0) {
          target.alive = false
          this.state.totalKills++
          this.state.gold += GOLD_PER_KILL
          world.addScore(GOLD_PER_KILL)
          world.addScorePopup(target.x, target.y - 10, `+${GOLD_PER_KILL}G`, '#ffcc44')
          this._spawnHitParticles(target.x, target.y)
        } else {
          // 減速効果（アイスタワー）
          if (proj.type === 2) {
            target.slowTimer = 2.0
          }
          this._spawnHitParticles(target.x, target.y)
        }
        proj.life = 0
      } else {
        // 移動
        const moveSpeed = TOWER_PROJECTILE_SPEED * dt
        proj.x += (dx / dist) * moveSpeed
        proj.y += (dy / dist) * moveSpeed
      }
    }

    this.state.projectiles = this.state.projectiles.filter(p => p.life > 0)

    // ─── パーティクル更新 ──────────────────────────────────────
    this.state.particles = this.state.particles.filter(p => {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 100 * dt
      p.life -= dt
      return p.life > 0
    })

    // ─── キー入力: タワータイプ選択 ────────────────────────────
    for (let i = 0; i < TOWER_TYPES; i++) {
      const key = `${i + 1}`
      if (input.justPressed.has(key) || input.keys.has(key)) {
        this.state.selectedTowerType = i
      }
    }

    // ─── キー入力: タワー配置（Space でプレイヤー位置に配置） ─────
    // justReleased を使用（justPressed だとゲーム開始フレームと競合するため）
    // プレイヤーは Space を離してから再び押すことでタワーを配置する
    if (input.justReleased.has('Space') && this.state.gameStarted) {
      this._tryPlaceTowerAtPlayer(world)
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const W = world.canvas.width
    const H = world.canvas.height
    const px = new PixelCanvas(ctx)
    const s = this.state
    const groundY = H * 0.7

    // ─── 背景（夜空） ──────────────────────────────────────────
    px.bandGradient(0, 0, W, H,
      [[0, SKY_TOP], [0.6, SKY_BOTTOM], [1, GROUND_COLOR]],
      'v', 8,
    )

    // ─── 地面 ──────────────────────────────────────────────────
    px.rect(0, groundY, W, H - groundY, GROUND_COLOR)

    // 地面の石畳パターン
    const tileW = 32
    const startX = 0
    px.withAlpha(0.08, () => {
      for (let tx = startX; tx < W; tx += tileW) {
        px.line(tx, groundY - 1, tx, groundY, '#2a3050', 1)
      }
    })

    // ─── 拠点（城門） ──────────────────────────────────────────
    this._drawCastle(px, CASTLE_X, groundY)

    // 拠点HPバー
    this._drawBaseHpBar(px, W, s)

    // ─── タワー ────────────────────────────────────────────────
    for (const tower of s.towers) {
      this._drawTower(px, tower.x, tower.y, tower.type)
    }

    // ─── 敵 ────────────────────────────────────────────────────
    for (const enemy of s.enemies) {
      if (!enemy.alive) continue
      this._drawEnemy(px, enemy)
    }

    // ─── 射撃 ──────────────────────────────────────────────────
    for (const proj of s.projectiles) {
      const projColor = proj.type === 0 ? '#ffcc44' : proj.type === 1 ? '#ff6644' : '#66aaff'
      px.circle(proj.x, proj.y, PROJECTILE_SIZE, projColor)
      px.halo(
        (expand, color) => px.circle(proj.x, proj.y, PROJECTILE_SIZE + expand * 0.5, color),
        projColor, 2,
      )
    }

    // ─── パーティクル ──────────────────────────────────────────
    for (const p of s.particles) {
      px.circle(p.x, p.y, p.size, p.color)
    }

    // ─── HUD ───────────────────────────────────────────────────
    this._drawHUD(px, W, s)

    // ─── タワー選択ボタン ──────────────────────────────────────
    this._drawTowerSelectButtons(px, W, s)

    // ─── 未開始メッセージ ──────────────────────────────────────
    if (!s.gameStarted) {
      px.text('Press Space to start!', W / 2, H / 2 - 60, {
        font: 'bold 18px monospace', fill: '#ffffff', align: 'center',
      })
      px.text('1-3: Tower type | Space: Place at player', W / 2, H / 2 - 30, {
        font: '12px monospace', fill: 'rgba(255,255,255,0.5)', align: 'center',
      })
    }

    // ─── ウェーブ告知 ──────────────────────────────────────────
    if (s.waveAnnounceTimer > 0) {
      const alpha = Math.min(1, s.waveAnnounceTimer / 1.0)
      px.text(`WAVE ${s.currentWave}`, W / 2, H / 2 - 20, {
        font: 'bold 32px monospace', fill: '#ff8844', alpha, align: 'center',
      })
    }
  }

  isWon(_world: MutableWorld): boolean {
    return this.state.currentWave >= WAVE_COUNT && !this.state.waveInProgress
  }

  isLost(_world: MutableWorld): boolean {
    return this.state.baseHp <= 0
  }

  // ─── 内部メソッド ───────────────────────────────────────────────

  private _startWave(waveNum: number): void {
    this.state.currentWave = waveNum
    this.state.waveInProgress = true
    this.state.enemiesSpawnedThisWave = 0
    this.state.waveTimer = 0
    this.state.waveAnnounceTimer = 2.0
  }

  private _spawnEnemy(W: number, groundY: number, waveIdx: number): void {
    const isBoss = this.state.currentWave === BOSS_WAVE &&
      this.state.enemiesSpawnedThisWave === ENEMIES_PER_WAVE[waveIdx] - 1

    const hp = isBoss ? ENEMY_BASE_HP * 5 : ENEMY_BASE_HP + waveIdx * 10
    const speed = isBoss ? ENEMY_SPEED * 0.6 : ENEMY_SPEED + waveIdx * 3

    this.state.enemies.push({
      x: W + Math.random() * 100,
      y: groundY - ENEMY_SIZE / 2 + (Math.random() - 0.5) * 40,
      hp,
      maxHp: hp,
      speed,
      slowTimer: 0,
      alive: true,
      id: this._nextEnemyId++,
    })
  }

  private _findNearestTarget(tower: { x: number; y: number }): number | null {
    let closestId = -1
    let closestDist = Infinity

    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue
      const dist = Math.hypot(enemy.x - tower.x, enemy.y - tower.y)
      if (dist <= TOWER_RANGE && dist < closestDist) {
        closestDist = dist
        closestId = enemy.id
      }
    }

    return closestId
  }

  private _fireProjectile(tower: { x: number; y: number; type: number }, targetId: number): void {
    this.state.projectiles.push({
      x: tower.x,
      y: tower.y,
      targetId,
      speed: TOWER_PROJECTILE_SPEED,
      damage: TOWER_DAMAGE[tower.type],
      type: tower.type,
      life: 1.0, // 1秒以内にターゲットに到達しなければ消滅
    })
  }

  private _tryPlaceTower(world: MutableWorld, mouseX: number, mouseY: number): void {
    const s = this.state
    const canvas = world.canvas
    const W = canvas.width
    const H = canvas.height
    const groundY = H * 0.7

    // 配置可能範囲: 城門の右側、画面右端より前
    const minPlaceX = CASTLE_X + CASTLE_W + 20
    const maxPlaceX = W - 40
    const minPlaceY = 40
    const maxPlaceY = groundY - 20

    if (mouseX < minPlaceX || mouseX > maxPlaceX ||
        mouseY < minPlaceY || mouseY > maxPlaceY) {
      return
    }

    // 既存タワーと重ならないかチェック
    for (const tower of s.towers) {
      const dist = Math.hypot(mouseX - tower.x, mouseY - tower.y)
      if (dist < 30) return
    }

    const cost = TOWER_COST[s.selectedTowerType]
    if (s.gold < cost) return

    s.gold -= cost
    s.towers.push({
      x: mouseX,
      y: mouseY,
      type: s.selectedTowerType,
      shootTimer: 0,
      targetId: null,
    })

    world.addScorePopup(mouseX, mouseY - 20, `-${cost}G`, '#ff6644')
  }

  /**
   * プレイヤーの現在位置にタワーを配置（キー操作対応, #fix-towerdef-input）。
   * 配置可能範囲: 城門から一定距離以内（TOWER_RANGE 以内）。
   */
  private _tryPlaceTowerAtPlayer(world: MutableWorld): void {
    const s = this.state
    const px = world.player
    const placeX = px.x + px.w / 2
    const placeY = px.y + px.h / 2
    const groundY = world.canvas.height * 0.7

    // 配置可能範囲: 城門の右側、プレイヤー位置が城門から TOWER_RANGE 以内
    const minPlaceX = CASTLE_X + CASTLE_W + 20
    const maxPlaceX = Math.min(world.canvas.width - 40, CASTLE_X + CASTLE_W + TOWER_RANGE)
    const minPlaceY = 40
    const maxPlaceY = groundY - 20

    if (placeX < minPlaceX || placeX > maxPlaceX ||
        placeY < minPlaceY || placeY > maxPlaceY) {
      return
    }

    // 既存タワーと重ならないかチェック
    for (const tower of s.towers) {
      const dist = Math.hypot(placeX - tower.x, placeY - tower.y)
      if (dist < 30) return
    }

    const cost = TOWER_COST[s.selectedTowerType]
    if (s.gold < cost) return

    s.gold -= cost
    s.towers.push({
      x: placeX,
      y: placeY,
      type: s.selectedTowerType,
      shootTimer: 0,
      targetId: null,
    })

    world.addScorePopup(placeX, placeY - 20, `-${cost}G`, '#ff6644')
  }

  private _spawnHitParticles(x: number, y: number): void {
    for (let i = 0; i < HIT_PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 60
      this.state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.2,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        size: 2 + Math.random() * 2,
      })
    }
  }

  private _drawCastle(px: PixelCanvas, x: number, groundY: number): void {
    const gateW = CASTLE_W
    const gateH = CASTLE_H

    // 門柱
    px.rect(x, groundY - gateH, 8, gateH, CASTLE_COLOR)
    px.rect(x + gateW - 8, groundY - gateH, 8, gateH, CASTLE_COLOR)

    // 門の上部（アーチ）
    px.halfCircle(x + gateW / 2, groundY - gateH, gateW / 2 - 4, 'up', CASTLE_COLOR)

    // 門の開口部
    const openingW = gateW - 20
    const openingH = gateH * 0.6
    px.rect(x + 10, groundY - openingH, openingW, openingH, CASTLE_DOOR_COLOR)

    // 横梁
    px.rect(x, groundY - gateH + 6, gateW, 4, '#2a3050')

    // 城壁
    px.rect(x - 10, groundY - gateH - 20, gateW + 20, 20, '#151a30')
  }

  private _drawBaseHpBar(px: PixelCanvas, W: number, s: TowerDefModeState): void {
    const barW = 200
    const barH = 16
    const barX = W / 2 - barW / 2
    const barY = 14

    // バックグラウンド
    px.roundedRect(barX, barY, barW, barH, 'rgba(0,0,0,0.6)', 2)

    // HP
    const hpRatio = s.baseHp / BASE_HP_MAX
    const hpColor = hpRatio > 0.5 ? '#44ff88' : hpRatio > 0.25 ? '#ffcc44' : '#ff4444'
    px.rect(barX + 2, barY + 2, (barW - 4) * hpRatio, barH - 4, hpColor)

    // テキスト
    px.text(`BASE HP: ${s.baseHp}/${BASE_HP_MAX}`, W / 2, barY + barH + 4, {
      font: '10px monospace', fill: '#ffffff', align: 'center',
    })
  }

  private _drawTower(px: PixelCanvas, x: number, y: number, type: number): void {
    const size = 16
    if (type === 0) {
      // アロータワー（三角形）
      px.tri(x - size, y + size, size * 2, size * 2, 'up', '#ffcc44')
      px.rect(x - 3, y + size, 6, size, '#aa8822')
    } else if (type === 1) {
      // キャノン（円形）
      px.circle(x, y, size, '#ff6644')
      px.circle(x, y, size - 4, '#cc4422')
      px.rect(x + size - 2, y - 3, 10, 6, '#884422')
    } else {
      // アイス（四角形）
      px.rect(x - size, y - size, size * 2, size * 2, '#66aaff')
      px.rect(x - size + 3, y - size + 3, size * 2 - 6, size * 2 - 6, '#4488dd')
      px.halo(
        (expand, color) => px.rect(x - size - expand, y - size - expand,
          (size + expand) * 2, (size + expand) * 2, color),
        '#88ccff', 2,
      )
    }
  }

  private _drawEnemy(px: PixelCanvas, enemy: EnemyEntity): void {
    const x = enemy.x
    const y = enemy.y
    const size = ENEMY_SIZE

    // 減速エフェクト
    if (enemy.slowTimer > 0) {
      px.withAlpha(0.3, () => {
        px.circle(x, y, size + 4, '#66aaff')
      })
    }
    // 本体
    px.rect(x - size / 2, y - size / 2, size, size, ENEMY_COLOR)
    // 目
    px.rect(x - 5, y - 3, 3, 3, '#ffffff')
    px.rect(x + 2, y - 3, 3, 3, '#ffffff')
    // HP バー
    const hpRatio = Math.max(0, enemy.hp / enemy.maxHp)
    const hpBarW = size
    const hpBarH = 3
    px.rect(x - hpBarW / 2, y - size / 2 - 6, hpBarW, hpBarH, 'rgba(0,0,0,0.5)')
    px.rect(x - hpBarW / 2, y - size / 2 - 6, hpBarW * hpRatio, hpBarH, '#44ff88')
  }

  private _drawHUD(px: PixelCanvas, W: number, s: TowerDefModeState): void {
    const hx = HUD_X
    const hy = HUD_Y
    const hw = HUD_W
    const hh = HUD_H

    px.roundedRect(hx, hy, hw, hh, 'rgba(10,15,26,0.75)', 2)

    // ウェーブ
    px.text(`WAVE`, hx + 10, hy + 14, {
      font: 'bold 12px monospace', fill: '#66aaff',
    })
    px.text(formatWave(s.currentWave), hx + 50, hy + 14, {
      font: 'bold 14px monospace', fill: '#ffffff',
    })

    // 金貨
    px.text(`GOLD`, hx + 10, hy + 34, {
      font: 'bold 12px monospace', fill: '#ffcc44',
    })
    px.text(`${s.gold}`, hx + 55, hy + 34, {
      font: 'bold 14px monospace', fill: '#ffdd66',
    })

    // 撃破数
    px.text(`KILLS`, hx + 10, hy + 54, {
      font: 'bold 12px monospace', fill: '#ff8844',
    })
    px.text(`${s.totalKills}`, hx + 65, hy + 54, {
      font: 'bold 14px monospace', fill: '#ffaa66',
    })

    // 敵数
    const aliveCount = s.enemies.filter(e => e.alive).length
    px.text(`ENEMIES`, hx + 110, hy + 14, {
      font: 'bold 12px monospace', fill: '#dd5522',
    })
    px.text(`${aliveCount}`, hx + 170, hy + 14, {
      font: 'bold 14px monospace', fill: '#ff7744',
    })
  }

  private _drawTowerSelectButtons(px: PixelCanvas, W: number, s: TowerDefModeState): void {
    const names = ['ARROW', 'CANNON', 'ICE']
    const colors = ['#ffcc44', '#ff6644', '#66aaff']

    for (let i = 0; i < TOWER_TYPES; i++) {
      const bx = TOWER_SELECT_X + i * (TOWER_SELECT_BTN_W + TOWER_SELECT_GAP)
      const by = TOWER_SELECT_Y
      const isSelected = s.selectedTowerType === i
      const cost = TOWER_COST[i]
      const canAfford = s.gold >= cost

      // ボタン背景
      const bgColor = isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(20,25,40,0.6)'
      px.roundedRect(bx, by, TOWER_SELECT_BTN_W, TOWER_SELECT_BTN_H, bgColor, 2)

      // 選択ボーダー
      if (isSelected) {
        px.rect(bx, by, TOWER_SELECT_BTN_W, 2, colors[i])
        px.rect(bx, by + TOWER_SELECT_BTN_H - 2, TOWER_SELECT_BTN_W, 2, colors[i])
      }

      // キー番号
      px.text(`${i + 1}`, bx + 6, by + 10, {
        font: 'bold 12px monospace', fill: '#ffffff',
      })

      // 名前
      px.text(names[i], bx + 6, by + 24, {
        font: '9px monospace', fill: canAfford ? colors[i] : '#666666',
      })

      // コスト
      px.text(`${cost}G`, bx + TOWER_SELECT_BTN_W - 20, by + 24, {
        font: '9px monospace', fill: canAfford ? '#ffcc44' : '#666666',
      })
    }
  }
}

export default new TowerDefMode()
