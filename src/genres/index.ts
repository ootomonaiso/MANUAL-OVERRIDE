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

import { registerGenre, hasGenre } from '../engine/GameRegistry'
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

for (const [path, exported] of Object.entries(pluginModules)) {
  if (path === './index.ts') continue
  if (Array.isArray(exported)) {
    for (const plugin of exported) {
      if (plugin?.id) registerGenre(plugin)
    }
  } else if (exported?.id) {
    registerGenre(exported)
  }
}

// ── 2. TSプラグインが存在しないJSON定義ジャンルに自動フォールバックを登録 ──
// これにより bullet_hell / horror / idle など TS なしのジャンルも正しく描画される
for (const def of GAME_CONFIG.genres.genres) {
  if (hasGenre(def.id as GenreId)) continue   // TSプラグインが登録済みならスキップ
  registerGenre(new JSONGenrePlugin({
    id:     def.id,
    theme:  def.theme,
    visual: def.visual,
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
