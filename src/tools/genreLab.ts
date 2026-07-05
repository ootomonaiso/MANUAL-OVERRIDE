/**
 * genreLab.ts
 *
 * 開発者用ジャンル設計GUI（genre-lab）のエントリポイント。
 * dev サーバー起動中に /tools/genre-lab.html で開く。
 * 本番ビルド（index.html のみバンドル）には含まれない。
 *
 * - 実プレイ再現（2択モード）: 本物の sampleCards で2枚引いて選ぶ
 * - 12軸スライダー / カード一覧 → 事後確率のライブ表示 + 収束ガイド
 * - 試作ジャンルJSONの一時追加と正規化JSONコピー
 * - カードプール全体のモンテカルロ到達性シミュレーション
 */

import type { GenreDef, GenreParams, GenreParam, ManualCard } from '../domain/types'
import { computeBayesianPosteriors, DEFAULT_BAYES_CONFIG } from '../domain/genreResolver'
import { GENRES } from '../data/genres'
import { CARD_POOL, sampleCards } from '../data/cardPool'
import { MAX_ROUNDS } from '../data/gameBalance'
import { GENRE_AXES, judgeConvergence, cardDelta, runSimulation } from './genreLabSim'
import type { ConvergenceJudgment } from './genreLabSim'

const SLIDER_MAX = 12
const SLIDER_STEP = 0.5
const RANDOM_RUNS = 5000
const FOCUS_RUNS = 500
const GENRE_SCHEMA_REF = '../../../schemas/genre.schema.json'
const PROTO_PLACEHOLDER = '{\n  "id": "my_genre",\n  "label": "私のジャンル",\n  "thresholds": { "tempo": 3, "speed": 3 }\n}'

// ── 状態 ─────────────────────────────────────────────────────
const acc: GenreParams = {}
const history: { label: string; delta: GenreParams }[] = []
let protoGenre: GenreDef | null = null
let lastShownIds = new Set<string>()
const activeAxes = new Set<GenreParam>()

function workingGenres(): GenreDef[] {
  return protoGenre ? [...GENRES.filter(g => g.id !== protoGenre?.id), protoGenre] : GENRES
}

function currentJudgment(): ConvergenceJudgment {
  const genres = workingGenres()
  return judgeConvergence(computeBayesianPosteriors(acc, genres), genres)
}

// ── DOM ヘルパー ─────────────────────────────────────────────
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`#${id} が見つかりません`)
  return node as T
}

function h(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function _paramsSummary(params: GenreParams | undefined): string {
  return Object.entries(params ?? {})
    .map(([k, v]) => {
      const rounded = Math.round(v * 10) / 10
      return `${k}${rounded >= 0 ? '+' : ''}${rounded}`
    })
    .join(' ')
}

function _cardMeta(card: ManualCard): string {
  const affinity = card.genreAffinity?.length ? `  → ${card.genreAffinity.join(',')}` : ''
  return `${_paramsSummary(card.genreParams)}  (w${card.weight ?? 1})${affinity}`
}

// ── カード適用（全経路共通） ─────────────────────────────────
function applyCard(card: ManualCard) {
  const delta = cardDelta(card, el<HTMLInputElement>('jitter').checked)
  for (const [k, v] of Object.entries(delta) as [GenreParam, number][]) {
    acc[k] = (acc[k] ?? 0) + v
  }
  history.push({ label: card.label, delta })
  refresh()
}

function undoLast() {
  const last = history.pop()
  if (!last) return
  for (const [k, v] of Object.entries(last.delta) as [GenreParam, number][]) {
    acc[k] = Math.max(0, (acc[k] ?? 0) - v)
  }
  refresh()
}

function resetAll() {
  for (const axis of GENRE_AXES) delete acc[axis]
  history.splice(0)
  lastShownIds = new Set()
  el('pair').replaceChildren()
  refresh()
}

// ── 2択モード（実プレイ再現） ────────────────────────────────
function drawPair() {
  const posteriors = computeBayesianPosteriors(acc, workingGenres())
  const pair = sampleCards(2, lastShownIds, posteriors)
  const root = el('pair')
  root.replaceChildren()
  for (const card of pair) {
    const btn = h('button', 'pair-btn') as HTMLButtonElement
    btn.append(h('span', 'pair-label', card.label), h('span', 'card-params', _cardMeta(card)))
    btn.title = card.hint ?? ''
    btn.addEventListener('click', () => {
      lastShownIds = new Set(pair.map(c => c.id))
      root.replaceChildren()
      applyCard(card)
      // 実プレイ同様、収束せず残ラウンドがあれば続けて次の2枚を出す
      const { converged } = currentJudgment()
      if (!converged && history.length < MAX_ROUNDS) drawPair()
    })
    root.appendChild(btn)
  }
}

function renderDealStatus() {
  const root = el('deal-status')
  root.replaceChildren()
  const { converged, top } = currentJudgment()
  if (converged) {
    root.appendChild(h('div', 'banner banner-locked', `✔ 収束: ${converged}（ラウンド ${history.length}）`))
  } else if (history.length >= MAX_ROUNDS) {
    root.appendChild(h('div', 'banner banner-forced', `⏱ ${MAX_ROUNDS}ラウンド終了 → 最尤ジャンルで強制確定: ${top?.id ?? '─'}`))
  }
}

// ── 軸スライダー ─────────────────────────────────────────────
function buildSliders() {
  const root = el('sliders')
  for (const axis of GENRE_AXES) {
    const row = h('div', 'slider-row')
    const label = h('label', 'slider-label', axis)
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = String(SLIDER_MAX)
    input.step = String(SLIDER_STEP)
    input.value = '0'
    input.dataset.axis = axis
    const value = h('span', 'slider-value', '0')
    input.addEventListener('input', () => {
      acc[axis] = Number(input.value)
      value.textContent = input.value
      renderPosteriors()
      renderDealStatus()
    })
    row.append(label, input, value)
    root.appendChild(row)
  }
}

function syncSliders() {
  for (const input of document.querySelectorAll<HTMLInputElement>('#sliders input')) {
    const axis = input.dataset.axis as GenreParam
    const val = Math.min(SLIDER_MAX, acc[axis] ?? 0)
    input.value = String(val)
    const value = input.nextElementSibling
    if (value) value.textContent = val.toFixed(1)
  }
}

// ── カード一覧（検索 + 軸フィルタ） ──────────────────────────
function buildAxisChips() {
  const root = el('axis-filter')
  for (const axis of GENRE_AXES) {
    const chip = h('button', 'chip', axis) as HTMLButtonElement
    chip.addEventListener('click', () => {
      if (activeAxes.has(axis)) { activeAxes.delete(axis); chip.classList.remove('active') }
      else { activeAxes.add(axis); chip.classList.add('active') }
      filterCards()
    })
    root.appendChild(chip)
  }
}

function buildCards() {
  const root = el('cards')
  for (const card of CARD_POOL) {
    const btn = h('button', 'card-btn') as HTMLButtonElement
    btn.append(h('span', 'card-label', card.label), h('span', 'card-params', _cardMeta(card)))
    btn.title = card.hint ?? ''
    btn.dataset.search = `${card.id} ${card.label} ${card.hint ?? ''} ${(card.genreAffinity ?? []).join(' ')}`.toLowerCase()
    btn.dataset.axes = Object.keys(card.genreParams ?? {}).join(' ')
    btn.addEventListener('click', () => applyCard(card))
    root.appendChild(btn)
  }
}

function filterCards() {
  const query = el<HTMLInputElement>('card-search').value.trim().toLowerCase()
  for (const btn of document.querySelectorAll<HTMLButtonElement>('#cards .card-btn')) {
    const textHit = query === '' || (btn.dataset.search ?? '').includes(query)
    const axes = (btn.dataset.axes ?? '').split(' ')
    const axisHit = activeAxes.size === 0 || [...activeAxes].some(a => axes.includes(a))
    btn.style.display = textHit && axisHit ? '' : 'none'
  }
}

// ── 履歴 ─────────────────────────────────────────────────────
function renderHistory() {
  const root = el('history')
  root.replaceChildren()
  history.forEach((entry, i) => {
    root.appendChild(h('div', 'history-row', `${i + 1}. ${entry.label} — ${_paramsSummary(entry.delta)}`))
  })
  el('round-count').textContent = String(history.length)
}

// ── 事後確率・収束ガイド ─────────────────────────────────────
function _shortfalls(genre: GenreDef): { axis: GenreParam; missing: number }[] {
  return (Object.entries(genre.thresholds) as [GenreParam, number][])
    .map(([axis, th]) => ({ axis, missing: th - (acc[axis] ?? 0) }))
    .filter(s => s.missing > 0)
}

function _shortfallTitle(genre: GenreDef): string {
  const parts = (Object.entries(genre.thresholds) as [GenreParam, number][])
    .map(([axis, th]) => {
      const have = acc[axis] ?? 0
      return `${axis}: ${have.toFixed(1)}/${th}${have >= th ? ' ✓' : ''}`
    })
  return parts.length > 0 ? parts.join('  ') : '(閾値なし: base)'
}

function renderPosteriors() {
  const genres = workingGenres()
  const posteriors = computeBayesianPosteriors(acc, genres)
  const judgment = judgeConvergence(posteriors, genres)

  const root = el('posteriors')
  root.replaceChildren()
  const sorted = genres
    .map(g => ({ genre: g, prob: posteriors[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)

  for (const { genre, prob } of sorted) {
    const row = h('div', 'post-row')
    row.title = _shortfallTitle(genre)
    const name = h('span', 'post-name', (protoGenre?.id === genre.id ? '★' : '') + genre.id)
    const barWrap = h('div', 'post-bar-wrap')
    const bar = h('div', 'post-bar' + (judgment.converged === genre.id ? ' post-bar-locked' : ''))
    bar.style.width = `${(prob * 100).toFixed(1)}%`
    barWrap.appendChild(bar)
    row.append(name, barWrap, h('span', 'post-pct', `${(prob * 100).toFixed(1)}%`))
    root.appendChild(row)
  }

  const { top, second, minProbMet, dominanceMet, converged } = judgment
  const ratio = top && second && second.prob > 0 ? (top.prob / second.prob).toFixed(2) : '∞'
  el('judgment').innerHTML = [
    converged
      ? `<b class="ok">収束: ${converged}</b>`
      : `<b>未収束</b>（最尤: ${top?.id ?? '─'}）`,
    `minProb ${(DEFAULT_BAYES_CONFIG.minProb * 100).toFixed(0)}%: ${top ? (top.prob * 100).toFixed(1) : 0}% ${minProbMet ? '<span class="ok">✓</span>' : '<span class="ng">✗</span>'}`,
    `dominance ×${DEFAULT_BAYES_CONFIG.dominanceRatio}: ×${ratio} ${dominanceMet ? '<span class="ok">✓</span>' : '<span class="ng">✗</span>'}`,
  ].join(' ｜ ')

  renderGuide(judgment)
}

function renderGuide(judgment: ConvergenceJudgment) {
  const guide = el('guide')
  const target = judgment.top
  if (!target) { guide.textContent = ''; return }
  const genre = workingGenres().find(g => g.id === target.id)
  if (!genre) { guide.textContent = ''; return }
  if (judgment.converged) {
    guide.innerHTML = `<span class="ok">✔ ${target.id} に収束済み。</span>閾値はすべて充足。`
    return
  }
  const missing = _shortfalls(genre)
  guide.innerHTML = missing.length === 0
    ? `${target.id} の閾値は充足済み。あとは他ジャンルとの差（dominance ×${DEFAULT_BAYES_CONFIG.dominanceRatio}）を開くカードが必要。`
    : `${target.id} の収束まで: ` + missing.map(s => `<b>${s.axis}</b> あと${s.missing.toFixed(1)}`).join(' ・ ')
}

// ── 試作ジャンル ─────────────────────────────────────────────
function _parseProto(): GenreDef {
  const src = el<HTMLTextAreaElement>('proto-json').value.trim()
  if (!src) throw new Error('JSONが空です')
  const raw = JSON.parse(src) as Partial<GenreDef> & { id?: string; label?: string; thresholds?: GenreParams }
  if (!raw.id || !raw.label || typeof raw.thresholds !== 'object') {
    throw new Error('id / label / thresholds は必須です')
  }
  const badAxes = Object.keys(raw.thresholds ?? {}).filter(k => !GENRE_AXES.includes(k as GenreParam))
  if (badAxes.length > 0) throw new Error(`不明な軸名: ${badAxes.join(', ')}`)
  return {
    enableFeatures: [], disableFeatures: [], scoreFormula: '', manualReveal: '',
    theme: 'plain', bgColor: '#1a1a2e',
    ...raw,
  } as GenreDef
}

function _setProtoStatus(text: string, ok: boolean) {
  const status = el('proto-status')
  status.textContent = text
  status.className = ok ? 'ok' : 'ng'
}

function applyProto() {
  if (!el<HTMLTextAreaElement>('proto-json').value.trim()) {
    protoGenre = null
    _setProtoStatus('', true)
    renderPosteriors()
    return
  }
  try {
    protoGenre = _parseProto()
    _setProtoStatus(`★ ${protoGenre.id} を一時追加中（既存の同IDは置換）`, true)
  } catch (e) {
    protoGenre = null
    _setProtoStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`, false)
  }
  renderPosteriors()
}

async function copyProto() {
  try {
    const raw = JSON.parse(el<HTMLTextAreaElement>('proto-json').value.trim()) as { id?: string }
    if (!raw.id) throw new Error('id は必須です')
    const normalized = { $schema: GENRE_SCHEMA_REF, ...raw }
    await navigator.clipboard.writeText(JSON.stringify(normalized, null, 2) + '\n')
    _setProtoStatus(`コピーしました → src/data/genres/${raw.id}.json に保存すれば本採用`, true)
  } catch (e) {
    _setProtoStatus(`コピー失敗: ${e instanceof Error ? e.message : String(e)}`, false)
  }
}

// ── モンテカルロ ─────────────────────────────────────────────
function runSim() {
  const status = el('sim-status')
  status.textContent = `計算中...（ランダム${RANDOM_RUNS}回 + 各ジャンル狙い${FOCUS_RUNS}回）`
  // 表示を更新してから重い計算を始める
  setTimeout(() => {
    const genres = workingGenres()
    const { randomDist, focusedRate } = runSimulation(genres, RANDOM_RUNS, FOCUS_RUNS)
    const root = el('sim-result')
    root.replaceChildren()
    const header = h('div', 'sim-row sim-header')
    header.append(h('span', 'post-name', 'ジャンル'), h('span', 'sim-col', 'ランダム分布'), h('span', 'sim-col', '狙い撃ち到達率'))
    root.appendChild(header)
    const sorted = genres.filter(g => g.id !== 'base')
      .sort((a, b) => (focusedRate[b.id] ?? 0) - (focusedRate[a.id] ?? 0))
    for (const g of sorted) {
      const row = h('div', 'sim-row')
      const rnd = (randomDist[g.id] ?? 0) * 100
      const foc = (focusedRate[g.id] ?? 0) * 100
      row.append(
        h('span', 'post-name', (protoGenre?.id === g.id ? '★' : '') + g.id),
        h('span', 'sim-col', `${rnd.toFixed(1).padStart(5)}% ${'▇'.repeat(Math.round(rnd / 2))}`),
        h('span', 'sim-col' + (foc < 5 ? ' ng' : ''), `${foc.toFixed(1).padStart(5)}% ${'▇'.repeat(Math.round(foc / 4))}`),
      )
      root.appendChild(row)
    }
    status.textContent = '完了。狙っても5%未満のジャンルは赤表示（要: カード供給 or 閾値調整）'
  }, 30)
}

// ── 再描画の集約 ─────────────────────────────────────────────
function refresh() {
  syncSliders()
  renderHistory()
  renderPosteriors()
  renderDealStatus()
}

// ── 初期化 ───────────────────────────────────────────────────
el<HTMLTextAreaElement>('proto-json').placeholder = PROTO_PLACEHOLDER
el('max-rounds').textContent = String(MAX_ROUNDS)
el('card-count').textContent = String(CARD_POOL.length)
el('genre-count').textContent = String(GENRES.length)
buildSliders()
buildAxisChips()
buildCards()
el('draw').addEventListener('click', drawPair)
el('undo').addEventListener('click', undoLast)
el('reset').addEventListener('click', resetAll)
el('card-search').addEventListener('input', filterCards)
el('proto-apply').addEventListener('click', applyProto)
el('proto-copy').addEventListener('click', () => { void copyProto() })
el('run-sim').addEventListener('click', runSim)
refresh()
