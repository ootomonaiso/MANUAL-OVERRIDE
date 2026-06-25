import type { LearningRule, LearningTrigger, LearningEffect, ActionStats } from './types'

// ticks=0 ガード: ゲーム開始直後（統計未蓄積）で誤発動しないよう先頭でチェック
function _evaluateTrigger(trigger: LearningTrigger, stats: ActionStats): boolean {
  if (stats.ticks === 0) return false

  let rate = 0
  switch (trigger.type) {
    case 'jumpRate':  rate = stats.jumps / stats.ticks;           break
    case 'rightRate': rate = stats.moveRight / stats.ticks;       break
    case 'leftRate':  rate = stats.moveLeft / stats.ticks;        break
    case 'shotRate':  rate = stats.shots / stats.ticks;           break
    case 'dashRate':  rate = (stats.dashes ?? 0) / stats.ticks;   break
  }

  return (trigger.triggerAbove ?? true)
    ? rate > trigger.threshold
    : rate < trigger.threshold
}

// rules 配列を in-place で変更する（triggered フラグを立てる）副作用あり
export function evaluateLearningRules(
  rules: LearningRule[],
  stats: ActionStats,
): LearningEffect[] {
  const fired: LearningEffect[] = []
  for (const rule of rules) {
    if (rule.triggered) continue
    if (_evaluateTrigger(rule.trigger, stats)) {
      rule.triggered = true
      fired.push(rule.effect)
    }
  }
  return fired
}

export function describeEffect(effect: LearningEffect): string {
  switch (effect.type) {
    case 'disableAction': return `アクション "${effect.payload}" を無効化`
    case 'invertHazard':  return `ハザード色反転（${effect.durationSec ?? '永続'}秒）`
    case 'forceFeature':  return `フィーチャー "${effect.payload}" を強制有効化`
    case 'changeKey':     return `キー再マッピング → "${effect.payload}"`
  }
}
