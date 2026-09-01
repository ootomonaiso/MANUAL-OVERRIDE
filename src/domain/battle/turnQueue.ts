/**
 * domain/battle/turnQueue.ts
 * 行動順キュー・フォーカス解決・敵の行動選択（docs/genre/rpg/04-battle-flow.md）。
 */

import type { Combatant, TurnEntry, EnemyDef } from './types'

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
 * EnemyDef から Combatant.actives（CT管理用・スキルIDごとに一意）と
 * actionPattern（元の並び。繰り返しを保持）を構築する。
 */
export function buildEnemyActivesFromPattern(
  def: EnemyDef,
): { actives: { id: string; level: number; stacks: number; cooldown: number; slotIndex: null }[]; actionPattern: string[] } {
  const seen = new Set<string>()
  const actives: { id: string; level: number; stacks: number; cooldown: number; slotIndex: null }[] = []
  for (const skillId of def.actionPattern) {
    if (seen.has(skillId)) continue
    seen.add(skillId)
    const ref = def.activeSkills.find(a => a.id === skillId)
    actives.push({ id: skillId, level: ref?.level ?? 1, stacks: 0, cooldown: 0, slotIndex: null })
  }
  return { actives, actionPattern: [...def.actionPattern] }
}

/**
 * actionPattern（繰り返しを保持した元の並び）を patternIndex から進めながら、
 * 最初に使用可能な(CT中でない)スキルIDを返す。飛ばした位置は消費扱いにしない
 * （次に同じ位置へ来たときも同じ判定を行う）。全てCT中なら null（何もしない）。
 */
export function pickEnemySkill(enemy: Combatant): string | null {
  const pattern = enemy.actionPattern
  if (pattern.length === 0) return null
  const byId = new Map(enemy.actives.map(a => [a.id, a]))

  for (let i = 0; i < pattern.length; i++) {
    const idx = (enemy.patternIndex + i) % pattern.length
    const skillId = pattern[idx]
    const owned = byId.get(skillId)
    if (owned && owned.cooldown <= 0) {
      enemy.patternIndex = (idx + 1) % pattern.length
      return skillId
    }
  }
  return null
}

/** 敵の次に使うスキルを、実際に消費せずプレビューする */
export function previewEnemyNextSkill(enemy: Combatant): string | null {
  const pattern = enemy.actionPattern
  if (pattern.length === 0) return null
  const byId = new Map(enemy.actives.map(a => [a.id, a]))
  for (let i = 0; i < pattern.length; i++) {
    const idx = (enemy.patternIndex + i) % pattern.length
    const owned = byId.get(pattern[idx])
    if (owned && owned.cooldown <= 0) return pattern[idx]
  }
  return null
}
