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
export function blankEntrySkeleton(category: string, id: string, opts?: { kind?: 'active' | 'passive' }): Record<string, unknown> {
  switch (category) {
    case 'skills': {
      const kind = opts?.kind ?? 'active'
      const base: Record<string, unknown> = {
        id, label: '', flavorText: '', kind,
        mainCategory: 'vitality', subCategories: [],
        effect: kind === 'active'
          ? [{ op: 'damage', element: 'physical', scale: { stat: 'str', rate: 1 } }]
          : [{ op: 'statBoost', stat: 'def', amount: 100 }],
      }
      if (kind === 'active') {
        base.element = 'physical'
        base.cooldown = 3
        base.defaultFocus = 'enemy'
        base.focusRange = 'single'
      }
      return base
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

// ── effect[] ノードのフィールド定義 ─────────────────────────────
//
// 「ダメージを、何に基づいて、何%与えるか」のようなop固有ロジックを、
// JSON欄ではなく型付きフォームで直接編集できるようにするための記述。
// schemas/battle-skill.schema.json の effectNode は op（enum）しか強制して
// いないため（op固有フィールドは scripts/validate-json.mjs の walkEffectNodes が
// 実行時に検証する）、ここでの定義が「フォーム上での唯一の正」になる。
// src/domain/battle/skillText.ts の buildSkillText の switch(op) と対応関係にある。

export type EffectFieldSpec =
  | { key: string; kind: 'stat'; label: string; optional?: boolean }
  | { key: string; kind: 'element'; label: string; optional?: boolean }
  | { key: string; kind: 'element-or-any'; label: string; optional?: boolean }
  | { key: string; kind: 'number'; label: string; optional?: boolean; step?: number; min?: number }
  | { key: string; kind: 'select'; label: string; options: readonly string[]; optional?: boolean }
  | { key: string; kind: 'scale'; label: string; optional?: boolean }
  | { key: string; kind: 'nodes'; label: string; optional?: boolean }

export const EFFECT_OP_FIELDS: Readonly<Record<string, readonly EffectFieldSpec[]>> = {
  damage: [
    { key: 'element', kind: 'element', label: '属性' },
    { key: 'scale', kind: 'scale', label: '参照ステータス・倍率' },
  ],
  heal: [
    { key: 'element', kind: 'element', label: '属性' },
    { key: 'scale', kind: 'scale', label: '参照ステータス・倍率' },
  ],
  shield: [
    { key: 'element', kind: 'element', label: '属性' },
    { key: 'scale', kind: 'scale', label: '参照ステータス・倍率' },
  ],
  repeat: [
    { key: 'times', kind: 'number', label: '繰り返し回数', min: 1, step: 1 },
    { key: 'body', kind: 'nodes', label: '本体（繰り返す効果）' },
    { key: 'onFirstIteration', kind: 'nodes', label: '最初の1回だけ追加で発動', optional: true },
    { key: 'onLastIteration', kind: 'nodes', label: '最後の1回だけ追加で発動', optional: true },
  ],
  modifier: [
    { key: 'stat', kind: 'stat', label: '対象ステータス' },
    { key: 'amount', kind: 'number', label: '実数加算（amount）', optional: true },
    { key: 'rate', kind: 'number', label: '割合加算（rate）', optional: true, step: 0.01 },
    { key: 'scope', kind: 'select', label: '持続範囲', options: ['thisHit', 'thisTurn', 'thisBattle', 'permanent'] },
    { key: 'applyTo', kind: 'select', label: '対象（省略時は自分）', options: ['self', 'target'], optional: true },
  ],
  statBoost: [
    { key: 'stat', kind: 'stat', label: '対象ステータス' },
    { key: 'amount', kind: 'number', label: '実数加算（amount）', optional: true },
    { key: 'rate', kind: 'number', label: '割合加算（rate）', optional: true, step: 0.01 },
  ],
  elementAffinity: [
    { key: 'element', kind: 'element', label: '属性' },
    { key: 'affinity', kind: 'select', label: '種別', options: ['weak', 'resist'] },
  ],
  cutRate: [
    { key: 'amount', kind: 'number', label: '軽減割合（amount）', step: 0.01 },
  ],
  replaceGuard: [],
  healBetweenBattles: [
    { key: 'amount', kind: 'number', label: '固定回復量（amount）', optional: true },
    { key: 'rate', kind: 'number', label: '割合回復（rate）', optional: true, step: 0.01 },
  ],
  effectBoost: [
    { key: 'element', kind: 'element-or-any', label: '属性' },
    { key: 'rate', kind: 'number', label: '倍率（rate）', step: 0.01 },
  ],
  healTaken: [
    { key: 'rate', kind: 'number', label: '倍率（rate）', step: 0.01 },
  ],
  noop: [],
}

// ── スプライトのドット絵プレビュー ─────────────────────────────
//
// PixelSprite.vue の buildRuns と同じアルゴリズムを、Vueに依存しない形で
// 切り出したもの（横に連続する同色セルを1つの矩形へまとめ、SVGの<rect>数を減らす）。
// content-editor は敵の見た目を「見えれば十分」（編集はしない）ため、
// 被弾フラッシュ等の tint 機能は移植していない。

export interface SpriteDefLike {
  w: number
  h: number
  palette: Record<string, string>
  frames: Record<string, readonly string[]>
}
export interface SpriteRun { x: number; y: number; w: number; color: string }

/**
 * battle-effects/*.json の visual.color は、固定の #rrggbb だけでなく
 * `var(--battle-diff-plus)` のようなCSSカスタムプロパティ参照も使う
 * （実際の色は BattleScreen.vue 側で戦闘テーマごとに変わりうる）。
 * content-editor は単体のページで戦闘UIのCSSを読み込んでいないため、
 * このページ内でプレビューするための「代表値」としてここに固定値を持つ
 * （BattleScreen.vue の :root 相当ブロックの初期値と同じ。実際の見た目の
 * 正としては扱わない。あくまでプレビューの近似）。
 */
export const BATTLE_CSS_VAR_FALLBACK: Readonly<Record<string, string>> = {
  '--battle-element-physical': '#ff7a5c',
  '--battle-element-magical': '#6fb4ff',
  '--battle-element-special': '#c88bff',
  '--battle-stat': '#e0c46a',
  '--battle-number': '#ffe9a8',
  '--battle-diff-plus': '#7ee08a',
  '--battle-diff-minus': '#ff6a6a',
  '--battle-diff-muted': '#a6a2b0',
  '--battle-category-heal': '#7ee08a',
  '--battle-category-aegis': '#63b8ff',
  '--battle-category-guard': '#e0c46a',
  '--battle-category-curse': '#b98bff',
  '--battle-accent': '#e0c46a',
}

/** "#rrggbb" はそのまま、"var(--xxx)" は上のフォールバック表から解決する。どちらでもなければ null */
export function resolvePreviewColor(color: string | undefined): string | null {
  if (!color) return null
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(color.trim())
  if (m) return BATTLE_CSS_VAR_FALLBACK[m[1]] ?? null
  return null
}

export function buildSpriteRuns(def: SpriteDefLike, frame: string): SpriteRun[] {
  const rows = def.frames[frame] ?? def.frames.idle
  if (!rows) return []
  const runs: SpriteRun[] = []
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    let x = 0
    while (x < row.length) {
      const ch = row[x]
      const raw = ch === '.' ? undefined : def.palette[ch]
      // 動的色スロット(@)は戦闘スプライトでは使わない。未解決は透明として飛ばす
      if (!raw || raw.startsWith('@')) { x++; continue }
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      runs.push({ x, y, w: end - x, color: raw })
      x = end
    }
  }
  return runs
}
