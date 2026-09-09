// ゲームに登場するエンティティの定義と基本操作

export interface Rect { x: number; y: number; w: number; h: number }

// 衝突判定（grace付き — 最大で辺の半分までクランプしてフェア判定）
export function rectsOverlap(a: Rect, b: Rect, grace = 4): boolean {
  const g = Math.min(grace, Math.floor(Math.min(a.w, a.h) / 2))
  const ag = { x: a.x + g, y: a.y + g, w: a.w - g * 2, h: a.h - g * 2 }
  return ag.x < b.x + b.w && ag.x + ag.w > b.x && ag.y < b.y + b.h && ag.y + ag.h > b.y
}

// ──────────────────────────────────────────────────────────────────────
// Player
// ──────────────────────────────────────────────────────────────────────
export class Player {
  x: number; y: number
  w = 36; h = 52
  vy = 0
  vx = 0
  onGround = false
  jumpsLeft = 1
  invincible = 0
  hp = 3
  maxHp = 3
  exp = 0
  currentLevelXp = 0   // 現在レベル内の進行XP（レベルアップでリセット）
  nextLevelXp = 100    // 次のレベルに必要なXP
  hunger = 100
  level = 1
  weaponDamage = 1
  airTime = 0
  landSquash = 0   // 0〜1：着地スカッシュ量

  constructor(x: number, groundY: number) {
    this.x = x
    this.y = groundY - this.h
  }

  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h } }
}

// ──────────────────────────────────────────────────────────────────────
// Hazard（障害物）
// ──────────────────────────────────────────────────────────────────────
export type HazardShape = 'rect' | 'spike' | 'pillar' | 'diamond'

export type HazardDirection = 'right' | 'left'

export class Hazard {
  x: number; y: number
  w: number; h: number
  color: string
  glowColor: string
  shape: HazardShape
  hp: number
  maxHp: number
  isSafe: boolean
  pulse = 0   // 0〜1 sin アニメ（floating系）
  floatAmp = 0  // 上下に浮遊する振幅
  direction: HazardDirection = 'right'

  // ── ギミック用フラグ（runner/bullet_runner/platformer/aquatic）。既定値は全て無効化状態 ──
  /** 弾の当たり判定から除外する（ShootFeature が参照）。障害物・ギミックは弾で壊れない */
  isGimmick = false
  /** 上から乗ると着地できる足場（isSafe と併用。着地判定は sideScroller が処理） */
  isPlatform = false
  /** 着地時に強く跳ね返すバネ（isPlatform 相当の着地判定 + 反発） */
  isSpring = false
  /** 横スクロール専用: 地面が欠落しているマーカー。この区間では通常の地面着地をしない */
  isHole = false
  /** 足場上のプレイヤーに与える水平速度（コンベア用。px/sec） */
  conveyorVx = 0
  /** 水平ドリフト（climb の移動足場用）。MovementFeature の vertical_scroll ドリフト対象 */
  driftEnabled = false
  /** aquatic専用: isSafe な地形・生物・回復オブジェクトの意味分け */
  interactionKind: 'terrain' | 'creature' | 'heal' | undefined = undefined

  constructor(
    x: number, y: number, w: number, h: number,
    color: string, glowColor: string,
    shape: HazardShape = 'rect',
    hp = 1, isSafe = false,
    floatAmp = 0,
    direction: HazardDirection = 'right',
  ) {
    this.x = x; this.y = y; this.w = w; this.h = h
    this.color = color; this.glowColor = glowColor
    this.shape = shape; this.hp = hp; this.maxHp = hp
    this.isSafe = isSafe; this.floatAmp = floatAmp
    this.direction = direction
  }

  get rect(): Rect {
    const floatY = this.floatAmp > 0 ? this.y + Math.sin(this.pulse) * this.floatAmp : this.y
    return { x: this.x, y: floatY, w: this.w, h: this.h }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Bullet（プレイヤーが発射する弾）
// ──────────────────────────────────────────────────────────────────────
export class Bullet {
  x: number; y: number
  w = 14; h = 5
  vx: number; vy: number
  alive = true
  trail: Array<{ x: number; y: number }> = []

  constructor(x: number, y: number, vx: number, vy: number) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy
  }

  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h } }
}

// ──────────────────────────────────────────────────────────────────────
// Item（RPGのアイテム）
// ──────────────────────────────────────────────────────────────────────
export class Item {
  x: number; y: number
  w = 22; h = 22
  type: 'exp' | 'hp' | 'food' | 'weapon'
  alive = true
  pulse = Math.random() * Math.PI * 2  // ランダム位相

  constructor(x: number, y: number, type: 'exp' | 'hp' | 'food' | 'weapon') {
    this.x = x; this.y = y; this.type = type
  }

  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h } }
}

// ──────────────────────────────────────────────────────────────────────
// ScorePopup（スコアポップアップ）
// ──────────────────────────────────────────────────────────────────────
export interface ScorePopup {
  x: number; y: number
  text: string
  color: string
  life: number   // 1→0 で消える
  vy: number
}

// ──────────────────────────────────────────────────────────────────────
// BeatMarker
// ──────────────────────────────────────────────────────────────────────
export interface BeatMarker {
  t: number
  x: number
  strength: number
}
