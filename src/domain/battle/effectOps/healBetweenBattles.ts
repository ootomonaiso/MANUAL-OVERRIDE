/**
 * domain/battle/effectOps/healBetweenBattles.ts
 * 特性用: 戦闘終了時にHPを一定量回復する。
 *
 * 宣言的op。battleEngine.ts の戦闘終了処理（ドラフト前）が所持特性の effect を
 * 直接読んで適用する。runEffects からは実行されない。
 */

import type { EffectOp } from '../types'

export const healBetweenBattlesOp: EffectOp = {
  id: 'healBetweenBattles',
  execute() {
    console.warn('[effectOps] "healBetweenBattles" は宣言的opのため runEffects からは実行されません（戦闘終了処理が処理します）')
  },
}
