/**
 * src/data/battleContent.ts
 *
 * rpg ジャンル（ローグライク戦闘）のコンテンツを自動収集する。
 * src/data/config.ts / src/data/sprites.ts と同型のパターン。
 *
 * ── スキル・特性・敵・エフェクトを追加するには ────────────────────
 * それぞれのディレクトリに JSON を1つ追加するだけ。
 * 形式は schemas/battle-*.schema.json を参照。
 * ──────────────────────────────────────────────────────────────
 */

import type {
  ActiveSkillDef, PassiveSkillDef, TraitDef, EnemyDef, BattleEffectDef,
  BattleContent, EnemySkillRefResolved,
} from '../domain/battle/types'

type SkillJson = Partial<ActiveSkillDef> & Partial<PassiveSkillDef> & { id?: string; kind?: string }

function normalizeSkillRef(ref: unknown): EnemySkillRefResolved {
  if (typeof ref === 'string') return { id: ref, level: 1 }
  const r = ref as { id: string; level?: number }
  return { id: r.id, level: r.level ?? 1 }
}

// ── スキル（アクティブ/パッシブ） ─────────────────────────────────
const _skillModules = import.meta.glob('./skills/*.json', { eager: true })
const _skills = new Map<string, ActiveSkillDef | PassiveSkillDef>()
for (const [path, mod] of Object.entries(_skillModules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as SkillJson
  if (typeof raw.id !== 'string' || (raw.kind !== 'active' && raw.kind !== 'passive')) {
    console.error(`[battleContent] ${path}: id/kind が不正です。このスキルはスキップされます。`)
    continue
  }
  if (_skills.has(raw.id)) {
    console.warn(`[battleContent] スキルID "${raw.id}" が重複しています (${path})。上書きします。`)
  }
  _skills.set(raw.id, raw as ActiveSkillDef | PassiveSkillDef)
}

// ── 特性 ───────────────────────────────────────────────────────
const _traitModules = import.meta.glob('./traits/*.json', { eager: true })
const _traits = new Map<string, TraitDef>()
for (const [path, mod] of Object.entries(_traitModules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as Partial<TraitDef> & { id?: string }
  if (typeof raw.id !== 'string' || raw.kind !== 'trait') {
    console.error(`[battleContent] ${path}: id/kind が不正です。この特性はスキップされます。`)
    continue
  }
  if (_traits.has(raw.id)) {
    console.warn(`[battleContent] 特性ID "${raw.id}" が重複しています (${path})。上書きします。`)
  }
  _traits.set(raw.id, raw as TraitDef)
}

// ── 敵 ─────────────────────────────────────────────────────────
interface EnemyJson {
  id?: string
  label?: string
  flavorText?: string
  stats?: EnemyDef['stats']
  traits?: string[]
  activeSkills?: unknown[]
  passiveSkills?: unknown[]
  actionPattern?: string[]
  isBoss?: boolean
}

const _enemyModules = import.meta.glob('./enemies/*.json', { eager: true })
const _enemies = new Map<string, EnemyDef>()
for (const [path, mod] of Object.entries(_enemyModules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as EnemyJson
  if (typeof raw.id !== 'string' || !raw.stats) {
    console.error(`[battleContent] ${path}: id/stats が不正です。この敵はスキップされます。`)
    continue
  }
  if (_enemies.has(raw.id)) {
    console.warn(`[battleContent] 敵ID "${raw.id}" が重複しています (${path})。上書きします。`)
  }
  _enemies.set(raw.id, {
    id: raw.id,
    label: raw.label ?? raw.id,
    flavorText: raw.flavorText ?? '',
    stats: raw.stats,
    traits: raw.traits ?? [],
    activeSkills: (raw.activeSkills ?? []).map(normalizeSkillRef),
    passiveSkills: (raw.passiveSkills ?? []).map(normalizeSkillRef),
    actionPattern: raw.actionPattern ?? [],
    isBoss: raw.isBoss ?? false,
  })
}

// ── エフェクト ─────────────────────────────────────────────────
const _effectModules = import.meta.glob('./battle-effects/*.json', { eager: true })
const _effects = new Map<string, BattleEffectDef>()
for (const [path, mod] of Object.entries(_effectModules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as Partial<BattleEffectDef> & { id?: string }
  if (typeof raw.id !== 'string') {
    console.error(`[battleContent] ${path}: id が見つかりません。このエフェクトはスキップされます。`)
    continue
  }
  if (_effects.has(raw.id)) {
    console.warn(`[battleContent] エフェクトID "${raw.id}" が重複しています (${path})。上書きします。`)
  }
  _effects.set(raw.id, raw as BattleEffectDef)
}

export const SKILLS: ReadonlyMap<string, ActiveSkillDef | PassiveSkillDef> = _skills
export const TRAITS: ReadonlyMap<string, TraitDef> = _traits
export const ENEMIES: ReadonlyMap<string, EnemyDef> = _enemies
export const BATTLE_EFFECTS: ReadonlyMap<string, BattleEffectDef> = _effects

/** domain/battle 層へ渡す純粋なコンテンツ束（Vue・Viteのローダに依存しない形） */
export const BATTLE_CONTENT: BattleContent = { skills: SKILLS, traits: TRAITS, enemies: ENEMIES }
