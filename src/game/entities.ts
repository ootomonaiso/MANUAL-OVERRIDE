// ゲームに登場するエンティティの定義と基本操作

export interface Rect { x: number; y: number; w: number; h: number }

// 衝突判定（grace付き — 4px内側を使用してフェア判定）
export function rectsOverlap(a: Rect, b: Rect, grace = 4): boolean {
  const ag = { x: a.x + grace, y: a.y + grace, w: a.w - grace * 2, h: a.h - grace * 2 }
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
  shield = 0       // shield Feature: 1=ガード可能、0=なし（リチャージ中）
  shieldRecharge = 0  // shield Feature: 再チャージまでの残り秒数
  airTime = 0
  runFrame = 0     // ランニングアニメーション（0〜3）
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

  constructor(
    x: number, y: number, w: number, h: number,
    color: string, glowColor: string,
    shape: HazardShape = 'rect',
    hp = 1, isSafe = false,
    floatAmp = 0,
  ) {
    this.x = x; this.y = y; this.w = w; this.h = h
    this.color = color; this.glowColor = glowColor
    this.shape = shape; this.hp = hp; this.maxHp = hp
    this.isSafe = isSafe; this.floatAmp = floatAmp
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
  type: 'exp' | 'hp'
  alive = true
  pulse = Math.random() * Math.PI * 2  // ランダム位相

  constructor(x: number, y: number, type: 'exp' | 'hp') {
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
