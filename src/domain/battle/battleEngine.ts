/**
 * domain/battle/battleEngine.ts
 * ターン進行・行動順キュー・勝敗判定（docs/genre/rpg/04-battle-flow.md）。
 * Vue のリアクティビティに依存しないプレーンな関数群。呼び出し側（useBattleState）が
 * reactive オブジェクトを toRaw() してから渡すこと（10-state.md「リアクティビティの注意」）。
 */

import { BATTLE } from '../../data/tunables'
import type {
  BattleState, Combatant, BattleContent, EffectRequest,
  FocusSpec, ActiveSkillDef, SkillDef, StatKey, CategoryId, ScoreVarsBattle,
} from './types'
import { STAT_KEYS } from './types'
import {
  newAccumulator, addFlat, addRate, toModifiers, accumulatePassiveStatBoosts,
  computeEffectiveStats, clampHpToMax,
} from './stats'
import { resolveAdjacent3, buildEnemyActivesFromPattern, previewEnemyNextSkill, pickEnemySkill } from './turnQueue'
import { runEffects, clearThisTurnModifiers, clearThisBattleModifiers } from './effectOps'
import { CATEGORY_IDS } from './types'

type Emit = (req: EffectRequest) => void

// ─────────────────────────────────────────────────────────────
// 初期化
// ─────────────────────────────────────────────────────────────

const INITIAL_SKILLS = [
  { id: 'skill_strike', favoredStat: 'str' as StatKey },
  { id: 'skill_fireball', favoredStat: 'int' as StatKey },
]

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

function freshCombatant(id: string, label: string, isPlayer: boolean, formationIndex: number): Combatant {
  return {
    id, label, isPlayer,
    spriteId: '',
    baseStats: {
      hp: 0, str: 0, def: 0, int: 0, ref: 0, agi: 0,
      hitRate: BATTLE.initialStats.hitRate, evadeRate: 0,
      critRate: BATTLE.initialStats.critRate,
      critDamageMultiplier: BATTLE.initialStats.critDamageMultiplier,
    },
    hp: 0, shield: 0, alive: true,
    traits: [], passives: [], actives: [],
    temporary: [],
    builtinCooldowns: { guard: 0, dodge: 0 },
    actionPattern: [], patternIndex: 0, formationIndex, isBoss: false,
  }
}

/** ジャンル確定時: 初期スキル・初期ステータスをランダムに決定してプレイヤーを構築する */
export function initPlayer(rng: () => number): Combatant {
  const c = freshCombatant('player', 'あなた', true, 0)
  c.spriteId = BATTLE.playerSprite
  const s = BATTLE.initialStats
  const { id: initialSkillId, favoredStat } = INITIAL_SKILLS[Math.floor(rng() * INITIAL_SKILLS.length)]

  for (const key of ['str', 'def', 'int', 'ref', 'agi'] as StatKey[]) {
    const isFavored = key === favoredStat
    c.baseStats[key] = Math.round(
      isFavored ? randRange(rng, s.favoredMin, s.favoredMax) : randRange(rng, s.baseMin, s.baseMax),
    )
  }
  c.baseStats.hp = Math.round(randRange(rng, s.hpMin, s.hpMax))

  c.actives.push({ id: initialSkillId, level: 1, stacks: 0, cooldown: 0, slotIndex: 0 })
  c.hp = c.baseStats.hp
  return c
}

/** 敵定義から Combatant を構築する（毎戦フレッシュに生成。敵はランをまたいで持ち越さない） */
export function spawnEnemyFromDef(def: import('./types').EnemyDef, formationIndex: number): Combatant {
  const c = freshCombatant(`${def.id}#${formationIndex}`, def.label, false, formationIndex)
  c.spriteId = def.sprite
  c.baseStats = { ...def.stats }
  c.isBoss = def.isBoss
  c.traits = def.traits.map(id => ({ id }))
  c.passives = def.passiveSkills.map(ref => ({ id: ref.id, level: ref.level, stacks: 0 }))
  const built = buildEnemyActivesFromPattern(def)
  c.actives = built.actives
  c.actionPattern = built.actionPattern
  c.hp = c.baseStats.hp
  return c
}

/**
 * 何戦目かに応じて出現させる敵プールを選ぶ。
 * ボス戦（bossBattleIndex）ちょうどのときは isBoss を1体、それ以外は非ボスから選ぶ。
 * 実際の出現数・重み付けは呼び出し側（useBattleState）が enemies マップと相談して決める簡易版。
 */
export function pickEnemyDefs(
  content: BattleContent,
  battleIndex: number,
  rng: () => number,
): import('./types').EnemyDef[] {
  const all = [...content.enemies.values()]
  const isBossBattle = battleIndex === BATTLE.bossBattleIndex
  const pool = all.filter(e => e.isBoss === isBossBattle)
  const usable = pool.length > 0 ? pool : all
  if (usable.length === 0) return []
  if (isBossBattle) return [usable[Math.floor(rng() * usable.length)]]

  const count = Math.max(1, Math.round(randRange(rng, BATTLE.initialEnemyCount.min, BATTLE.initialEnemyCount.max)))
  const picked: import('./types').EnemyDef[] = []
  for (let i = 0; i < count; i++) picked.push(usable[Math.floor(rng() * usable.length)])
  return picked
}

// ─────────────────────────────────────────────────────────────
// 実効値の解決
// ─────────────────────────────────────────────────────────────

export function resolveEffectiveStats(c: Combatant, content: BattleContent): import('./types').EffectiveStats {
  const acc = newAccumulator()
  for (const p of c.passives) {
    const def = content.skills.get(p.id)
    if (!def || def.kind !== 'passive') continue
    accumulatePassiveStatBoosts([{ level: p.level, def }], acc)
  }
  for (const t of c.traits) {
    const def = content.traits.get(t.id)
    if (!def) continue
    accumulatePassiveStatBoosts([{ level: 1, def }], acc)
  }
  for (const key of STAT_KEYS) {
    for (const tm of c.temporary) {
      if (tm.stat !== key) continue
      if (tm.flat) addFlat(acc, key, tm.flat)
      if (tm.rate) addRate(acc, key, tm.rate)
    }
  }
  return computeEffectiveStats(c.baseStats, toModifiers(acc))
}

// ─────────────────────────────────────────────────────────────
// フォーカス解決
// ─────────────────────────────────────────────────────────────

/** プレイヤー操作用: 指定した敵を中心に focusRange に応じた対象配列を返す */
export function resolvePlayerFocus(
  spec: FocusSpec, player: Combatant, enemies: readonly Combatant[], centerEnemyIndex: number | null,
): Combatant[] {
  if (spec.side === 'self') return [player]
  const alive = enemies.filter(e => e.alive)
  if (spec.side === 'ally') return [player]   // 味方は存在しない。安全側フォールバック
  if (spec.range === 'all') return alive
  if (spec.range === 'adjacent3' && centerEnemyIndex !== null) return resolveAdjacent3(enemies, centerEnemyIndex)
  if (centerEnemyIndex !== null) {
    const e = enemies[centerEnemyIndex]
    return e && e.alive ? [e] : alive.slice(0, 1)
  }
  return alive.slice(0, 1)
}

/** 敵の行動用: 敵から見た対象は常にプレイヤー1体（味方は存在しない） */
export function resolveEnemyFocus(spec: FocusSpec, enemy: Combatant, player: Combatant): Combatant[] {
  return spec.side === 'self' ? [enemy] : [player]
}

// ─────────────────────────────────────────────────────────────
// スキル使用
// ─────────────────────────────────────────────────────────────

export function useActiveSkill(params: {
  state: BattleState
  content: BattleContent
  source: Combatant
  skillId: string
  level: number
  targets: Combatant[]
  rng: () => number
  emit: Emit
}): void {
  const { state, content, source, skillId, level, targets, rng, emit } = params
  const def = content.skills.get(skillId)
  if (!def || def.kind !== 'active') return

  // onCast タイミングのエフェクトのみここで発火する。onHit 側は damage op が対象ごとに出す
  //（対象が複数・多段のとき、着弾演出は当たった回数だけ必要になるため）
  for (const fx of def.effects ?? []) {
    emit({ effectId: fx, targetRef: 'source', combatantId: source.id, payload: { skillId: def.id } })
  }

  runEffects(def.effect, {
    source, targets, skill: def, level, state, emit, rng,
    getEffective: c => resolveEffectiveStats(c, content),
    content,
  })
}

export function useBuiltinAction(source: Combatant, action: 'guard' | 'pass' | 'dodge'): void {
  if (action === 'pass') return
  if (action === 'guard') {
    source.temporary.push({ stat: 'cutRate', flat: BATTLE.guard.cutRate, scope: 'thisTurn', sourceId: 'guard' })
    source.builtinCooldowns.guard = BATTLE.guard.cooldown
  } else {
    source.temporary.push({ stat: 'evadeRate', flat: BATTLE.dodge.evadeBonus, scope: 'thisTurn', sourceId: 'dodge' })
    source.builtinCooldowns.dodge = BATTLE.dodge.cooldown
  }
}

/** 特性 replaceGuard を持つか判定する */
export function hasReplaceGuard(c: Combatant, content: BattleContent): boolean {
  return c.traits.some(t => {
    const def = content.traits.get(t.id)
    return def?.effect.some(e => e.op === 'replaceGuard') ?? false
  })
}

// ─────────────────────────────────────────────────────────────
// 敵の行動
// ─────────────────────────────────────────────────────────────

export function enemyTakeTurn(params: {
  state: BattleState
  content: BattleContent
  enemy: Combatant
  player: Combatant
  rng: () => number
  emit: Emit
}): void {
  const { state, content, enemy, player, rng, emit } = params
  const skillId = pickEnemySkill(enemy)
  if (!skillId) return   // 全スキルCT中 = 何もしない
  const owned = enemy.actives.find(a => a.id === skillId)
  if (!owned) return
  const def = content.skills.get(skillId)
  if (!def || def.kind !== 'active') return

  const targets = resolveEnemyFocus({ side: def.defaultFocus, range: def.focusRange }, enemy, player)
  useActiveSkill({ state, content, source: enemy, skillId, level: owned.level, targets, rng, emit })
  owned.cooldown = def.cooldown
}

export { previewEnemyNextSkill }

// ─────────────────────────────────────────────────────────────
// ラウンド終了処理
// ─────────────────────────────────────────────────────────────

export function endOfRound(state: BattleState): void {
  const all = [state.player, ...state.enemies].filter(c => c.alive)
  for (const c of all) {
    for (const a of c.actives) a.cooldown = Math.max(0, a.cooldown - 1)
    c.builtinCooldowns.guard = Math.max(0, c.builtinCooldowns.guard - 1)
    c.builtinCooldowns.dodge = Math.max(0, c.builtinCooldowns.dodge - 1)
    clearThisTurnModifiers(c)
  }
  state.roundCount++
}

// ─────────────────────────────────────────────────────────────
// 勝敗判定・戦闘終了処理
// ─────────────────────────────────────────────────────────────

export type BattleOutcome = 'ongoing' | 'won' | 'lost'

export function checkBattleOutcome(state: BattleState): BattleOutcome {
  if (!state.player.alive) return 'lost'
  if (state.enemies.every(e => !e.alive)) return 'won'
  return 'ongoing'
}

/**
 * 戦闘勝利時の後処理: HP と shield 以外を全てリセットし、healBetweenBattles 特性を適用する。
 * 呼び出し後、状態は 'drafting' に遷移させる（ドラフト抽選は skillDraft.ts が別途行う）。
 */
export function finishBattleOnVictory(state: BattleState, content: BattleContent): void {
  const player = state.player
  const wonBoss = state.enemies.some(e => e.isBoss)

  clearThisBattleModifiers(player)   // thisTurn/thisBattle をまとめて除去。permanent は残す
  for (const a of player.actives) a.cooldown = 0
  player.builtinCooldowns = { guard: 0, dodge: 0 }

  state.lastBattleEndNotices = []

  // 特性の有無に関わらず、戦闘終了ごとに無条件で最大HPの一定割合を回復する
  // （HPが不足しがちだったプレイフィードバックを受けた常設の救済措置。healBetweenBattles
  // 特性による回復とは別枠で加算される）
  {
    const eff = resolveEffectiveStats(player, content)
    const amount = Math.floor(BATTLE.postBattleHealRate * eff.hp)
    const before = player.hp
    player.hp = Math.min(eff.hp, player.hp + amount)
    if (player.hp > before) state.lastBattleEndNotices.push(`戦闘後の回復で${player.hp - before}回復した`)
  }

  for (const t of player.traits) {
    const def = content.traits.get(t.id)
    if (!def) continue
    for (const eff of def.effect) {
      if (eff.op !== 'healBetweenBattles') continue
      const eff2 = resolveEffectiveStats(player, content)
      const amount = typeof eff.amount === 'number' ? eff.amount
        : typeof eff.rate === 'number' ? eff.rate * eff2.hp : 0
      const before = player.hp
      player.hp = Math.min(eff2.hp, player.hp + Math.floor(amount))
      if (player.hp > before) state.lastBattleEndNotices.push(`${def.label}で${player.hp - before}回復した`)
    }
  }
  clampHpToMax(player, resolveEffectiveStats(player, content).hp)

  state.battlesWon++
  if (wonBoss) state.bossDefeated = true
  state.battleIndex++
  state.rerollCharges++
}

// ─────────────────────────────────────────────────────────────
// スコア（実装後に持ち越しの暫定式に対応する変数群）
// ─────────────────────────────────────────────────────────────

export function buildBattleScoreVars(state: BattleState): ScoreVarsBattle {
  let maxSkillLevel = 0
  for (const a of state.player.actives) maxSkillLevel = Math.max(maxSkillLevel, a.level)
  for (const p of state.player.passives) maxSkillLevel = Math.max(maxSkillLevel, p.level)
  return {
    battlesWon: state.battlesWon,
    bossDefeated: state.bossDefeated ? 1 : 0,
    maxSkillLevel,
    traitsAcquired: state.player.traits.length,
  }
}

// ─────────────────────────────────────────────────────────────
// カテゴリポイント（skillDraft.ts と共有する集計。エンジンからも参照するためここに置く）
// ─────────────────────────────────────────────────────────────

export function zeroCategoryPoints(): Record<CategoryId, number> {
  const out = {} as Record<CategoryId, number>
  for (const id of CATEGORY_IDS) out[id] = 0
  return out
}

export type { SkillDef, ActiveSkillDef }
