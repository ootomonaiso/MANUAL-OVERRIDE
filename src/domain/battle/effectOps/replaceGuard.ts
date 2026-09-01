/**
 * domain/battle/effectOps/replaceGuard.ts
 * 特性用: 「守る」を「避ける」へ置換する。
 *
 * 宣言的op。battleEngine.ts が所持特性の effect を直接読んで
 * builtin action セット（guard か dodge か）を決定する。runEffects からは実行されない。
 */

import type { EffectOp } from '../types'

export const replaceGuardOp: EffectOp = {
  id: 'replaceGuard',
  execute() {
    console.warn('[effectOps] "replaceGuard" は宣言的opのため runEffects からは実行されません（戦闘エンジン側が処理します）')
  },
}
