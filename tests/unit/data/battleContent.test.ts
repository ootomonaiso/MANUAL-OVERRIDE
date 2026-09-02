import { describe, it, expect } from 'vitest'
import { SKILLS, TRAITS, ENEMIES, BATTLE_EFFECTS, BATTLE_CONTENT } from '../../../src/data/battleContent'
import { KNOWN_OP_IDS } from '../../../src/domain/battle/effectOps'
import { CATEGORY_IDS, STAT_KEYS } from '../../../src/domain/battle/types'
import type { EffectNode, CategoryId } from '../../../src/domain/battle/types'
import { buildSkillText } from '../../../src/domain/battle/skillText'
import { BATTLE } from '../../../src/data/tunables'
import { SPRITES } from '../../../src/data/sprites'
import { SFX_DEFS } from '../../../src/framework/SfxLoader'
import skillSchema from '../../../schemas/battle-skill.schema.json'
import traitSchema from '../../../schemas/battle-trait.schema.json'

/** ファイル名とIDの一致を確かめるため、ローダと同じ glob をテスト側でも張る */
const skillFiles = import.meta.glob('../../../src/data/skills/*.json', { eager: true })
const traitFiles = import.meta.glob('../../../src/data/traits/*.json', { eager: true })
const enemyFiles = import.meta.glob('../../../src/data/enemies/*.json', { eager: true })
const effectFiles = import.meta.glob('../../../src/data/battle-effects/*.json', { eager: true })

function basename(path: string): string {
  return path.split('/').pop()?.replace(/\.json$/, '') ?? path
}

function idOf(mod: unknown): string {
  return ((mod as { default?: { id?: string } }).default ?? mod as { id?: string }).id ?? ''
}

/** repeat のような入れ子opも含めて、使われている op ID をすべて集める */
function collectOps(nodes: readonly EffectNode[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    out.add(n.op)
    for (const key of ['body', 'onFirstIteration', 'onLastIteration']) {
      const nested = n[key]
      if (Array.isArray(nested)) collectOps(nested as EffectNode[], out)
    }
  }
  return out
}

const ALL_SKILLS = [...SKILLS.values()]
const ALL_TRAITS = [...TRAITS.values()]
const ALL_ENEMIES = [...ENEMIES.values()]

describe('battleContent: ロードの健全性', () => {
  it('スキル・特性・敵・エフェクトがすべて読み込まれている', () => {
    expect(SKILLS.size).toBe(Object.keys(skillFiles).length)
    expect(TRAITS.size).toBe(Object.keys(traitFiles).length)
    expect(ENEMIES.size).toBe(Object.keys(enemyFiles).length)
    expect(BATTLE_EFFECTS.size).toBe(Object.keys(effectFiles).length)
  })

  it('どのカテゴリも空ではない', () => {
    expect(SKILLS.size).toBeGreaterThan(0)
    expect(TRAITS.size).toBeGreaterThan(0)
    expect(ENEMIES.size).toBeGreaterThan(0)
    expect(BATTLE_EFFECTS.size).toBeGreaterThan(0)
  })

  it('ファイル名と定義IDが一致する（IDだけ書き換えた取りこぼしを防ぐ）', () => {
    for (const files of [skillFiles, traitFiles, enemyFiles, effectFiles]) {
      for (const [path, mod] of Object.entries(files)) {
        expect(idOf(mod), path).toBe(basename(path))
      }
    }
  })

  it('domain へ渡すコンテンツ束が同じマップを指している', () => {
    expect(BATTLE_CONTENT.skills).toBe(SKILLS)
    expect(BATTLE_CONTENT.traits).toBe(TRAITS)
    expect(BATTLE_CONTENT.enemies).toBe(ENEMIES)
  })
})

describe('battleContent: スキル定義', () => {
  it('IDのプレフィックスが種別と一致する', () => {
    for (const def of ALL_SKILLS) {
      const expected = def.kind === 'active' ? 'skill_' : 'passive_'
      expect(def.id.startsWith(expected), def.id).toBe(true)
    }
  })

  it('ラベルとフレーバーテキストが入っている', () => {
    for (const def of ALL_SKILLS) {
      expect(def.label, def.id).toBeTruthy()
      expect(def.flavorText, def.id).toBeTruthy()
    }
  })

  it('主カテゴリ・サブカテゴリが定義済みのカテゴリのみを指す', () => {
    for (const def of ALL_SKILLS) {
      expect(CATEGORY_IDS, def.id).toContain(def.mainCategory)
      for (const sub of def.subCategories) expect(CATEGORY_IDS, def.id).toContain(sub)
    }
  })

  it('サブカテゴリは3個以下（重み T(N) が負になる 4個以上を許さない）', () => {
    expect(skillSchema.properties.subCategories.maxItems).toBe(3)
    for (const def of ALL_SKILLS) {
      expect(def.subCategories.length, def.id).toBeLessThanOrEqual(3)
      expect(def.subCategories, def.id).not.toContain(def.mainCategory)
    }
  })

  it('使われている op はすべてレジストリに登録済み', () => {
    for (const def of ALL_SKILLS) {
      for (const op of collectOps(def.effect)) expect(KNOWN_OP_IDS, `${def.id}: ${op}`).toContain(op)
    }
  })

  it('アクティブスキルは属性・クールタイム・フォーカスが妥当', () => {
    for (const def of ALL_SKILLS) {
      if (def.kind !== 'active') continue
      expect(['physical', 'magical', 'special'], def.id).toContain(def.element)
      expect(def.cooldown, def.id).toBeGreaterThanOrEqual(0)
      expect(['enemy', 'self', 'ally'], def.id).toContain(def.defaultFocus)
      expect(['single', 'all', 'adjacent3'], def.id).toContain(def.focusRange)
    }
  })

  it('アクティブスキルが指すエフェクトIDが存在する', () => {
    for (const def of ALL_SKILLS) {
      if (def.kind !== 'active') continue
      for (const fx of def.effects ?? []) expect(BATTLE_EFFECTS.has(fx), `${def.id}: ${fx}`).toBe(true)
    }
  })

  it('解放条件のカテゴリが実在し、必要ポイントが正の値', () => {
    for (const def of ALL_SKILLS) {
      if (!def.unlockCondition) continue
      expect(CATEGORY_IDS, def.id).toContain(def.unlockCondition.category)
      expect(def.unlockCondition.points, def.id).toBeGreaterThan(0)
    }
  })

  it('ジャンル確定時の初期スキル2種が存在し、物理と魔法で1本ずつある', () => {
    const strike = SKILLS.get('skill_strike')
    const fireball = SKILLS.get('skill_fireball')
    expect(strike?.kind).toBe('active')
    expect(fireball?.kind).toBe('active')
    expect(strike?.kind === 'active' && strike.element).toBe('physical')
    expect(fireball?.kind === 'active' && fireball.element).toBe('magical')
  })

  it('初期スキルには解放条件が付いていない（引けなくなるのを防ぐ）', () => {
    expect(SKILLS.get('skill_strike')?.unlockCondition).toBeUndefined()
    expect(SKILLS.get('skill_fireball')?.unlockCondition).toBeUndefined()
  })

  it('初期スキルのクールタイムは 0（初手から必ず撃てる）', () => {
    for (const id of ['skill_strike', 'skill_fireball']) {
      const def = SKILLS.get(id)
      expect(def?.kind === 'active' && def.cooldown, id).toBe(0)
    }
  })
})

describe('battleContent: 特性定義', () => {
  it('IDが trait_ で始まり、主カテゴリを持たない', () => {
    for (const def of ALL_TRAITS) {
      expect(def.id.startsWith('trait_'), def.id).toBe(true)
      expect(def.mainCategory, def.id).toBeNull()
      expect(def.subCategories, def.id).toEqual([])
    }
  })

  it('使われている op はすべてレジストリに登録済み', () => {
    for (const def of ALL_TRAITS) {
      for (const op of collectOps(def.effect)) expect(KNOWN_OP_IDS, `${def.id}: ${op}`).toContain(op)
    }
  })

  it('スキーマ内の op 一覧が3箇所すべて実装側の KNOWN_OP_IDS と同期している', () => {
    const expected = [...KNOWN_OP_IDS].sort()
    // validate-json.mjs が読む allowedOps と、Ajv が実際に検証する enum の両方
    expect([...skillSchema.allowedOps].sort()).toEqual(expected)
    expect([...skillSchema.definitions.effectNode.properties.op.enum].sort()).toEqual(expected)
    expect([...traitSchema.properties.effect.items.properties.op.enum].sort()).toEqual(expected)
  })

  it('healTaken は特性でのみ使う（回復側はパッシブを走査しないため）', () => {
    for (const def of ALL_SKILLS) {
      expect(collectOps(def.effect).has('healTaken'), def.id).toBe(false)
    }
  })
})

describe('battleContent: 敵定義', () => {
  it('IDが enemy_ で始まりラベルがある', () => {
    for (const def of ALL_ENEMIES) {
      expect(def.id.startsWith('enemy_'), def.id).toBe(true)
      expect(def.label, def.id).toBeTruthy()
    }
  })

  it('全ステータスが揃っていて HP・STR が正の値', () => {
    for (const def of ALL_ENEMIES) {
      for (const key of STAT_KEYS) expect(typeof def.stats[key], `${def.id}.${key}`).toBe('number')
      expect(def.stats.hp, def.id).toBeGreaterThan(0)
      expect(def.stats.str, def.id).toBeGreaterThan(0)
      expect(def.stats.hitRate, def.id).toBeGreaterThan(0)
    }
  })

  it('行動パターンが空でない（何もしない敵を作らない）', () => {
    for (const def of ALL_ENEMIES) expect(def.actionPattern.length, def.id).toBeGreaterThan(0)
  })

  it('行動パターンのスキルがすべて activeSkills に宣言されている', () => {
    for (const def of ALL_ENEMIES) {
      const declared = new Set(def.activeSkills.map(a => a.id))
      for (const id of def.actionPattern) expect(declared.has(id), `${def.id}: ${id}`).toBe(true)
    }
  })

  it('参照しているスキル・パッシブ・特性がすべて実在する', () => {
    for (const def of ALL_ENEMIES) {
      for (const ref of def.activeSkills) {
        expect(SKILLS.get(ref.id)?.kind, `${def.id}: ${ref.id}`).toBe('active')
        expect(ref.level, `${def.id}: ${ref.id}`).toBeGreaterThanOrEqual(1)
      }
      for (const ref of def.passiveSkills) {
        expect(SKILLS.get(ref.id)?.kind, `${def.id}: ${ref.id}`).toBe('passive')
      }
      for (const id of def.traits) expect(TRAITS.has(id), `${def.id}: ${id}`).toBe(true)
    }
  })

  it('ボスがちょうど1体、通常敵も1体以上いる', () => {
    const bosses = ALL_ENEMIES.filter(e => e.isBoss)
    expect(bosses).toHaveLength(1)
    expect(ALL_ENEMIES.filter(e => !e.isBoss).length).toBeGreaterThan(0)
  })

  it('ボスはどの通常敵よりHPが高い', () => {
    const boss = ALL_ENEMIES.find(e => e.isBoss)
    const maxMobHp = Math.max(...ALL_ENEMIES.filter(e => !e.isBoss).map(e => e.stats.hp))
    expect(boss?.stats.hp).toBeGreaterThan(maxMobHp)
  })

  it('ボス戦の番号までに出せる通常敵が用意されている', () => {
    expect(ALL_ENEMIES.filter(e => !e.isBoss).length).toBeGreaterThan(0)
    expect(BATTLE.bossBattleIndex).toBeGreaterThan(0)
  })
})

describe('battleContent: エフェクト定義', () => {
  const TIMINGS = ['onCast', 'onHit', 'onMiss', 'onHeal', 'onShield', 'onStatus', 'onDefeat', 'onSystem']

  it('IDが fx_ で始まり、タイミング・対象・表示時間が妥当', () => {
    for (const def of BATTLE_EFFECTS.values()) {
      expect(def.id.startsWith('fx_'), def.id).toBe(true)
      expect(TIMINGS, def.id).toContain(def.timing)
      expect(['source', 'target', 'screen'], def.id).toContain(def.target)
      expect(def.durationMs, def.id).toBeGreaterThan(0)
      expect(def.visual?.kind, def.id).toBeTruthy()
    }
  })

  it('戦闘ロジックが発行するエフェクトIDがすべて定義されている', () => {
    // damage/heal/shield/modifier の各 op と battleEngine が emit する ID
    const emitted = [
      'fx_miss', 'fx_critical', 'fx_weakness', 'fx_resisted', 'fx_shield_break', 'fx_defeat',
      'fx_hit_physical', 'fx_hit_magical', 'fx_hit_special',
      'fx_heal', 'fx_shield_gain', 'fx_buff', 'fx_debuff',
    ]
    for (const id of emitted) expect(BATTLE_EFFECTS.has(id), id).toBe(true)
  })
})

describe('battleContent: 効果文の生成（実データ）', () => {
  it('全スキル・全特性で句点が重複しない', () => {
    for (const def of [...ALL_SKILLS, ...ALL_TRAITS]) {
      for (const level of [1, 2, 3, 4]) {
        const out = buildSkillText(def, level).map(t => t.text).join('')
        expect(out, `${def.id} Lv${level}`).not.toContain('。。')
      }
    }
  })

  it('未対応opのフォールバック表記が実データに現れない', () => {
    for (const def of [...ALL_SKILLS, ...ALL_TRAITS]) {
      const out = buildSkillText(def, 1).map(t => t.text).join('')
      expect(out, def.id).not.toMatch(/^\(|\(\w+\)。/)
    }
  })

  it('効果文が空にならない', () => {
    for (const def of [...ALL_SKILLS, ...ALL_TRAITS]) {
      expect(buildSkillText(def, 1).length, def.id).toBeGreaterThan(0)
    }
  })
})

describe('battleContent: 解放条件の到達可能性', () => {
  it('解放条件のポイントは設定済みのしきい値のいずれかを使う', () => {
    const allowed = new Set<number>(BATTLE.categoryUnlockThresholds)
    for (const def of ALL_SKILLS) {
      if (!def.unlockCondition) continue
      expect(allowed.has(def.unlockCondition.points), `${def.id}: ${def.unlockCondition.points}`).toBe(true)
    }
  })

  it('解放条件に使われるカテゴリには、解放条件なしで到達できる手段がある', () => {
    const freeCategories = new Set<CategoryId>()
    for (const def of ALL_SKILLS) {
      if (def.unlockCondition) continue
      freeCategories.add(def.mainCategory)
      for (const sub of def.subCategories) freeCategories.add(sub)
    }
    for (const def of ALL_SKILLS) {
      if (!def.unlockCondition) continue
      expect(freeCategories.has(def.unlockCondition.category), `${def.id}`).toBe(true)
    }
  })
})

describe('battleContent: 見た目（スプライト）の紐付け', () => {
  it('すべての敵が実在するスプライトを名前で参照している', () => {
    for (const enemy of ALL_ENEMIES) {
      expect(enemy.sprite, `${enemy.id}: sprite が未設定`).toBeTruthy()
      expect(SPRITES[enemy.sprite], `${enemy.id} → ${enemy.sprite}`).toBeDefined()
    }
  })

  it('敵・プレイヤーのスプライトは通常時と攻撃時の2フレームを持つ', () => {
    const ids = [...ALL_ENEMIES.map(e => e.sprite), BATTLE.playerSprite]
    for (const id of ids) {
      const def = SPRITES[id]
      expect(def, id).toBeDefined()
      expect(Object.keys(def.frames), id).toContain('idle')
      expect(Object.keys(def.frames), id).toContain('attack')
    }
  })

  it('攻撃フレームは通常フレームと別の絵になっている（見た目が変わらない手抜きを弾く）', () => {
    for (const id of [...ALL_ENEMIES.map(e => e.sprite), BATTLE.playerSprite]) {
      const def = SPRITES[id]
      expect(def.frames.attack.join('|'), id).not.toBe(def.frames.idle.join('|'))
    }
  })

  it('プレイヤーのスプライトは battle.json で指定されたものを使う', () => {
    expect(BATTLE.playerSprite).toBeTruthy()
    expect(SPRITES[BATTLE.playerSprite]).toBeDefined()
  })
})

describe('battleContent: 効果音の紐付け', () => {
  it('エフェクトが指す効果音はすべて実在する', () => {
    for (const def of BATTLE_EFFECTS.values()) {
      if (!def.sfx) continue
      expect(SFX_DEFS[def.sfx], `${def.id} → ${def.sfx}`).toBeDefined()
    }
  })

  it('スキル個別の効果音はすべて実在する（スキルごとに音を差し替えられる）', () => {
    for (const def of ALL_SKILLS) {
      if (def.kind !== 'active' || !def.sfx) continue
      for (const id of [def.sfx.cast, def.sfx.impact]) {
        if (!id) continue
        expect(SFX_DEFS[id], `${def.id} → ${id}`).toBeDefined()
      }
    }
  })

  it('スキルの effects[] は発動側（onCast）の演出だけを並べる', () => {
    // 着弾側は damage/heal/shield オペレーションが対象ごとに発行するため、
    // ここへ書くと使用者自身が被弾したように光ってしまう。
    for (const def of ALL_SKILLS) {
      if (def.kind !== 'active') continue
      for (const fx of def.effects ?? []) {
        expect(BATTLE_EFFECTS.get(fx)?.timing, `${def.id} → ${fx}`).toBe('onCast')
      }
    }
  })
})
