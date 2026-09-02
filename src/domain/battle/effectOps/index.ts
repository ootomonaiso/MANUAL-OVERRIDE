/**
 * domain/battle/effectOps/index.ts
 * スキル効果オペレーションの一括登録（docs/genre/rpg/05-skills.md）。
 *
 * 新しい効果を追加するには、このディレクトリにファイルを1つ足して
 * 下部の import と registerOp() 呼び出しを1行ずつ追加するだけでよい。
 * レジストリの実体・実行関数は ./registry を参照。
 */

export { registerOp, getOp, allOpIds, runEffects, KNOWN_OP_IDS,
  clearThisHitModifiers, clearThisTurnModifiers, clearThisBattleModifiers } from './registry'

import { registerOp } from './registry'
import { damageOp } from './damage'
import { healOp } from './heal'
import { shieldOp } from './shield'
import { repeatOp } from './repeat'
import { modifierOp } from './modifier'
import { statBoostOp } from './statBoost'
import { elementAffinityOp } from './elementAffinity'
import { cutRateOp } from './cutRate'
import { replaceGuardOp } from './replaceGuard'
import { healBetweenBattlesOp } from './healBetweenBattles'
import { effectBoostOp } from './effectBoost'
import { healTakenOp } from './healTaken'
import { noopOp } from './noop'

registerOp(damageOp)
registerOp(healOp)
registerOp(shieldOp)
registerOp(repeatOp)
registerOp(modifierOp)
registerOp(statBoostOp)
registerOp(elementAffinityOp)
registerOp(cutRateOp)
registerOp(replaceGuardOp)
registerOp(healBetweenBattlesOp)
registerOp(effectBoostOp)
registerOp(healTakenOp)
registerOp(noopOp)
