/**
 * domain/battle/battleEngine.ts
 * ターン進行・行動順キュー・勝敗判定（docs/genre/rpg/04-battle-flow.md）。
 * Vue のリアクティビティに依存しないプレーンな関数群。呼び出し側（useBattleState）が
 * reactive オブジェクトを toRaw() してから渡すこと（10-state.md「リアクティビティの注意」）。
 */

import { BATTLE, ENCOUNTER_GROUPS } from '../../data/tunables'
import type { EncounterGroupsConfig } from '../../framework/config-types'
import type {
  BattleState, Combatant, BattleContent, EffectRequest, EffectiveStats,
  FocusSpec, ActiveSkillDef, StatKey, ScoreVarsBattle,
  BattleStats, EnemyDef, EnemySet,
} from './types'
import { STAT_KEYS } from './types'
import {
  newAccumulator, addFlat, addRate, toModifiers, accumulatePassiveStatBoosts,
  computeEffectiveStats, clampHpToMax,
} from './stats'
import { decayShield } from './damageCalc'
import { resolveAdjacent3, buildEnemyActivesFromPattern, pickEnemySkill } from './turnQueue'
import {
  runEffects, clearThisTurnModifiers, clearThisBattleModifiers, downgradeNextRoundModifiers,
  decrementRoundsModifiers,
} from './effectOps'

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
    flavorText: '',
    baseStats: {
      hp: 0, str: 0, def: 0, int: 0, ref: 0, agi: 0,
      hitRate: BATTLE.initialStats.hitRate, evadeRate: 0,
      critRate: BATTLE.initialStats.critRate,
      critDamageMultiplier: BATTLE.initialStats.critDamageMultiplier,
    },
    hp: 0, shield: 0, maxShield: 0, alive: true,
    traits: [], passives: [], actives: [],
    temporary: [],
    periodicSelfEffects: [],
    periodicTargetEffects: [],
    pendingCounter: null,
    queuedCounterHits: 0,
    pendingTransformBonus: null,
    skipNextTurn: false,
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

  c.actives.push({ id: initialSkillId, points: 0, level: 1, cooldown: 0, slotIndex: 0 })
  c.hp = c.baseStats.hp
  return c
}

/** 敵定義から Combatant を構築する（毎戦フレッシュに生成。敵はランをまたいで持ち越さない）。
 * statsOverride を渡すと、指定した項目だけ敵定義のデフォルト値を上書きする（敵セット想定） */
export function spawnEnemyFromDef(
  def: EnemyDef, formationIndex: number, statsOverride?: Partial<BattleStats>,
): Combatant {
  const c = freshCombatant(`${def.id}#${formationIndex}`, def.label, false, formationIndex)
  c.spriteId = def.sprite
  c.flavorText = def.flavorText
  c.baseStats = { ...def.stats, ...statsOverride }
  c.isBoss = def.isBoss
  c.traits = def.traits.map(id => ({ id }))
  c.passives = def.passiveSkills.map(ref => ({ id: ref.id, level: ref.level }))
  const built = buildEnemyActivesFromPattern(def)
  c.actives = built.actives
  c.actionPattern = built.actionPattern
  c.hp = c.baseStats.hp
  return c
}

// ─────────────────────────────────────────────────────────────
// 敵グループ/難易度スケーリング（CLAUDE_TASKS.md 第6フェーズ）
// ─────────────────────────────────────────────────────────────

/** battleIndex(0始まり) が bossIntervalBattles 戦ごとのボス戦かどうか */
export function isBossBattleIndex(battleIndex: number, bossIntervalBattles: number): boolean {
  return (battleIndex + 1) % bossIntervalBattles === 0
}

/** 何回目のボス出現か（1始まり）。ボス戦でない battleIndex に対しても計算はできるが意味を持たない */
export function bossOccurrenceNumber(battleIndex: number, bossIntervalBattles: number): number {
  return Math.floor(battleIndex / bossIntervalBattles) + 1
}

/** ボスは groupOrder（例: A→B→C→D→E）を順番に巡回する。Eの次は再びA */
export function bossGroupFor(occurrenceNumber: number, groupOrder: readonly string[]): string {
  return groupOrder[(occurrenceNumber - 1) % groupOrder.length]
}

/** groupOrder を lapsForTrueClear 周した時点のボス撃破が「真のクリア」になる */
export function isTrueClearOccurrence(occurrenceNumber: number, groupOrder: readonly string[], lapsForTrueClear: number): boolean {
  return occurrenceNumber === groupOrder.length * lapsForTrueClear
}

/** battleIndex が「真のクリア」となるボス戦かどうか（isBossBattleIndex + isTrueClearOccurrence の合成） */
export function isTrueClearBattleIndex(
  battleIndex: number,
  encounterGroups: { bossIntervalBattles: number; groupOrder: readonly string[]; lapsForTrueClear: number },
): boolean {
  if (!isBossBattleIndex(battleIndex, encounterGroups.bossIntervalBattles)) return false
  const occurrence = bossOccurrenceNumber(battleIndex, encounterGroups.bossIntervalBattles)
  return isTrueClearOccurrence(occurrence, encounterGroups.groupOrder, encounterGroups.lapsForTrueClear)
}

/** battleIndex に対応する spawnWeightTiers の重みを返す（閾値以下で最も新しいティア） */
function weightsForBattleIndex(
  tiers: readonly { minBattleIndex: number; weights: Record<string, number> }[],
  battleIndex: number,
): Record<string, number> {
  let chosen: Record<string, number> = {}
  for (const tier of tiers) {
    if (tier.minBattleIndex <= battleIndex) chosen = tier.weights
  }
  return chosen
}

/**
 * 重み付き抽選で1つキーを選ぶ。重みの合計が0以下なら null。
 * 重みが 0 以下の entry は roll を消費せず読み飛ばす
 * （roll がちょうど 0 の瞬間に、抽選対象外のはずの entry が先頭にいるだけで選ばれてしまうのを防ぐため）。
 */
function weightedPick<T extends string>(weights: Record<T, number>, rng: () => number): T | null {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const [key, w] of entries) {
    if (w <= 0) continue
    roll -= w
    if (roll <= 0) return key
  }
  return entries[entries.length - 1]?.[0] ?? null
}

/** グループ内のセットのうち、ボス入り／非ボスだけを絞り込む */
function filterSetsByBossFlag(setIds: readonly string[], content: BattleContent, wantBoss: boolean): EnemySet[] {
  const sets: EnemySet[] = []
  for (const id of setIds) {
    const set = content.enemySets.get(id)
    if (!set) continue
    const hasBoss = set.members.some(m => content.enemies.get(m.enemyId)?.isBoss)
    if (hasBoss === wantBoss) sets.push(set)
  }
  return sets
}

export interface EnemySpawnPick {
  def: EnemyDef
  statsOverride?: Partial<BattleStats>
}

/**
 * 何戦目かに応じて出現させる敵セットを選ぶ。
 * ボス戦（bossIntervalBattles戦ごと）は groupOrder を巡回するグループから、ボス入りセットを1つ選ぶ。
 * 通常戦は spawnWeightTiers の重みでグループを1つ選び、そのグループの非ボスセットから1つ選ぶ。
 * 該当グループに候補が無い場合は全グループを横断して探すフォールバックを行う（コンテンツ未整備でも落ちない）。
 * encounterGroups は省略時 ENCOUNTER_GROUPS（実設定）。テストが独自シナリオを注入できるよう引数化してある。
 */
export function pickEnemyDefs(
  content: BattleContent,
  battleIndex: number,
  rng: () => number,
  encounterGroups: EncounterGroupsConfig = ENCOUNTER_GROUPS,
): EnemySpawnPick[] {
  const eg = encounterGroups
  const bossBattle = isBossBattleIndex(battleIndex, eg.bossIntervalBattles)

  let candidateSets: EnemySet[]
  if (bossBattle) {
    const occurrence = bossOccurrenceNumber(battleIndex, eg.bossIntervalBattles)
    const group = bossGroupFor(occurrence, eg.groupOrder)
    candidateSets = filterSetsByBossFlag(eg.groups[group] ?? [], content, true)
    if (candidateSets.length === 0) {
      // フォールバック: 該当グループにボス入りセットが無ければ全グループから探す
      console.warn(`[battleEngine] グループ "${group}" にボス入りセットが無いため、全グループから探します`)
      candidateSets = filterSetsByBossFlag(Object.values(eg.groups).flat(), content, true)
    }
  } else {
    const weights = weightsForBattleIndex(eg.spawnWeightTiers, battleIndex)
    const group = weightedPick(weights, rng)
    candidateSets = filterSetsByBossFlag(group ? (eg.groups[group] ?? []) : [], content, false)
    if (candidateSets.length === 0) {
      candidateSets = filterSetsByBossFlag(Object.values(eg.groups).flat(), content, false)
    }
  }

  if (candidateSets.length === 0) {
    console.warn('[battleEngine] 出現可能な敵セットが1つも見つかりませんでした')
    return []
  }
  const set = candidateSets[Math.floor(rng() * candidateSets.length)]
  const picks: EnemySpawnPick[] = []
  for (const member of set.members) {
    const def = content.enemies.get(member.enemyId)
    if (!def) continue
    picks.push({ def, statsOverride: member.statsOverride })
  }
  return picks
}

// ─────────────────────────────────────────────────────────────
// 実効値の解決
// ─────────────────────────────────────────────────────────────

export function resolveEffectiveStats(c: Combatant, content: BattleContent): EffectiveStats {
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

/** プレイヤー操作用: 指定した敵を中心に focusRange に応じた対象配列を返す。
 * rng は focusRange:'random' でのみ使う（生存している敵からランダムに1体選ぶ） */
export function resolvePlayerFocus(
  spec: FocusSpec, player: Combatant, enemies: readonly Combatant[], centerEnemyIndex: number | null,
  rng: () => number,
): Combatant[] {
  if (spec.side === 'self') return [player]
  const alive = enemies.filter(e => e.alive)
  if (spec.side === 'ally') return [player]   // 味方は存在しない。安全側フォールバック
  if (spec.range === 'all') return alive
  if (spec.range === 'random') return alive.length > 0 ? [alive[Math.floor(rng() * alive.length)]] : []
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

  // 一発ツモ 想定: 直前に立直等が仕込んだ「変化先スキル専用の一時ボーナス」を、対象がこの
  // スキルと一致する時だけ消費する。thisHit スコープで積むので、この後の runEffects 内の
  // ダメージ計算にだけ乗り、命中・外れに関わらず runEffects の末尾で自動的に失効する
  if (source.pendingTransformBonus && source.pendingTransformBonus.targetSkillId === skillId) {
    const bonus = source.pendingTransformBonus
    source.temporary.push({ stat: bonus.stat, flat: bonus.amount, scope: 'thisHit', sourceId: `${skillId}:transformBonus` })
    source.pendingTransformBonus = null
  }

  // onCast タイミングのエフェクトのみここで発火する。onHit 側は damage op が対象ごとに出す
  //（対象が複数・多段のとき、着弾演出は当たった回数だけ必要になるため）
  for (const fx of def.effects ?? []) {
    emit({ effectId: fx, targetRef: 'source', combatantId: source.id, payload: { skillId: def.id } })
  }

  runEffects(def.effect, {
    source, targets, skill: def, level, state, emit, rng,
    getEffective: c => resolveEffectiveStats(c, content),
    content,
    dealtDamage: { total: 0, missedPotential: 0 },
  })

  flushCounterRetaliations({ attacker: source, hitTargets: targets, state, content, rng, emit })

  // 立直⇔自摸 のように、使用後に別スキルへ変化する。OwnedActive の id だけ差し替え、
  // レベル・スタック・スロット位置は維持する。呼び出し元（selectAction/enemyTakeTurn）は
  // この直後に owned.id を見てクールダウンを設定するため、順序として先にここで差し替える
  if (def.transformsInto) {
    const owned = source.actives.find(a => a.id === skillId)
    if (owned) owned.id = def.transformsInto
    if (def.grantsBonusOnTransformUse) {
      source.pendingTransformBonus = {
        targetSkillId: def.transformsInto,
        stat: def.grantsBonusOnTransformUse.stat,
        amount: def.grantsBonusOnTransformUse.amount,
        roundsRemaining: 2,   // nextRoundスコープと同じ寿命（残りの現ラウンド＋次のラウンド丸ごと）
      }
    }
  }
}

/**
 * カウンター/反射板: 攻撃側の一連の行動（repeatを含む）が完全に終わってから、
 * 被弾側で反撃態勢中だった対象ぶんをまとめて反撃させる（ユーザー確定仕様）。
 * 反撃も通常の damage op（命中判定・カット率・属性相性込み）を経由するため、
 * 相手のステータス次第で通りにくくなる
 */
function flushCounterRetaliations(params: {
  attacker: Combatant
  hitTargets: readonly Combatant[]
  state: BattleState
  content: BattleContent
  rng: () => number
  emit: Emit
}): void {
  const { attacker, hitTargets, state, content, rng, emit } = params
  for (const holder of hitTargets) {
    // hitTargets は「このスキルの対象だった者」であって「実際に被弾した者」ではない
    // （例: counterStance 自体は自己対象の宣言的opで、誰もダメージを受けていない）。
    // queuedCounterHits が0のままなら何も消費しない — pendingCounter に触れてもいけない
    // （そうしないと、反撃態勢に入った直後の自己対象アクションでその場で消えてしまう）
    const hits = holder.queuedCounterHits
    if (hits <= 0) continue
    const pending = holder.pendingCounter
    holder.pendingCounter = null
    holder.queuedCounterHits = 0
    if (!pending || !holder.alive) continue

    const counterDef = content.skills.get(pending.sourceId)
    const level = holder.actives.find(a => a.id === pending.sourceId)?.level ?? 1
    const skillForRetaliation: ActiveSkillDef = counterDef && counterDef.kind === 'active' ? counterDef : {
      kind: 'active', id: pending.sourceId, label: pending.sourceId, flavorText: '',
      mainCategory: 'guard', subCategories: [], effect: [],
      element: pending.element, cooldown: 0, defaultFocus: 'enemy', focusRange: 'single',
    }
    const retaliationNode = { op: 'damage', element: pending.element, scale: { stat: pending.scaleStat, rate: pending.rate } }

    for (let i = 0; i < hits; i++) {
      if (!attacker.alive) break
      runEffects([retaliationNode], {
        source: holder, targets: [attacker], skill: skillForRetaliation, level, state, emit, rng,
        getEffective: c => resolveEffectiveStats(c, content),
        content,
        dealtDamage: { total: 0, missedPotential: 0 },
      })
    }
  }
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
  const skillId = pickEnemySkill(enemy, content, state.roundCount)
  if (!skillId) return   // 全スキルCT中 = 何もしない
  const owned = enemy.actives.find(a => a.id === skillId)
  if (!owned) return
  const def = content.skills.get(skillId)
  if (!def || def.kind !== 'active') return

  const targets = resolveEnemyFocus({ side: def.defaultFocus, range: def.focusRange }, enemy, player)
  useActiveSkill({ state, content, source: enemy, skillId, level: owned.level, targets, rng, emit })
  // transformsInto で owned.id が変化している場合があるため、クールダウンは使用後の id で改めて引く
  // （注意: transformsInto を持つスキルは actionPattern の同じ位置に再度現れると id が一致せず
  // 選ばれなくなるため、敵の actionPattern には向かない。プレイヤーの所持スキル専用として設計している）
  const usedDef = content.skills.get(owned.id)
  owned.cooldown = usedDef && usedDef.kind === 'active' ? usedDef.cooldown : 0
}

// ─────────────────────────────────────────────────────────────
// ラウンド終了処理
// ─────────────────────────────────────────────────────────────

export function endOfRound(state: BattleState, content: BattleContent, emit: Emit): void {
  const all = [state.player, ...state.enemies].filter(c => c.alive)
  for (const c of all) {
    for (const a of c.actives) a.cooldown = Math.max(0, a.cooldown - 1)
    c.builtinCooldowns.guard = Math.max(0, c.builtinCooldowns.guard - 1)
    c.builtinCooldowns.dodge = Math.max(0, c.builtinCooldowns.dodge - 1)
    // 先に thisTurn を失効させてから nextRound を thisTurn へ格下げする（順序が逆だと同じ呼び出しで消えてしまう）。
    // これにより nextRound は「付与されたラウンドの残り＋次のラウンド丸ごと」＝2ラウンド分保つ
    clearThisTurnModifiers(c)
    downgradeNextRoundModifiers(c)
    decrementRoundsModifiers(c)
    applyPeriodicSelfEffects(c, content, emit)
    applyPeriodicTargetEffects(c, state, content, emit)
    decayShield(c, BATTLE.shield.decayPerTurn)
    // 一発ツモ 想定: 変化先スキル専用ボーナスは nextRound と同じ2ラウンド寿命（未消費なら失効させる）
    if (c.pendingTransformBonus) {
      c.pendingTransformBonus.roundsRemaining--
      if (c.pendingTransformBonus.roundsRemaining <= 0) c.pendingTransformBonus = null
    }
  }
  state.roundCount++
}

/**
 * 継続ダメージ（龍鱗 想定）。シールド・カット率を経由せず直接HPを減らす（防ぎようがない）。
 * 自滅（戦闘不能）は許容する
 */
function applyPeriodicSelfEffects(c: Combatant, content: BattleContent, emit: Emit): void {
  for (const pe of c.periodicSelfEffects) {
    if (!c.alive) break
    const maxHp = resolveEffectiveStats(c, content).hp
    const dmg = Math.floor(pe.ratio * maxHp)
    c.hp = Math.max(0, c.hp - dmg)
    emit({ effectId: 'fx_debuff', targetRef: 'source', combatantId: c.id, payload: { text: `-${dmg}`, skillId: pe.sourceId } })
    if (c.hp <= 0) {
      c.alive = false
      emit({ effectId: 'fx_defeat', targetRef: 'source', combatantId: c.id })
    }
  }
}

/**
 * 継続ダメージ（風の剣 想定）を相手側全体へ与える。periodicSelfEffects と同じくシールド・
 * カット率を経由せず直接HPを減らす。発動元(c)が戦闘不能なら何もしない
 * （倒れた後もバフの残りターンぶん攻撃し続けるのは不自然なため）。
 */
function applyPeriodicTargetEffects(c: Combatant, state: BattleState, content: BattleContent, emit: Emit): void {
  if (c.periodicTargetEffects.length === 0) return
  const opposing = (c.isPlayer ? state.enemies : [state.player]).filter(t => t.alive)
  if (c.alive && opposing.length > 0) {
    const sourceStats = resolveEffectiveStats(c, content)
    for (const pe of c.periodicTargetEffects) {
      const dmg = Math.floor(sourceStats[pe.scaleStat] * pe.rate)
      for (const target of opposing) {
        target.hp = Math.max(0, target.hp - dmg)
        emit({ effectId: `fx_hit_${pe.element}`, targetRef: 'target', combatantId: target.id,
          payload: { text: `-${dmg}`, skillId: pe.sourceId } })
        if (target.hp <= 0) {
          target.alive = false
          emit({ effectId: 'fx_defeat', targetRef: 'target', combatantId: target.id })
        }
      }
    }
  }
  c.periodicTargetEffects = c.periodicTargetEffects
    .map(pe => ({ ...pe, roundsRemaining: pe.roundsRemaining - 1 }))
    .filter(pe => pe.roundsRemaining > 0)
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
 * shield は次戦へ持ち越されるが、無条件に強い持ち越し資源にならないよう decayPerBattle
 * （既定50%、maxShield基準）だけ追加で目減りさせる。
 * 呼び出し後、状態は 'drafting' に遷移させる（ドラフト抽選は skillDraft.ts が別途行う）。
 */
export function finishBattleOnVictory(state: BattleState, content: BattleContent): void {
  const player = state.player
  const wonBoss = state.enemies.some(e => e.isBoss)

  clearThisBattleModifiers(player)   // thisTurn/thisBattle/nextRound をまとめて除去。permanent は残す
  player.periodicSelfEffects = []    // 継続ダメージ（龍鱗等）も戦闘限りでリセットする
  player.periodicTargetEffects = []  // 継続ダメージ（風の剣等、相手側へのもの）も戦闘限りでリセットする
  player.pendingCounter = null       // カウンター/反射板の反撃態勢も戦闘限りでリセットする
  player.queuedCounterHits = 0
  player.pendingTransformBonus = null   // 一発ツモ等の変化先スキル専用ボーナスも戦闘限りでリセットする
  player.skipNextTurn = false           // 不意打ち等による行動キャンセルの持ち越しも戦闘限りでリセットする
  for (const a of player.actives) a.cooldown = 0
  player.builtinCooldowns = { guard: 0, dodge: 0 }
  decayShield(player, BATTLE.shield.decayPerBattle)

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
  state.bossDefeated = wonBoss
  if (wonBoss) state.bossesDefeatedCount++
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
    bossDefeated: state.bossesDefeatedCount,
    maxSkillLevel,
    traitsAcquired: state.player.traits.length,
  }
}
