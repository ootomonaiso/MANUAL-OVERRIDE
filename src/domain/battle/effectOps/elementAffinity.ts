/**
 * domain/battle/effectOps/elementAffinity.ts
 * 特性用: 弱点・耐性を付与する。
 *
 * 宣言的op。damageCalc.ts の computeAffinityStage() が traitDefs から
 * 直接 { op: "elementAffinity" } ノードを読む。runEffects からは実行されない。
 */

import type { EffectOp } from '../types'

export const elementAffinityOp: EffectOp = {
  id: 'elementAffinity',
  execute() {
    console.warn('[effectOps] "elementAffinity" は宣言的opのため runEffects からは実行されません（相性段階の集計側が処理します）')
  },
}
