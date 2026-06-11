/**
 * manualDeck.ts
 *
 * MANUAL_DECK の構築エントリーポイント。
 *
 * ─────────────────────────────────────────────────────
 * 新しいブランチを追加する方法（2通り）:
 *
 * ① JSON ファイルを追加（推奨: コンテンツのみ、TS 不要）
 *    src/data/manuals/ に *.json を作成するだけ。
 *    import.meta.glob が自動収集するので他の変更不要。
 *    → フォーマット: src/data/manuals/TEMPLATE.json を参照
 *
 * ② TypeScript の ManualBuilder を使う（動的生成・条件分岐が必要な場合）
 *    import { ManualBuilder, extendDeck } from '../framework'
 *    const [key, ver] = new ManualBuilder('my-key', '2.5').text('...').build()
 *    extendDeck(MANUAL_DECK, [[key, ver]])
 * ─────────────────────────────────────────────────────
 */

import { loadFromGlob, devValidate } from '../framework'
import { pluginManager } from '../plugins/PluginManager'
import type { ManualVersion, Choice, GenreParams } from '../domain/types'

// src/data/manuals/*.json を自動収集（ビルド時に静的バンドル）
// TEMPLATE.json は除外（サンプルファイル）
// 新しい JSON ファイルを追加するだけで自動的にデッキに組み込まれる
const _rawModules = import.meta.glob(
  ['./manuals/*.json', '!./manuals/TEMPLATE.json'],
  { eager: true },
)

export const MANUAL_DECK = loadFromGlob(_rawModules)

// Load user-installed deck-extension plugins
const installedPlugins = pluginManager.loadAll()
for (const plugin of installedPlugins) {
  if (plugin.type === 'deck-extension') {
    // Add entries to MANUAL_DECK
    for (const entry of plugin.entries) {
      MANUAL_DECK[entry.key] = entry
    }

    // Inject choices into existing versions
    if (plugin.inject) {
      for (const injection of plugin.inject) {
        const targetVer = MANUAL_DECK[injection.targetKey] as ManualVersion
        if (targetVer) {
          const choiceWithId: Choice = {
            label: injection.choice.label,
            next: injection.choice.next,
            genreParams: injection.choice.genreParams as GenreParams,
            id: injection.choice.id || `${injection.targetKey}-injected-${Math.random().toString(36).substr(2, 9)}`,
          }
          targetVer.choices.push(choiceWithId)
        }
      }
    }
  }
}

// 開発中のみ整合性チェックを実行（本番ビルドでは除去される）
devValidate(MANUAL_DECK)
