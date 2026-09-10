/**
 * domain/battle/effectOps/healTaken.ts
 * 特性・パッシブ用: 対象側の被回復量を増減させる（例:「被回復量+30%」）。
 *
 * 宣言的op。effectOps/heal.ts の healTakenMultiplier() が所持特性・パッシブの
 * effect を直接読む。runEffects からは実行されない。
 */

import type { EffectOp } from '../types'

export const healTakenOp: EffectOp = {
  id: 'healTaken',
  execute() {
    console.warn('[effectOps] "healTaken" は宣言的opのため runEffects からは実行されません（被回復倍率の集計側が処理します）')
  },
}
