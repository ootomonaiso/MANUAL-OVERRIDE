/**
 * domain/battle/effectOps/repeat.ts
 * 内側のオペレーションをN回繰り返す。onFirstIteration/onLastIteration は
 * それぞれ body の「前」に実行される（最後の1回だけクリティカル率上昇、等の表現のため）。
 */

import type { EffectContext, EffectNode, EffectOp } from '../types'
import { clearThisHitModifiers, getOp } from './registry'

interface RepeatParams {
  times: number
  body: EffectNode[]
  onFirstIteration?: EffectNode[]
  onLastIteration?: EffectNode[]
}

function readParams(node: EffectNode): RepeatParams {
  return {
    times: node.times as number,
    body: (node.body as EffectNode[]) ?? [],
    onFirstIteration: node.onFirstIteration as EffectNode[] | undefined,
    onLastIteration: node.onLastIteration as EffectNode[] | undefined,
  }
}

export const repeatOp: EffectOp = {
  id: 'repeat',
  execute(node, ctx) {
    const { times, body, onFirstIteration, onLastIteration } = readParams(node)
    for (let i = 0; i < times; i++) {
      if (i === 0 && onFirstIteration) runNodes(onFirstIteration, ctx)
      if (i === times - 1 && onLastIteration) runNodes(onLastIteration, ctx)
      runNodes(body, ctx)
      // thisHit スコープは1ヒットごとに失効させる（次の反復へ持ち越さない）
      clearThisHitModifiers(ctx.source)
      for (const t of ctx.targets) clearThisHitModifiers(t)
    }
  },
}

function runNodes(nodes: readonly EffectNode[], ctx: EffectContext): void {
  for (const n of nodes) {
    const op = getOp(n.op)
    if (!op) { console.warn(`[effectOps] repeat内で未登録の op "${n.op}"`); continue }
    op.execute(n, ctx)
  }
}
