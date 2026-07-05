/**
 * manualDeck.ts
 *
 * MANUAL_DECK の構築エントリーポイント。
 *
 * ─────────────────────────────────────────────────────
 * 【重要】ランタイムが参照するのは '1.0' エントリ（初期説明書）のみ。
 * ゲーム中の選択肢はツリー分岐ではなくカードプール方式で提供される
 * （src/data/cardPool.ts / src/data/cards/*.json）。
 *
 * 選択肢を追加したい場合はここではなく src/data/cards/ にカードを
 * 追加すること（書式: src/data/cards/TEMPLATE.json）。
 * manuals/*.json のツリー定義と ManualBuilder は後方互換のために
 * 残されている（deck-extension プラグインが注入先として使用）。
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
