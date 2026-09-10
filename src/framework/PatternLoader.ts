/**
 * src/framework/PatternLoader.ts
 *
 * src/data/patterns/*.json を import.meta.glob で読み込み、型検証して公開する。
 * ConfigLoader.ts / SfxLoader.ts と同じ「自動収集 + 開発時警告」方針。
 */

import type {
  RunnerPatternFile, RunnerPattern, BulletRunnerEnemyFile, BulletRunnerEnemyOverlay,
  PlatformerPatternFile, PlatformerRoom, AquaticPatternFile, AquaticPattern,
} from '../engine/patternTypes'

const _modules = import.meta.glob('../data/patterns/*.json', { eager: true })

function _raw(path: string): unknown {
  const mod = (_modules as Record<string, { default?: unknown }>)[path]
  return mod?.default ?? mod
}

function _isRunnerPatternFile(raw: unknown): raw is RunnerPatternFile {
  if (typeof raw !== 'object' || raw === null) return false
  const f = raw as Partial<RunnerPatternFile>
  return f.section === 'runner_patterns'
    && typeof f.patternLengthPx === 'number'
    && Array.isArray(f.patterns)
}

const _runnerFile = (() => {
  const raw = _raw('../data/patterns/runner.json')
  if (!_isRunnerPatternFile(raw)) {
    console.warn('[PatternLoader] ../data/patterns/runner.json: 無効なパターンファイルです。')
    return { section: 'runner_patterns', patternLengthPx: 900, patterns: [] } as RunnerPatternFile
  }
  return raw
})()

/** Runner / Bullet Runner が使う区間パターン集の固定長 (px) */
export const RUNNER_PATTERN_LENGTH_PX: number = _runnerFile.patternLengthPx

/** Runner / Bullet Runner が使う区間パターン一覧 */
export const RUNNER_PATTERNS: readonly RunnerPattern[] = _runnerFile.patterns

if (RUNNER_PATTERNS.length === 0) {
  console.warn('[PatternLoader] runner.json にパターンが1件もありません。')
}

function _isEnemyOverlayFile(raw: unknown): raw is BulletRunnerEnemyFile {
  if (typeof raw !== 'object' || raw === null) return false
  const f = raw as Partial<BulletRunnerEnemyFile>
  return f.section === 'bullet_runner_enemy_overlay' && Array.isArray(f.overlays)
}

const _enemyOverlayFile = (() => {
  const raw = _raw('../data/patterns/bullet_runner_enemies.json')
  if (!_isEnemyOverlayFile(raw)) {
    console.warn('[PatternLoader] ../data/patterns/bullet_runner_enemies.json: 無効な敵オーバーレイファイルです。')
    return { section: 'bullet_runner_enemy_overlay', overlays: [] } as BulletRunnerEnemyFile
  }
  return raw
})()

/** Bullet Runner の敵オーバーレイ。patternId → BulletRunnerEnemyOverlay */
export const BULLET_RUNNER_ENEMY_OVERLAYS: ReadonlyMap<string, BulletRunnerEnemyOverlay> = new Map(
  _enemyOverlayFile.overlays.map(o => [o.patternId, o]),
)

function _isPlatformerPatternFile(raw: unknown): raw is PlatformerPatternFile {
  if (typeof raw !== 'object' || raw === null) return false
  const f = raw as Partial<PlatformerPatternFile>
  return f.section === 'platformer_patterns' && Array.isArray(f.patterns)
}

const _platformerFile = (() => {
  const raw = _raw('../data/patterns/platformer.json')
  if (!_isPlatformerPatternFile(raw)) {
    console.warn('[PatternLoader] ../data/patterns/platformer.json: 無効なパターンファイルです。')
    return { section: 'platformer_patterns', patterns: [] } as PlatformerPatternFile
  }
  return raw
})()

/** Platformer の部屋パターン一覧 */
export const PLATFORMER_ROOMS: readonly PlatformerRoom[] = _platformerFile.patterns

if (PLATFORMER_ROOMS.length === 0) {
  console.warn('[PatternLoader] platformer.json にパターンが1件もありません。')
}

function _isAquaticPatternFile(raw: unknown): raw is AquaticPatternFile {
  if (typeof raw !== 'object' || raw === null) return false
  const f = raw as Partial<AquaticPatternFile>
  return f.section === 'aquatic_patterns'
    && typeof f.segmentLengthPx === 'number'
    && typeof f.referenceWidthPx === 'number'
    && Array.isArray(f.patterns)
}

const _aquaticFile = (() => {
  const raw = _raw('../data/patterns/aquatic.json')
  if (!_isAquaticPatternFile(raw)) {
    console.warn('[PatternLoader] ../data/patterns/aquatic.json: 無効なパターンファイルです。')
    return { section: 'aquatic_patterns', segmentLengthPx: 700, referenceWidthPx: 480, patterns: [] } as AquaticPatternFile
  }
  return raw
})()

/** Aquatic が使うセグメントパターン集の固定長 (px、縦方向) */
export const AQUATIC_SEGMENT_LENGTH_PX: number = _aquaticFile.segmentLengthPx

/** Aquatic のパターン座標系の基準幅 (px)。実行時に実際の可動域帯幅へスケーリングする */
export const AQUATIC_REFERENCE_WIDTH_PX: number = _aquaticFile.referenceWidthPx

/** Aquatic が使うセグメントパターン一覧 */
export const AQUATIC_PATTERNS: readonly AquaticPattern[] = _aquaticFile.patterns

if (AQUATIC_PATTERNS.length === 0) {
  console.warn('[PatternLoader] aquatic.json にパターンが1件もありません。')
}

/**
 * プールから均一確率で1パターンを選ぶ。直前と同一パターンは除外する
 * （プールが1件のみの場合はそのまま返す）。
 */
export function pickRandomPattern<T extends { id: string }>(
  pool: readonly T[],
  excludeId: string | null,
): T {
  const candidates = pool.length > 1 && excludeId !== null
    ? pool.filter(p => p.id !== excludeId)
    : pool
  const chosen = candidates[Math.floor(Math.random() * candidates.length)]
  return chosen ?? pool[0]
}
