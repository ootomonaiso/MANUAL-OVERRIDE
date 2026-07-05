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
  if (!_genres.has(id) && id !== 'base') {
    console.warn(`[GameRegistry] ジャンル "${id}" が見つかりません。'base' にフォールバックします。`)
  }
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
  console.warn('[GameRegistry] 登録状況 — Genres:', [..._genres.keys()].join(', '))
  console.warn('[GameRegistry] 登録状況 — Features:', [..._features.keys()].join(', '))
}

/**
 * テスト用: ジャンルとFeatureの登録を全削除する。
 * VITEST または DEV モードでのみ公開し、PRODUCTION ビルドでは呼び出せないようにする。
 */
export function resetRegistry(): void {
  if (import.meta.env.PROD) {
    console.warn('[GameRegistry] resetRegistry() は PRODUCTION ビルドでは使用できません。')
    return
  }
  _genres.clear()
  _features.clear()
}

/**
 * JSON設定から読み込んだ spawnDensity を既存のGenrePluginにはめこむ。
 * GenrePluginインタフェースはreadonlyとして宣言されているが、
 * 起動時の1回限りのイミュータブルな初期化ではあるので、内部的に型キャストを使用する。
 * 型安全性を維持するためにGameRegistry内で閉じている。
 */
export function mergeSpawnDensity(id: GenreId, density: import('../domain/types').SpawnDensityConfig): void {
  const plugin = _genres.get(id)
  if (plugin === undefined) return
  // TypeScript readonlyはビルド時のみ効く。起動時の初期化には型キャストを許容する。
  // genres/index.ts は必ず未設定のプラグインにのみ呼び出すことを保証する。
  (plugin as unknown as Record<string, unknown>).spawnDensity = density
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
