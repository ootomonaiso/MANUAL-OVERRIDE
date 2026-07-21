import type { LearningRule, LearningTrigger, LearningEffect, ActionStats } from './types'

// 統計が十分に溜まるまで発火させない（約5秒 @60fps）。rate は count/ticks の
// 「フレームあたり」レートで、開始直後は分母が小さく単発の操作でも rate が跳ね上がる。
// triggerAbove:false のルールが初回評価で即発動する（例: jumpRate<0.05）のを防ぐ。
const MIN_EVAL_TICKS = 300

// ticks ガード: 統計が MIN_EVAL_TICKS 未満のうちは評価しない
function _evaluateTrigger(trigger: LearningTrigger, stats: ActionStats): boolean {
  if (stats.ticks < MIN_EVAL_TICKS) return false

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
