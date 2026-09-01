/**
 * domain/battle/effectOps/effectBoost.ts
 * 特性・パッシブ用: 自身が出すダメージ/回復/シールドの効果倍率を上昇させる
 * （例: 「物理攻撃+50%」）。element は対象属性、"any" で全属性に適用する。
 *
 * 宣言的op。stats.ts の collectEffectMultiplier() が所持特性・パッシブの
 * effect を直接読む。runEffects からは実行されない。
 */

import type { EffectOp } from '../types'

export const effectBoostOp: EffectOp = {
  id: 'effectBoost',
  execute() {
    console.warn('[effectOps] "effectBoost" は宣言的opのため runEffects からは実行されません（効果倍率の集計側が処理します）')
  },
}
