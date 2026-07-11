#!/usr/bin/env node
/**
 * JSON integrity check for all game data files.
 * Validates syntax + required keys for known config schemas,
 * plus content-level integrity for genres and cards:
 *   - genre: id/label/thresholds required, axis-name typos, theme enum, duplicate ids
 *   - cards: required keys, axis-name typos, duplicate ids,
 *            conflictsWith / genreAffinity reference integrity
 * Axis / theme lists are read from schemas/genre.schema.json (single source of truth).
 * Exit 1 on any failure.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, relative } from 'path'

// ── Required-key schemas for known config files ──────────────────────────
const SCHEMAS = {
  'score.json':        ['section', 'distanceScoreRate', 'longAirScoreRate'],
  'physics.json':      ['section', 'jumpVelocity', 'runSpeed'],
  'game_balance.json': ['section', 'scoreRatioPlay', 'baseScrollSpeed'],
  'spawn.json':        ['section', 'firstSpawnDist'],
  'genres.json':       [], // array or object — just parse check
  'genre_params.json': [],
  'difficulty.json':   ['section'],
  'shoot.json':        ['section'],
  'throw.json':        ['section'],
}

// Required keys for manual branch files
const MANUAL_REQUIRED = ['id', 'entries']

// ── Axis / theme lists from the JSON schema (single source of truth) ─────
const _genreSchema = JSON.parse(readFileSync('schemas/genre.schema.json', 'utf8'))
const VALID_AXES   = Object.keys(_genreSchema.properties.thresholds.properties)
const VALID_THEMES = _genreSchema.properties.theme.enum

const GENRE_ID_PATTERN = /^[a-z][a-z0-9_]*$/

// ─────────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const errors = []

function fail(file, msg) {
  failed++
  errors.push(`  ❌  ${file}\n       ${msg}`)
}

function ok(file) {
  passed++
  process.stdout.write(`  ✅  ${file}\n`)
}

function parseJson(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8')
    return { data: JSON.parse(raw), raw }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

function walkJson(dir) {
  const results = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        results.push(...walkJson(full))
      } else if (
        extname(full) === '.json' &&
        !basename(full).startsWith('TEMPLATE')
      ) {
        results.push(full)
      }
    }
  } catch {
    // directory doesn't exist — skip silently
  }
  return results
}

function relPath(filePath) {
  return relative(process.cwd(), filePath).replace(/\\/g, '/')
}

function validateFile(filePath, requiredKeys = []) {
  const rel = relPath(filePath)
  const { data, error } = parseJson(filePath)

  if (data === null) {
    fail(rel, `JSON parse error: ${error}`)
    return
  }

  // Verify required keys exist at top level
  const missing = requiredKeys.filter(k => !(k in data))
  if (missing.length > 0) {
    fail(rel, `Missing required keys: ${missing.map(k => `"${k}"`).join(', ')}`)
    return
  }

  // Verify no undefined values leaked in (JSON.parse turns undefined to null, but check anyway)
  const raw = readFileSync(filePath, 'utf8')
  if (/:\s*undefined/.test(raw)) {
    fail(rel, 'Contains literal "undefined" value (not valid JSON)')
    return
  }

  ok(rel)
}

function unknownAxes(params) {
  return Object.keys(params ?? {}).filter(k => !VALID_AXES.includes(k))
}

// ── Genre definitions (src/data/genres/*.json) ───────────────────────────
// Returns the set of genre ids for reference checks by cards.
function validateGenres() {
  const genreIds = new Set()

  for (const file of walkJson('src/data/genres')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []
    for (const key of ['id', 'label', 'thresholds']) {
      if (!(key in data)) problems.push(`必須キー "${key}" がありません`)
    }
    if (data.id !== undefined) {
      if (!GENRE_ID_PATTERN.test(data.id)) {
        problems.push(`id "${data.id}" が不正です（英小文字で始まり、英小文字・数字・_のみ）`)
      }
      if (data.id !== basename(file, '.json')) {
        problems.push(`id "${data.id}" とファイル名が一致していません`)
      }
      if (genreIds.has(data.id)) {
        problems.push(`id "${data.id}" が他のジャンルと重複しています`)
      }
      genreIds.add(data.id)
    }
    const badAxes = unknownAxes(data.thresholds)
    if (badAxes.length > 0) {
      problems.push(`thresholds に不明な軸名: ${badAxes.join(', ')}（有効: ${VALID_AXES.join(', ')}）`)
    }
    if (data.theme !== undefined && !VALID_THEMES.includes(data.theme)) {
      problems.push(`theme "${data.theme}" が不正です（有効: ${VALID_THEMES.join(', ')}）`)
    }

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
  }

  return genreIds
}

// ── Card decks (src/data/cards/*.json) ───────────────────────────────────
function validateCards(genreIds) {
  const files = walkJson('src/data/cards')

  // First pass: collect every card id for conflictsWith reference checks
  const allCardIds = new Set()
  for (const file of files) {
    const { data } = parseJson(file)
    for (const card of data?.cards ?? []) {
      if (card.id) allCardIds.add(card.id)
    }
  }

  const seenIds = new Set()
  for (const file of files) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    if (!Array.isArray(data.cards)) {
      fail(rel, '"cards" 配列が必要です（{ "cards": [ ... ] } の形式）')
      continue
    }

    const problems = []
    for (const card of data.cards) {
      const name = card.id ?? card.label ?? '(no id)'
      for (const key of ['id', 'label', 'manualText']) {
        if (!(key in card)) problems.push(`カード "${name}": 必須キー "${key}" がありません`)
      }
      if (card.id) {
        if (seenIds.has(card.id)) problems.push(`カードID "${card.id}" が重複しています`)
        seenIds.add(card.id)
      }
      const badAxes = unknownAxes(card.genreParams)
      if (badAxes.length > 0) {
        problems.push(`カード "${name}": genreParams に不明な軸名: ${badAxes.join(', ')}`)
      }
      for (const ref of card.conflictsWith ?? []) {
        if (!allCardIds.has(ref)) {
          problems.push(`カード "${name}": conflictsWith の "${ref}" というカードは存在しません`)
        }
      }
      for (const ref of card.genreAffinity ?? []) {
        if (!genreIds.has(ref)) {
          problems.push(`カード "${name}": genreAffinity の "${ref}" というジャンルは存在しません`)
        }
      }
    }

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
  }
}

// ── content/choices/*.json (human-authored, converted by preprocess) ─────
function validateContentChoices(genreIds) {
  for (const file of walkJson('content/choices')) {
    if (basename(file).startsWith('_')) continue // examples are ignored by preprocess
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const list = Array.isArray(data) ? data : (Array.isArray(data.cards) ? data.cards : [data])
    const problems = []
    for (const entry of list) {
      if (!entry.label) continue // comment-only entries are skipped by preprocess
      if (!entry.genreParams || typeof entry.genreParams !== 'object') {
        problems.push(`"${entry.label}": "genreParams" が必要です`)
        continue
      }
      const badAxes = unknownAxes(entry.genreParams)
      if (badAxes.length > 0) {
        problems.push(`"${entry.label}": genreParams に不明な軸名: ${badAxes.join(', ')}（有効: ${VALID_AXES.join(', ')}）`)
      }
      for (const ref of entry.genreAffinity ?? []) {
        if (!genreIds.has(ref)) {
          problems.push(`"${entry.label}": genreAffinity の "${ref}" というジャンルは存在しません`)
        }
      }
    }

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
  }
}

// ── Run ──────────────────────────────────────────────────────────────────
console.log('\n🔍  JSON Integrity Check\n')

// Config files
for (const file of walkJson('src/data/config')) {
  const name = basename(file)
  validateFile(file, SCHEMAS[name] ?? ['section'])
}

// Genre definitions (also collects ids for reference checks)
const genreIds = validateGenres()

// Manual deck files
for (const file of walkJson('src/data/manuals')) {
  validateFile(file, MANUAL_REQUIRED)
}
validateManualDeckRefs()

// 説明書ツリー（後方互換データ）の参照整合性: すべての choices[].next が
// マージ後デッキ内の実在キーを指すか検証する。1.0 からの到達性は検査しない
// （現行はカードプール方式で、旧ツリーはルート未接続の死にデータのため到達不能は正常）。
function validateManualDeckRefs() {
  const rel = 'src/data/manuals/*.json (next 参照整合性)'
  const keys = new Set()
  const refs = []
  for (const file of walkJson('src/data/manuals')) {
    const { data } = parseJson(file)
    if (!data || !Array.isArray(data.entries)) continue
    for (const e of data.entries) {
      if (e && typeof e.key === 'string') keys.add(e.key)
    }
  }
  for (const file of walkJson('src/data/manuals')) {
    const { data } = parseJson(file)
    if (!data || !Array.isArray(data.entries)) continue
    for (const e of data.entries) {
      for (const c of e.choices ?? []) {
        if (typeof c.next === 'string') refs.push({ from: e.key, next: c.next })
      }
    }
  }
  const broken = refs.filter(r => !keys.has(r.next))
  if (broken.length > 0) {
    const list = broken.slice(0, 10).map(b => `${b.from} → ${b.next}`).join(', ')
    const more = broken.length > 10 ? ` ほか${broken.length - 10}件` : ''
    fail(rel, `存在しないキーを指す next が ${broken.length} 件: ${list}${more}`)
  } else {
    ok(rel)
  }
}

// Card pool files (incl. generated user-cards.json)
validateCards(genreIds)

// Human-authored content
for (const file of walkJson('content/genres')) {
  validateFile(file, ['id', 'label', 'thresholds'])
}
validateContentChoices(genreIds)

// ── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(48)}`)
if (errors.length > 0) {
  console.log('\nFailed files:\n')
  errors.forEach(e => console.error(e))
}
console.log(`\n${passed} passed, ${failed} failed\n`)

if (failed > 0) {
  console.error('💥  JSON validation failed')
  process.exit(1)
} else {
  console.log('✅  All JSON files are valid')
}
