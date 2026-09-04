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
 * effect[] は「何に、どの属性で、何%のダメージを与えるか」のようなop固有ロジックを
 * 型付きフォームで直接編集できるようにしている（EFFECT_OP_FIELDS 参照）。
 * どのフィールドも「JSONとして直接編集」に切り替えれば生JSONで上書きできる
 * （フォームが苦手な形にも必ず対応できる逃げ道として用意している）。
 *
 * JP表示: mainCategory/element/statなどの列挙値は、実データの値（英語キー）を
 * 変えずに、ゲーム本体と同じ日本語ラベル（src/domain/battle/skillText.ts）を
 * 添えて表示する。表示用ラベルとデータの値を混同しないよう、保存する値は
 * 常に元の英語キーのまま扱う。
 */

import schemaSkill from '../../schemas/battle-skill.schema.json'
import schemaTrait from '../../schemas/battle-trait.schema.json'
import schemaEnemy from '../../schemas/battle-enemy.schema.json'
import schemaEffect from '../../schemas/battle-effect.schema.json'
import schemaBackground from '../../schemas/battle-background.schema.json'
import { SPRITES } from '../data/sprites'
import { CATEGORY_LABEL, ELEMENT_LABEL, STAT_LABEL, MODIFIER_SCOPE_LABEL } from '../domain/battle/skillText'
import { CATEGORY_IDS, STAT_KEYS, type CategoryId, type Element, type StatKey } from '../domain/battle/types'
import {
  type JsonSchema, resolveRef, widgetKindOf, getAtPath, setAtPath, deleteAtPath,
  EFFECT_OP_SKELETONS, EFFECT_OP_FIELDS, EFFECT_OP_LABEL, ALLOWED_EFFECT_OPS, blankEntrySkeleton, isValidIdShape,
  buildSpriteRuns, resolvePreviewColor, type EffectFieldSpec,
} from './contentEditorForm'

const API = '/__content-editor/api'

type CategoryKey = 'skills' | 'traits' | 'enemies' | 'battleEffects' | 'battleBackgrounds'

interface TabDef {
  key: string
  apiCategory: CategoryKey
  label: string
  kindFilter?: 'active' | 'passive'
}

/**
 * 「アクティブ/パッシブ」は同じ src/data/rpg/skills/ ディレクトリ（1スキーマ）だが、
 * 「分けれるといい」という要望を受けてタブだけをUI側で分割する。
 * apiCategory は常に 'skills' のまま（サーバー側のカテゴリ設定は増やさない）。
 */
const TABS: TabDef[] = [
  { key: 'skills-active', apiCategory: 'skills', label: 'アクティブ', kindFilter: 'active' },
  { key: 'skills-passive', apiCategory: 'skills', label: 'パッシブ', kindFilter: 'passive' },
  { key: 'traits', apiCategory: 'traits', label: '特性' },
  { key: 'enemies', apiCategory: 'enemies', label: '敵' },
  { key: 'battleEffects', apiCategory: 'battleEffects', label: 'エフェクト' },
  { key: 'battleBackgrounds', apiCategory: 'battleBackgrounds', label: '背景' },
]

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

interface EntrySummary {
  id: string; label: string; kind?: string; isBoss?: boolean; bossOnly?: boolean; broken?: boolean
  mainCategory?: string; element?: string; timing?: string; draftable?: boolean
  sprite?: string; visual?: { kind?: string; color?: string }
}
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
}

// ── 列挙値の日本語ラベル（値そのものは変えない。表示だけ添える） ──
const ENUM_LABEL_FIELDS: Record<string, Record<string, string>> = {
  'skills.mainCategory': CATEGORY_LABEL,
  'skills.subCategories': CATEGORY_LABEL,
  'skills.element': ELEMENT_LABEL,
  'skills.unlockCondition.category': CATEGORY_LABEL,
  'traits.unlockCondition.category': CATEGORY_LABEL,
}
const APPLY_TO_LABEL: Record<string, string> = { self: '自分', target: '対象' }
const AFFINITY_LABEL: Record<string, string> = { weak: '弱点', resist: '耐性' }
const TIMING_LABEL: Record<string, string> = {
  onCast: '発動時', onHit: '命中時', onMiss: 'ミス時', onHeal: '回復時', onShield: 'シールド時',
  onStatus: '状態異常時', onDefeat: '撃破時', onSystem: 'システム',
}
const EFFECT_SELECT_LABELS: Record<string, Record<string, string>> = {
  scope: MODIFIER_SCOPE_LABEL, applyTo: APPLY_TO_LABEL, affinity: AFFINITY_LABEL,
}

// ── グループ化（セクション分け）の設定 ────────────────────────────
interface GroupOption { value: string; label: string }
const GROUP_OPTIONS: Record<string, GroupOption[]> = {
  'skills-active': [
    { value: 'none', label: 'グループなし' },
    { value: 'element', label: '属性で分ける（物理・魔法・特殊）' },
    { value: 'mainCategory', label: 'カテゴリで分ける' },
  ],
  'skills-passive': [
    { value: 'none', label: 'グループなし' },
    { value: 'mainCategory', label: 'カテゴリで分ける' },
  ],
  traits: [
    { value: 'none', label: 'グループなし' },
    { value: 'draftable', label: 'ドラフト区分で分ける' },
  ],
  enemies: [
    { value: 'none', label: 'グループなし' },
    { value: 'isBoss', label: 'ボス区分で分ける' },
  ],
  battleEffects: [
    { value: 'none', label: 'グループなし' },
    { value: 'timing', label: 'タイミングで分ける' },
  ],
  battleBackgrounds: [
    { value: 'none', label: 'グループなし' },
    { value: 'bossOnly', label: 'ボス専用区分で分ける' },
  ],
}
const GROUP_ORDER: Record<string, string[]> = {
  element: ['physical', 'magical', 'special'],
  mainCategory: [...CATEGORY_IDS],
  isBoss: ['normal', 'boss'],
  bossOnly: ['normal', 'bossOnly'],
  timing: ['onCast', 'onHit', 'onMiss', 'onHeal', 'onShield', 'onStatus', 'onDefeat', 'onSystem'],
  draftable: ['draftable', 'fixed'],
}
const GROUP_BY_STORAGE_KEY = 'contentEditor.groupBy'

function loadGroupByPrefs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(GROUP_BY_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch { return {} }
}
function saveGroupByPrefs(): void {
  try { localStorage.setItem(GROUP_BY_STORAGE_KEY, JSON.stringify(groupBySel)) } catch { /* localStorage不可でも動作は継続する */ }
}

function groupKeyOf(entry: EntrySummary, groupField: string): string {
  switch (groupField) {
    case 'element': return entry.element ?? '(未設定)'
    case 'mainCategory': return entry.mainCategory ?? '(未設定)'
    case 'isBoss': return entry.isBoss ? 'boss' : 'normal'
    case 'bossOnly': return entry.bossOnly ? 'bossOnly' : 'normal'
    case 'timing': return entry.timing ?? '(未設定)'
    case 'draftable': return entry.draftable === false ? 'fixed' : 'draftable'
    default: return ''
  }
}
function groupLabelOf(groupField: string, key: string): string {
  switch (groupField) {
    case 'element': return ELEMENT_LABEL[key as Element] ?? key
    case 'mainCategory': return CATEGORY_LABEL[key as CategoryId] ?? key
    case 'isBoss': return key === 'boss' ? 'ボス' : '通常'
    case 'bossOnly': return key === 'bossOnly' ? 'ボス専用' : '通常戦闘'
    case 'timing': return TIMING_LABEL[key] ?? key
    case 'draftable': return key === 'fixed' ? '常設（ドラフト対象外）' : 'ドラフト対象'
    default: return key
  }
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
function optionLabel(value: string, labelMap?: Record<string, string>): string {
  const label = labelMap?.[value]
  return label ? `${value}（${label}）` : value
}

// ── 状態 ──────────────────────────────────────────────────────
let refs: RefsResponse = { activeSkillIds: [], passiveSkillIds: [], traitIds: [], effectIds: [], sfxIds: [], spriteIds: [] }
let lists: Record<CategoryKey, EntrySummary[]> = { skills: [], traits: [], enemies: [], battleEffects: [], battleBackgrounds: [] }
let currentTabKey = TABS[0].key
let currentCategory: CategoryKey = TABS[0].apiCategory
let currentId: string | null = null
let currentValue: Record<string, unknown> | null = null
let isNewEntry = false
let rawMode = false
const groupBySel: Record<string, string> = loadGroupByPrefs()

function currentTab(): TabDef {
  return TABS.find(t => t.key === currentTabKey) ?? TABS[0]
}

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

// ── サイドバー: タブ ──────────────────────────────────────────
function renderTabs(): void {
  const tabsEl = el<HTMLDivElement>('tabs')
  tabsEl.innerHTML = ''
  for (const tab of TABS) {
    let entries = lists[tab.apiCategory]
    if (tab.kindFilter) entries = entries.filter(e => e.kind === tab.kindFilter)
    const btn = h('button', `tab-btn${tab.key === currentTabKey ? ' active' : ''}`, `${tab.label} (${entries.length})`)
    btn.addEventListener('click', () => {
      currentTabKey = tab.key
      currentCategory = tab.apiCategory
      renderTabs()
      renderGroupBySelect()
      renderList()
    })
    tabsEl.appendChild(btn)
  }
}

// ── サイドバー: グループ化設定 ────────────────────────────────
function renderGroupBySelect(): void {
  const host = el<HTMLDivElement>('group-by-host')
  host.innerHTML = ''
  const options = GROUP_OPTIONS[currentTabKey]
  if (!options || options.length <= 1) return
  const label = h('label', 'group-by-label', 'セクション分け: ')
  const select = document.createElement('select')
  select.className = 'group-by-select'
  for (const opt of options) {
    const optEl = document.createElement('option')
    optEl.value = opt.value
    optEl.textContent = opt.label
    select.appendChild(optEl)
  }
  select.value = groupBySel[currentTabKey] ?? 'none'
  select.addEventListener('change', () => {
    groupBySel[currentTabKey] = select.value
    saveGroupByPrefs()
    renderList()
  })
  label.appendChild(select)
  host.appendChild(label)
}

// ── サイドバー: 一覧 ──────────────────────────────────────────
function renderList(): void {
  const listEl = el<HTMLDivElement>('entry-list')
  listEl.innerHTML = ''
  const tab = currentTab()
  let entries = lists[tab.apiCategory]
  if (tab.kindFilter) entries = entries.filter(e => e.kind === tab.kindFilter)

  const groupField = groupBySel[tab.key] ?? 'none'
  if (groupField === 'none') {
    for (const entry of entries) listEl.appendChild(renderEntryButton(entry, tab.apiCategory))
    return
  }
  const buckets = new Map<string, EntrySummary[]>()
  for (const entry of entries) {
    const k = groupKeyOf(entry, groupField)
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)?.push(entry)
  }
  const order = GROUP_ORDER[groupField] ?? []
  const orderedKeys = [...order.filter(k => buckets.has(k)), ...[...buckets.keys()].filter(k => !order.includes(k)).sort()]
  for (const k of orderedKeys) {
    const bucket = buckets.get(k)
    if (!bucket || bucket.length === 0) continue
    listEl.appendChild(h('div', 'group-header', `${groupLabelOf(groupField, k)}（${bucket.length}）`))
    for (const entry of bucket) listEl.appendChild(renderEntryButton(entry, tab.apiCategory))
  }
}

function renderEntryButton(entry: EntrySummary, apiCategory: CategoryKey): HTMLElement {
  const btn = h('button', `entry-btn${entry.id === currentId ? ' active' : ''}${entry.broken ? ' broken' : ''}`)
  if (apiCategory === 'enemies' && !entry.broken) {
    const thumb = h('span', 'entry-thumb')
    renderSpritePreview(entry.sprite, thumb, 28)
    btn.appendChild(thumb)
  }
  if (apiCategory === 'battleEffects' && !entry.broken) {
    const swatch = h('span', 'entry-swatch')
    renderEffectSwatch(entry.visual, swatch)
    btn.appendChild(swatch)
  }
  const idSpan = h('span', 'entry-id', entry.id)
  const labelSpan = h('span', 'entry-name', entry.label)
  btn.append(idSpan, labelSpan)
  if (entry.isBoss) btn.appendChild(h('span', 'badge boss', 'BOSS'))
  if (entry.bossOnly) btn.appendChild(h('span', 'badge boss', 'ボス専用'))
  btn.addEventListener('click', () => void selectEntry(apiCategory, entry.id))
  return btn
}

// ── 見た目のプレビュー（絵そのものは編集しない。表示のみ） ─────────

/** 敵のドット絵。PixelSprite.vue と同じ考え方で、横に連続する同色セルを矩形へまとめて描く */
function renderSpritePreview(spriteId: string | undefined, container: HTMLElement, targetHeight: number): void {
  container.innerHTML = ''
  const def = spriteId ? SPRITES[spriteId] : undefined
  if (!def) {
    container.appendChild(h('span', 'sprite-missing', spriteId ? `(スプライト "${spriteId}" が見つかりません)` : '(未設定)'))
    return
  }
  const runs = buildSpriteRuns(def, 'idle')
  const scale = Math.max(1, Math.round(targetHeight / def.h))
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${def.w} ${def.h}`)
  svg.setAttribute('width', String(def.w * scale))
  svg.setAttribute('height', String(def.h * scale))
  svg.setAttribute('shape-rendering', 'crispEdges')
  for (const r of runs) {
    const rect = document.createElementNS(svgNS, 'rect')
    rect.setAttribute('x', String(r.x))
    rect.setAttribute('y', String(r.y))
    rect.setAttribute('width', String(r.w))
    rect.setAttribute('height', '1')
    rect.setAttribute('fill', r.color)
    svg.appendChild(rect)
  }
  container.appendChild(svg)
}

/** エフェクトには絵（スプライト）が無いため、visual.color を地色にした kind バッジで代用する */
function renderEffectSwatch(visual: { kind?: string; color?: string } | undefined, container: HTMLElement): void {
  container.innerHTML = ''
  const swatch = h('div', 'effect-swatch-badge')
  swatch.style.background = resolvePreviewColor(visual?.color) ?? '#555a68'
  swatch.textContent = visual?.kind ?? '?'
  container.appendChild(swatch)
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
  renderList()
  renderEditor()
}

function createNew(): void {
  const tab = currentTab()
  const raw = window.prompt(`新規IDを入力してください（${CATEGORY_ID_HINT[tab.apiCategory]}）`)
  if (!raw) return
  const id = raw.trim()
  if (!isValidIdShape(id)) { showStatus('idは英小文字で始まり、英小文字・数字・_のみ使えます', true); return }
  if (lists[tab.apiCategory].some(e => e.id === id)) { showStatus(`"${id}" は既に存在します`, true); return }
  currentCategory = tab.apiCategory
  currentId = id
  currentValue = blankEntrySkeleton(tab.apiCategory, id, tab.kindFilter ? { kind: tab.kindFilter } : undefined)
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
  renderObjectFields(schema, schema, currentValue, '', form)
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
  pathPrefix: string, container: HTMLElement,
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
    fieldWrap.appendChild(h('label', 'field-label', fieldLabelFor(path, key) + (isRequired ? ' *' : '')))

    // 任意項目のオブジェクト（unlockCondition, sfx, glow等）は、開いただけで
    // 中の必須フィールドにデフォルト値が書き込まれ、触っていないのに保存すると
    // 項目が追加されてしまう。トグルで明示的にON/OFFできるようにする。
    if (!isRequired && resolvedSub.type === 'object' && resolvedSub.properties && !(currentCategory === 'battleEffects' && path === 'visual')) {
      renderOptionalObjectField(resolvedSub, root, value, path, fieldWrap)
    } else {
      renderField(subSchemaRaw, root, value, path, key, fieldWrap)
    }
    container.appendChild(fieldWrap)
  }
}

/** enemies.stats.* は STAT_LABEL（HP/STR/命中率...）を添えて表示する */
function fieldLabelFor(path: string, key: string): string {
  if (currentCategory === 'enemies' && path.startsWith('stats.')) {
    const label = STAT_LABEL[key as StatKey]
    if (label) return `${key}（${label}）`
  }
  return key
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
  if (currentCategory === 'enemies' && path === 'sprite') { renderSpriteField(rootValue, path, container); return }
  if (currentCategory === 'enemies' && path === 'activeSkills') { renderSkillRefList(rootValue, path, container, refs.activeSkillIds, true); return }
  if (currentCategory === 'enemies' && path === 'passiveSkills') { renderSkillRefList(rootValue, path, container, refs.passiveSkillIds, true); return }
  if (currentCategory === 'enemies' && path === 'actionPattern') { renderActionPattern(rootValue, path, container); return }
  if ((currentCategory === 'skills' || currentCategory === 'traits') && path === 'effect') { renderEffectNodeList(rootValue, path, container); return }
  if (currentCategory === 'battleEffects' && path === 'visual') { renderVisualField(schemaRaw, root, rootValue, path, container); return }

  const schema = resolveRef(schemaRaw, root)
  const kind = widgetKindOf(schemaRaw, root)
  const current = getAtPath(rootValue, path)
  const refCheckboxSource = REF_CHECKBOX_FIELDS[refFieldKey(path)]
  const refDatalistSource = REF_DATALIST_FIELDS[refFieldKey(path)]
  const enumLabels = ENUM_LABEL_FIELDS[refFieldKey(path)]

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
        optEl.textContent = optionLabel(String(opt), enumLabels)
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
      const options = (items.enum ?? []).map(v => ({ id: String(v), label: enumLabels?.[String(v)] ?? String(v) }))
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

/** enemies.sprite: 通常のテキスト入力＋候補一覧に加え、実際のドット絵をその場に表示する */
function renderSpriteField(rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const current = getAtPath(rootValue, path)
  const input = document.createElement('input')
  input.type = 'text'
  input.value = typeof current === 'string' ? current : ''
  const listId = `dl-${path.replace(/\./g, '-')}`
  const dl = document.createElement('datalist')
  dl.id = listId
  for (const spriteId of refs.spriteIds) {
    const opt = document.createElement('option')
    opt.value = spriteId
    dl.appendChild(opt)
  }
  input.setAttribute('list', listId)
  container.append(input, dl)

  const previewBox = h('div', 'sprite-preview')
  container.appendChild(previewBox)
  const refresh = () => renderSpritePreview(input.value || undefined, previewBox, 96)
  input.addEventListener('change', () => { setAtPath(rootValue, path, input.value); refresh() })
  refresh()
}

/** battleEffects.visual: 通常のフィールド群に加え、色とkindを反映したプレビューを添える */
function renderVisualField(schemaRaw: JsonSchema, root: JsonSchema, rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const schema = resolveRef(schemaRaw, root)
  const box = h('div', 'nested-object')
  renderObjectFields(schema, root, rootValue, path, box)
  container.appendChild(box)

  const previewWrap = h('div', 'field')
  previewWrap.appendChild(h('label', 'field-label', 'プレビュー（絵は無いため色とkindのみ）'))
  const previewBox = h('div')
  previewWrap.appendChild(previewBox)
  container.appendChild(previewWrap)

  const refresh = () => renderEffectSwatch(getAtPath(rootValue, path) as { kind?: string; color?: string } | undefined, previewBox)
  box.addEventListener('change', refresh)
  refresh()
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

// ── effect[]: op固有ロジックの型付きフォーム ────────────────────
//
// 「ダメージを、何に基づいて、何%与えるか」を直接編集したいという要望を受け、
// op選択＋JSON欄だった旧実装を、EFFECT_OP_FIELDS駆動の型付きフィールドへ置き換えた。
// repeat の body/onFirstIteration/onLastIteration は EffectNode[] を再帰的に持つため、
// この関数自身を再帰呼び出しする。

function renderEffectNodeList(rootValue: Record<string, unknown>, path: string, container: HTMLElement): void {
  const list = [...((getAtPath(rootValue, path) as Record<string, unknown>[] | undefined) ?? [])]
  const box = h('div', 'object-array')
  const commit = () => setAtPath(rootValue, path, list)
  function redraw(): void {
    box.innerHTML = ''
    list.forEach((node, i) => {
      const card = h('div', 'object-array-card effect-node-card')
      const head = h('div', 'object-array-head')
      head.appendChild(h('span', undefined, `#${i + 1}`))
      const opSelect = document.createElement('select')
      for (const op of ALLOWED_EFFECT_OPS) {
        const optEl = document.createElement('option')
        optEl.value = op
        optEl.textContent = optionLabel(op, EFFECT_OP_LABEL)
        opSelect.appendChild(optEl)
      }
      opSelect.value = typeof node.op === 'string' ? node.op : ALLOWED_EFFECT_OPS[0]
      // op を切り替えると、そのopのひな形で中身を総入れ替えする（型の合わない
      // 古いフィールドが残らないようにするため。値を活かしたい場合はリセット前に控える）
      opSelect.addEventListener('change', () => {
        list[i] = { op: opSelect.value, ...(EFFECT_OP_SKELETONS[opSelect.value] ?? {}) }
        commit(); redraw()
      })
      const resetBtn = h('button', 'small', 'リセット')
      resetBtn.title = 'このopの標準的な値に戻します'
      resetBtn.addEventListener('click', () => {
        list[i] = { op: node.op, ...(EFFECT_OP_SKELETONS[String(node.op)] ?? {}) }
        commit(); redraw()
      })
      const removeBtn = h('button', 'small', '× 削除')
      removeBtn.addEventListener('click', () => { list.splice(i, 1); commit(); redraw() })
      head.append(opSelect, resetBtn, removeBtn)
      card.appendChild(head)

      const fields = EFFECT_OP_FIELDS[String(node.op)] ?? []
      if (fields.length === 0) {
        card.appendChild(h('p', 'note', 'このopに追加フィールドはありません。'))
      }
      for (const spec of fields) {
        const fieldWrap = h('div', 'field')
        fieldWrap.appendChild(h('label', 'field-label', spec.label + (spec.optional ? '' : ' *')))
        renderEffectField(node, spec, fieldWrap, () => commit())
        card.appendChild(fieldWrap)
      }
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

function statSelect(value: unknown, onChange: (v: string) => void): HTMLSelectElement {
  const select = document.createElement('select')
  for (const stat of STAT_KEYS) {
    const optEl = document.createElement('option')
    optEl.value = stat
    optEl.textContent = `${stat}（${STAT_LABEL[stat]}）`
    select.appendChild(optEl)
  }
  select.value = typeof value === 'string' ? value : STAT_KEYS[0]
  select.addEventListener('change', () => onChange(select.value))
  return select
}
function elementSelect(value: unknown, onChange: (v: string) => void, includeAny: boolean): HTMLSelectElement {
  const select = document.createElement('select')
  const values: string[] = includeAny ? ['physical', 'magical', 'special', 'any'] : ['physical', 'magical', 'special']
  for (const el2 of values) {
    const optEl = document.createElement('option')
    optEl.value = el2
    optEl.textContent = el2 === 'any' ? 'any（全属性）' : `${el2}（${ELEMENT_LABEL[el2 as Element]}）`
    select.appendChild(optEl)
  }
  select.value = typeof value === 'string' ? value : values[0]
  select.addEventListener('change', () => onChange(select.value))
  return select
}

/** effectノード1個ぶんの、1フィールドを描く。node を直接書き換え、都度 onCommit() を呼ぶ */
function renderEffectField(node: Record<string, unknown>, spec: EffectFieldSpec, container: HTMLElement, onCommit: () => void): void {
  const current = node[spec.key]
  switch (spec.kind) {
    case 'stat': {
      container.appendChild(statSelect(current, v => { node[spec.key] = v; onCommit() }))
      if (current === undefined) node[spec.key] = STAT_KEYS[0]
      return
    }
    case 'element': {
      container.appendChild(elementSelect(current, v => { node[spec.key] = v; onCommit() }, false))
      if (current === undefined) node[spec.key] = 'physical'
      return
    }
    case 'element-or-any': {
      container.appendChild(elementSelect(current, v => { node[spec.key] = v; onCommit() }, true))
      if (current === undefined) node[spec.key] = 'physical'
      return
    }
    case 'number': {
      const input = document.createElement('input')
      input.type = 'number'
      if (spec.step !== undefined) input.step = String(spec.step); else input.step = 'any'
      if (spec.min !== undefined) input.min = String(spec.min)
      input.value = typeof current === 'number' ? String(current) : ''
      input.placeholder = spec.optional ? '（未設定）' : ''
      input.addEventListener('change', () => {
        if (input.value === '') {
          if (spec.optional) delete node[spec.key]
        } else {
          node[spec.key] = Number(input.value)
        }
        onCommit()
      })
      container.appendChild(input)
      return
    }
    case 'select': {
      const labelMap = EFFECT_SELECT_LABELS[spec.key]
      const select = document.createElement('select')
      if (spec.optional) {
        const blankOpt = document.createElement('option')
        blankOpt.value = ''
        blankOpt.textContent = '（未設定）'
        select.appendChild(blankOpt)
      }
      for (const opt of spec.options) {
        const optEl = document.createElement('option')
        optEl.value = opt
        optEl.textContent = optionLabel(opt, labelMap)
        select.appendChild(optEl)
      }
      select.value = typeof current === 'string' ? current : ''
      select.addEventListener('change', () => {
        if (select.value === '' && spec.optional) delete node[spec.key]
        else node[spec.key] = select.value
        onCommit()
      })
      if (current === undefined && !spec.optional) node[spec.key] = spec.options[0]
      container.appendChild(select)
      return
    }
    case 'scale': {
      const scaleObj = (typeof current === 'object' && current !== null ? current : { stat: STAT_KEYS[0], rate: 1 }) as { stat?: string; rate?: number }
      node[spec.key] = scaleObj
      const wrap = h('div', 'scale-field')
      wrap.appendChild(statSelect(scaleObj.stat, v => { scaleObj.stat = v; onCommit() }))
      const rateInput = document.createElement('input')
      rateInput.type = 'number'
      rateInput.step = '0.01'
      rateInput.value = typeof scaleObj.rate === 'number' ? String(scaleObj.rate) : '1'
      rateInput.title = '倍率（rate）。1 = 参照ステータスの100%分'
      rateInput.addEventListener('change', () => { scaleObj.rate = Number(rateInput.value); onCommit() })
      wrap.appendChild(rateInput)
      if (scaleObj.stat === undefined) scaleObj.stat = STAT_KEYS[0]
      if (scaleObj.rate === undefined) scaleObj.rate = 1
      container.appendChild(wrap)
      return
    }
    case 'nodes': {
      if (spec.optional) {
        const existing = Array.isArray(current)
        const label = h('label', 'checkbox-item')
        const toggle = document.createElement('input')
        toggle.type = 'checkbox'
        toggle.checked = existing
        label.append(toggle, document.createTextNode(' この項目を設定する'))
        container.appendChild(label)
        const box = h('div', 'nested-object')
        box.style.display = existing ? '' : 'none'
        if (existing) renderEffectNodeList(node, spec.key, box)
        container.appendChild(box)
        toggle.addEventListener('change', () => {
          if (toggle.checked) {
            if (!Array.isArray(node[spec.key])) node[spec.key] = []
            box.style.display = ''
            box.innerHTML = ''
            renderEffectNodeList(node, spec.key, box)
          } else {
            delete node[spec.key]
            box.style.display = 'none'
            box.innerHTML = ''
          }
          onCommit()
        })
        return
      }
      if (!Array.isArray(node[spec.key])) node[spec.key] = []
      renderEffectNodeList(node, spec.key, container)
      return
    }
    default:
      return
  }
}

// ── 起動 ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  await loadAll()
  renderTabs()
  renderGroupBySelect()
  renderList()
  renderEditor()
  el<HTMLButtonElement>('new-btn').addEventListener('click', createNew)
}

void main()
