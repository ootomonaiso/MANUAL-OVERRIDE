import type { ContradictionEvent, ContradictionState, ContradictionLevel, ContradictionSeverity } from './types'

// ─────────────────────────────────────────────────────────────
// 矛盾トラッキングの定数
// ─────────────────────────────────────────────────────────────

/** 1回の矛盾イベントで増加するレベル */
const CONTRADICTION_INCREMENT = 0.15

/** バッドエンド発動の閾値（矛盾レベルがこの値以上で発動） */
export const BAD_ENDING_THRESHOLD = 0.6

/** 矛盾警告表示の閾値（矛盾レベルがこの値以上で警告表示） */
export const CONTRADICTION_WARNING_THRESHOLD = 0.3

/** 最大矛盾レベル（これ以上は増加しない） */
const MAX_CONTRADICTION_LEVEL = 1.0

/** severe 閾値の比率（BAD_ENDING_THRESHOLD のこの比率で severe 判定） */
const SEVERE_THRESHOLD_RATIO = 0.7

// 矛盾イベントの反応メッセージテンプレート
const REACTION_MESSAGES: string[] = [
  '…えっ、そっちを選んだの？',
  'この説明書、矛盾してる…',
  '前の選択と合わな',
  '文字が滲んできた…',
  '読めなくなってくる…',
  'もはや何が書いてあるか…',
]

/**
 * 矛盾トラッキングの状態を初期化する。
 */
export function initContradictionState(): ContradictionState {
  return {
    level: 0,
    events: [],
    badEndingTriggered: false,
  }
}

/**
 * 矛盾カード選択時の処理。
 *
 * 既に選択済みカードと矛盾するカードが選ばれた場合、
 * 矛盾レベルを増加させ、イベントを記録する。
 *
 * @param state 現在の矛盾状態
 * @param cardId 選択されたカードID
 * @param conflictedId 矛盾する既存カードID
 * @returns 更新された矛盾状態
 */
export function recordContradiction(
  state: ContradictionState,
  cardId: string,
  conflictedId: string,
): ContradictionState {
  // バッドエンド発動後は追加処理しない（イミュータブルにコピー）
  if (state.badEndingTriggered) {
    return { ...state, events: [...state.events] }
  }

  const newLevel = Math.min(MAX_CONTRADICTION_LEVEL, state.level + CONTRADICTION_INCREMENT)

  // 矛盾イベントの反応メッセージを選択
  const messageIndex = Math.min(state.events.length, REACTION_MESSAGES.length - 1)
  const reactionMessage = REACTION_MESSAGES[messageIndex]

  const event: ContradictionEvent = {
    cardId,
    conflictedId,
    reactionMessage,
  }

  const badEndingTriggered = newLevel >= BAD_ENDING_THRESHOLD

  return {
    level: newLevel,
    events: [...state.events, event],
    badEndingTriggered,
  }
}

/**
 * 現在の矛盾レベルから矛盾の深刻度を返す。
 */
export function getContradictionSeverity(level: ContradictionLevel): ContradictionSeverity {
  if (level === 0) return 'none'
  if (level < CONTRADICTION_WARNING_THRESHOLD) return 'mild'
  if (level < BAD_ENDING_THRESHOLD * SEVERE_THRESHOLD_RATIO) return 'moderate'
  if (level < BAD_ENDING_THRESHOLD) return 'severe'
  return 'broken'
}

/**
 * 矛盾レベルに応じた説明書UIへの視覚的効果クラス名を返す。
 * ManualPanel でCSSクラスとして適用される。
 */
export function getContradictionEffectClass(level: ContradictionLevel): string {
  const severity = getContradictionSeverity(level)
  switch (severity) {
    case 'mild':
      return 'manual-contradiction-mild'
    case 'moderate':
      return 'manual-contradiction-moderate'
    case 'severe':
      return 'manual-contradiction-severe'
    case 'broken':
      return 'manual-contradiction-broken'
    default:
      return ''
  }
}

/**
 * バッドエンドが発動するかどうかを判定する。
 */
export function isBadEndingTriggered(level: ContradictionLevel): boolean {
  return level >= BAD_ENDING_THRESHOLD
}

/**
 * 矛盾レベルに応じた警告メッセージを生成する。
 * HUD や ManualPanel に一時的に表示される。
 */
export function getContradictionWarning(level: ContradictionLevel): string | null {
  if (level < CONTRADICTION_WARNING_THRESHOLD) return null

  const warnings: Record<ContradictionSeverity, string> = {
    none: '',
    mild: '',
    moderate: '⚠ 説明書に矛盾が生じ始めてい',
    severe: '⚠⚠ 説明書が崩壊し始めてい',
    broken: '⚠⚠⚠ 説明書はもはや読めなくなっ',
  }

  const severity = getContradictionSeverity(level)
  return warnings[severity] || null
}

/**
 * バッドエンド時のメッセージを生成する。
 */
export function generateBadEndingMessage(events: ContradictionEvent[]): string {
  const count = events.length
  if (count === 0) {
    return '説明書は何の気なしに書かれていた。そして、そのまま終わった。'
  }

  const messages: string[] = [
    `あなたは ${count} 回の矛盾を選択した。`,
  ]

  if (count >= 4) {
    messages.push('説明書はもはや読める状態ではなかった。')
    messages.push('文字が滲み、行が崩れ、意味が分からなくなっ')
    messages.push('しかし、それは一つの完成形だったのかもしれな')
  } else if (count >= 2) {
    messages.push('説明書は矛盾に満ちていた。')
    messages.push('でも、その矛盾自体が一つの物語だったのかもしれな')
  } else {
    messages.push('小さな矛盾が、意外な結末を呼んだのかもしれな')
  }

  return messages.join('\n')
}
