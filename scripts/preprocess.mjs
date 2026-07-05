#!/usr/bin/env node
/**
 * scripts/preprocess.mjs
 *
 * content/ フォルダの内容を src/data/ に変換する前処理スクリプト。
 * npm run build / npm run dev の前に自動実行される。
 *
 * 処理内容:
 *   1. content/genres/*.json  → 検証 → src/data/genres/<id>.json
 *      （デフォルト補完はロード時の normalizeGenreDef が行うため、ここでは検証とコピーのみ）
 *   2. content/choices/*.json → カード変換 → src/data/cards/user-cards.json
 *      （ゲームの選択肢はカードプール方式。旧 MANUAL_DECK 注入方式は廃止）
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT    = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'content')
const SRC     = join(ROOT, 'src', 'data')

const GENRE_SCHEMA_REF = '../../../schemas/genre.schema.json'
const CARDS_SCHEMA_REF = '../../../schemas/cards.schema.json'
const USER_CARDS_PATH  = join(SRC, 'cards', 'user-cards.json')

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

let _hasError = false
function error(msg) { console.error(`\n[エラー] ${msg}`); _hasError = true }
function warn(msg)  { console.warn(`[警告] ${msg}`) }
function ok(msg)    { console.log(`  ✓ ${msg}`) }

// ──────────────────────────────────────────────────────────────────────
// 1. ジャンル処理: 検証して src/data/genres/ にコピー
// ──────────────────────────────────────────────────────────────────────

function processGenres() {
  const genreDir = join(CONTENT, 'genres')
  const outDir   = join(SRC, 'genres')
  const items    = readJsonFiles(genreDir)
  if (items.length === 0) return

  console.log(`\nジャンル処理 (${items.length}件)`)
  mkdirSync(outDir, { recursive: true })

  for (const { file, data } of items) {
    if (!data.id) { error(`${file}: "id" が必要です`); continue }
    if (!data.label) { error(`${file}: "label" が必要です`); continue }
    if (!data.thresholds || typeof data.thresholds !== 'object') {
      error(`${file}: "thresholds" が必要です（空でよければ {} と書いてください）`); continue
    }
    if (!/^[a-z][a-z0-9_]*$/.test(data.id)) {
      error(`${file}: id は英小文字で始まり、英小文字・数字・_のみ使えます`); continue
    }

    const genre = { ...data, $schema: GENRE_SCHEMA_REF }
    delete genre['注意']

    const outPath = join(outDir, `${genre.id}.json`)
    writeFileSync(outPath, JSON.stringify(genre, null, 2) + '\n', 'utf-8')
    ok(`${file} → src/data/genres/${genre.id}.json`)
  }
}

// ──────────────────────────────────────────────────────────────────────
// 2. 選択肢処理: カードに変換して src/data/cards/user-cards.json に出力
//
// 入力は以下のいずれの形式でもよい:
//   - カードの配列               [ { "label": ..., "genreParams": ... }, ... ]
//   - カード単体                 { "label": ..., "genreParams": ... }
//   - cards ラッパー             { "cards": [ ... ] }
// 必須は label と genreParams のみ。id / manualText は自動補完される。
// ──────────────────────────────────────────────────────────────────────

function _slugify(name) {
  return basename(name, '.json').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
}

function processChoices() {
  const choiceDir = join(CONTENT, 'choices')
  const items     = readJsonFiles(choiceDir)

  if (items.length === 0) {
    // content 側が空になったら生成物も消す（取り残し防止）
    if (existsSync(USER_CARDS_PATH)) {
      rmSync(USER_CARDS_PATH)
      ok('content/choices/ が空のため src/data/cards/user-cards.json を削除しました')
    }
    return
  }

  console.log(`\n選択肢処理 (${items.length}ファイル)`)

  const cards = []
  const seenIds = new Set()

  for (const { file, data } of items) {
    const list = Array.isArray(data) ? data : (Array.isArray(data.cards) ? data.cards : [data])
    let index = 0

    for (const entry of list) {
      // 注意書きだけのエントリはスキップ
      if (!entry.label) continue
      index++

      if (entry.addTo) {
        warn(`${file}: "addTo" は旧方式のため無視されます（現在はカードプール方式で、全カードが自動的に抽選対象になります）`)
      }
      if (!entry.genreParams || typeof entry.genreParams !== 'object') {
        error(`${file}: "${entry.label}" に "genreParams" が必要です（例: { "tempo": 2 }）`); continue
      }

      const id = entry.id ?? `user-${_slugify(file)}-${index}`
      if (seenIds.has(id)) {
        error(`${file}: カードID "${id}" が重複しています`); continue
      }
      seenIds.add(id)

      const { addTo: _addTo, 注意: _note, ...rest } = entry
      cards.push({
        ...rest,
        id,
        manualText: entry.manualText ?? [entry.label],
      })
      ok(`"${entry.label}" → カード ${id} (${file})`)
    }
  }

  if (cards.length > 0) {
    const output = { $schema: CARDS_SCHEMA_REF, cards }
    writeFileSync(USER_CARDS_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8')
    ok(`→ src/data/cards/user-cards.json (${cards.length}枚)`)
  }
}

// ──────────────────────────────────────────────────────────────────────
// エントリポイント
// ──────────────────────────────────────────────────────────────────────

console.log('=== preprocess ===')
processGenres()
processChoices()

if (_hasError) {
  console.error('\n前処理に失敗しました。上記のエラーを修正してください。')
  process.exit(1)
} else {
  console.log('\n前処理完了')
}
