import { describe, it, expect } from 'vitest'
import {
  resolveRef, widgetKindOf, getAtPath, setAtPath, deleteAtPath,
  EFFECT_OP_SKELETONS, ALLOWED_EFFECT_OPS, blankEntrySkeleton, isValidIdShape,
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
