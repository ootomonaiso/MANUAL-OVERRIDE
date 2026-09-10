/**
 * src/data/rpg/battleBackgrounds.ts
 *
 * src/data/rpg/battle-backgrounds/*.json を自動収集する。
 *
 * ── 背景を追加するには ────────────────────────────────────────
 * src/data/rpg/battle-backgrounds/bg_xxx.json を1つ置くだけ。
 * 形式は schemas/battle-background.schema.json を参照。
 * ────────────────────────────────────────────────────────────
 */

import type { BattleBackgroundDef } from '../../domain/battle/backdrop'

const _modules = import.meta.glob('./battle-backgrounds/*.json', { eager: true })

/**
 * 不正ファイルは本番同様スキップし続けるが（白画面化を避けるため）、dev では
 * console.error が他のログに埋もれて気づかれない実害があった
 * （docs/refactoring/06-data-config.md §5-2、battleContent.ts の _recordSkip と同じ方針）。
 */
const _skippedEntries: string[] = []
function _recordSkip(path: string, reason: string): void {
  console.error(`[battleBackgrounds] ${path}: ${reason}`)
  _skippedEntries.push(`${path}: ${reason}`)
}

const _defs: BattleBackgroundDef[] = []
for (const [path, mod] of Object.entries(_modules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as Partial<BattleBackgroundDef>
  if (typeof raw.id !== 'string' || !raw.sky || !raw.ground) {
    _recordSkip(path, 'id/sky/ground が不正です。この背景はスキップされます。')
    continue
  }
  if (_defs.some(d => d.id === raw.id)) {
    console.warn(`[battleBackgrounds] 背景ID "${raw.id}" が重複しています (${path})。後勝ちにはしません。`)
    continue
  }
  _defs.push({ ...raw, layers: raw.layers ?? [], props: raw.props ?? [] } as BattleBackgroundDef)
}

if (!import.meta.env?.PROD && _skippedEntries.length > 0) {
  console.error(
    `[battleBackgrounds] dev: ${_skippedEntries.length} 件の背景がスキップされました（本番では黙って除外されるため見落としに注意）\n` +
    _skippedEntries.map(s => `  - ${s}`).join('\n'),
  )
}

// glob の列挙順はビルド環境に依存するため、抽選結果を安定させる目的でIDでソートする
_defs.sort((a, b) => a.id.localeCompare(b.id))

export const BATTLE_BACKGROUNDS: readonly BattleBackgroundDef[] = _defs

export function findBattleBackground(id: string | null): BattleBackgroundDef | null {
  if (!id) return null
  return _defs.find(d => d.id === id) ?? null
}
