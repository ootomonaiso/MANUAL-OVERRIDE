import { describe, it, expect } from 'vitest'
import {
  resolveRef, widgetKindOf, getAtPath, setAtPath, deleteAtPath,
  EFFECT_OP_SKELETONS, EFFECT_OP_FIELDS, ALLOWED_EFFECT_OPS, blankEntrySkeleton, isValidIdShape,
  resolvePreviewColor,
  type JsonSchema,
} from '../../../src/tools/contentEditorForm'

describe('contentEditorForm: resolveRef', () => {
  const root: JsonSchema = {
    definitions: {
      color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    },
  }

  it('#/definitions/xxx を解決する', () => {
    expect(resolveRef({ $ref: '#/definitions/color' }, root)).toEqual(root.definitions?.color)
  })

  it('$ref が無ければそのまま返す', () => {
    const schema: JsonSchema = { type: 'string' }
    expect(resolveRef(schema, root)).toBe(schema)
  })

  it('存在しない $ref はそのまま返す（壊れない）', () => {
    const schema: JsonSchema = { $ref: '#/definitions/nope' }
    expect(resolveRef(schema, root)).toBe(schema)
  })
})

describe('contentEditorForm: widgetKindOf', () => {
  const root: JsonSchema = {}

  it('const は const ウィジェット', () => {
    expect(widgetKindOf({ const: 'trait' }, root)).toBe('const')
  })
  it('enum は select ウィジェット', () => {
    expect(widgetKindOf({ type: 'string', enum: ['a', 'b'] }, root)).toBe('select')
  })
  it('boolean は checkbox ウィジェット', () => {
    expect(widgetKindOf({ type: 'boolean' }, root)).toBe('checkbox')
  })
  it('number/integer は number ウィジェット', () => {
    expect(widgetKindOf({ type: 'number' }, root)).toBe('number')
    expect(widgetKindOf({ type: 'integer' }, root)).toBe('number')
  })
  it('#rrggbb パターンの string は color ウィジェット', () => {
    expect(widgetKindOf({ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, root)).toBe('color')
  })
  it('通常の string は text ウィジェット', () => {
    expect(widgetKindOf({ type: 'string' }, root)).toBe('text')
  })
  it('array<string enum> は array-checkbox ウィジェット', () => {
    const schema: JsonSchema = { type: 'array', items: { type: 'string', enum: ['a', 'b'] } }
    expect(widgetKindOf(schema, root)).toBe('array-checkbox')
  })
  it('array<string> は array-primitive ウィジェット', () => {
    const schema: JsonSchema = { type: 'array', items: { type: 'string' } }
    expect(widgetKindOf(schema, root)).toBe('array-primitive')
  })
  it('array<object> は array-object ウィジェット', () => {
    const schema: JsonSchema = { type: 'array', items: { type: 'object', properties: {} } }
    expect(widgetKindOf(schema, root)).toBe('array-object')
  })
  it('object かつ properties があれば object ウィジェット', () => {
    expect(widgetKindOf({ type: 'object', properties: { a: { type: 'string' } } }, root)).toBe('object')
  })
  it('oneOf は json ウィジェットへ逃がす（activeSkillRef等）', () => {
    expect(widgetKindOf({ oneOf: [{ type: 'string' }, { type: 'object' }] }, root)).toBe('json')
  })
})

describe('contentEditorForm: パス操作', () => {
  it('getAtPath: ネストした値を読める', () => {
    const obj = { stats: { hp: 100 } }
    expect(getAtPath(obj, 'stats.hp')).toBe(100)
  })
  it('getAtPath: 存在しないパスは undefined', () => {
    expect(getAtPath({}, 'a.b.c')).toBeUndefined()
  })
  it('setAtPath: 中間オブジェクトが無ければ作る', () => {
    const obj: Record<string, unknown> = {}
    setAtPath(obj, 'sfx.cast', 'battle_hit')
    expect(obj).toEqual({ sfx: { cast: 'battle_hit' } })
  })
  it('setAtPath: 数値インデックスの手前は配列を作る', () => {
    const obj: Record<string, unknown> = {}
    setAtPath(obj, 'layers.0.color', '#112233')
    expect(obj).toEqual({ layers: [{ color: '#112233' }] })
  })
  it('deleteAtPath: 任意項目のトグルOFFで値を消せる', () => {
    const obj: Record<string, unknown> = { unlockCondition: { category: 'vitality', points: 5 } }
    deleteAtPath(obj, 'unlockCondition')
    expect(obj).toEqual({})
  })
  it('deleteAtPath: 存在しないパスでも例外を投げない', () => {
    expect(() => deleteAtPath({}, 'a.b.c')).not.toThrow()
  })
})

describe('contentEditorForm: effectノードのひな形', () => {
  it('ALLOWED_EFFECT_OPS の全opにひな形がある', () => {
    for (const op of ALLOWED_EFFECT_OPS) {
      expect(EFFECT_OP_SKELETONS[op], op).toBeDefined()
    }
  })
  it('damage のひな形は element と scale を持つ', () => {
    expect(EFFECT_OP_SKELETONS.damage).toMatchObject({ element: expect.any(String), scale: { stat: expect.any(String), rate: expect.any(Number) } })
  })
  it('noop / replaceGuard のひな形は空オブジェクト', () => {
    expect(EFFECT_OP_SKELETONS.noop).toEqual({})
    expect(EFFECT_OP_SKELETONS.replaceGuard).toEqual({})
  })
})

describe('contentEditorForm: EFFECT_OP_FIELDS（効果ロジックの型付きフォーム定義）', () => {
  it('ALLOWED_EFFECT_OPS の全opにフィールド定義がある（空配列も許容）', () => {
    for (const op of ALLOWED_EFFECT_OPS) {
      expect(EFFECT_OP_FIELDS[op], op).toBeDefined()
    }
  })
  it('damage/heal/shield は element と scale の2フィールド', () => {
    for (const op of ['damage', 'heal', 'shield']) {
      const keys = EFFECT_OP_FIELDS[op].map(f => f.key)
      expect(keys, op).toEqual(['element', 'scale'])
    }
  })
  it('damage のひな形が EFFECT_OP_FIELDS の必須フィールドをすべて満たす', () => {
    const skeleton = EFFECT_OP_SKELETONS.damage as Record<string, unknown>
    for (const spec of EFFECT_OP_FIELDS.damage) {
      if (!spec.optional) expect(skeleton[spec.key], spec.key).not.toBeUndefined()
    }
  })
  it('modifier の amount/rate/applyTo は任意項目としてマークされている', () => {
    const byKey = Object.fromEntries(EFFECT_OP_FIELDS.modifier.map(f => [f.key, f]))
    expect(byKey.amount.optional).toBe(true)
    expect(byKey.rate.optional).toBe(true)
    expect(byKey.applyTo.optional).toBe(true)
    expect(byKey.stat.optional).toBeFalsy()
    expect(byKey.scope.optional).toBeFalsy()
  })
  it('repeat は body（必須）と onFirstIteration/onLastIteration（任意）の nodes フィールドを持つ', () => {
    const byKey = Object.fromEntries(EFFECT_OP_FIELDS.repeat.map(f => [f.key, f]))
    expect(byKey.body.kind).toBe('nodes')
    expect(byKey.body.optional).toBeFalsy()
    expect(byKey.onFirstIteration.kind).toBe('nodes')
    expect(byKey.onFirstIteration.optional).toBe(true)
    expect(byKey.onLastIteration.kind).toBe('nodes')
    expect(byKey.onLastIteration.optional).toBe(true)
  })
  it('noop / replaceGuard はフィールドを持たない', () => {
    expect(EFFECT_OP_FIELDS.noop).toEqual([])
    expect(EFFECT_OP_FIELDS.replaceGuard).toEqual([])
  })
})

describe('contentEditorForm: blankEntrySkeleton の kind 切り替え（アクティブ/パッシブタブ分割）', () => {
  it('kind未指定ではactiveのスケルトンになる（element/cooldown等を持つ）', () => {
    const s = blankEntrySkeleton('skills', 'skill_test') as Record<string, unknown>
    expect(s.kind).toBe('active')
    expect(s.element).toBeDefined()
    expect(s.cooldown).toBeDefined()
  })
  it('kind:"passive" を指定すると、active専用フィールドを持たないスケルトンになる', () => {
    const s = blankEntrySkeleton('skills', 'passive_test', { kind: 'passive' }) as Record<string, unknown>
    expect(s.kind).toBe('passive')
    expect(s.element).toBeUndefined()
    expect(s.cooldown).toBeUndefined()
    expect(s.defaultFocus).toBeUndefined()
    expect(s.focusRange).toBeUndefined()
    expect(Array.isArray(s.effect)).toBe(true)
  })
})

describe('contentEditorForm: blankEntrySkeleton', () => {
  it('skills: kind/mainCategory/effect を含む最小構成を返す', () => {
    const s = blankEntrySkeleton('skills', 'skill_test') as Record<string, unknown>
    expect(s.id).toBe('skill_test')
    expect(s.kind).toBe('active')
    expect(Array.isArray(s.effect)).toBe(true)
  })
  it('traits: kind は固定で trait', () => {
    const s = blankEntrySkeleton('traits', 'trait_test') as Record<string, unknown>
    expect(s.kind).toBe('trait')
  })
  it('enemies: stats の必須10項目が揃っている', () => {
    const s = blankEntrySkeleton('enemies', 'enemy_test') as { stats: Record<string, unknown> }
    for (const key of ['hp', 'str', 'def', 'int', 'ref', 'agi', 'hitRate', 'evadeRate', 'critRate', 'critDamageMultiplier']) {
      expect(s.stats[key], key).not.toBeUndefined()
    }
  })
  it('battleEffects: timing/target/visual.kind を持つ', () => {
    const s = blankEntrySkeleton('battleEffects', 'fx_test') as Record<string, unknown>
    expect(s.timing).toBeDefined()
    expect(s.target).toBeDefined()
  })
  it('battleBackgrounds: sky/ground/floor を持つ', () => {
    const s = blankEntrySkeleton('battleBackgrounds', 'bg_test') as Record<string, unknown>
    expect(s.sky).toBeDefined()
    expect(s.ground).toBeDefined()
    expect(s.floor).toBeDefined()
  })
})

describe('contentEditorForm: isValidIdShape', () => {
  it('英小文字始まり・英小文字数字アンダースコアのみを許可する', () => {
    expect(isValidIdShape('skill_fireball')).toBe(true)
    expect(isValidIdShape('enemy_slime2')).toBe(true)
  })
  it('大文字・記号・数字始まりは拒否する', () => {
    expect(isValidIdShape('Skill_x')).toBe(false)
    expect(isValidIdShape('1skill')).toBe(false)
    expect(isValidIdShape('skill-x')).toBe(false)
    expect(isValidIdShape('')).toBe(false)
  })
})

describe('contentEditorForm: resolvePreviewColor（battle-effectsのvisual.colorプレビュー）', () => {
  it('#rrggbb はそのまま返す', () => {
    expect(resolvePreviewColor('#ffd23a')).toBe('#ffd23a')
  })
  it('var(--xxx) は既知のフォールバック表から解決する', () => {
    expect(resolvePreviewColor('var(--battle-diff-plus)')).toBe('#7ee08a')
    expect(resolvePreviewColor('var(--battle-element-physical)')).toBe('#ff7a5c')
  })
  it('未知の var(--xxx) や不正な値は null', () => {
    expect(resolvePreviewColor('var(--not-a-real-var)')).toBeNull()
    expect(resolvePreviewColor('not-a-color')).toBeNull()
  })
  it('undefined は null', () => {
    expect(resolvePreviewColor(undefined)).toBeNull()
  })
})
