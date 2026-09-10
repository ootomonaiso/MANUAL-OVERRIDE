/**
 * engine/patternTypes.ts
 * 手作りパターン方式（runner / bullet_runner / platformer）で共通の型定義。
 * 詳細仕様: plan/spec-pattern-system.md
 */

// 'hole'（地面の欠落）は撤廃済み。狭い穴の当たり判定が繰り返しバグの温床になったため、
// 仕様変更でRunner/Bullet Runnerから完全に取り除いた（地面は常に連続する）。
// 'current'（流れゾーン）は Aquatic 専用。非接触・重なり判定のみで水平方向へ押し流す
// （plan/spec-aquatic.md）。
export type PatternEntryKind = 'oneWayPlatform' | 'spring' | 'spike' | 'current'

export interface PatternEntry {
  kind: PatternEntryKind
  /**
   * パターンローカル座標。
   * Runner/Bullet Runner: x = パターン起点からの水平距離px、
   *   y = 地面からの高さpx（0=地面、正の値=地面より上＝空中）
   * Aquatic: x = 可動域帯内のローカル座標px（referenceWidthPx基準）、
   *   y = セグメント起点（浅い側）からの深さpx（0〜segmentLengthPx）
   */
  x: number
  y: number
  w: number
  h: number
  /** 左右往復する移動足場にする（kind:'oneWayPlatform' のみ有効） */
  driftEnabled?: boolean
  /** コンベア速度 px/sec（+右 / -左、kind:'oneWayPlatform' のみ有効） */
  conveyorVx?: number
  /**
   * Platformer専用: 複数ルートの識別タグ（例 "a" / "b"）。同じタグを持つ entries を
   * 床→exitまでの1本の到達可能な経路として設計する。タグなしの entries は
   * 全ルート共通（どちらからでも使える）として扱う（scripts/pattern-reach-sim.mjs）。
   * Runner/Bullet Runnerでは未使用。
   */
  route?: string
  /** Aquatic専用: 流れゾーンの水平方向の押し流し速度 px/sec（+右 / -左、kind:'current' のみ有効） */
  currentVx?: number
}

export interface RunnerPattern {
  id: string
  entries: PatternEntry[]
}

export interface RunnerPatternFile {
  section: 'runner_patterns'
  patternLengthPx: number
  patterns: RunnerPattern[]
}

export interface BulletRunnerEnemySpot {
  x: number
  y: number
  w: number
  h: number
  hpOverride: number
  spawnChance: number
}

export interface BulletRunnerEnemyOverlay {
  patternId: string
  spots: BulletRunnerEnemySpot[]
}

export interface BulletRunnerEnemyFile {
  section: 'bullet_runner_enemy_overlay'
  overlays: BulletRunnerEnemyOverlay[]
}

// ──────────────────────────────────────────────────────────────────────
// Platformer: 垂直・1画面1部屋のクリア&ループ方式（plan/spec-platformer.md）
// ──────────────────────────────────────────────────────────────────────

export interface PlatformerRoom {
  id: string
  /** 部屋の床（起点、暗黙に幅いっぱいで自動生成）から exit までの間に配置するギミック */
  entries: PatternEntry[]
  /** 部屋の出口（一方通行足場）。到達すると部屋クリアとして扱う */
  exit: PatternEntry
}

export interface PlatformerPatternFile {
  section: 'platformer_patterns'
  patterns: PlatformerRoom[]
}

// ──────────────────────────────────────────────────────────────────────
// Aquatic: 垂直・エンドレス連結方式（Runner の横エンドレスを縦に転用した第3の形）
// plan/spec-aquatic.md 参照。
// ──────────────────────────────────────────────────────────────────────

export interface AquaticPattern {
  id: string
  entries: PatternEntry[]
}

export interface AquaticPatternFile {
  section: 'aquatic_patterns'
  /** 全パターン共通の固定長（縦方向、px）。entries[].y はこの範囲内に収まる */
  segmentLengthPx: number
  /** entries[].x / w の基準幅（px）。実行時に実際の可動域帯幅へスケーリングする */
  referenceWidthPx: number
  patterns: AquaticPattern[]
}
