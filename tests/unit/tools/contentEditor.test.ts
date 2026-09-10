/**
 * src/tools/contentEditor.ts の characterization test（現状の挙動の固定）。
 *
 * ■ なぜ「ハーネス」経由なのか
 * contentEditor.ts は export を1つも持たず、末尾で `void main()` を実行する
 * トップレベルスクリプトである（docs/refactoring/05-tools.md §1-1 の【high】）。
 * そのため素の import では (1) 何も取り出せず (2) import しただけで
 * fetch と DOM 構築が走る。src/ には一切手を入れない方針なので、
 * ここでは「元のソースを読み、import 指定子を tmp/ から見た相対パスへ書き換え、
 * `void main()` を無効化し、テスト対象の関数だけ export を足した派生モジュール」を
 * tmp/（gitignore 済み）へ生成して読み込む。
 * 元ソースをそのまま読むので、実装が変わればこのテストも自動で追随する。
 *
 * ■ この方式が要らなくなる条件
 * 05-tools.md §1-2 の分割（contentEditor/views/schemaForm.ts 等）が終われば
 * 各モジュールを普通に import できるようになる。分割後はハーネスを捨て、
 * import 先を差し替えるだけで下のアサーションはそのまま使える。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { JsonSchema, EffectFieldSpec } from '../../../src/tools/contentEditorForm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SRC_PATH = resolve(ROOT, 'src/tools/contentEditor.ts')
const OUT_DIR = resolve(ROOT, 'tmp')
const OUT_PATH = resolve(OUT_DIR, 'contentEditor.harness.ts')

interface Harness {
  renderField(
    schemaRaw: JsonSchema, root: JsonSchema, rootValue: Record<string, unknown>,
    path: string, fieldKey: string, container: HTMLElement,
  ): void
  renderOptionalObjectField(
    schema: JsonSchema, root: JsonSchema, rootValue: Record<string, unknown>,
    path: string, container: HTMLElement,
  ): void
  renderEffectField(
    node: Record<string, unknown>, spec: EffectFieldSpec, container: HTMLElement,
    onCommit: () => void, onStatChange?: () => void,
  ): void
  __setCategory(c: string): void
}

function buildHarness(): string {
  let src = readFileSync(SRC_PATH, 'utf8')
  const srcDir = dirname(SRC_PATH)
  src = src.replace(/from '(\.[^']+)'/g, (_full, spec: string) => {
    let rel = relative(OUT_DIR, resolve(srcDir, spec)).replace(/\\/g, '/')
    if (!rel.startsWith('.')) rel = `./${rel}`
    return `from '${rel}'`
  })
  // 置換が外れると import しただけで main() が走り、fetch と DOM 構築が始まってしまう。
  // 静かに壊れるより、ここで落として原因を名指しする。
  const disabled = src.replace(/^void main\(\)$/m, '// harness: 起動は行わない')
  if (disabled === src) {
    throw new Error(
      'contentEditor.ts の末尾 `void main()` が見つからず、起動を無効化できませんでした。'
      + ' 起動行の書式が変わった可能性があります（ハーネスの置換パターンを更新してください）。',
    )
  }
  src = disabled
  return `${src}
export { renderField, renderObjectFields, renderOptionalObjectField, renderEffectField }
export function __setCategory(c: string): void { currentCategory = c as CategoryKey }
`
}

let ed: Harness
const ROOT_SCHEMA: JsonSchema = {}

beforeAll(async () => {
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_PATH, buildHarness(), 'utf8')
  ed = (await import(/* @vite-ignore */ pathToFileURL(OUT_PATH).href)) as unknown as Harness
  ed.__setCategory('skills')
})

function box(): HTMLElement {
  return document.createElement('div')
}

describe('contentEditor: renderField が widgetKindOf ごとに生成するウィジェット', () => {
  it('const: div.const-value を出し、値を rootValue へ書き込む', () => {
    const v: Record<string, unknown> = {}
    const c = box()
    ed.renderField({ const: 'trait' }, ROOT_SCHEMA, v, 'kind', 'kind', c)
    expect(c.firstElementChild?.tagName).toBe('DIV')
    expect(c.firstElementChild?.className).toBe('const-value')
    expect(c.firstElementChild?.textContent).toBe('trait')
    // const だけは表示と同時に書き込む（固定値なのでユーザー操作の余地が無い）
    expect(v.kind).toBe('trait')
  })

  it('checkbox: input[type=checkbox] を出し、現在値を checked に反映する', () => {
    const c = box()
    ed.renderField({ type: 'boolean' }, ROOT_SCHEMA, { isBoss: true }, 'isBoss', 'isBoss', c)
    const input = c.firstElementChild as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('checkbox')
    expect(input.checked).toBe(true)
  })

  it('number: min/max/step を schema から引き、値が無ければ空欄', () => {
    const c = box()
    ed.renderField({ type: 'integer', minimum: 1, maximum: 9 }, ROOT_SCHEMA, {}, 'cooldown', 'cooldown', c)
    const input = c.firstElementChild as HTMLInputElement
    expect(input.type).toBe('number')
    expect(input.min).toBe('1')
    expect(input.max).toBe('9')
    expect(input.step).toBe('1')
    expect(input.value).toBe('')
  })

  it('number: type:"number" の step は any、既存値は文字列化して入る', () => {
    const c = box()
    ed.renderField({ type: 'number' }, ROOT_SCHEMA, { rate: 0.25 }, 'rate', 'rate', c)
    const input = c.firstElementChild as HTMLInputElement
    expect(input.step).toBe('any')
    expect(input.value).toBe('0.25')
  })

  it('select: enum を option 化し、日本語ラベル表があれば「値（ラベル）」で見せる', () => {
    const c = box()
    ed.renderField({ type: 'string', enum: ['physical', 'magical'] }, ROOT_SCHEMA, { element: 'magical' }, 'element', 'element', c)
    const select = c.firstElementChild as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect([...select.options].map(o => o.value)).toEqual(['physical', 'magical'])
    expect(select.value).toBe('magical')
    // skills.element は ENUM_LABEL_FIELDS に載っているので表示だけ日本語が添う（値は英語のまま）
    expect(select.options[0].textContent).toContain('physical')
    expect(select.options[0].textContent).not.toBe('physical')
  })

  it('text: input[type=text]。値が文字列でなければ空欄', () => {
    const c = box()
    ed.renderField({ type: 'string' }, ROOT_SCHEMA, { label: '火球' }, 'label', 'label', c)
    expect((c.firstElementChild as HTMLInputElement).type).toBe('text')
    expect((c.firstElementChild as HTMLInputElement).value).toBe('火球')
  })

  it('color: div.color-field の中に input[type=color] と input.color-text を並べる', () => {
    const c = box()
    ed.renderField({ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, ROOT_SCHEMA, {}, 'accent', 'accent', c)
    const wrap = c.firstElementChild as HTMLElement
    expect(wrap.className).toBe('color-field')
    const [picker, text] = [...wrap.children] as HTMLInputElement[]
    expect(picker.type).toBe('color')
    expect(text.className).toBe('color-text')
    // 未設定時のプレースホルダ色。この #888888 は「表示上の仮の色」であって保存値ではない
    expect(picker.value).toBe('#888888')
    expect(text.value).toBe('#888888')
  })

  it('object: div.nested-object を作り中身を再帰描画する', () => {
    const c = box()
    const schema: JsonSchema = { type: 'object', properties: { top: { type: 'string' } }, required: ['top'] }
    ed.renderField(schema, ROOT_SCHEMA, {}, 'sky', 'sky', c)
    expect((c.firstElementChild as HTMLElement).className).toBe('nested-object')
    expect(c.querySelectorAll('.field').length).toBe(1)
  })

  it('array-primitive: div.string-list のリスト編集UIになる', () => {
    const c = box()
    ed.renderField({ type: 'array', items: { type: 'string' } }, ROOT_SCHEMA, {}, 'tags', 'tags', c)
    expect(c.querySelector('.string-list')).not.toBeNull()
  })

  it('array-checkbox: enum 要素の配列は checkbox 群になる', () => {
    const c = box()
    const schema: JsonSchema = { type: 'array', items: { type: 'string', enum: ['a', 'b'] } }
    ed.renderField(schema, ROOT_SCHEMA, { subCategories: ['b'] }, 'subCategories', 'subCategories', c)
    const boxes = [...c.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[]
    expect(boxes.length).toBe(2)
    expect(boxes.map(b => b.checked)).toEqual([false, true])
  })

  it('oneOf など判定不能なものは生JSON編集（textarea）へ逃がす', () => {
    const c = box()
    ed.renderField({ oneOf: [{ type: 'string' }, { type: 'object' }] }, ROOT_SCHEMA, {}, 'ref', 'ref', c)
    expect(c.querySelector('textarea')).not.toBeNull()
  })
})

describe('contentEditor: 表示しただけでは rootValue に書き込まない（既知バグの再発防止）', () => {
  // contentEditor.ts:661-664 / :685-686 のコメントが明記する回帰防止。
  // kind="passive" のスキルを開いただけで element 等の禁止フィールドが黙って
  // 追加され、保存すると検証エラーになる不具合が実際に起きていた。
  it('select: 先頭候補を仮表示するだけで rootValue には書き込まない', () => {
    const v: Record<string, unknown> = {}
    const c = box()
    ed.renderField({ type: 'string', enum: ['physical', 'magical'] }, ROOT_SCHEMA, v, 'element', 'element', c)
    expect((c.firstElementChild as HTMLSelectElement).value).toBe('physical')
    expect(v).toEqual({})
    expect('element' in v).toBe(false)
  })

  it('color: プレースホルダ色を表示するだけで rootValue には書き込まない', () => {
    const v: Record<string, unknown> = {}
    const c = box()
    ed.renderField({ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, ROOT_SCHEMA, v, 'glow.color', 'color', c)
    expect(v).toEqual({})
  })

  it('number / text も、触るまでは書き込まない', () => {
    const v: Record<string, unknown> = {}
    ed.renderField({ type: 'number' }, ROOT_SCHEMA, v, 'cooldown', 'cooldown', box())
    ed.renderField({ type: 'string' }, ROOT_SCHEMA, v, 'label', 'label', box())
    expect(v).toEqual({})
  })

  it('select を実際に操作した時にだけ書き込まれる', () => {
    const v: Record<string, unknown> = {}
    const c = box()
    ed.renderField({ type: 'string', enum: ['physical', 'magical'] }, ROOT_SCHEMA, v, 'element', 'element', c)
    const select = c.firstElementChild as HTMLSelectElement
    select.value = 'magical'
    select.dispatchEvent(new Event('change'))
    expect(v.element).toBe('magical')
  })
})

describe('contentEditor: 任意オブジェクト項目のトグル（renderOptionalObjectField）', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { category: { type: 'string', enum: ['vitality'] }, points: { type: 'number' } },
    required: ['category', 'points'],
  }

  it('未設定なら OFF・中身は非表示で、rootValue にキーは無い', () => {
    const v: Record<string, unknown> = {}
    const c = box()
    ed.renderOptionalObjectField(schema, ROOT_SCHEMA, v, 'unlockCondition', c)
    const toggle = c.querySelector('input[type=checkbox]') as HTMLInputElement
    expect(toggle.checked).toBe(false)
    expect((c.querySelector('.nested-object') as HTMLElement).style.display).toBe('none')
    expect('unlockCondition' in v).toBe(false)
  })

  it('ONにするとキーが空オブジェクトとして生え、中身が描画される', () => {
    const v: Record<string, unknown> = {}
    const c = box()
    ed.renderOptionalObjectField(schema, ROOT_SCHEMA, v, 'unlockCondition', c)
    const toggle = c.querySelector('input[type=checkbox]') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    expect(v.unlockCondition).toEqual({})
    const nested = c.querySelector('.nested-object') as HTMLElement
    expect(nested.style.display).toBe('')
    expect(nested.querySelectorAll('.field').length).toBe(2)
  })

  it('OFFにするとキーごと消え、中身の描画も捨てられる', () => {
    const v: Record<string, unknown> = { unlockCondition: { category: 'vitality', points: 5 } }
    const c = box()
    ed.renderOptionalObjectField(schema, ROOT_SCHEMA, v, 'unlockCondition', c)
    const toggle = c.querySelector('input[type=checkbox]') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    toggle.checked = false
    toggle.dispatchEvent(new Event('change'))
    expect(v).toEqual({})
    expect((c.querySelector('.nested-object') as HTMLElement).innerHTML).toBe('')
  })
})

describe('contentEditor: renderEffectField の percentByStat（stat に応じた%出し分け）', () => {
  const amountSpec: EffectFieldSpec = {
    key: 'amount', kind: 'number', label: '実数加算（amount）', optional: true, percentByStat: true,
  }

  it('stat が実数系（str）なら%サフィックスを付けず、値をそのまま見せる', () => {
    const c = box()
    ed.renderEffectField({ stat: 'str', amount: 100 }, amountSpec, c, () => {})
    const input = c.firstElementChild as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.value).toBe('100')
    expect(c.querySelector('.unit-suffix')).toBeNull()
  })

  it('stat が割合系（critRate）なら div.scale-field に包み「%」を添え、値を×100して見せる', () => {
    const c = box()
    ed.renderEffectField({ stat: 'critRate', amount: 0.5 }, amountSpec, c, () => {})
    const wrap = c.firstElementChild as HTMLElement
    expect(wrap.className).toBe('scale-field')
    expect((wrap.querySelector('input') as HTMLInputElement).value).toBe('50')
    expect(wrap.querySelector('.unit-suffix')?.textContent).toBe('%')
  })

  it('%表示のときの入力は ÷100 して保存する', () => {
    const node: Record<string, unknown> = { stat: 'critRate', amount: 0.5 }
    const c = box()
    ed.renderEffectField(node, amountSpec, c, () => {})
    const input = c.querySelector('input') as HTMLInputElement
    input.value = '80'
    input.dispatchEvent(new Event('change'))
    expect(node.amount).toBeCloseTo(0.8, 8)
  })

  it('stat 未設定のときは実数扱い（percentByStat は兄弟 stat が決まるまで働かない）', () => {
    const c = box()
    ed.renderEffectField({ amount: 100 }, amountSpec, c, () => {})
    expect(c.querySelector('.unit-suffix')).toBeNull()
  })

  it('percent:true のフィールドは stat に関係なく常に%表示（cutRate.amount）', () => {
    const spec: EffectFieldSpec = { key: 'amount', kind: 'number', label: '軽減割合', step: 0.01, percent: true }
    const c = box()
    ed.renderEffectField({ amount: 0.15 }, spec, c, () => {})
    expect((c.firstElementChild as HTMLElement).className).toBe('scale-field')
    expect((c.querySelector('input') as HTMLInputElement).value).toBe('15')
  })

  it('任意フィールドを空欄にするとキーごと削除される', () => {
    const node: Record<string, unknown> = { stat: 'str', amount: 100 }
    const c = box()
    ed.renderEffectField(node, amountSpec, c, () => {})
    const input = c.querySelector('input') as HTMLInputElement
    input.value = ''
    input.dispatchEvent(new Event('change'))
    expect('amount' in node).toBe(false)
  })

  it('stat / element フィールドは renderField の select と違い、描画時点で既定値を書き込む', () => {
    // renderField の select は eager-commit しないのに、effect ノード側は書き込む。
    // 意図的な差か不整合かは判断できないため現状のまま固定する（docs/refactoring/07-deferred.md）
    const node: Record<string, unknown> = {}
    ed.renderEffectField(node, { key: 'stat', kind: 'stat', label: '対象' }, box(), () => {})
    ed.renderEffectField(node, { key: 'element', kind: 'element', label: '属性' }, box(), () => {})
    expect(node.stat).toBe('hp')
    expect(node.element).toBe('physical')
  })
})
