/**
 * src/tools/contentEditorForm.ts
 *
 * content-editor（npm run content-editor）のフォーム生成に使う純粋なロジック。
 * DOM操作は一切含まない（contentEditor.ts 側が担当）。単体テスト対象。
 */

export interface JsonSchema {
  type?: string | string[]
  enum?: readonly unknown[]
  const?: unknown
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  items?: JsonSchema
  additionalProperties?: boolean
  pattern?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  minItems?: number
  maxItems?: number
  oneOf?: readonly JsonSchema[]
  $ref?: string
  description?: string
  definitions?: Record<string, JsonSchema>
}

/** `#/definitions/xxx` 形式の $ref をルートschemaの definitions から解決する */
export function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  if (!schema.$ref) return schema
  const m = /^#\/definitions\/(.+)$/.exec(schema.$ref)
  if (!m) return schema
  const target = root.definitions?.[m[1]]
  return target ? resolveRef(target, root) : schema
}

export type WidgetKind =
  | 'const' | 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'color'
  | 'array-primitive' | 'array-checkbox' | 'array-object' | 'object' | 'json'

/** ある property の schema から、どのウィジェットで表示すべきかを判定する */
export function widgetKindOf(schema: JsonSchema, root: JsonSchema): WidgetKind {
  const s = resolveRef(schema, root)
  if (s.const !== undefined) return 'const'
  if (s.oneOf) return 'json' // activeSkillRef/passiveSkillRef 等。呼び出し側で個別対応する
  if (s.enum) return 'select'
  if (s.type === 'boolean') return 'checkbox'
  if (s.type === 'number' || s.type === 'integer') return 'number'
  if (s.type === 'string') {
    if (s.pattern === '^#[0-9a-fA-F]{6}$') return 'color'
    return 'text'
  }
  if (s.type === 'array') {
    const items = s.items ? resolveRef(s.items, root) : undefined
    if (!items) return 'json'
    if (items.enum) return 'array-checkbox'
    if (items.type === 'string') return 'array-primitive'
    if (items.type === 'object') return 'array-object'
    return 'json'
  }
  if (s.type === 'object' && s.properties) return 'object'
  return 'json'
}

/** dot区切りのパス（例: "stats.hp", "layers.0.color"）で値を読む */
export function getAtPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur === null || cur === undefined) return undefined
    return (cur as Record<string, unknown>)[key]
  }, obj)
}

/** dot区切りのパスへ値を書く。中間のオブジェクト/配列が無ければ作る */
export function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextIsIndex = /^\d+$/.test(keys[i + 1])
    if (cur[key] === undefined || cur[key] === null || typeof cur[key] !== 'object') {
      cur[key] = nextIsIndex ? [] : {}
    }
    cur = cur[key] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

/** dot区切りのパスの値を削除する（任意項目のトグルをOFFにした時用） */
export function deleteAtPath(obj: Record<string, unknown>, path: string): void {
  const keys = path.split('.')
  let cur: Record<string, unknown> | undefined = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur === undefined || cur === null) return
    cur = cur[keys[i]] as Record<string, unknown> | undefined
  }
  if (cur) delete cur[keys[keys.length - 1]]
}

/**
 * effect[] の各ノードは op ごとに必要なフィールドが違い、schema 側は op の enum しか
 * 強制していない（docs/genre/rpg/07-data-schema.md 準拠、実データの検証は
 * scripts/validate-json.mjs の walkEffectNodes が担う）。フォーム上で op を選んだ時、
 * ここに定義したひな形を差し込むことで、JSON欄をゼロから書かずに済むようにする。
 * あくまで初期値であり、保存時に強制はしない。
 */
export const EFFECT_OP_SKELETONS: Readonly<Record<string, Record<string, unknown>>> = {
  damage: { element: 'physical', scale: { stat: 'str', rate: 1 } },
  heal: { element: 'special', scale: { stat: 'int', rate: 0.8 } },
  shield: { element: 'special', scale: { stat: 'def', rate: 0.5 } },
  repeat: { times: 2, body: [{ op: 'damage', element: 'physical', scale: { stat: 'str', rate: 0.5 } }] },
  modifier: { stat: 'str', amount: 100, scope: 'thisTurn' },
  statBoost: { stat: 'def', amount: 100 },
  elementAffinity: { element: 'physical', affinity: 'weak' },
  cutRate: { amount: 0.15 },
  replaceGuard: {},
  healBetweenBattles: { rate: 0.15 },
  effectBoost: { element: 'physical', rate: 0.2 },
  healTaken: { rate: 0.2 },
  noop: {},
}

export const ALLOWED_EFFECT_OPS = Object.keys(EFFECT_OP_SKELETONS)

/** カテゴリ別の、新規作成時の最小スケルトン（required を満たすだけの空de値） */
export function blankEntrySkeleton(category: string, id: string): Record<string, unknown> {
  switch (category) {
    case 'skills':
      return {
        id, label: '', flavorText: '', kind: 'active',
        mainCategory: 'vitality', subCategories: [],
        element: 'physical', cooldown: 3, defaultFocus: 'enemy', focusRange: 'single',
        effect: [{ op: 'damage', element: 'physical', scale: { stat: 'str', rate: 1 } }],
      }
    case 'traits':
      return { id, label: '', flavorText: '', kind: 'trait', effect: [{ op: 'noop' }] }
    case 'enemies':
      return {
        id, label: '', flavorText: '', sprite: '',
        stats: { hp: 1000, str: 100, def: 100, int: 100, ref: 100, agi: 100, hitRate: 0.9, evadeRate: 0, critRate: 0.05, critDamageMultiplier: 1.5 },
        traits: [], activeSkills: [], passiveSkills: [], actionPattern: [], isBoss: false,
      }
    case 'battleEffects':
      return { id, label: '', timing: 'onHit', durationMs: 300, target: 'target', visual: { kind: 'flash' } }
    case 'battleBackgrounds':
      return {
        id, label: '',
        sky: { top: '#1a1a2e', bottom: '#3a3a5e' },
        ground: { top: '#2a2a1e', bottom: '#1a1a0e', baseline: 0.6 },
        floor: { top: '#3a3020', bottom: '#1a1508', line: '#5a4a30' },
        layers: [], accent: '#e0c46a',
      }
    default:
      return { id }
  }
}

/** id: 英小文字始まり、英小文字・数字・_のみ。カテゴリごとの接頭辞パターンは呼び出し側の cfg 側で持つ */
export function isValidIdShape(id: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(id)
}
