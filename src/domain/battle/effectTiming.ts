/**
 * domain/battle/effectTiming.ts
 * 演出待ち時間の見積もり。
 *
 * 連続攻撃（`repeat`）は damage 等の op を同期的に何度も実行するため、演出（ヒットのたびの
 * フラッシュ・ダメージポップアップ）は multiHitIntervalMs 間隔で後追い再生される
 * （useBattlePresentation.ts の drain()）。一方、次の手番へ進むタイミング（useBattleState.ts の
 * afterAction）は元々 timing.impactMs という固定値だけを待っており、ヒット数を考慮しないため、
 * 多段ヒットの演出が終わる前に相手の行動が始まってしまっていた。
 * estimateHitCount() で「何回ヒット相当の演出が積まれるか」を見積もり、次の手番までの
 * 待ち時間をヒット数ぶん伸ばす（正確なfx数の再現ではなく、待ち時間の下限見積もりでよい）。
 */

import type { EffectNode } from './types'

/** effect木を辿り、repeat.times を掛け合わせながら damage/heal/shield の発生回数を数える */
export function estimateHitCount(nodes: readonly EffectNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.op === 'repeat') {
      const times = typeof node.times === 'number' ? node.times : 1
      const body = Array.isArray(node.body) ? (node.body as EffectNode[]) : []
      count += times * Math.max(1, estimateHitCount(body))
    } else if (node.op === 'damage' || node.op === 'heal' || node.op === 'shield') {
      count += 1
    }
  }
  return count
}
