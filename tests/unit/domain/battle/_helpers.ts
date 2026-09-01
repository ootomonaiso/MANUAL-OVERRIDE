/**
 * tests/unit/domain/battle/_helpers.ts
 * rpg 戦闘テスト用の共通ファクトリ。vitest の include（*.test.ts）に拾われない名前にしてある。
 */

import type {
  BattleStats, Combatant, BattleContent, ActiveSkillDef, PassiveSkillDef,
  TraitDef, EnemyDef, BattleState, CategoryId, EffectRequest, EffectContext,
  EffectNode, SkillDef,
} from '../../../../src/domain/battle/types'
import { CATEGORY_IDS } from '../../../../src/domain/battle/types'
import { resolveEffectiveStats } from '../../../../src/domain/battle/battleEngine'

/**
 * 既定値は「補正ゼロ点」に揃えてある。
 * def/ref/agi = 1000 は battle.json の cut.anchor / evade.anchor と一致するため、
 * カット率も回避率も 0 になり、テストの期待値が式そのものになる。
 */
export function makeStats(over: Partial<BattleStats> = {}): BattleStats {
  return {
    hp: 5000, str: 1000, def: 1000, int: 1000, ref: 1000, agi: 1000,
    hitRate: 1, evadeRate: 0, critRate: 0, critDamageMultiplier: 2,
    ...over,
  }
}

export function makeCombatant(over: Partial<Combatant> = {}): Combatant {
  const baseStats = over.baseStats ?? makeStats()
  return {
    id: 'c1', label: 'テスト', isPlayer: false,
    baseStats,
    hp: baseStats.hp, shield: 0, alive: true,
    traits: [], passives: [], actives: [],
    temporary: [],
    builtinCooldowns: { guard: 0, dodge: 0 },
    actionPattern: [], patternIndex: 0, formationIndex: 0, isBoss: false,
    ...over,
  }
}

export function makePlayer(over: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: 'player', label: 'あなた', isPlayer: true, ...over })
}

export function makeActive(over: Partial<ActiveSkillDef> & { id: string }): ActiveSkillDef {
  return {
    kind: 'active', label: over.id, flavorText: '',
    mainCategory: 'might' as CategoryId, subCategories: [],
    element: 'physical', cooldown: 0, defaultFocus: 'enemy', focusRange: 'single',
    effect: [],
    ...over,
  }
}

export function makePassive(over: Partial<PassiveSkillDef> & { id: string }): PassiveSkillDef {
  return {
    kind: 'passive', label: over.id, flavorText: '',
    mainCategory: 'vitality' as CategoryId, subCategories: [],
    effect: [],
    ...over,
  }
}

export function makeTrait(over: Partial<TraitDef> & { id: string }): TraitDef {
  return {
    kind: 'trait', label: over.id, flavorText: '',
    mainCategory: null, subCategories: [],
    effect: [],
    ...over,
  }
}

export function makeEnemyDef(over: Partial<EnemyDef> & { id: string }): EnemyDef {
  return {
    label: over.id, flavorText: '',
    stats: makeStats(),
    traits: [], activeSkills: [], passiveSkills: [], actionPattern: [], isBoss: false,
    ...over,
  }
}

export function makeContent(parts: {
  skills?: (ActiveSkillDef | PassiveSkillDef)[]
  traits?: TraitDef[]
  enemies?: EnemyDef[]
} = {}): BattleContent {
  return {
    skills: new Map((parts.skills ?? []).map(s => [s.id, s])),
    traits: new Map((parts.traits ?? []).map(t => [t.id, t])),
    enemies: new Map((parts.enemies ?? []).map(e => [e.id, e])),
  }
}

export function zeroPoints(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>
  for (const id of CATEGORY_IDS) out[id] = 0
  return out
}

export function makeState(over: Partial<BattleState> = {}): BattleState {
  return {
    battleIndex: 0, battlesWon: 0, bossDefeated: false, runOutcome: null,
    player: makePlayer(),
    enemies: [],
    turnQueue: [], turnIndex: 0, roundCount: 0,
    status: 'battle',
    draftOptions: null,
    pendingSwapSkillId: null,
    categoryPoints: zeroPoints(),
    seenIds: new Set(),
    ui: { statusPanelMode: 'effective', showBuffDiff: true, statusPanelCollapsed: false, skillListCollapsed: false },
    playScore: 0,
    lastBattleEndNotices: [],
    ...over,
  }
}

/** 与えた順に値を返し、尽きたら最後の値を返し続ける決定的な乱数 */
export function seqRng(values: readonly number[]): () => number {
  let i = 0
  return () => {
    const v = values[Math.min(i, values.length - 1)] ?? 0
    i++
    return v
  }
}

export function constRng(v: number): () => number {
  return () => v
}

/** 必ず命中し、決してクリティカルしない乱数（damageOp は hit → crit の順に引く） */
export const alwaysHitNoCrit = (): (() => number) => constRng(0.5)

export interface CapturedEffects {
  emit: (req: EffectRequest) => void
  list: EffectRequest[]
  ids: () => string[]
}

export function captureEffects(): CapturedEffects {
  const list: EffectRequest[] = []
  return { emit: r => { list.push(r) }, list, ids: () => list.map(r => r.effectId) }
}

/** op を単体実行するための EffectContext を組み立てる */
export function makeCtx(parts: {
  source: Combatant
  targets: Combatant[]
  skill: SkillDef
  content: BattleContent
  level?: number
  rng?: () => number
  state?: BattleState
  emit?: (req: EffectRequest) => void
}): EffectContext {
  const content = parts.content
  return {
    source: parts.source,
    targets: parts.targets,
    skill: parts.skill,
    level: parts.level ?? 1,
    state: parts.state ?? makeState({ player: parts.source }),
    emit: parts.emit ?? (() => {}),
    rng: parts.rng ?? constRng(0.5),
    getEffective: c => resolveEffectiveStats(c, content),
    content,
  }
}

export function node(op: string, rest: Record<string, unknown> = {}): EffectNode {
  return { op, ...rest }
}
