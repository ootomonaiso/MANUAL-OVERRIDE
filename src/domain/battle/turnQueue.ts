/**
 * domain/battle/turnQueue.ts
 * 行動順キュー・フォーカス解決・敵の行動選択（docs/genre/rpg/04-battle-flow.md）。
 */

import type { Combatant, TurnEntry, EnemyDef, ActiveSkillDef } from './types'

/**
 * 行動順キューを構築する。
 * 並べ替え規則: priority 降順 → 同値ならプレイヤー優先 → 敵同士は左→右(formationIndex)。
 */
export function buildTurnQueue(
  combatants: readonly Combatant[],
  agiOf: (c: Combatant) => number,
): TurnEntry[] {
  const alive = combatants.filter(c => c.alive)
  const entries: TurnEntry[] = alive.map(c => ({
    combatantId: c.id,
    agi: agiOf(c),
    priority: agiOf(c),
  }))
  const byId = new Map(alive.map(c => [c.id, c]))
  entries.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const ca = byId.get(a.combatantId)
    const cb = byId.get(b.combatantId)
    if (!ca || !cb) return 0
    if (ca.isPlayer !== cb.isPlayer) return ca.isPlayer ? -1 : 1
    return ca.formationIndex - cb.formationIndex
  })
  return entries
}

/** 中心インデックスから隣接3体を解決する。端では2体になる（空きを補わない） */
export function resolveAdjacent3(enemies: readonly Combatant[], centerIndex: number): Combatant[] {
  const result: Combatant[] = []
  for (let i = centerIndex - 1; i <= centerIndex + 1; i++) {
    const e = enemies[i]
    if (e && e.alive) result.push(e)
  }
  return result
}

/**
 * 敵の actionPattern を進めながら、最初に使用可能な(CT中でない)スキルIDを返す。
 * 飛ばしたスキルは消費扱いにしない。全てCT中なら null（何もしない）。
 */
export function pickEnemySkill(enemy: Combatant): string | null {
  const pattern = enemy.actives.length > 0 ? enemy.actives : []
  if (pattern.length === 0) return null

  // actionPattern の並びは EnemyDef 側にあるため、呼び出し側が actionPattern を渡す設計にする。
  // ここでは Combatant.actives の並び = actionPattern の並び、という前提を battleEngine 側で保証する。
  for (let i = 0; i < pattern.length; i++) {
    const idx = (enemy.patternIndex + i) % pattern.length
    const owned = pattern[idx]
    if (owned.cooldown <= 0) {
      enemy.patternIndex = (idx + 1) % pattern.length
      return owned.id
    }
  }
  return null
}

/**
 * EnemyDef から Combatant.actives を actionPattern 順に構築する。
 * pickEnemySkill が「actives の並び = actionPattern の並び」を前提とするため、
 * ここで actionPattern をそのまま使い、重複IDはスキップして初出のみ載せる
 * （同じスキルが actionPattern に複数回現れても CT 管理は1つに集約する）。
 */
export function buildEnemyActivesFromPattern(def: EnemyDef): { id: string; level: number; stacks: number; cooldown: number; slotIndex: null }[] {
  const seen = new Set<string>()
  const result: { id: string; level: number; stacks: number; cooldown: number; slotIndex: null }[] = []
  for (const skillId of def.actionPattern) {
    if (seen.has(skillId)) continue
    seen.add(skillId)
    const ref = def.activeSkills.find(a => a.id === skillId)
    result.push({ id: skillId, level: ref?.level ?? 1, stacks: 0, cooldown: 0, slotIndex: null })
  }
  return result
}

/** 敵の次に使うスキルを、実際に消費せずプレビューする（UI表示・詳細表示の非公開制御は呼び出し側） */
export function previewEnemyNextSkill(enemy: Combatant): string | null {
  const pattern = enemy.actives
  if (pattern.length === 0) return null
  for (let i = 0; i < pattern.length; i++) {
    const idx = (enemy.patternIndex + i) % pattern.length
    if (pattern[idx].cooldown <= 0) return pattern[idx].id
  }
  return null
}

export type { ActiveSkillDef }
