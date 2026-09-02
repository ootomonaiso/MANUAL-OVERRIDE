/**
 * domain/battle/effectOps/registry.ts
 * オペレーションレジストリの実体。op 実装ファイル（repeat.ts 等）が循環importなしに
 * getOp() を呼べるよう、登録の集約（index.ts）とは分離してある。
 */

import type { EffectContext, EffectNode, EffectOp, TemporaryModifier } from '../types'

const registry = new Map<string, EffectOp>()

export function registerOp(op: EffectOp): void {
  registry.set(op.id, op)
}

export function getOp(id: string): EffectOp | undefined {
  return registry.get(id)
}

export function allOpIds(): string[] {
  return [...registry.keys()]
}

/** オペレーション配列を順に実行する。未登録の op は警告してスキップする */
export function runEffects(nodes: readonly EffectNode[], ctx: EffectContext): void {
  for (const node of nodes) {
    const op = registry.get(node.op)
    if (!op) {
      console.warn(`[effectOps] 未登録の op "${node.op}" をスキップしました`)
      continue
    }
    op.execute(node, ctx)
  }
  clearThisHitModifiers(ctx.source)
  for (const t of ctx.targets) clearThisHitModifiers(t)
}

export function clearThisHitModifiers(c: { temporary: TemporaryModifier[] }): void {
  c.temporary = c.temporary.filter(m => m.scope !== 'thisHit')
}

export function clearThisTurnModifiers(c: { temporary: TemporaryModifier[] }): void {
  c.temporary = c.temporary.filter(m => m.scope !== 'thisTurn')
}

export function clearThisBattleModifiers(c: { temporary: TemporaryModifier[] }): void {
  c.temporary = c.temporary.filter(m => m.scope !== 'thisBattle' && m.scope !== 'thisTurn')
}

export const KNOWN_OP_IDS = [
  'damage', 'heal', 'shield', 'repeat', 'modifier',
  'statBoost', 'elementAffinity', 'cutRate', 'replaceGuard', 'healBetweenBattles',
  'effectBoost', 'healTaken', 'noop',
] as const
