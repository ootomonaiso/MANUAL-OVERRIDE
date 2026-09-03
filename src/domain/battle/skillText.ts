/**
 * domain/battle/skillText.ts
 * 効果文の自動生成（docs/genre/rpg/05-skills.md「効果文の表示」）。
 * 表示される数値はスキルレベルの倍率を適用済みの実値にする。
 */

import type { SkillDef, EffectNode, StatKey, Element, CategoryId, ModifierScope, TemporaryModifier } from './types'
import { levelMultiplier } from './stats'

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  vitality: '頑強', guard: '守勢', might: '剛撃', wisdom: '明晰', swift: '疾風',
  fatal: '致命', heal: '治癒', aegis: '加護', curse: '呪詛', pierce: '貫通', combo: '連撃',
}

/** カテゴリごとの目印色。実際の色値は battle-screen の CSS カスタムプロパティ側で定義する */
export const CATEGORY_COLOR: Record<CategoryId, string> = {
  vitality: 'var(--battle-category-vitality)',
  guard: 'var(--battle-category-guard)',
  might: 'var(--battle-category-might)',
  wisdom: 'var(--battle-category-wisdom)',
  swift: 'var(--battle-category-swift)',
  fatal: 'var(--battle-category-fatal)',
  heal: 'var(--battle-category-heal)',
  aegis: 'var(--battle-category-aegis)',
  curse: 'var(--battle-category-curse)',
  pierce: 'var(--battle-category-pierce)',
  combo: 'var(--battle-category-combo)',
}

export interface SkillTextToken {
  type: 'plain' | 'stat' | 'element' | 'number'
  text: string
  /** type === 'element' のとき、色分けに使う具体的な属性 */
  element?: Element
}

export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP', str: 'STR', def: 'DEF', int: 'INT', ref: 'REF', agi: 'AGI',
  hitRate: '命中率', evadeRate: '回避率', critRate: 'クリティカル率',
  critDamageMultiplier: 'クリティカルダメージ倍率',
}

export const ELEMENT_LABEL: Record<Element, string> = {
  physical: '物理', magical: '魔法', special: '特殊',
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`
}

function statTok(key: StatKey): SkillTextToken {
  return { type: 'stat', text: STAT_LABEL[key] }
}
function elemTok(el: Element): SkillTextToken {
  return { type: 'element', text: ELEMENT_LABEL[el], element: el }
}
function numTok(text: string): SkillTextToken {
  return { type: 'number', text }
}
function plain(text: string): SkillTextToken {
  return { type: 'plain', text }
}

function nodeToTokens(node: EffectNode, mult: number): SkillTextToken[] {
  switch (node.op) {
    case 'damage': {
      const scale = node.scale as { stat: StatKey; rate: number }
      return [
        elemTok(node.element as Element), plain('属性ダメージ: '),
        statTok(scale.stat), plain('の'), numTok(pct(scale.rate * mult)), plain('分'),
      ]
    }
    case 'heal': {
      const scale = node.scale as { stat: StatKey; rate: number }
      return [plain('回復: '), statTok(scale.stat), plain('の'), numTok(pct(scale.rate * mult)), plain('分')]
    }
    case 'shield': {
      const scale = node.scale as { stat: StatKey; rate: number }
      return [plain('シールド付与: '), statTok(scale.stat), plain('の'), numTok(pct(scale.rate * mult)), plain('分')]
    }
    case 'repeat': {
      const times = node.times as number
      const body = (node.body as EffectNode[]) ?? []
      const onLast = node.onLastIteration as EffectNode[] | undefined
      const out: SkillTextToken[] = [numTok(`${times}回`), plain('繰り返す（')]
      for (const b of body) out.push(...nodeToTokens(b, mult), plain('。'))
      out.push(plain('）'))
      if (onLast) {
        out.push(plain('最後の1回のみ: '))
        for (const n of onLast) out.push(...nodeToTokens(n, mult), plain('。'))
      }
      return out
    }
    case 'modifier': {
      const stat = node.stat as StatKey | 'cutRate'
      const amount = node.amount as number | undefined
      const rate = node.rate as number | undefined
      const statLabel = stat === 'cutRate' ? plain('カット率') : statTok(stat)
      const applyTo = (node.applyTo as string | undefined) === 'target' ? '対象' : '自分'
      const valueTok = amount !== undefined ? numTok(`+${amount * mult}`) : numTok(`${pct((rate ?? 0) * mult)}`)
      return [plain(`${applyTo}の`), statLabel, plain('を'), valueTok, plain('変化させる')]
    }
    case 'statBoost': {
      const stat = node.stat as StatKey
      const amount = node.amount as number | undefined
      const rate = node.rate as number | undefined
      const valueTok = amount !== undefined ? numTok(`+${amount * mult}`) : numTok(pct((rate ?? 0) * mult))
      return [statTok(stat), plain('を'), valueTok, plain('上昇させる')]
    }
    case 'elementAffinity': {
      const affinity = node.affinity === 'weak' ? '弱点' : '耐性'
      return [elemTok(node.element as Element), plain(`属性を${affinity}とする`)]
    }
    case 'cutRate': {
      const amount = node.amount as number
      return [plain('被ダメージを'), numTok(pct(amount)), plain('軽減する')]
    }
    case 'effectBoost': {
      const el = node.element as Element | 'any'
      const rate = node.rate as number
      const head = el === 'any' ? plain('全属性') : elemTok(el)
      return [head, plain('の効果量を'), numTok(pct(rate * mult)), plain('上昇させる')]
    }
    case 'healTaken': {
      const rate = node.rate as number
      return [plain('受ける回復量を'), numTok(pct(rate * mult)), plain('上昇させる')]
    }
    case 'replaceGuard':
      return [plain('「守る」が「様子を見る」に変化する')]
    case 'noop':
      return [plain('何もしない')]
    case 'healBetweenBattles': {
      const amount = node.amount as number | undefined
      const rate = node.rate as number | undefined
      const valueTok = amount !== undefined ? numTok(`${amount}`) : numTok(pct(rate ?? 0))
      return [plain('戦闘終了時にHPを'), valueTok, plain('回復する')]
    }
    default:
      return [plain(`(${node.op})`)]
  }
}

function endsWithPeriod(tokens: readonly SkillTextToken[]): boolean {
  const last = tokens[tokens.length - 1]
  return last?.type === 'plain' && last.text.endsWith('。')
}

// ─────────────────────────────────────────────────────────────
// バフ・デバフ表示（一時効果を「今かかっているもの」として見せる）
// ─────────────────────────────────────────────────────────────

const MODIFIER_SCOPE_LABEL: Record<ModifierScope, string> = {
  thisHit: 'この一撃のみ', thisTurn: 'このターンのみ', thisBattle: 'この戦闘中', permanent: '永続',
}

export interface TemporaryModifierView {
  label: string
  isBuff: boolean
  scopeLabel: string
}

/** 一時効果1件をバフ/デバフ表示用に変換する。BuffStrip・敵の状態表示の両方で使う */
export function describeTemporaryModifier(m: TemporaryModifier): TemporaryModifierView {
  const magnitude = m.flat ?? m.rate ?? 0
  const isBuff = magnitude >= 0
  const label = m.sourceId === 'guard' ? '防御態勢'
    : m.sourceId === 'dodge' ? '回避態勢'
      : m.stat === 'cutRate' ? 'ダメージ軽減'
        : `${STAT_LABEL[m.stat]}${isBuff ? '上昇' : '低下'}`
  return { label, isBuff, scopeLabel: MODIFIER_SCOPE_LABEL[m.scope] }
}

/** 効果データから表示文を自動生成する。レベル倍率を適用済みの実値で表示する */
export function buildSkillText(def: SkillDef, level: number): SkillTextToken[] {
  const mult = def.kind === 'trait' ? 1 : levelMultiplier(level)
  const out: SkillTextToken[] = []
  def.effect.forEach((node, i) => {
    if (i > 0 && !endsWithPeriod(out)) out.push(plain('。'))
    out.push(...nodeToTokens(node, mult))
  })
  if (!endsWithPeriod(out)) out.push(plain('。'))
  return out
}
