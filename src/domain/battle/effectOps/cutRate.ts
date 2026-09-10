/**
 * domain/battle/effectOps/cutRate.ts
 * 特性用: カット率を追加する（最終カット率の加算対象）。
 *
 * 宣言的op。effectOps/damage.ts の collectTraitCutRates() が traitDefs から
 * 直接 { op: "cutRate" } ノードを読む。runEffects からは実行されない。
 */

import type { EffectOp } from '../types'

export const cutRateOp: EffectOp = {
  id: 'cutRate',
  execute() {
    console.warn('[effectOps] "cutRate" は宣言的opのため runEffects からは実行されません（カット率の集計側が処理します）')
  },
}
