/**
 * game/modes/ArenaMode.ts
 *
 * ウェーブ制アリーナバトル Mode。
 * 画面がアリーナ（左右に壁）で閉じられている。敵が波状に現れ、全滅させると次のウェーブ。
 *
 * - プレイヤー: 左右移動 + ジャンプ + 射撃（Zキー）
 * - 敵: 右端から出現、左へ移動、プレイヤーYに追従
 * - 弾: 右方向発射
 * - 5ウェーブ全滅で勝利、HP=0 で敗北
 */

import type { GameMode } from '../../engine/GameMode'
import type { MutableWorld } from '../../engine/types'
import { PixelCanvas } from '../render'

// ── 定数 ──────────────────────────────────────────────────────────

// プレイヤー
const PLAYER_W = 24
const PLAYER_H = 32
const PLAYER_GRAVITY = 1200
const PLAYER_MOVE_SPEED = 200
const PLAYER_JUMP_VEL = -500
const PLAYER_MAX_HP = 3
const PLAYER_INVINCIBLE_SEC = 1.0
const PLAYER_START_X = 80

// アリーナ
const WALL_WIDTH = 20
const GROUND_Y_RATIO = 0.8

// 敵
const ENEMY_W = 24
const ENEMY_H = 24
const ENEMY_BASE_HP = 2
const ENEMY_BASE_SPEED = 60
const ENEMY_SPEED_PER_WAVE = 15
const ENEMY_Y_TRACK_SPEED = 40
const ENEMY_SPAWN_INTERVAL = 1.5

// 弾
const BULLET_SPEED = 400
const BULLET_W = 8
const BULLET_H = 4
const BULLET_COLOR = '#ffcc44'
const SHOOT_INTERVAL = 0.3

// ウェーブ
const WAVE_COUNT = 5
const ENEMIES_PER_WAVE = [3, 5, 7, 10, 13] as const
const WAVE_GAP_SEC = 3.0
const WAVE_ANNOUNCE_SEC = 2.0
const POINTS_PER_KILL = 100

// 色
const COLOR_PLAYER = '#44aaff'
const COLOR_PLAYER_HITS = '#ff4444'
const COLOR_ENEMY = '#dd3322'
const COLOR_ENEMY_EYE = '#ffffff'
const COLOR_WALL = '#3a2a1a'
const COLOR_WALL_LIGHT = '#5a4a2a'
const COLOR_GROUND = '#2a1a0a'
const COLOR_ARENA_BG = '#0a0505'
const PARTICLE_COLORS = ['#ff4422', '#ff8844', '#ffcc44', '#ffffff'] as const

// HUD
const HUD_FONT = '14px monospace'
const HEART_SIZE = 12

// 内部型
interface EnemyEntity {
  x: number
  y: number
  hp: number
  maxHp: number
  speed: number
  alive: boolean
  id: number
}

interface BulletEntity {
  x: number
  y: number
  alive: boolean
}

interface ArenaModeState {
  // ウェーブ
  currentWave: number
  waveTimer: number
  waveInProgress: boolean
  enemiesSpawnedThisWave: number
  waveAnnounceTimer: number
  // 敵
  enemies: EnemyEntity[]
  // 弾
  bullets: BulletEntity[]
  // パーティクル
  particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[]
  // ゲーム状態
  totalKills: number
  gameStarted: boolean
  initialized: boolean
}

function initialState(): ArenaModeState {
  return {
    currentWave: 0,
    waveTimer: 0,
    waveInProgress: false,
    enemiesSpawnedThisWave: 0,
    waveAnnounceTimer: 0,
    enemies: [],
    bullets: [],
    particles: [],
    totalKills: 0,
    gameStarted: false,
    initialized: false,
  }
}

export class ArenaMode implements GameMode {
  readonly id = 'arena'

  private state: ArenaModeState = initialState()
  private _playerHp = PLAYER_MAX_HP
  private _playerY = 300
  private _playerVy = 0
  private _playerOnGround = false
  private _shootTimer = 0
  private _invincibleTimer = 0
  private _nextEnemyId = 0
  private _playerDrawX = PLAYER_START_X
  private _initialized = false

  setup(_world: MutableWorld): void {
    this.state = initialState()
    this.state.initialized = true
    this._playerHp = PLAYER_MAX_HP
    this._playerY = 300
    this._playerVy = 0
    this._playerOnGround = false
    this._shootTimer = 0
    this._invincibleTimer = 0
    this._nextEnemyId = 0
    this._playerDrawX = PLAYER_START_X
    this._initialized = true
  }

  update(world: MutableWorld, dt: number): void {
    const canvas = world.canvas
    const W = canvas.width
    const H = canvas.height
    const input = world.input
    const groundY = H * GROUND_Y_RATIO

    if (!this._initialized) {
      this.setup(world)
    }

    // ─── ゲーム開始待機 ────────────────────────────────────────
    if (!this.state.gameStarted) {
      if (input.keys.has('Space')) {
        this.state.gameStarted = true
        this._startWave(1)
      } else {
        return
      }
    }

    this.state.waveTimer += dt

    // ─── 無敵タイマー ─────────────────────────────────────────
    if (this._invincibleTimer > 0) {
      this._invincibleTimer -= dt
    }

    // ─── ウェーブ管理 ──────────────────────────────────────────
    if (!this.state.waveInProgress) {
      if (this.state.waveTimer >= WAVE_GAP_SEC) {
        this.state.waveTimer = 0
        if (this.state.currentWave < WAVE_COUNT) {
          this._startWave(this.state.currentWave + 1)
        }
      }
    } else {
      const waveIdx = this.state.currentWave - 1
      const expectedCount = ENEMIES_PER_WAVE[waveIdx]

      // 敵スポーン
      if (this.state.enemiesSpawnedThisWave < expectedCount) {
        if (this.state.waveTimer >= ENEMY_SPAWN_INTERVAL) {
          this.state.waveTimer = 0
          this._spawnEnemy(W, groundY)
          this.state.enemiesSpawnedThisWave++
        }
      }

      // 全敵撃破チェック
      const aliveEnemies = this.state.enemies.filter(e => e.alive)
      if (aliveEnemies.length === 0 && this.state.enemiesSpawnedThisWave >= expectedCount) {
        this.state.waveInProgress = false
        this.state.waveTimer = 0
        world.setCombo(this.state.totalKills)
        world.addScorePopup(W / 2, H / 2 - 40, `WAVE ${this.state.currentWave} CLEAR!`, '#ffcc44')
        if (this.state.currentWave >= WAVE_COUNT) {
          world.addScorePopup(W / 2, H / 2, 'ALL WAVES CLEARED!', '#ffdd44')
        }
      }
    }

    // W1: waveAnnounceTimer は waveInProgress 関係なく減算する
    if (this.state.waveAnnounceTimer > 0) {
      this.state.waveAnnounceTimer -= dt
    }

    // ─── プレイヤー物理 ───────────────────────────────────────
    // 左右移動（直接加算）
    const moveSpeed = PLAYER_MOVE_SPEED * dt
    if (input.keys.has('ArrowLeft')) {
      this._playerDrawX -= moveSpeed
    }
    if (input.keys.has('ArrowRight')) {
      this._playerDrawX += moveSpeed
    }
    // 壁クランプ
    this._playerDrawX = Math.max(WALL_WIDTH, Math.min(W - WALL_WIDTH - PLAYER_W, this._playerDrawX))

    // ジャンプ
    if (input.justPressed.has('Space') && this._playerOnGround) {
      this._playerVy = PLAYER_JUMP_VEL
      this._playerOnGround = false
    }

    // 重力
    this._playerVy += PLAYER_GRAVITY * dt

    // 位置更新
    this._playerY += this._playerVy * dt

    // 地面衝突
    if (this._playerY + PLAYER_H >= groundY) {
      this._playerY = groundY - PLAYER_H
      this._playerVy = 0
      this._playerOnGround = true
    }

    // 射撃
    this._shootTimer -= dt
    if (input.keys.has('z') && this._shootTimer <= 0) {
      this._shootTimer = SHOOT_INTERVAL
      this.state.bullets.push({
        x: this._playerDrawX + PLAYER_W,
        y: this._playerY + PLAYER_H / 2 - BULLET_H / 2,
        alive: true,
      })
    }

    // ─── 弾更新 ───────────────────────────────────────────────
    for (const bullet of this.state.bullets) {
      if (!bullet.alive) continue
      bullet.x += BULLET_SPEED * dt

      if (bullet.x > W + 20) {
        bullet.alive = false
        continue
      }

      // 敵命中判定
      for (const enemy of this.state.enemies) {
        if (!enemy.alive) continue
        if (bullet.x < enemy.x + ENEMY_W && bullet.x + BULLET_W > enemy.x &&
            bullet.y < enemy.y + ENEMY_H && bullet.y + BULLET_H > enemy.y) {
          bullet.alive = false
          enemy.hp--
          if (enemy.hp <= 0) {
            enemy.alive = false
            this.state.totalKills++
            world.setKills(this.state.totalKills)
            world.addScore(POINTS_PER_KILL)
            world.addScorePopup(enemy.x, enemy.y - 10, `+${POINTS_PER_KILL}`, '#ffcc44')
            this._spawnHitParticles(enemy.x + ENEMY_W / 2, enemy.y + ENEMY_H / 2)
          } else {
            this._spawnHitParticles(bullet.x, bullet.y)
          }
          break
        }
      }
    }
    this.state.bullets = this.state.bullets.filter(b => b.alive)

    // ─── 敵更新 ───────────────────────────────────────────────
    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue

      // 左へ移動
      enemy.x -= enemy.speed * dt

      // Y 追従
      const dy = this._playerY - enemy.y
      enemy.y += Math.sign(dy) * ENEMY_Y_TRACK_SPEED * dt

      // 画面外 or プレイヤー接触
      if (enemy.x + ENEMY_W < -20) {
        enemy.alive = false
        continue
      }

      // プレイヤー接触
      if (this._invincibleTimer <= 0 &&
          this._playerDrawX < enemy.x + ENEMY_W && this._playerDrawX + PLAYER_W > enemy.x &&
          this._playerY < enemy.y + ENEMY_H && this._playerY + PLAYER_H > enemy.y) {
        this._playerHp--
        this._invincibleTimer = PLAYER_INVINCIBLE_SEC
        enemy.alive = false
        world.triggerShake(0.4)
        world.addScorePopup(this._playerDrawX, this._playerY - 20, '-1 HP', '#ff4444')
        if (this._playerHp <= 0) {
          this._playerHp = 0
          return  // isLost が true
        }
      }
    }
    this.state.enemies = this.state.enemies.filter(e => e.alive)

    // ─── パーティクル更新 ─────────────────────────────────────
    this.state.particles = this.state.particles.filter(p => {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 200 * dt
      p.life -= dt
      return p.life > 0
    })
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const canvas = world.canvas
    const W = canvas.width
    const H = canvas.height
    const px = new PixelCanvas(ctx)
    const groundY = H * GROUND_Y_RATIO
    const s = this.state

    // ─── 背景 ─────────────────────────────────────────────────
    px.bandGradient(0, 0, W, H,
      [[0, COLOR_ARENA_BG], [0.7, COLOR_ARENA_BG], [1, COLOR_GROUND]], 'v', 8)

    // ─── 地面 ─────────────────────────────────────────────────
    px.rect(0, groundY, W, H - groundY, COLOR_GROUND)

    // ─── 壁 ───────────────────────────────────────────────────
    this._drawWall(px, 0, groundY, WALL_WIDTH, COLOR_WALL, COLOR_WALL_LIGHT)
    this._drawWall(px, W - WALL_WIDTH, groundY, WALL_WIDTH, COLOR_WALL, COLOR_WALL_LIGHT)

    // ─── 敵描画 ───────────────────────────────────────────────
    for (const enemy of s.enemies) {
      if (!enemy.alive) continue
      this._drawEnemy(px, enemy)
    }

    // ─── 弾描画 ───────────────────────────────────────────────
    for (const bullet of s.bullets) {
      if (!bullet.alive) continue
      px.rect(bullet.x, bullet.y, BULLET_W, BULLET_H, BULLET_COLOR)
      px.halo(
        (expand, color) => px.rect(bullet.x - expand, bullet.y - expand / 2,
          BULLET_W + expand * 2, BULLET_H + expand, color),
        BULLET_COLOR, 2,
      )
    }

    // ─── プレイヤー描画 ───────────────────────────────────────
    // C9: _playerY は既にプレイヤーの上辺 Y なので - PLAYER_H しない
    const drawY = this._playerY

    if (this._invincibleTimer > 0) {
      // 点滅
      if (Math.sin(performance.now() * 0.02) > 0) {
        this._drawPlayer(px, this._playerDrawX, drawY, PLAYER_W, PLAYER_H, COLOR_PLAYER_HITS)
      }
    } else {
      this._drawPlayer(px, this._playerDrawX, drawY, PLAYER_W, PLAYER_H, COLOR_PLAYER)
    }

    // ─── パーティクル ─────────────────────────────────────────
    for (const p of s.particles) {
      px.circle(p.x, p.y, p.size, p.color)
    }

    // ─── HUD ──────────────────────────────────────────────────
    this._drawHUD(px, W, H, s)

    // ─── 未開始メッセージ ──────────────────────────────────────
    if (!s.gameStarted) {
      px.text('Press Space to start!', W / 2, H / 2 - 60, {
        font: 'bold 18px monospace', fill: '#ffffff', align: 'center',
      })
      px.text('Arrows: Move/Jump | Z: Shoot', W / 2, H / 2 - 30, {
        font: '12px monospace', fill: 'rgba(255,255,255,0.5)', align: 'center',
      })
    }

    // ─── ウェーブ告知 ─────────────────────────────────────────
    if (s.waveAnnounceTimer > 0) {
      const alpha = Math.min(1, s.waveAnnounceTimer / 1.0)
      px.text(`WAVE ${s.currentWave}`, W / 2, H / 2 - 20, {
        font: 'bold 36px monospace', fill: '#ff4422', alpha, align: 'center',
      })
    }
  }

  isWon(_world: MutableWorld): boolean {
    return this.state.currentWave >= WAVE_COUNT && !this.state.waveInProgress
  }

  isLost(_world: MutableWorld): boolean {
    return this._playerHp <= 0
  }

  // ─── 内部 ───────────────────────────────────────────────────────

  private _startWave(waveNum: number): void {
    this.state.currentWave = waveNum
    this.state.waveInProgress = true
    this.state.enemiesSpawnedThisWave = 0
    this.state.waveTimer = 0
    this.state.waveAnnounceTimer = WAVE_ANNOUNCE_SEC
  }

  private _spawnEnemy(W: number, groundY: number): void {
    const waveIdx = this.state.currentWave - 1
    const hp = ENEMY_BASE_HP + waveIdx
    const speed = ENEMY_BASE_SPEED + waveIdx * ENEMY_SPEED_PER_WAVE

    this.state.enemies.push({
      x: W + 20 + Math.random() * 40,
      y: groundY - ENEMY_H + (Math.random() - 0.5) * 60,
      hp,
      maxHp: hp,
      speed,
      alive: true,
      id: this._nextEnemyId++,
    })
  }

  private _spawnHitParticles(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 80
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

  private _drawWall(px: PixelCanvas, x: number, groundY: number, w: number, base: string, light: string): void {
    // 石柱風
    px.rect(x, groundY - 200, w, 200, base)
    px.rect(x, groundY - 200, 3, 200, light)
    px.rect(x + w - 3, groundY - 200, 3, 200, 'rgba(0,0,0,0.3)')
    // 装飾ライン
    for (let i = 0; i < 4; i++) {
      const ly = groundY - 40 - i * 45
      px.rect(x, ly, w, 2, 'rgba(255,200,100,0.15)')
    }
  }

  private _drawPlayer(px: PixelCanvas, x: number, y: number, w: number, h: number, color: string): void {
    // 身体
    px.rect(x, y, w, h, color)
    // ヘルメット
    px.rect(x + 2, y, w - 4, 8, '#2266aa')
    // 目
    px.rect(x + 4, y + 12, 4, 4, '#ffffff')
    px.rect(x + w - 8, y + 12, 4, 4, '#ffffff')
    // 剣
    px.line(x + w, y + h * 0.3, x + w + 16, y + h * 0.2, '#cccccc', 1)
  }

  private _drawEnemy(px: PixelCanvas, enemy: EnemyEntity): void {
    const x = enemy.x
    const y = enemy.y
    const w = ENEMY_W
    const h = ENEMY_H

    // 身体
    px.rect(x, y, w, h, COLOR_ENEMY)
    // 目
    px.rect(x + 3, y + 4, 5, 5, COLOR_ENEMY_EYE)
    px.rect(x + w - 8, y + 4, 5, 5, COLOR_ENEMY_EYE)
    // 口
    px.rect(x + 6, y + h - 8, w - 12, 3, '#440000')
    // HP バー
    const hpRatio = enemy.hp / enemy.maxHp
    const hpBarW = w
    const hpBarH = 3
    px.rect(x, y - 6, hpBarW, hpBarH, 'rgba(0,0,0,0.6)')
    px.rect(x, y - 6, hpBarW * hpRatio, hpBarH, '#44ff88')
  }

  private _drawHUD(px: PixelCanvas, W: number, H: number, s: ArenaModeState): void {
    // ウェーブ + 残敵数（左上）
    const aliveCount = s.enemies.filter(e => e.alive).length
    px.text(`WAVE ${s.currentWave}/${WAVE_COUNT}`, 12, 18, {
      font: HUD_FONT, fill: '#ff8844',
    })
    px.text(`ENEMIES: ${aliveCount}`, 12, 38, {
      font: '12px monospace', fill: '#dd5522',
    })

    // HP ハート（右上）
    const heartX = W - HEART_SIZE * PLAYER_MAX_HP - 12
    const heartY = 14
    for (let i = 0; i < PLAYER_MAX_HP; i++) {
      const hx = heartX + i * (HEART_SIZE + 4)
      if (i < this._playerHp) {
        px.rect(hx, heartY, HEART_SIZE, HEART_SIZE, '#ff4444')
        px.rect(hx + 2, heartY + 2, HEART_SIZE - 4, HEART_SIZE - 4, '#ff6666')
      } else {
        px.rect(hx, heartY, HEART_SIZE, HEART_SIZE, 'rgba(100,0,0,0.5)')
      }
    }

    // 撃破数
    px.text(`KILLS: ${s.totalKills}`, 12, H - 16, {
      font: '12px monospace', fill: '#ffffff',
    })
  }
}

export default new ArenaMode()
