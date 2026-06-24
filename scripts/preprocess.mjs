#!/usr/bin/env node
/**
 * scripts/preprocess.mjs
 *
 * content/ フォルダの内容を src/data/ に変換する前処理スクリプト。
 * npm run build / npm run dev の前に自動実行される。
 *
 * 処理内容:
 *   1. content/genres/*.json → デフォルト補完 → src/data/genres/
 *   2. content/choices/*.json → 選択肢注入 → src/data/manuals/user-choices.json
 *   3. content/choices/_SLOTS.md を生成（注入可能ポイント一覧）
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT    = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'content')
const SRC     = join(ROOT, 'src', 'data')

// ──────────────────────────────────────────────────────────────────────
// ジャンルのデフォルト値
// ──────────────────────────────────────────────────────────────────────
const GENRE_DEFAULTS = {
  enableFeatures:  [],
  disableFeatures: [],
  scoreFormula:    'distance * 1.0 + survivedSec * 5',
  theme:           'plain',
  bgColor:         '#1a1a2e',
  gravity:         1600,
  endingFlavor:    '',
}

// ──────────────────────────────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────────────────────────────

function readJsonFiles(dir, skipPrefix = '_') {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith(skipPrefix))
    .map(f => {
      const raw = readFileSync(join(dir, f), 'utf-8')
      try {
        return { file: f, data: JSON.parse(raw) }
      } catch (e) {
        error(`${f} の JSON パースに失敗しました: ${e.message}`)
        return null
      }
    })
    .filter(Boolean)
}

function readAllManualDeck() {
  const deck = {}
  const manualDir = join(SRC, 'manuals')
  if (!existsSync(manualDir)) return deck
  const files = readdirSync(manualDir)
    .filter(f => f.endsWith('.json') && f !== 'user-choices.json')
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(manualDir, f), 'utf-8'))
      for (const entry of raw.entries || []) {
        const key = entry.key ?? entry.version
        if (key) deck[key] = { ...entry, _sourceFile: f }
      }
    } catch { /* skip invalid */ }
  }
  return deck
}

let _hasError = false
function error(msg) { console.error(`\n[エラー] ${msg}`); _hasError = true }
function warn(msg)  { console.warn(`[警告] ${msg}`) }
function ok(msg)    { console.log(`  ✓ ${msg}`) }

// ──────────────────────────────────────────────────────────────────────
// 1. ジャンル処理
// ──────────────────────────────────────────────────────────────────────

function processGenres() {
  const genreDir = join(CONTENT, 'genres')
  const outDir   = join(SRC, 'genres')
  const items    = readJsonFiles(genreDir)
  if (items.length === 0) return

  console.log(`\nジャンル処理 (${items.length}件)`)
  mkdirSync(outDir, { recursive: true })

  for (const { file, data } of items) {
    // 必須チェック
    if (!data.id) { error(`${file}: "id" が必要です`); continue }
    if (!data.label) { error(`${file}: "label" が必要です`); continue }
    if (!data.thresholds || typeof data.thresholds !== 'object') {
      error(`${file}: "thresholds" が必要です（空でよければ {} と書いてください）`); continue
    }
    if (!/^[a-z][a-z0-9_]*$/.test(data.id)) {
      error(`${file}: id は英小文字で始まり、英小文字・数字・_のみ使えます`); continue
    }

    // デフォルト補完
    const genre = {
      $schema: '../../../../schemas/genre.schema.json',
      ...GENRE_DEFAULTS,
      ...data,
      manualReveal: data.manualReveal ?? `これは${data.label}になりました。`,
    }

    // $schema と注意書きフィールドは除去
    delete genre['注意']

    const outPath = join(outDir, `${genre.id}.json`)
    writeFileSync(outPath, JSON.stringify(genre, null, 2) + '\n', 'utf-8')
    ok(`${file} → src/data/genres/${genre.id}.json`)
  }
}

// ──────────────────────────────────────────────────────────────────────
// 2. 選択肢注入処理
// ──────────────────────────────────────────────────────────────────────

function processChoices() {
  const choiceDir = join(CONTENT, 'choices')
  const items     = readJsonFiles(choiceDir)
  if (items.length === 0) return

  console.log(`\n選択肢処理 (${items.length}ファイル)`)

  // 既存のマニュアルデッキを読み込む
  const deck = readAllManualDeck()

  const newEntries   = []
  const overrideKeys = new Set()
  let   counter      = 0

  for (const { file, data } of items) {
    const list = Array.isArray(data) ? data : [data]

    for (const inj of list) {
      // 注意書きフィールドはスキップ
      if (!inj.addTo && !inj.label) continue

      const { addTo, label, genreParams, hint } = inj

      if (!addTo) { error(`${file}: "addTo" が必要です`); continue }
      if (!label) { error(`${file}: "label" が必要です`); continue }
      if (!genreParams || typeof genreParams !== 'object') {
        error(`${file}: "genreParams" が必要です（例: { "tempo": 2 }）`); continue
      }

      const targetEntry = deck[addTo]
      if (!targetEntry) {
        const available = Object.keys(deck).slice(0, 8).join(', ')
        error(`${file}: バージョン "${addTo}" が見つかりません。\n  利用可能な例: ${available} ...\n  完全な一覧: content/choices/_SLOTS.md`)
        continue
      }

      // ターミナルバージョンを生成（この選択肢を選ぶと収束判定へ）
      counter++
      const terminalKey = `user-terminal-${counter}`

      newEntries.push({
        key:        terminalKey,
        version:    targetEntry.version,
        manualText: targetEntry.manualText ?? ['...'],
        hazards:    targetEntry.hazards ?? { colors: ['red'], safeColors: ['blue'] },
        choices:    [],
      })

      // 元のバージョンに選択肢を追加したコピーを作成（上書き登録）
      if (!overrideKeys.has(addTo)) {
        overrideKeys.add(addTo)
        // ターゲットのコピーを上書きエントリとして登録
        newEntries.push({
          ...targetEntry,
          key:     targetEntry.key ?? addTo,
          choices: [...(targetEntry.choices ?? [])],
          _sourceFile: undefined,
        })
      }

      // 上書きエントリに選択肢を追加
      const overrideEntry = newEntries.find(
        e => (e.key ?? e.version) === addTo
      )
      if (overrideEntry) {
        overrideEntry.choices.push({
          label,
          next: terminalKey,
          genreParams,
          ...(hint ? { hint } : {}),
        })
      }

      ok(`"${label}" → ${addTo} に追加 (${file})`)
    }
  }

  if (newEntries.length > 0) {
    const outPath = join(SRC, 'manuals', 'user-choices.json')
    const output  = {
      id:          'user-choices',
      description: 'content/choices/ から自動生成（npm run preprocess）',
      entries:     newEntries.map(e => {
        const { _sourceFile: _, ...rest } = e
        return rest
      }),
    }
    writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8')
    ok(`→ src/data/manuals/user-choices.json (${newEntries.length}エントリ)`)
  }
}

// ──────────────────────────────────────────────────────────────────────
// 3. _SLOTS.md 生成（注入可能ポイント一覧）
// ──────────────────────────────────────────────────────────────────────

function generateSlots() {
  const deck    = readAllManualDeck()
  const keys    = Object.keys(deck).sort()
  const outPath = join(CONTENT, 'choices', '_SLOTS.md')

  const lines = [
    '# 選択肢の注入ポイント一覧',
    '',
    '`content/choices/*.json` の `addTo` に指定できるバージョンキーです。',
    '`npm run preprocess` を実行するたびに更新されます。',
    '',
    '| キー | バージョン | 現在の選択肢数 | ファイル |',
    '|---|---|---|---|',
  ]

  for (const key of keys) {
    const e = deck[key]
    const choices = (e.choices ?? []).length
    lines.push(`| \`${key}\` | ${e.version ?? key} | ${choices}個 | ${e._sourceFile ?? '-'} |`)
  }

  writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8')
  ok(`→ content/choices/_SLOTS.md (${keys.length}件)`)
}

// ──────────────────────────────────────────────────────────────────────
// エントリポイント
// ──────────────────────────────────────────────────────────────────────

console.log('=== preprocess ===')
processGenres()
processChoices()
generateSlots()

if (_hasError) {
  console.error('\n前処理に失敗しました。上記のエラーを修正してください。')
  process.exit(1)
} else {
  console.log('\n前処理完了')
}
