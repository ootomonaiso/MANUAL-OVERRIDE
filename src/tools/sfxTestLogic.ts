/**
 * src/tools/sfxTestLogic.ts
 *
 * sfx-test（開発者用効果音テストツール）の DOM 非依存ロジック層。
 * UI層（sfxTest.ts）から分離し、tests/unit/tools/ で純粋関数として検証する。
 * genreLab.ts / genreLabSim.ts の分離構成に倣う（docs/sfx-test-mode.md §8）。
 */

import { devValidateSfx } from '../framework/ConfigValidator'
import type { SfxDef } from '../framework/sfx-types'

export const RECENT_STORAGE_KEY = 'sfxTest.recentIds'
export const RECENT_LIMIT = 8

/**
 * SFX_DEFS には存在するが、SfxSound のどの SoundHooks フックからも playSfx() されない ID。
 * plan/json-sfx-standalone-design.md の通り、PR #230（P0ドーパミン強化/P1進捗機能）分離のため
 * 意図的に未配線のまま残されている。SfxSound の実装から機械的に導出できないため手動で保守する
 * （docs/sfx-test-mode.md §6）。
 */
export const UNWIRED_SFX_IDS: ReadonlySet<string> = new Set([
  'combo_milestone',
  'goal_achieved',
  'milestone',
  'near_miss',
  'record_update',
  'skin_select',
])

/** 「最近使った」リストの先頭に id を追加する。重複は先頭へ移動し、上限を超えた分は切り捨てる。 */
export function pushRecent(recent: readonly string[], id: string, limit = RECENT_LIMIT): string[] {
  const deduped = recent.filter(existing => existing !== id)
  return [id, ...deduped].slice(0, limit)
}

/**
 * devValidateSfx() の console.warn 出力を id ごとに集約する。
 * 検証ルール自体は複製せず、本番と同じ devValidateSfx を呼んで出力を横取りするだけに留める
 * （絶対条件3: テスト再生モード専用のロジックを新規に書かない）。
 */
export function collectSfxWarnings(defs: Readonly<Record<string, SfxDef>>): Map<string, string[]> {
  const byId = new Map<string, string[]>()
  const original = console.warn
  console.warn = (...args: unknown[]) => {
    const message = args[0]
    if (typeof message !== 'string') return
    const match = message.match(/SFX "([^"]+)"/)
    if (!match) return
    const id = match[1]
    const list = byId.get(id) ?? []
    list.push(message)
    byId.set(id, list)
  }
  try {
    devValidateSfx(defs)
  } finally {
    console.warn = original
  }
  return byId
}
