/**
 * domain/battle/effectOps/criticalFx.ts
 * クリティカル演出の発火。damage / heal / shield の3opで共通のため切り出す。
 * 1重（通常のクリティカル）は fx_critical、2重以上（スーパークリティカル）は
 * fx_super_critical を鳴らし分ける。
 */

import type { EffectContext } from '../types'

export function emitCriticalEffect(ctx: EffectContext, targetId: string, critStacks: number): void {
  if (critStacks <= 0) return
  if (critStacks === 1) {
    ctx.emit({ effectId: 'fx_critical', targetRef: 'target', combatantId: targetId })
  } else {
    ctx.emit({ effectId: 'fx_super_critical', targetRef: 'target', combatantId: targetId, payload: { critStacks } })
  }
}
