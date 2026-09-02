/**
 * domain/battle/effectOps/noop.ts
 * 何もしない。「何もしていない」のような、意図的に無効果であることを表すスキル用。
 */

import type { EffectOp } from '../types'

export const noopOp: EffectOp = {
  id: 'noop',
  execute() { /* 意図的に何もしない */ },
}
