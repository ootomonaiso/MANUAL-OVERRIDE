/**
 * src/data/battleBackgrounds.ts
 *
 * src/data/battle-backgrounds/*.json を自動収集する。
 *
 * ── 背景を追加するには ────────────────────────────────────────
 * src/data/battle-backgrounds/bg_xxx.json を1つ置くだけ。
 * 形式は schemas/battle-background.schema.json を参照。
 * ────────────────────────────────────────────────────────────
 */

import type { BattleBackgroundDef } from '../domain/battle/backdrop'

const _modules = import.meta.glob('./battle-backgrounds/*.json', { eager: true })

const _defs: BattleBackgroundDef[] = []
for (const [path, mod] of Object.entries(_modules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as Partial<BattleBackgroundDef>
  if (typeof raw.id !== 'string' || !raw.sky || !raw.ground) {
    console.error(`[battleBackgrounds] ${path}: id/sky/ground が不正です。この背景はスキップされます。`)
    continue
  }
  if (_defs.some(d => d.id === raw.id)) {
    console.warn(`[battleBackgrounds] 背景ID "${raw.id}" が重複しています (${path})。後勝ちにはしません。`)
    continue
  }
  _defs.push({ ...raw, layers: raw.layers ?? [], props: raw.props ?? [] } as BattleBackgroundDef)
}

// glob の列挙順はビルド環境に依存するため、抽選結果を安定させる目的でIDでソートする
_defs.sort((a, b) => a.id.localeCompare(b.id))

export const BATTLE_BACKGROUNDS: readonly BattleBackgroundDef[] = _defs

export function findBattleBackground(id: string | null): BattleBackgroundDef | null {
  if (!id) return null
  return _defs.find(d => d.id === id) ?? null
}
