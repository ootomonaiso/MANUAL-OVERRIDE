#!/usr/bin/env node
/**
 * JSON integrity check for all game data files.
 * Validates syntax + required keys for known config schemas.
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

function validateFile(filePath, requiredKeys = []) {
  const rel = relative(process.cwd(), filePath).replace(/\\/g, '/')
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

// ── Run ──────────────────────────────────────────────────────────────────
console.log('\n🔍  JSON Integrity Check\n')

// Config files
for (const file of walkJson('src/data/config')) {
  const name = basename(file)
  validateFile(file, SCHEMAS[name] ?? ['section'])
}

// Manual deck files
for (const file of walkJson('src/data/manuals')) {
  validateFile(file, MANUAL_REQUIRED)
}

// Card pool / misc data files
for (const file of walkJson('src/data/cards')) {
  validateFile(file)
}

// Content directory (choices, etc.)
for (const file of walkJson('content')) {
  validateFile(file)
}

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
