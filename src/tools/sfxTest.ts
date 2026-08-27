/**
 * src/tools/sfxTest.ts
 *
 * 開発者用 SFX テスト再生ツール（sfx-test）のエントリポイント。
 * dev サーバー起動中に /tools/sfx-test.html で開く（npm run sfx-test）。
 * 本番ビルド（index.html のみバンドル）には含まれない（docs/sfx-test-mode.md §2）。
 *
 * - SFX_DEFS 全件をドロップダウンに列挙し、本番と同じ SfxSound.playSfx() で再生する
 * - combo のみ computeComboFreqScale() 経由でピッチを合わせる（本番の onCombo と同一挙動）
 * - 最近使った ID を localStorage に保存し、クリックで選択状態を復元する（自動再生はしない）
 */

import { SfxSound, computeComboFreqScale } from '../plugins/SfxSound'
import { SFX_DEFS } from '../framework/SfxLoader'
import type { SfxDef, SfxOscTrack } from '../framework/sfx-types'
import {
  RECENT_STORAGE_KEY,
  RECENT_LIMIT,
  UNWIRED_SFX_IDS,
  pushRecent,
  collectSfxWarnings,
} from './sfxTestLogic'

const COMBO_ID = 'combo'
const COMBO_COUNT_MIN = 0
const COMBO_COUNT_MAX = 200

const sfx = new SfxSound()
const warningsById = collectSfxWarnings(SFX_DEFS)
let recentIds = _loadRecent()

// ── DOM ヘルパー（genreLab.ts と同じ方針） ─────────────────────────

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

// ── localStorage 永続化 ─────────────────────────────────────────

function _loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function _saveRecent(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // プライベートブラウズ等 localStorage 不可環境では保存を諦める（試聴自体は継続できる）
  }
}

function touchRecent(id: string): void {
  recentIds = pushRecent(recentIds, id, RECENT_LIMIT)
  _saveRecent(recentIds)
  renderRecent()
}

// ── 描画 ───────────────────────────────────────────────────────

function selectedId(): string {
  return el<HTMLSelectElement>('sfx-select').value
}

function renderOptions(): void {
  const select = el<HTMLSelectElement>('sfx-select')
  select.innerHTML = ''
  for (const id of Object.keys(SFX_DEFS).sort()) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id
    select.appendChild(opt)
  }
  el('sfx-count').textContent = String(Object.keys(SFX_DEFS).length)
}

function renderRecent(): void {
  const container = el('recent-list')
  container.innerHTML = ''
  if (recentIds.length === 0) {
    container.appendChild(h('div', 'note', 'まだありません'))
    return
  }
  for (const id of recentIds) {
    const btn = h('button', 'card-btn', id) as HTMLButtonElement
    btn.type = 'button'
    btn.addEventListener('click', () => {
      el<HTMLSelectElement>('sfx-select').value = id
      onSelectionChange()
    })
    container.appendChild(btn)
  }
}

function renderBadges(id: string): void {
  const container = el('badges')
  container.innerHTML = ''
  if (UNWIRED_SFX_IDS.has(id)) {
    container.appendChild(h('span', 'chip', '未配線（PR #230 待ち）'))
  }
  const warnings = warningsById.get(id)
  if (warnings && warnings.length > 0) {
    const badge = h('span', 'chip ng', `定義に警告 ${warnings.length}件`)
    badge.title = warnings.join('\n')
    container.appendChild(badge)
  }
}

function renderPreview(def: SfxDef): void {
  const tbody = el<HTMLTableSectionElement>('preview-body')
  tbody.innerHTML = ''
  def.tracks.forEach((track, i) => {
    const row = document.createElement('tr')
    const osc = track.kind === 'osc' ? (track as SfxOscTrack) : null
    const freqText = osc ? `${osc.freq}${osc.freqEnd !== undefined ? ` → ${osc.freqEnd}` : ''}` : '-'
    const cells = [
      String(i),
      track.kind,
      osc ? osc.wave : '-',
      freqText,
      String(track.durationSec),
      String(track.volume),
      String(track.delaySec ?? 0),
      track.filter ? track.filter.type : '-',
    ]
    for (const text of cells) {
      const td = document.createElement('td')
      td.textContent = text
      row.appendChild(td)
    }
    tbody.appendChild(row)
  })
}

function updateComboRowVisibility(id: string): void {
  el('combo-row').style.display = id === COMBO_ID ? '' : 'none'
}

function onSelectionChange(): void {
  const id = selectedId()
  const def = SFX_DEFS[id]
  el('sfx-comment').textContent = def.$comment ?? ''
  updateComboRowVisibility(id)
  renderBadges(id)
  renderPreview(def)
}

// ── 再生 ───────────────────────────────────────────────────────

function play(): void {
  const id = selectedId()
  if (id === COMBO_ID) {
    const rawCount = Number(el<HTMLInputElement>('combo-count').value)
    const count = Math.min(Math.max(rawCount, COMBO_COUNT_MIN), COMBO_COUNT_MAX)
    sfx.playSfx(COMBO_ID, computeComboFreqScale(count))
  } else {
    sfx.playSfx(id)
  }
  touchRecent(id)
}

// ── 初期化 ─────────────────────────────────────────────────────

function init(): void {
  renderOptions()
  renderRecent()
  onSelectionChange()
  el<HTMLSelectElement>('sfx-select').addEventListener('change', onSelectionChange)
  el<HTMLButtonElement>('play-btn').addEventListener('click', play)
}

init()
