#!/usr/bin/env node
/**
 * scripts/new-genre.mjs
 *
 * 新しいジャンルを content/genres/ にスキャフォルドする。
 *
 * 使い方:
 *   npm run new-genre                    # 対話式
 *   npm run new-genre -- my_genre "私のジャンル"   # 引数で即生成
 */

import { createInterface } from 'node:readline'
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT       = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR    = resolve(ROOT, 'content', 'genres')
const SCHEMA_REF = '../../schemas/genre.schema.json'

// テーマ・軸の一覧は schemas/genre.schema.json が唯一の定義元
const _schema = JSON.parse(
  readFileSync(resolve(ROOT, 'schemas', 'genre.schema.json'), 'utf-8')
)
const THEMES = _schema.properties.theme.enum
const PARAMS = Object.keys(_schema.properties.thresholds.properties)

// existsSync→writeFileSync 間の TOCTOU を避けるため flag:'wx' で原子的に生成する
function writeGenreFile(outPath, genre) {
  try {
    writeFileSync(outPath, JSON.stringify(genre, null, 2) + '\n', { encoding: 'utf-8', flag: 'wx' })
  } catch (e) {
    if (e.code === 'EEXIST') {
      console.error(`エラー: ${outPath} は既に存在します`)
      process.exit(1)
    }
    throw e
  }
}

// ── 引数モード（対話なし）──────────────────────────────────────────────
const [,, argId, argLabel] = process.argv
if (argId && argLabel) {
  if (!/^[a-z][a-z0-9_]*$/.test(argId)) {
    console.error('エラー: IDは英小文字で始まり、英小文字・数字・_のみ使えます')
    process.exit(1)
  }
  const outPath = resolve(OUT_DIR, `${argId}.json`)
  const genre = {
    $schema: SCHEMA_REF,
    id: argId,
    label: argLabel,
    thresholds: {},
  }
  writeGenreFile(outPath, genre)
  console.log(`✓ content/genres/${argId}.json を作成しました`)
  console.log(`  thresholds を設定してから npm run build を実行してください`)
  process.exit(0)
}

// ── 対話モード──────────────────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q, def) => new Promise(r =>
  rl.question(def !== undefined ? `${q} [${def}]: ` : `${q}: `, a => r(a.trim() || def || ''))
)

console.log('\n=== 新しいジャンルを作成 ===')
console.log('content/genres/ に JSON ファイルを生成します。\n')

const id = await ask('ジャンルID (英小文字。例: lava_world)')
if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) {
  console.error('エラー: IDは英小文字で始まり、英小文字・数字・_のみ使えます')
  rl.close(); process.exit(1)
}

const outPath = resolve(OUT_DIR, `${id}.json`)

const label  = await ask('表示名 (例: 溶岩ワールド)')
const threshRaw = await ask(
  `収束条件 (例: enemy:4,survive:3 / パラメータ: ${PARAMS.join(' ')})`,
  ''
)

const thresholds = {}
for (const pair of threshRaw.split(',').map(s => s.trim()).filter(Boolean)) {
  const [k, v] = pair.split(':')
  if (PARAMS.includes(k?.trim()) && v) thresholds[k.trim()] = Number(v.trim())
}

console.log('\nテーマ（説明書UIの見た目）:')
THEMES.forEach((t, i) => console.log(`  ${i + 1}. ${t}`))
const themeIdx = parseInt(await ask('番号')) - 1
const theme    = THEMES[themeIdx] ?? 'plain'

const genre = {
  $schema: SCHEMA_REF,
  id,
  label,
  thresholds,
  theme,
}

rl.close()
writeGenreFile(outPath, genre)

console.log(`\n✓ content/genres/${id}.json を作成しました`)
console.log('\n次のステップ:')
console.log('  1. 必要なら enableFeatures / visual などを編集')
console.log('  2. content/choices/ に選択肢を追加してプレイヤーを誘導')
console.log('  3. npm run build')
