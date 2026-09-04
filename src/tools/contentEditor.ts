/**
 * src/tools/contentEditor.ts
 *
 * 開発者用 JSONコンテンツエディタ（content-editor）のエントリポイント。
 * dev サーバー起動中に /tools/content-editor.html で開く（npm run content-editor）。
 * 本番ビルドには含まれない（tools/*.html は index.html からリンクされないため
 * `vite build` の対象に入らず、書き込みAPI自体も scripts/contentEditorPlugin.mjs 側で
 * apply: 'serve' に限定している）。
 *
 * アクティブ/パッシブスキル・特性・敵・戦闘エフェクト・戦闘背景の src/data/rpg/*.json を
 * スキーマ駆動のフォームで編集し、保存時はサーバー側（同プラグイン）で
 * schemas/battle-*.schema.json による検証を経てからファイルへ書き込む。
 * effect[] のようにスキーマ上 op 以外が自由形式の部分は、op 選択 + JSON欄で扱う。
 * どのフィールドも「JSONとして直接編集」に切り替えれば生JSONで上書きできる
 * （フォームが苦手な形にも必ず対応できる逃げ道として用意している）。
 */

import schemaSkill from '../../schemas/battle-skill.schema.json'
import schemaTrait from '../../schemas/battle-trait.schema.json'
import schemaEnemy from '../../schemas/battle-enemy.schema.json'
import schemaEffect from '../../schemas/battle-effect.schema.json'
import schemaBackground from '../../schemas/battle-background.schema.json'
import {
  type JsonSchema, resolveRef, widgetKindOf, getAtPath, setAtPath, deleteAtPath,
  EFFECT_OP_SKELETONS, ALLOWED_EFFECT_OPS, blankEntrySkeleton, isValidIdShape,
} from './contentEditorForm'

const API = '/__content-editor/api'

type CategoryKey = 'skills' | 'traits' | 'enemies' | 'battleEffects' | 'battleBackgrounds'

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  skills: 'アクティブ / パッシブ',
  traits: '特性',
  enemies: '敵',
  battleEffects: 'エフェクト',
  battleBackgrounds: '背景',
}
const CATEGORY_ID_HINT: Record<CategoryKey, string> = {
  skills: 'skill_xxx（アクティブ）または passive_xxx（パッシブ）',
  traits: 'trait_xxx',
  enemies: 'enemy_xxx',
  battleEffects: 'fx_xxx',
  battleBackgrounds: 'bg_xxx',
}
const CATEGORY_SCHEMA: Record<CategoryKey, JsonSchema> = {
  skills: schemaSkill as JsonSchema,
  traits: schemaTrait as JsonSchema,
  enemies: schemaEnemy as JsonSchema,
  battleEffects: schemaEffect as JsonSchema,
  battleBackgrounds: schemaBackground as JsonSchema,
}
const CATEGORY_KEYS: CategoryKey[] = ['skills', 'traits', 'enemies', 'battleEffects', 'battleBackgrounds']

interface EntrySummary { id: string; label: string; kind?: string; isBoss?: boolean; bossOnly?: boolean; broken?: boolean }
interface RefOption { id: string; label: string }
interface RefsResponse {
  activeSkillIds: RefOption[]
  passiveSkillIds: RefOption[]
  traitIds: RefOption[]
  effectIds: RefOption[]
  sfxIds: string[]
  spriteIds: string[]
}

// ── どのフィールドを refs から補完するか（category.path -> refs のキー） ──
const REF_CHECKBOX_FIELDS: Record<string, keyof RefsResponse> = {
  'skills.effects': 'effectIds',
  'enemies.traits': 'traitIds',
}
const REF_DATALIST_FIELDS: Record<string, keyof RefsResponse> = {
  'skills.sfx.cast': 'sfxIds',
  'skills.sfx.impact': 'sfxIds',
  'battleEffects.sfx': 'sfxIds',
  'enemies.sprite': 'spriteIds',
}

// ── DOM ヘルパー（sfxTest.ts / genreLab.ts と同じ方針） ─────────────
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`#${id} が見つかりません`)
  return node as T
}
function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// ── 状態 ──────────────────────────────────────────────────────
let refs: RefsResponse = { activeSkillIds: [], passiveSkillIds: [], traitIds: [], effectIds: [], sfxIds: [], spriteIds: [] }
let lists: Record<CategoryKey, EntrySummary[]> = { skills: [], traits: [], enemies: [], battleEffects: [], battleBackgrounds: [] }
let currentCategory: CategoryKey = 'skills'
let currentId: string | null = null
let currentValue: Record<string, unknown> | null = null
let isNewEntry = false
let rawMode = false

// ── API 呼び出し ────────────────────────────────────────────────
async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init)
  const body = await res.json()
  if (!res.ok && !('errors' in body) && !('ok' in body)) throw new Error(`API error ${res.status}`)
  return body as T
}

async function loadAll(): Promise<void> {
  const [listRes, refsRes] = await Promise.all([
    apiJson<Record<CategoryKey, EntrySummary[]>>('/list'),
    apiJson<RefsResponse>('/refs'),
  ])
  lists = listRes
  refs = refsRes
}

// ── サイドバー ────────────────────────────────────────────────
function renderTabs(): void {
  const tabsEl = el<HTMLDivElement>('tabs')
  tabsEl.innerHTML = ''
  for (const key of CATEGORY_KEYS) {
    const btn = h('button', `tab-btn${key === currentCategory ? ' active' : ''}`, `${CATEGORY_LABEL[key]} (${lists[key].length})`)
    btn.addEventListener('click', () => { currentCategory = key; renderTabs(); renderList() })
    tabsEl.appendChild(btn)
  }
}

function renderList(): void {
  const listEl = el<HTMLDivElement>('entry-list')
  listEl.innerHTML = ''
  for (const entry of lists[currentCategory]) {
    const btn = h('button', `entry-btn${entry.id === currentId ? ' active' : ''}${entry.broken ? ' broken' : ''}`)
    const idSpan = h('span', 'entry-id', entry.id)
    const labelSpan = h('span', 'entry-name', entry.label)
    btn.append(idSpan, labelSpan)
    if (entry.isBoss) btn.appendChild(h('span', 'badge boss', 'BOSS'))
    if (entry.bossOnly) btn.appendChild(h('span', 'badge boss', 'ボス専用'))
    btn.addEventListener('click', () => void selectEntry(currentCategory, entry.id))
    listEl.appendChild(btn)
  }
}

// ── エントリの読み込み・新規作成 ───────────────────────────────
async function selectEntry(category: CategoryKey, id: string): Promise<void> {
  const res = await apiJson<{ data?: Record<string, unknown>; error?: string }>(
    `/file?category=${category}&id=${encodeURIComponent(id)}`,
  )
  if (!res.data) { showStatus(res.error ?? '読み込みに失敗しました', true); return }
  currentCategory = category
  currentId = id
  currentValue = res.data
  isNewEntry = false
  rawMode = false
  renderTabs()
  renderList()
  renderEditor()
}

function createNew(): void {
  const raw = window.prompt(`新規IDを入力してください（${CATEGORY_ID_HINT[currentCategory]}）`)
  if (!raw) return
  const id = raw.trim()
  if (!isValidIdShape(id)) { showStatus('idは英小文字で始まり、英小文字・数字・_のみ使えます', true); return }
  if (lists[currentCategory].some(e => e.id === id)) { showStatus(`"${id}" は既に存在します`, true); return }
  currentId = id
  currentValue = blankEntrySkeleton(currentCategory, id)
  isNewEntry = true
  rawMode = false
  renderList()
  renderEditor()
}

async function deleteCurrent(): Promise<void> {
  if (!currentId || isNewEntry) return
  if (!window.confirm(`"${currentId}" を削除します。よろしいですか？`)) return
  const res = await apiJson<{ ok: boolean; errors?: string[] }>(
    `/file?category=${currentCategory}&id=${encodeURIComponent(currentId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) { showStatus((res.errors ?? ['削除に失敗しました']).join(' / '), true); return }
  showStatus(`"${currentId}" を削除しました`, false)
  currentId = null
  currentValue = null
  await loadAll()
  renderTabs()
  renderList()
  renderEditor()
}

async function save(): Promise<void> {
  if (!currentId || !currentValue) return
  const res = await apiJson<{ ok: boolean; errors?: string[] }>('/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: currentCategory, id: currentId, data: currentValue }),
  })
  if (!res.ok) { showStatus((res.errors ?? ['保存に失敗しました']).join('\n'), true); return }
  showStatus(`"${currentId}" を保存しました（参照整合性の確認には npm run validate も実行してください）`, false)
  const wasNew = isNewEntry
  isNewEntry = false
  await loadAll()
  renderTabs()
  renderList()
  // renderEditor() はフォーム全体を作り直し、直前の成功メッセージも消してしまうため
  // ここでは呼ばない。新規保存直後だけ、ヘッダの見出しと削除ボタンをその場で更新する。
  if (wasNew) {
    const header = document.querySelector('.editor-header')
    const title = header?.querySelector('h2')
    if (title) title.textContent = currentId ?? ''
    if (header && !header.querySelector('.danger')) {
      const delBtn = h('button', 'small danger', '削除')
      delBtn.addEventListener('click', () => void deleteCurrent())
      header.appendChild(delBtn)
    }
  }
}

function showStatus(message: string, isError: boolean): void {
  const box = el<HTMLDivElement>('status-box')
  box.textContent = message
  box.className = `status-box${isError ? ' error' : ' ok'}`
  box.style.display = 'block'
}

// ── フォーム描画 ──────────────────────────────────────────────
function renderEditor(): void {
  const host = el<HTMLDivElement>('editor-host')
  host.innerHTML = ''
  el<HTMLDivElement>('status-box').style.display = 'none'

  if (!currentValue || !currentId) {
    host.appendChild(h('p', 'note', '左の一覧からエントリを選ぶか、「＋ 新規作成」してください。'))
    return
  }

  const header = h('div', 'editor-header')
  header.appendChild(h('h2', undefined, `${currentId}${isNewEntry ? '（新規）' : ''}`))
  const toggleBtn = h('button', 'small', rawMode ? 'フォーム表示に戻す' : 'JSONとして直接編集')
  toggleBtn.addEventListener('click', () => { rawMode = !rawMode; renderEditor() })
  const saveBtn = h('button', 'small primary', '保存')
  saveBtn.addEventListener('click', () => void save())
  header.append(toggleBtn, saveBtn)
  if (!isNewEntry) {
    const delBtn = h('button', 'small danger', '削除')
    delBtn.addEventListener('click', () => void deleteCurrent())
    header.appendChild(delBtn)
  }
  host.appendChild(header)

  if (rawMode) {
    renderRawJsonEditor(host)
    return
  }

  const schema = CATEGORY_SCHEMA[currentCategory]
  const form = h('div', 'form-root')
  renderObjectFields(schema, schema, currentValue, '', form, [currentCategory])
  host.appendChild(form)
}

function renderRawJsonEditor(host: HTMLElement): void {
  const textarea = h('textarea', 'json-raw') as HTMLTextAreaElement
  textarea.value = JSON.stringify(currentValue, null, 2)
  textarea.rows = 28
  textarea.addEventListener('change', () => {
    try {
      currentValue = JSON.parse(textarea.value)
      showStatus('JSONを反映しました（まだ未保存です）', false)
    } catch (e) {
      showStatus(`JSONの構文エラー: ${(e as Error).message}`, true)
    }
  })
  host.appendChild(textarea)
}

/** オブジェクトschemaのpropertiesを辿ってフィールドを並べる */
function renderObjectFields(
  schema: JsonSchema, root: JsonSchema, value: Record<string, unknown>,
  pathPrefix: string, container: HTMLElement, skipTopKeys: string[] = [],
): void {
  const props = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  for (const [key, subSchemaRaw] of Object.entries(props)) {
    if (key === '$schema') continue
    if (pathPrefix === '' && key === 'id') continue // id はファイル名に固定

    const path = pathPrefix ? `${pathPrefix}.${key}` : key
    const isRequired = required.has(key)
    const resolvedSub = resolveRef(subSchemaRaw, root)
    const fieldWrap = h('div', 'field')
    fieldWrap.appendChild(h('label', 'field-label', key + (isRequired ? ' *' : '')))

    // 任意項目のオブジェクト（unlockCondition, sfx, glow等）は、開いただけで
    // 中の必須フィールドにデフォルト値が書き込まれ、触っていないのに保存すると
    // 項目が追加されてしまう。トグルで明示的にON/OFFできるようにする。
    if (!isRequired && resolvedSub.type === 'object' && resolvedSub.properties) {
      renderOptionalObjectField(resolvedSub, root, value, path, fieldWrap)
    } else {
      renderField(subSchemaRaw, root, value, path, key, fieldWrap)
    }
    container.appendChild(fieldWrap)
  }
  void skipTopKeys
}

function renderOptionalObjectField(
  schema: JsonSchema, root: JsonSchema, rootValue: Record<string, unknown>, path: string, container: HTMLElement,
): void {
  const existing = getAtPath(rootValue, path)
  const label = h('label', 'checkbox-item')
  const toggle = document.createElement('input')
  toggle.type = 'checkbox'
  toggle.checked = existing !== undefined && existing !== null
  label.append(toggle, document.createTextNode(' この項目を設定する'))
  container.appendChild(label)

  const box = h('div', 'nested-object')
  box.style.display = toggle.checked ? '' : 'none'
  if (toggle.checked) renderObjectFields(schema, root, rootValue, path, box)
  container.appendChild(box)

  toggle.addEventListener('change', () => {
    if (toggle.checked) {
      if (getAtPath(rootValue, path) === undefined) setAtPath(rootValue, path, {})
      box.style.display = ''
      box.innerHTML = ''
      renderObjectFields(schema, root, rootValue, path, box)
    } else {
      deleteAtPath(rootValue, path)
      box.style.display = 'none'
      box.innerHTML = ''
    }
  })
}

function refFieldKey(path: string): string {
  return `${currentCategory}.${path}`
}

function renderField(
  schemaRaw: JsonSchema, root: JsonSchema, rootValue: Record<string, unknown>,
  path: string, fieldKey: string, container: HTMLElement,
): void {
  // 特別対応が必要なフィールドを先に判定する
  if (currentCategory === 'enemies' && path === 'activeSkills') { renderSkillRefList(rootValue, path, container, refs.activeSkillIds, true); return }
  if (currentCategory === 'enemies' && path === 'passiveSkills') { renderSkillRefList(rootValue, path, container, refs.passiveSkillIds, true); return }
  if (currentCategory === 'enemies' && path === 'actionPattern') { renderActionPattern(rootValue, path, container); return }
  if (currentCategory === 'skills' && path === 'effect') { renderEffectList(rootValue, path, container); return }
  if (currentCategory === 'traits' && path === 'effect') { renderEffectList(rootValue, path, container); return }

  const schema = resolveRef(schemaRaw, root)
  const kind = widgetKindOf(schemaRaw, root)
  const current = getAtPath(rootValue, path)
  const refCheckboxSource = REF_CHECKBOX_FIELDS[refFieldKey(path)]
  const refDatalistSource = REF_DATALIST_FIELDS[refFieldKey(path)]

  if (refCheckboxSource) { renderCheckboxGroup(rootValue, path, container, refs[refCheckboxSource] as RefOption[]); return }

  switch (kind) {
    case 'const': {
      container.appendChild(h('div', 'const-value', String(schema.const)))
      setAtPath(rootValue, path, schema.const)
      return
    }
    case 'checkbox': {
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = Boolean(current)
      input.addEventListener('change', () => setAtPath(rootValue, path, input.checked))
      container.appendChild(input)
      return
    }
    case 'number': {
      const input = document.createElement('input')
      input.type = 'number'
      if (schema.minimum !== undefined) input.min = String(schema.minimum)
      if (schema.exclusiveMinimum !== undefined) input.min = String(schema.exclusiveMinimum + (schema.type === 'integer' ? 1 : 0.0001))
      if (schema.maximum !== undefined) input.max = String(schema.maximum)
      input.step = schema.type === 'integer' ? '1' : 'any'
      input.value = current !== undefined && current !== null ? String(current) : ''
      input.addEventListener('change', () => setAtPath(rootValue, path, input.value === '' ? undefined : Number(input.value)))
      container.appendChild(input)
      return
    }
    case 'select': {
      const select = document.createElement('select')
      for (const opt of schema.enum ?? []) {
        const optEl = document.createElement('option')
        optEl.value = String(opt)
        optEl.textContent = String(opt)
        select.appendChild(optEl)
      }
      // 表示上は先頭の選択肢を仮に見せるが、実際に触るまでは rootValue に書き込まない
      // （例: kind="passive" のスキルを開いただけで element 等の禁止フィールドが
      //  黙って追加されてしまう不具合があったため）。
      select.value = current !== undefined ? String(current) : String(schema.enum?.[0] ?? '')
      select.addEventListener('change', () => setAtPath(rootValue, path, select.value))
      container.appendChild(select)
      return
    }
    case 'color': {
      const wrap = h('div', 'color-field')
      const colorInput = document.createElement('input')
      colorInput.type = 'color'
      const textInput = document.createElement('input')
      textInput.type = 'text'
      textInput.className = 'color-text'
      const initial = typeof current === 'string' && /^#[0-9a-fA-F]{6}$/.test(current) ? current : '#888888'
      colorInput.value = initial
      textInput.value = typeof current === 'string' ? current : initial
      const commit = (v: string) => setAtPath(rootValue, path, v)
      colorInput.addEventListener('input', () => { textInput.value = colorInput.value; commit(colorInput.value) })
      textInput.addEventListener('change', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(textInput.value)) colorInput.value = textInput.value
        commit(textInput.value)
      })
      // select と同じ理由でここでも eager-commit しない（未入力の任意色フィールドが
      // 表示しただけで書き込まれるのを防ぐ）
      wrap.append(colorInput, textInput)
      container.appendChild(wrap)
      return
    }
    case 'text': {
      const input = document.createElement('input')
      input.type = 'text'
      input.value = typeof current === 'string' ? current : ''
      if (refDatalistSource) {
        const listId = `dl-${path.replace(/\./g, '-')}`
        const dl = document.createElement('datalist')
        dl.id = listId
        for (const item of refs[refDatalistSource] as (string | RefOption)[]) {
          const opt = document.createElement('option')
          opt.value = typeof item === 'string' ? item : item.id
          dl.appendChild(opt)
        }
        input.setAttribute('list', listId)
        container.appendChild(dl)
      }
      input.addEventListener('change', () => setAtPath(rootValue, path, input.value))
      container.appendChild(input)
      return
    }
    case 'object': {
      const box = h('div', 'nested-object')
      renderObjectFields(schema, root, rootValue, path, box)
      container.appendChild(box)
      return
    }
    case 'array-checkbox': {
      const items = resolveRef(schema.items ?? {}, root)
      const options = (items.enum ?? []).map(v => ({ id: String(v), label: String(v) }))
      renderCheckboxGroup(rootValue, path, container, options)
      return
    }
    case 'array-primitive': {
      renderStringListEditor(rootValue, path, container)
      return
    }
    case 'array-object': {
      renderObjectArrayEditor(schema, root, rootValue, path, container)
      return
    }
    default: {
      renderJsonSubEditor(rootValue, path, container)
      return
    }
  }
}

function renderCheckboxGroup(rootValue: Record<string, unknown>, path: string, container: HTMLElement, options: RefOption[]): void {
  const current = new Set((getAtPath(rootValue, path) as string[] | undefined) ?? [])
  const box = h('div', 'checkbox-group')
  if (options.length === 0) box.appendChild(h('p', 'note', '（候補なし）'))
  for (const opt of options) {
    const label = h('label', 'checkbox-item')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = current.has(opt.id)
    input.addEventListener('change', () => {
      if (input.checked) current.add(opt.id); else current.delete(opt.id)
      setAtPath(rootValue, path, [...current])
    })
    label.append(input, document.createTextNode(opt.label === opt.id ? opt.id : `${opt.id}（${opt.label}）`))
    box.appendChild(label)
  }
  container.appendChild(box)
}

function renderStringListEditor(rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const list = [...((getAtPath(rootValue, path) as string[] | undefined) ?? [])]
  const box = h('div', 'string-list')
  const commit = () => setAtPath(rootValue, path, list)
  function redraw(): void {
    box.innerHTML = ''
    list.forEach((v, i) => {
      const row = h('div', 'string-row')
      const input = document.createElement('input')
      input.type = 'text'
      input.value = v
      input.addEventListener('change', () => { list[i] = input.value; commit() })
      const removeBtn = h('button', 'small', '×')
      removeBtn.addEventListener('click', () => { list.splice(i, 1); commit(); redraw() })
      row.append(input, removeBtn)
      box.appendChild(row)
    })
    const addBtn = h('button', 'small', '＋ 追加')
    addBtn.addEventListener('click', () => { list.push(''); commit(); redraw() })
    box.appendChild(addBtn)
  }
  redraw()
  container.appendChild(box)
}

function renderObjectArrayEditor(schema: JsonSchema, root: JsonSchema, rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const itemSchema = resolveRef(schema.items ?? {}, root)
  const list = [...((getAtPath(rootValue, path) as Record<string, unknown>[] | undefined) ?? [])]
  const box = h('div', 'object-array')
  const commit = () => setAtPath(rootValue, path, list)
  function redraw(): void {
    box.innerHTML = ''
    list.forEach((item, i) => {
      const card = h('div', 'object-array-card')
      const cardHead = h('div', 'object-array-head')
      cardHead.appendChild(h('span', undefined, `#${i + 1}`))
      const removeBtn = h('button', 'small', '× 削除')
      removeBtn.addEventListener('click', () => { list.splice(i, 1); commit(); redraw() })
      cardHead.appendChild(removeBtn)
      card.appendChild(cardHead)
      renderObjectFields(itemSchema, root, item, '', card)
      box.appendChild(card)
    })
    const addBtn = h('button', 'small', '＋ 追加')
    addBtn.addEventListener('click', () => {
      const blank: Record<string, unknown> = {}
      for (const key of itemSchema.required ?? []) {
        const propSchema = resolveRef(itemSchema.properties?.[key] ?? {}, root)
        blank[key] = propSchema.enum ? propSchema.enum[0] : propSchema.type === 'number' ? 0 : ''
      }
      list.push(blank)
      commit(); redraw()
    })
    box.appendChild(addBtn)
  }
  redraw()
  container.appendChild(box)
}

function renderJsonSubEditor(rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const textarea = h('textarea', 'json-sub') as HTMLTextAreaElement
  const current = getAtPath(rootValue, path)
  textarea.value = JSON.stringify(current ?? null, null, 2)
  textarea.rows = 4
  textarea.addEventListener('change', () => {
    try { setAtPath(rootValue, path, JSON.parse(textarea.value)) } catch { /* 無視。次のフォーカスまで生の文字列は保持される */ }
  })
  container.appendChild(textarea)
}

/** enemies.activeSkills / passiveSkills: oneOf(string|{id,level}) は常に {id,level} で表示・保存する */
function renderSkillRefList(rootValue: Record<string, unknown>, path: string, container: HTMLElement, options: RefOption[], withLevel: boolean): void {
  const raw = (getAtPath(rootValue, path) as unknown[] | undefined) ?? []
  const list = raw.map(ref => typeof ref === 'string' ? { id: ref, level: 1 } : ref as { id: string; level: number })
  const box = h('div', 'skill-ref-list')
  const commit = () => setAtPath(rootValue, path, list)
  function redraw(): void {
    box.innerHTML = ''
    list.forEach((row, i) => {
      const rowEl = h('div', 'string-row')
      const select = document.createElement('select')
      const blankOpt = document.createElement('option')
      blankOpt.value = ''
      blankOpt.textContent = '（未選択）'
      select.appendChild(blankOpt)
      for (const opt of options) {
        const optEl = document.createElement('option')
        optEl.value = opt.id
        optEl.textContent = `${opt.id}（${opt.label}）`
        select.appendChild(optEl)
      }
      select.value = row.id
      select.addEventListener('change', () => { row.id = select.value; commit() })
      rowEl.appendChild(select)
      if (withLevel) {
        const levelInput = document.createElement('input')
        levelInput.type = 'number'
        levelInput.min = '1'; levelInput.max = '4'
        levelInput.value = String(row.level ?? 1)
        levelInput.className = 'level-input'
        levelInput.addEventListener('change', () => { row.level = Number(levelInput.value); commit() })
        rowEl.appendChild(levelInput)
      }
      const removeBtn = h('button', 'small', '×')
      removeBtn.addEventListener('click', () => { list.splice(i, 1); commit(); redraw() })
      rowEl.appendChild(removeBtn)
      box.appendChild(rowEl)
    })
    const addBtn = h('button', 'small', '＋ 追加')
    addBtn.addEventListener('click', () => { list.push({ id: '', level: 1 }); commit(); redraw() })
    box.appendChild(addBtn)
  }
  redraw()
  container.appendChild(box)
}

/** enemies.actionPattern: 文字列IDの並び。順序が意味を持つため ↑↓ で並べ替えられるようにする */
function renderActionPattern(rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const list = [...((getAtPath(rootValue, path) as string[] | undefined) ?? [])]
  const box = h('div', 'skill-ref-list')
  const commit = () => setAtPath(rootValue, path, list)
  function redraw(): void {
    box.innerHTML = ''
    list.forEach((id, i) => {
      const rowEl = h('div', 'string-row')
      const select = document.createElement('select')
      const blankOpt = document.createElement('option')
      blankOpt.value = ''
      blankOpt.textContent = '（未選択）'
      select.appendChild(blankOpt)
      for (const opt of refs.activeSkillIds) {
        const optEl = document.createElement('option')
        optEl.value = opt.id
        optEl.textContent = `${opt.id}（${opt.label}）`
        select.appendChild(optEl)
      }
      select.value = id
      select.addEventListener('change', () => { list[i] = select.value; commit() })
      rowEl.appendChild(select)
      const upBtn = h('button', 'small', '↑') as HTMLButtonElement
      upBtn.disabled = i === 0
      upBtn.addEventListener('click', () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; commit(); redraw() })
      const downBtn = h('button', 'small', '↓') as HTMLButtonElement
      downBtn.disabled = i === list.length - 1
      downBtn.addEventListener('click', () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; commit(); redraw() })
      const removeBtn = h('button', 'small', '×')
      removeBtn.addEventListener('click', () => { list.splice(i, 1); commit(); redraw() })
      rowEl.append(upBtn, downBtn, removeBtn)
      box.appendChild(rowEl)
    })
    const addBtn = h('button', 'small', '＋ 追加')
    addBtn.addEventListener('click', () => { list.push(''); commit(); redraw() })
    box.appendChild(addBtn)
  }
  redraw()
  container.appendChild(box)
}

/**
 * effect[]: op を選ぶと EFFECT_OP_SKELETONS のひな形を差し込み、それ以外の
 * op固有フィールドはJSON欄で直接編集する（schema側がopしか強制していないため）。
 */
function renderEffectList(rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const list = [...((getAtPath(rootValue, path) as Record<string, unknown>[] | undefined) ?? [])]
  const box = h('div', 'object-array')
  const commit = () => setAtPath(rootValue, path, list)
  function redraw(): void {
    box.innerHTML = ''
    list.forEach((node, i) => {
      const card = h('div', 'object-array-card')
      const head = h('div', 'object-array-head')
      head.appendChild(h('span', undefined, `#${i + 1}`))
      const opSelect = document.createElement('select')
      for (const op of ALLOWED_EFFECT_OPS) {
        const optEl = document.createElement('option')
        optEl.value = op
        optEl.textContent = op
        opSelect.appendChild(optEl)
      }
      opSelect.value = typeof node.op === 'string' ? node.op : ALLOWED_EFFECT_OPS[0]
      const resetBtn = h('button', 'small', 'ひな形を挿入')
      resetBtn.title = 'op固有フィールドを、このopの標準的な形で置き換えます'
      resetBtn.addEventListener('click', () => {
        const skeleton = EFFECT_OP_SKELETONS[opSelect.value] ?? {}
        list[i] = { op: opSelect.value, ...skeleton }
        commit(); redraw()
      })
      const removeBtn = h('button', 'small', '× 削除')
      removeBtn.addEventListener('click', () => { list.splice(i, 1); commit(); redraw() })
      opSelect.addEventListener('change', () => { node.op = opSelect.value; commit() })
      head.append(opSelect, resetBtn, removeBtn)
      card.appendChild(head)

      const rest = h('div', 'field')
      rest.appendChild(h('label', 'field-label', 'op以外のフィールド（JSON）'))
      const textarea = h('textarea', 'json-sub') as HTMLTextAreaElement
      const { op: _op, ...restValue } = node
      void _op
      textarea.value = JSON.stringify(restValue, null, 2)
      textarea.rows = 4
      textarea.addEventListener('change', () => {
        try {
          const parsed = JSON.parse(textarea.value) as Record<string, unknown>
          list[i] = { op: node.op, ...parsed }
          commit()
        } catch { /* 構文エラー中は反映しない */ }
      })
      rest.appendChild(textarea)
      card.appendChild(rest)
      box.appendChild(card)
    })
    const addBtn = h('button', 'small', '＋ ノード追加')
    addBtn.addEventListener('click', () => {
      const op = ALLOWED_EFFECT_OPS[0]
      list.push({ op, ...EFFECT_OP_SKELETONS[op] })
      commit(); redraw()
    })
    box.appendChild(addBtn)
  }
  redraw()
  container.appendChild(box)
}

// ── 起動 ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  await loadAll()
  renderTabs()
  renderList()
  renderEditor()
  el<HTMLButtonElement>('new-btn').addEventListener('click', createNew)
}

void main()
