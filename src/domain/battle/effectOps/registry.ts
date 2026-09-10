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
  c.temporary = c.temporary.filter(m =>
    m.scope !== 'thisBattle' && m.scope !== 'thisTurn' && m.scope !== 'nextRound' && m.scope !== 'rounds')
}

/**
 * `rounds` スコープの残存ラウンド数を1減らし、0以下になったものを失効させる。
 * `thisTurn`/`nextRound` とは独立した寿命管理のため、それらの失効処理と順序依存はない。
 */
export function decrementRoundsModifiers(c: { temporary: TemporaryModifier[] }): void {
  c.temporary = c.temporary
    .map(m => m.scope === 'rounds' ? { ...m, roundsRemaining: (m.roundsRemaining ?? 1) - 1 } : m)
    .filter(m => m.scope !== 'rounds' || (m.roundsRemaining ?? 0) > 0)
}

/**
 * `nextRound` スコープを `thisTurn` へ格下げする。endOfRound() で clearThisTurnModifiers() の**直後**に
 * 呼ぶこと（先にthisTurnを消してから格下げしないと、格下げした直後に同じ呼び出しで消えてしまう）。
 * これにより「付与されたラウンドの残り＋次のラウンド丸ごと」で失効する2ラウンド分の寿命になる。
 */
export function downgradeNextRoundModifiers(c: { temporary: TemporaryModifier[] }): void {
  for (const m of c.temporary) {
    if (m.scope === 'nextRound') m.scope = 'thisTurn'
  }
}

export const KNOWN_OP_IDS = [
  'damage', 'heal', 'shield', 'repeat', 'modifier',
  'statBoost', 'elementAffinity', 'cutRate', 'replaceGuard', 'healBetweenBattles',
  'effectBoost', 'healTaken', 'noop', 'counterStance', 'periodicSelfDamage', 'periodicTargetDamage',
  'selfDamageFromDealt', 'cancelTargetAction',
] as const
