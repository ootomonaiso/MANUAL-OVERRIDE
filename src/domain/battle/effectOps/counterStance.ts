/**
 * domain/battle/effectOps/counterStance.ts
 * カウンター/反射板 用: 反撃態勢に入る。実際の反撃は即座には行わない ——
 * battleEngine.ts::useActiveSkill が、攻撃側の一連の行動（repeat を含む）が
 * 完全に終わってから、命中した回数ぶんまとめて処理する（damage.ts が命中のたびに
 * queuedCounterHits を積み、useActiveSkill 側でまとめて消費・清算する）。
 */

import type { Element, EffectNode, EffectOp } from '../types'

interface CounterStanceParams {
  scaleStat: 'def' | 'ref'
  rate: number
  element: Element
}

function readParams(node: EffectNode): CounterStanceParams {
  return {
    scaleStat: node.scaleStat as 'def' | 'ref',
    rate: node.rate as number,
    element: node.element as Element,
  }
}

export const counterStanceOp: EffectOp = {
  id: 'counterStance',
  execute(node, ctx) {
    const { scaleStat, rate, element } = readParams(node)
    ctx.source.pendingCounter = { scaleStat, rate, element, sourceId: ctx.skill.id }
    ctx.source.queuedCounterHits = 0
  },
}
