/**
 * domain/battle/effectOps/statBoost.ts
 * パッシブ用: ステータスを恒常的に上昇させる。
 *
 * この op は runEffects() 経由では実行されない（宣言的データとして
 * stats.ts の accumulatePassiveStatBoosts() が skill.effect を直接読む）。
 * レジストリには「未登録の op」検証・allowedOps 同期のために登録する。
 */

import type { EffectOp } from '../types'

export const statBoostOp: EffectOp = {
  id: 'statBoost',
  execute() {
    console.warn('[effectOps] "statBoost" は宣言的opのため runEffects からは実行されません（パッシブ集計側が処理します）')
  },
}
