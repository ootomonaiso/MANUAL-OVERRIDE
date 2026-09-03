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
import Ajv from 'ajv'

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
  'pixelart.json':     ['section', 'size', 'gradientSteps', 'haloSteps',
                        'haloAlphaFalloff', 'alphaSteps', 'ditherRatioSteps',
                        'textScale', 'textMinBakePx', 'blockShadeAmount',
                        'spriteCacheMax', 'textCacheMax'],
  'genre_defaults.json': ['section', 'scoreFormula', 'theme', 'bgColor'],
  'palette_defaults.json': ['section', 'danger', 'dangerGlow', 'safe', 'safeGlow'],
  'battle.json': ['section', 'initialStats', 'cut', 'evade', 'affinity', 'guard', 'dodge', 'shield',
                    'playerSprite', 'presentation',
                  'categoryUnlockThresholds', 'fallbackStatBoost', 'bossBattleIndex', 'multiHitIntervalMs'],
}

// pixelart.json の数値範囲チェック（docs/pixelart-rebuild/00-rendering-system.md §9）
const PIXELART_RANGES = {
  size:             { min: 1, max: 16 },
  gradientSteps:    { min: 2, max: 32 },
  haloSteps:        { min: 0, max: 8 },
  haloAlphaFalloff: { min: 0, max: 1, exclusiveMin: true },
  alphaSteps:       { min: 2, max: 32 },
  ditherRatioSteps: { min: 1, max: 32 },
  textScale:        { min: 1, max: 8 },
  textMinBakePx:    { min: 1, max: 64 },
  blockShadeAmount: { min: 0, max: 255 },
  spriteCacheMax:   { min: 1 },
  textCacheMax:     { min: 1 },
}

function validatePixelart() {
  const path = 'src/data/config/pixelart.json'
  // 通常の設定ファイル検証（validateFile）とは別の検査であることを明示する。
  // 同じファイル名で ok() を2回呼ぶと成功件数が二重計上されるため、ラベルを分ける。
  const rel = `${relPath(path)} (範囲チェック)`
  const { data, error } = parseJson(path)
  if (data === null) { fail(rel, `JSON parse error: ${error}`); return }

  const problems = []
  for (const [key, range] of Object.entries(PIXELART_RANGES)) {
    const v = data[key]
    if (v === undefined) {
      // SCHEMAS 側でも必須キーとして検出されるが、範囲チェックを黙って
      // 素通りさせないためここでも明示的に失敗させる
      problems.push(`${key}: 必須キーがありません`)
      continue
    }
    if (typeof v !== 'number' || Number.isNaN(v)) {
      problems.push(`${key}: number が必要です (${typeof v} が渡されました)`)
      continue
    }
    if (range.exclusiveMin && v <= range.min) {
      problems.push(`${key} = ${v} は ${range.min} より大きい値が必要です`)
    } else if (!range.exclusiveMin && range.min !== undefined && v < range.min) {
      problems.push(`${key} = ${v} は最小値 ${range.min} を下回っています`)
    }
    if (range.max !== undefined && v > range.max) {
      problems.push(`${key} = ${v} は最大値 ${range.max} を超えています`)
    }
    if (!Number.isInteger(v) && key !== 'haloAlphaFalloff') {
      problems.push(`${key} = ${v} は整数である必要があります`)
    }
  }
  if (problems.length > 0) fail(rel, problems.join('\n       '))
  else ok(rel)
}

// ── スプライト定義 (src/data/sprites/*.json) ──────────────────────────────
// schemas/sprite.schema.json を単一の情報源として、必須キー・行整合・パレット参照を検証する。
// スキーマから読む: required / id の pattern / palette 値の pattern / palette キーの pattern。
// 行数と文字数の整合（w/h との一致、palette 未定義文字の検出）は JSON Schema では
// 表現できないため、ここで追加検証する。
const _spriteSchema = JSON.parse(readFileSync('schemas/sprite.schema.json', 'utf8'))
const SPRITE_REQUIRED     = _spriteSchema.required
const SPRITE_ID_PATTERN   = new RegExp(_spriteSchema.properties.id.pattern)
const SPRITE_PALETTE_VAL  = new RegExp(_spriteSchema.properties.palette.additionalProperties.pattern)
const SPRITE_PALETTE_KEY  = new RegExp(_spriteSchema.properties.palette.propertyNames.pattern)

function validateSprites() {
  const spriteIds = new Set()
  const spriteFrames = new Map()
  for (const file of walkJson('src/data/sprites')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []
    for (const key of SPRITE_REQUIRED) {
      if (!(key in data)) problems.push(`必須キー "${key}" がありません`)
    }
    if (problems.length > 0) { fail(rel, problems.join('\n       ')); continue }

    if (!SPRITE_ID_PATTERN.test(data.id)) {
      problems.push(`id "${data.id}" が不正です（英小文字で始まり、英小文字・数字・_のみ）`)
    }
    if (data.id !== basename(file, '.json')) {
      problems.push(`id "${data.id}" とファイル名が一致していません`)
    }
    if (spriteIds.has(data.id)) {
      problems.push(`id "${data.id}" が他のスプライトと重複しています`)
    }
    spriteIds.add(data.id)

    if (!Number.isInteger(data.w) || data.w < 1) problems.push(`w は 1 以上の整数である必要があります`)
    if (!Number.isInteger(data.h) || data.h < 1) problems.push(`h は 1 以上の整数である必要があります`)

    const paletteKeys = new Set(Object.keys(data.palette ?? {}))
    for (const [pk, pv] of Object.entries(data.palette ?? {})) {
      if (typeof pv !== 'string' || !SPRITE_PALETTE_VAL.test(pv)) {
        problems.push(`palette."${pk}" の値 "${pv}" が不正です（#rrggbb / #rgb または @スロット名）`)
      }
      if (!SPRITE_PALETTE_KEY.test(pk)) {
        problems.push(`palette のキー "${pk}" が不正です（1文字・"." は透明として予約済み）`)
      }
    }

    if (Object.keys(data.frames ?? {}).length === 0) {
      problems.push(`frames が空です（少なくとも1フレーム必要）`)
    }
    for (const [frameName, rows] of Object.entries(data.frames ?? {})) {
      if (!Array.isArray(rows)) { problems.push(`frames."${frameName}" は配列である必要があります`); continue }
      if (typeof data.h === 'number' && rows.length !== data.h) {
        problems.push(`frames."${frameName}": 行数 ${rows.length} が h=${data.h} と一致していません`)
      }
      rows.forEach((row, i) => {
        if (typeof row !== 'string') { problems.push(`frames."${frameName}"[${i}] は文字列である必要があります`); return }
        if (typeof data.w === 'number' && row.length !== data.w) {
          problems.push(`frames."${frameName}"[${i}]: 長さ ${row.length} が w=${data.w} と一致していません`)
        }
        for (const ch of row) {
          if (ch !== '.' && !paletteKeys.has(ch)) {
            problems.push(`frames."${frameName}"[${i}]: 文字 "${ch}" が palette に定義されていません`)
          }
        }
      })
    }

    spriteFrames.set(data.id, new Set(Object.keys(data.frames ?? {})))

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
  }
  return spriteFrames
}

// Required keys for manual branch files
const MANUAL_REQUIRED = ['id', 'entries']

// ── Axis / theme lists from the JSON schema (single source of truth) ─────
const _genreSchema = JSON.parse(readFileSync('schemas/genre.schema.json', 'utf8'))
const VALID_AXES   = Object.keys(_genreSchema.properties.thresholds.properties)
const VALID_THEMES = _genreSchema.properties.theme.enum

// JSON Schema validator for genre definitions (draft-07)
const ajv = new Ajv({ strict: false, allErrors: true })
const validateGenreSchema = ajv.compile(_genreSchema)

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

    // JSON Schema 検証（feature enum、additionalProperties 等）
    const schemaValid = validateGenreSchema(data)
    if (!schemaValid && validateGenreSchema.errors) {
      for (const err of validateGenreSchema.errors) {
        const path = err.instancePath || '(root)'
        problems.push(`schema: ${path} ${err.message}`)
      }
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

// ── SFX definitions (src/data/sfx/*.json) ────────────────────────────────
function validateSfx() {
  const VALID_WAVES = ['sine', 'triangle', 'square', 'sawtooth']
  const VALID_FILTER_TYPES = ['lowpass', 'highpass', 'bandpass']
  const seenIds = new Set()

  for (const file of walkJson('src/data/sfx')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []

    // id とファイル名の一致: jump.json → id: "jump"
    const expectedId = basename(file, extname(file))
    if (typeof data.id !== 'string' || data.id.trim().length === 0) {
      problems.push('id が空文字列または未指定です')
    } else if (data.id !== expectedId) {
      problems.push(`id "${data.id}" がファイル名 "${expectedId}" と一致しません`)
    }

    // id 重複検出
    if (seenIds.has(data.id)) {
      problems.push(`id "${data.id}" が重複しています`)
    }
    if (typeof data.id === 'string' && data.id.length > 0) {
      seenIds.add(data.id)
    }

    if (!Array.isArray(data.tracks) || data.tracks.length === 0) {
      problems.push('tracks が空配列です')
    }
    for (let i = 0; i < (data.tracks ?? []).length; i++) {
      const t = data.tracks[i]
      if (t.kind === 'osc') {
        if (!VALID_WAVES.includes(t.wave)) problems.push(`tracks[${i}]: 不正な wave "${t.wave}"`)
        if (typeof t.freq !== 'number' || t.freq <= 0) problems.push(`tracks[${i}]: freq が正の数ではありません`)
        if (typeof t.durationSec !== 'number' || t.durationSec <= 0) problems.push(`tracks[${i}]: durationSec が正の数ではありません`)
        if (typeof t.volume !== 'number' || t.volume < 0 || t.volume > 1) problems.push(`tracks[${i}]: volume が 0〜1 の範囲にありません`)
        if (t.freqEnd !== undefined && (typeof t.freqEnd !== 'number' || t.freqEnd <= 0)) problems.push(`tracks[${i}]: freqEnd が正の数ではありません`)
      } else if (t.kind === 'noise') {
        if (typeof t.durationSec !== 'number' || t.durationSec <= 0) problems.push(`tracks[${i}]: durationSec が正の数ではありません`)
        if (typeof t.volume !== 'number' || t.volume < 0 || t.volume > 1) problems.push(`tracks[${i}]: volume が 0〜1 の範囲にありません`)
      } else {
        problems.push(`tracks[${i}]: 不正な kind "${t.kind}"`)
      }
      if (t.filter) {
        if (!VALID_FILTER_TYPES.includes(t.filter.type)) problems.push(`tracks[${i}].filter: 不正な type "${t.filter.type}"`)
        if (typeof t.filter.freq !== 'number' || t.filter.freq <= 0) problems.push(`tracks[${i}].filter: freq が正の数ではありません`)
        if (t.filter.freqEnd !== undefined && (typeof t.filter.freqEnd !== 'number' || t.filter.freqEnd <= 0)) problems.push(`tracks[${i}].filter.freqEnd: 正の数ではありません`)
        if (t.filter.q !== undefined && (typeof t.filter.q !== 'number' || t.filter.q < 0)) problems.push(`tracks[${i}].filter.q: 0 以上ではありません`)
      }
      if (t.delaySec !== undefined && (typeof t.delaySec !== 'number' || t.delaySec < 0)) problems.push(`tracks[${i}]: delaySec は 0 以上ではありません`)
    }
    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
  }
  return seenIds
}

// ── RPG バトルコンテンツ (docs/genre/rpg/07-data-schema.md) ─────────────
const _battleSkillSchema = JSON.parse(readFileSync('schemas/battle-skill.schema.json', 'utf8'))
const _battleTraitSchema = JSON.parse(readFileSync('schemas/battle-trait.schema.json', 'utf8'))
const _battleEnemySchema = JSON.parse(readFileSync('schemas/battle-enemy.schema.json', 'utf8'))
const _battleEffectSchema = JSON.parse(readFileSync('schemas/battle-effect.schema.json', 'utf8'))
const ALLOWED_OPS = _battleSkillSchema.allowedOps
const _battleBackgroundSchema = JSON.parse(readFileSync('schemas/battle-background.schema.json', 'utf8'))

const ajvBattle = new Ajv({ strict: false, allErrors: true })
const validateSkillSchema = ajvBattle.compile(_battleSkillSchema)
const validateTraitSchema = ajvBattle.compile(_battleTraitSchema)
const validateEnemySchema = ajvBattle.compile(_battleEnemySchema)
const validateEffectSchema = ajvBattle.compile(_battleEffectSchema)
const validateBackgroundSchema = ajvBattle.compile(_battleBackgroundSchema)
const PROBLEM_SEPARATOR = String.fromCharCode(10) + '       '

/** effect ノード配列を再帰的に走査し、参照する op / stat / repeat 構造の粗い妥当性を見る */
function walkEffectNodes(nodes, problems, path = 'effect') {
  if (!Array.isArray(nodes)) { problems.push(`${path} は配列である必要があります`); return }
  nodes.forEach((node, i) => {
    const p = `${path}[${i}]`
    if (!node || typeof node !== 'object') { problems.push(`${p}: オブジェクトが必要です`); return }
    if (!ALLOWED_OPS.includes(node.op)) { problems.push(`${p}.op "${node.op}" は未登録のオペレーションです`); return }
    if (node.op === 'repeat') {
      if (!Number.isInteger(node.times) || node.times < 1) problems.push(`${p}.times は1以上の整数である必要があります`)
      walkEffectNodes(node.body, problems, `${p}.body`)
      if (node.onFirstIteration) walkEffectNodes(node.onFirstIteration, problems, `${p}.onFirstIteration`)
      if (node.onLastIteration) walkEffectNodes(node.onLastIteration, problems, `${p}.onLastIteration`)
    }
    if (['damage', 'heal', 'shield'].includes(node.op)) {
      if (!node.scale || typeof node.scale.stat !== 'string' || typeof node.scale.rate !== 'number') {
        problems.push(`${p}: scale.stat / scale.rate が必要です`)
      }
    }
  })
}

/** src/data/rpg/skills/*.json を検証する。戻り値: { activeIds, passiveIds, referencedEffectIds } */
function validateBattleSkills() {
  const activeIds = new Set()
  const passiveIds = new Set()
  const referencedEffectIds = new Set()
  const referencedSfxIds = new Set()
  const seen = new Set()

  for (const file of walkJson('src/data/rpg/skills')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []
    const schemaValid = validateSkillSchema(data)
    if (!schemaValid && validateSkillSchema.errors) {
      for (const err of validateSkillSchema.errors) problems.push(`schema: ${err.instancePath || '(root)'} ${err.message}`)
    }
    if (data.id !== basename(file, '.json')) problems.push(`id "${data.id}" とファイル名が一致していません`)
    if (seen.has(data.id)) problems.push(`id "${data.id}" が他のスキルと重複しています`)
    seen.add(data.id)

    if (data.kind === 'active') {
      for (const key of ['element', 'cooldown', 'defaultFocus', 'focusRange']) {
        if (data[key] === undefined) problems.push(`kind="active" には "${key}" が必須です`)
      }
      activeIds.add(data.id)
    } else if (data.kind === 'passive') {
      for (const key of ['element', 'cooldown', 'defaultFocus', 'focusRange']) {
        if (data[key] !== undefined) problems.push(`kind="passive" に "${key}" は指定できません`)
      }
      passiveIds.add(data.id)
    }
    for (const fx of data.effects ?? []) referencedEffectIds.add(fx)
    if (data.sfx) {
      if (data.kind !== 'active') problems.push('sfx は kind="active" のスキルにのみ指定できます')
      for (const id of [data.sfx.cast, data.sfx.impact]) if (id) referencedSfxIds.add(id)
    }
    if (Array.isArray(data.effect)) walkEffectNodes(data.effect, problems)

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
  }
  return { activeIds, passiveIds, referencedEffectIds, referencedSfxIds }
}

/** src/data/rpg/traits/*.json を検証する。戻り値: 特性IDの集合 */
function validateBattleTraits() {
  const traitIds = new Set()
  const seen = new Set()

  for (const file of walkJson('src/data/rpg/traits')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []
    const schemaValid = validateTraitSchema(data)
    if (!schemaValid && validateTraitSchema.errors) {
      for (const err of validateTraitSchema.errors) problems.push(`schema: ${err.instancePath || '(root)'} ${err.message}`)
    }
    if (data.id !== basename(file, '.json')) problems.push(`id "${data.id}" とファイル名が一致していません`)
    if (seen.has(data.id)) problems.push(`id "${data.id}" が他の特性と重複しています`)
    seen.add(data.id)
    if (Array.isArray(data.effect)) walkEffectNodes(data.effect, problems)

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
    traitIds.add(data.id)
  }
  return traitIds
}

/** src/data/rpg/enemies/*.json を検証する（skill/trait の参照整合性を含む） */
function validateBattleEnemies(activeIds, passiveIds, traitIds, spriteFrames) {
  const seen = new Set()
  let bossCount = 0

  for (const file of walkJson('src/data/rpg/enemies')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []
    const schemaValid = validateEnemySchema(data)
    if (!schemaValid && validateEnemySchema.errors) {
      for (const err of validateEnemySchema.errors) problems.push(`schema: ${err.instancePath || '(root)'} ${err.message}`)
    }
    if (data.id !== basename(file, '.json')) problems.push(`id "${data.id}" とファイル名が一致していません`)
    if (seen.has(data.id)) problems.push(`id "${data.id}" が他の敵と重複しています`)
    seen.add(data.id)
    if (data.isBoss) bossCount++

    const frames = spriteFrames.get(data.sprite)
    if (!frames) {
      problems.push(`sprite: 存在しないスプライト "${data.sprite}" を参照しています（src/data/sprites/）`)
    } else {
      for (const required of ['idle', 'attack']) {
        if (!frames.has(required)) problems.push(`sprite "${data.sprite}" に frames."${required}" がありません`)
      }
    }

    for (const t of data.traits ?? []) {
      if (!traitIds.has(t)) problems.push(`traits: 存在しない特性 "${t}" を参照しています`)
    }
    const refIds = ref => (typeof ref === 'string' ? ref : ref?.id)
    const activeRefIds = new Set()
    for (const ref of data.activeSkills ?? []) {
      const id = refIds(ref)
      activeRefIds.add(id)
      if (!activeIds.has(id)) problems.push(`activeSkills: 存在しないアクティブスキル "${id}" を参照しています`)
    }
    for (const ref of data.passiveSkills ?? []) {
      const id = refIds(ref)
      if (!passiveIds.has(id)) problems.push(`passiveSkills: 存在しないパッシブスキル "${id}" を参照しています`)
    }
    for (const id of data.actionPattern ?? []) {
      if (!activeRefIds.has(id)) problems.push(`actionPattern: "${id}" は activeSkills に含まれていません`)
    }

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
  }

  if (bossCount === 0) {
    fail('src/data/rpg/enemies/*.json', 'isBoss:true の敵が1体もありません（ランがクリアできません）')
  }
}

/** src/data/rpg/battle-effects/*.json を検証する。戻り値: エフェクトIDの集合 */
function validateBattleEffects() {
  const effectIds = new Set()
  const effectTimings = new Map()
  const referencedSfxIds = new Set()
  const seen = new Set()

  for (const file of walkJson('src/data/rpg/battle-effects')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []
    const schemaValid = validateEffectSchema(data)
    if (!schemaValid && validateEffectSchema.errors) {
      for (const err of validateEffectSchema.errors) problems.push(`schema: ${err.instancePath || '(root)'} ${err.message}`)
    }
    if (data.id !== basename(file, '.json')) problems.push(`id "${data.id}" とファイル名が一致していません`)
    if (seen.has(data.id)) problems.push(`id "${data.id}" が他のエフェクトと重複しています`)
    seen.add(data.id)

    if (problems.length > 0) fail(rel, problems.join('\n       '))
    else ok(rel)
    if (data.sfx) referencedSfxIds.add(data.sfx)
    effectIds.add(data.id)
    effectTimings.set(data.id, data.timing)
  }
  return { effectIds, effectTimings, referencedSfxIds }
}

/**
 * スキルの effects[] は「使用者側で鳴らす発動演出」だけを並べる欄。
 * 着弾側（onHit / onHeal / onShield 等）は damage/heal/shield オペレーションが
 * 対象ごとに自前で発行するため、ここに書くと使用者自身が被弾したように見えてしまう。
 */
function validateBattleEffectReferences(referencedEffectIds, effectIds, effectTimings) {
  const rel = 'src/data/rpg/skills/*.json (effects 参照整合性)'
  const problems = []
  const missing = [...referencedEffectIds].filter(id => !effectIds.has(id))
  if (missing.length > 0) problems.push(`存在しないエフェクトを参照しています: ${missing.join(', ')}`)
  const notCast = [...referencedEffectIds].filter(id => effectIds.has(id) && effectTimings.get(id) !== 'onCast')
  if (notCast.length > 0) {
    problems.push(`effects[] には timing="onCast" のエフェクトのみ書けます（着弾演出は効果オペレーションが自動で出します）: ${notCast.join(', ')}`)
  }
  if (problems.length > 0) fail(rel, problems.join(PROBLEM_SEPARATOR))
  else ok(rel)
}

/** src/data/rpg/battle-backgrounds/*.json を検証する。戻り値: ボス専用でない背景の数 */
function validateBattleBackgrounds() {
  const seen = new Set()
  let normalCount = 0
  let bossCount = 0

  for (const file of walkJson('src/data/rpg/battle-backgrounds')) {
    const rel = relPath(file)
    const { data, error } = parseJson(file)
    if (data === null) { fail(rel, `JSON parse error: ${error}`); continue }

    const problems = []
    const schemaValid = validateBackgroundSchema(data)
    if (!schemaValid && validateBackgroundSchema.errors) {
      for (const err of validateBackgroundSchema.errors) problems.push(`schema: ${err.instancePath || '(root)'} ${err.message}`)
    }
    if (data.id !== basename(file, '.json')) problems.push(`id "${data.id}" とファイル名が一致していません`)
    if (seen.has(data.id)) problems.push(`id "${data.id}" が他の背景と重複しています`)
    seen.add(data.id)
    if (data.bossOnly) bossCount++
    else normalCount++

    if (problems.length > 0) fail(rel, problems.join(PROBLEM_SEPARATOR))
    else ok(rel)
  }

  const rel = 'src/data/rpg/battle-backgrounds/*.json (最低限の構成)'
  if (normalCount < 2) fail(rel, '通常戦闘用の背景が2種未満です（連戦で場所が変わらなくなります）')
  else if (bossCount === 0) fail(rel, 'bossOnly:true の背景がありません（ボス戦の場が通常戦と同じになります）')
  else ok(rel)
}

/** エフェクト/スキルが参照する SE の id がすべて実在するか */
function validateBattleSfxReferences(referencedSfxIds, sfxIds) {
  const rel = 'src/data/rpg/{battle-effects,skills}/*.json (sfx 参照整合性)'
  const missing = [...referencedSfxIds].filter(id => !sfxIds.has(id))
  if (missing.length > 0) fail(rel, `存在しない効果音を参照しています: ${missing.join(', ')}`)
  else ok(rel)
}

// ── Run ──────────────────────────────────────────────────────────────────
console.log('\n🔍  JSON Integrity Check\n')

// Config files
for (const file of walkJson('src/data/config')) {
  const name = basename(file)
  validateFile(file, SCHEMAS[name] ?? ['section'])
}
validatePixelart()

// Sprite definitions (PixelArt化: docs/pixelart-rebuild/)
const spriteFrames = validateSprites()

// Genre definitions (also collects ids for reference checks)
const genreIds = validateGenres()

// Manual deck files
for (const file of walkJson('src/data/manuals')) {
  validateFile(file, MANUAL_REQUIRED)
}
validateManualDeckRefs()

// SFX definitions
const sfxIds = validateSfx()

// RPG バトルコンテンツ
const {
  activeIds: battleActiveIds,
  passiveIds: battlePassiveIds,
  referencedEffectIds: battleReferencedEffectIds,
  referencedSfxIds: skillReferencedSfxIds,
} = validateBattleSkills()
const battleTraitIds = validateBattleTraits()
validateBattleEnemies(battleActiveIds, battlePassiveIds, battleTraitIds, spriteFrames)
const {
  effectIds: battleEffectIds,
  effectTimings: battleEffectTimings,
  referencedSfxIds: effectReferencedSfxIds,
} = validateBattleEffects()
validateBattleEffectReferences(battleReferencedEffectIds, battleEffectIds, battleEffectTimings)
validateBattleSfxReferences([...effectReferencedSfxIds, ...skillReferencedSfxIds], sfxIds)
validateBattleBackgrounds()

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
