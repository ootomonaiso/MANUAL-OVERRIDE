/**
 * engine/GameRegistry.ts
 *
 * ジャンルプラグインと Feature システムの中央レジストリ。
 * エンジンはここを通じてプラグインを参照し、直接依存を持たない。
 *
 * ─────────────────────────────────────────────────────────────
 * 使い方:
 *
 * // 登録（起動時に1回）
 * GameRegistry.registerGenre(new StgPlugin())
 * GameRegistry.registerFeature(new ShootSystem())
 *
 * // 取得（エンジン内から）
 * const plugin  = GameRegistry.getGenre('stg')          // 見つからない場合は base
 * const systems = GameRegistry.getActiveSystems(features) // active なものだけ
 * ─────────────────────────────────────────────────────────────
 */

import type { GenreId, FeatureId } from '../domain/types'
import type { GenrePlugin } from './GenrePlugin'
import type { FeatureSystem } from './FeatureSystem'

// ──────────────────────────────────────────────────────────────────────
// 内部ストレージ
// ──────────────────────────────────────────────────────────────────────
const _genres   = new Map<GenreId, GenrePlugin>()
const _features = new Map<FeatureId, FeatureSystem>()

// ──────────────────────────────────────────────────────────────────────
// 登録 API
// ──────────────────────────────────────────────────────────────────────

/** ジャンルプラグインを登録する */
export function registerGenre(plugin: GenrePlugin): void {
  if (_genres.has(plugin.id)) {
    console.warn(`[GameRegistry] ジャンル "${plugin.id}" を上書き登録します。`)
  }
  _genres.set(plugin.id, plugin)
}

/**
 * Feature システムを登録する。
 * handles が配列の場合、それぞれの FeatureId に同一インスタンスを登録する。
 */
export function registerFeature(system: FeatureSystem): void {
  const ids: FeatureId[] = Array.isArray(system.handles)
    ? [...system.handles as FeatureId[]]
    : [system.handles as FeatureId]
  for (const id of ids) {
    if (_features.has(id)) {
      console.warn(`[GameRegistry] Feature "${id}" を上書き登録します。`)
    }
    _features.set(id, system)
  }
}

// ──────────────────────────────────────────────────────────────────────
// 取得 API
// ──────────────────────────────────────────────────────────────────────

/**
 * ジャンルプラグインを取得する。
 * 見つからない場合は 'base' プラグインにフォールバック。
 * 'base' も登録されていない場合は null を返す（通常は起きない）。
 */
export function getGenre(id: GenreId): GenrePlugin {
  const plugin = _genres.get(id) ?? _genres.get('base')
  if (!plugin) throw new Error(`[GameRegistry] "base" ジャンルが未登録です。src/genres/index.ts を確認してください。`)
  return plugin
}

/**
 * active な FeatureId のセットに対応するシステムを返す（重複なし）。
 * 1つのシステムが複数の FeatureId を handles している場合でも1度だけ含まれる。
 */
export function getActiveSystems(active: ReadonlySet<FeatureId>): FeatureSystem[] {
  const seen = new Set<FeatureSystem>()
  for (const id of active) {
    const sys = _features.get(id)
    if (sys) seen.add(sys)
  }
  return [...seen]
}

/** 指定IDのジャンルプラグインが登録済みかどうかを返す */
export function hasGenre(id: GenreId): boolean {
  return _genres.has(id)
}

/** 開発用: 登録状況を出力する */
export function debugPrint(): void {
  console.group('[GameRegistry] 登録状況')
  console.log('Genres:', [..._genres.keys()].join(', '))
  console.log('Features:', [..._features.keys()].join(', '))
  console.groupEnd()
}

// ──────────────────────────────────────────────────────────────────────
// 開発時バリデーション
// ──────────────────────────────────────────────────────────────────────

/**
 * 登録されていない FeatureId を検出して警告する。
 * FeatureId のリストと登録済みシステムの整合性チェック。
 */
export function devValidateRegistry(allFeatureIds: FeatureId[]): void {
  if (import.meta.env?.PROD) return
  const missing = allFeatureIds.filter(id => !_features.has(id))
  if (missing.length > 0) {
    console.warn(`[GameRegistry] 未登録の Feature: ${missing.join(', ')}\n各 Feature に FeatureSystem を実装・登録してください。`)
  }
  if (!_genres.has('base')) {
    console.error('[GameRegistry] "base" ジャンルが未登録です！')
  }
}
