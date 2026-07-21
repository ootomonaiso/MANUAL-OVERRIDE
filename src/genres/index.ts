/**
 * genres/index.ts
 * src/genres/*.ts を自動検出し、さらにTSプラグインが存在しないJSON定義ジャンルに
 * 自動フォールバックプラグインを生成して GameRegistry に登録する。
 *
 * ── TSプラグインを追加するには ────────────────────────────────────
 * 1. src/genres/ に MyGenrePlugin.ts を作成（GenrePlugin を実装）
 * 2. ファイルの末尾に以下の1行を追加するだけ:
 *    export default new MyGenrePlugin()
 * このファイルを編集する必要はない。
 *
 * ── JSONのみでジャンルを追加するには（TSコード不要）────────────────
 * src/data/genres/my_genre.json を追加するだけ。
 * visual.template または theme からビジュアルが自動決定される。
 * ────────────────────────────────────────────────────────────────
 */

import { registerGenre, hasGenre, mergeSpawnDensity } from '../engine/GameRegistry'
import type { GenrePlugin } from '../engine/GenrePlugin'
import type { GenreId } from '../domain/types'
import { pluginManager } from '../plugins/PluginManager'
import { JSONGenrePlugin } from '../plugins/JSONGenrePlugin'
import { GAME_CONFIG } from '../data/config'

// ── 1. src/genres/*.ts の default export を自動収集して登録 ──────────
// 単一インスタンスまたは配列（BasePlugin.ts のように複数クラスがある場合）に対応
const pluginModules = import.meta.glob<GenrePlugin | GenrePlugin[]>(
  './*.ts',
  { eager: true, import: 'default' },
)

// Collect registered TS plugin IDs for later merge
const _registeredTsPluginIds = new Set<string>()

for (const [path, exported] of Object.entries(pluginModules)) {
  if (path === './index.ts') continue
  if (Array.isArray(exported)) {
    for (const plugin of exported) {
      if (plugin?.id) {
        _registeredTsPluginIds.add(plugin.id)
        registerGenre(plugin)
      }
    }
  } else if (exported?.id) {
    _registeredTsPluginIds.add(exported.id)
    registerGenre(exported)
  }
}

// ── 1b. Merge spawnDensity from JSON into already-registered TS plugins ──
// JSON genre definitions (src/data/genres/*.json) serve as the single source
// of truth for spawnDensity. Two paths exist:
//   a) TS plugin registered: merge spawnDensity into the plugin instance (below)
//   b) No TS plugin: JSONGenrePlugin receives spawnDensity in constructor (step 2)
// This avoids duplication between TS plugins and JSON genre definitions.
for (const def of GAME_CONFIG.genres.genres) {
  if (!_registeredTsPluginIds.has(def.id)) continue
  if (def.spawnDensity) {
    mergeSpawnDensity(def.id as GenreId, def.spawnDensity)
  }
}

// ── 2. TSプラグインが存在しないJSON定義ジャンルに自動フォールバックを登録 ──
// これにより bullet_hell / horror / idle など TS なしのジャンルも正しく描画される
for (const def of GAME_CONFIG.genres.genres) {
  if (hasGenre(def.id as GenreId)) continue   // TSプラグインが登録済みならスキップ
  registerGenre(new JSONGenrePlugin({
    id:           def.id,
    theme:        def.theme,
    visual:       def.visual,
    spawnDensity: def.spawnDensity,
  }))
}

// ── 3. ユーザーがインストールしたプラグイン（localStorage 経由）────────
const installedPlugins = pluginManager.loadAll()
for (const plugin of installedPlugins) {
  if (plugin.type === 'genre') {
    registerGenre(new JSONGenrePlugin({
      id:    plugin.id,
      visual: plugin.visual,
    }))
  }
}
