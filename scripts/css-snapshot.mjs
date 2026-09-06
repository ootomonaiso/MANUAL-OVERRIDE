#!/usr/bin/env node
/**
 * ビルド済みCSSの「意味的スナップショット」を出力する。リファクタリング用の検証ツール。
 *
 * 用途: docs/refactoring/ の作業では「描画結果を1pxも変えない」ことが絶対条件だが、
 * コンポーネントを分割・移動すると Vue の scoped スタイルのハッシュ（data-v-xxxxxxxx）と
 * ルールの出現順が必ず変わるため、CSSファイルを直接 diff しても差分だらけで判定できない。
 * そこでハッシュと順序を正規化し、「セレクタと宣言の集合」として比較できる形に落とす。
 *
 * 使い方:
 *   npm run build && node scripts/css-snapshot.mjs tmp/css-before.txt
 *   （リファクタリング作業）
 *   npm run build && node scripts/css-snapshot.mjs tmp/css-after.txt
 *   diff tmp/css-before.txt tmp/css-after.txt   # 差分ゼロなら描画は変わっていない
 *
 * 2つのファイルを渡すと比較まで行い、差異があれば終了コード1で落ちる:
 *   node scripts/css-snapshot.mjs --diff tmp/css-before.txt tmp/css-after.txt
 *
 * 判定できること / できないこと:
 *   ○ 宣言の増減・値の変更・セレクタの変更・@media 条件の変更
 *   ○ scoped ハッシュの変化に惑わされない
 *   × カスケード順序だけが変わったケース（同じ詳細度のルールが競合していると見逃す）
 *     → 順序に依存する変更を入れるときは、必ず実画面での目視確認も併せて行うこと
 */

import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const DIST_ASSETS = path.join(ROOT, 'dist', 'assets')

/** Vue の scoped スタイルが生成する属性セレクタ。ファイル単位で決まるので分割すると必ず変わる */
const SCOPE_ATTR_RE = /\[data-v-[0-9a-f]{6,10}\]/g
/** Vite がファイル名に付けるコンテンツハッシュ */
const ASSET_HASH_RE = /-[A-Za-z0-9_-]{8}\.(css|js)$/

function normalizeSelector(selector) {
  return selector
    .replace(SCOPE_ATTR_RE, '[scoped]')
    .split(',')
    .map(s => s.trim().replace(/\s+/g, ' '))
    .sort()
    .join(', ')
}

function normalizeDecls(rule) {
  const decls = []
  rule.each(node => {
    if (node.type === 'decl') {
      const value = node.value.replace(SCOPE_ATTR_RE, '[scoped]').replace(/\s+/g, ' ').trim()
      decls.push(`${node.prop.trim()}:${value}${node.important ? ' !important' : ''}`)
    }
  })
  return decls.sort().join('; ')
}

/** @media / @supports などの入れ子文脈を「条件の連なり」として表す */
function contextOf(node) {
  const parts = []
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule') parts.unshift(`@${p.name} ${p.params.replace(/\s+/g, ' ').trim()}`)
  }
  return parts.join(' >> ')
}

function snapshotCss(css, sourceLabel) {
  const root = postcss.parse(css, { from: sourceLabel })
  const lines = []

  root.walkRules(rule => {
    // @keyframes の中身（0% / to など）は「セレクタ」ではなくフレーム指定。文脈側で区別する
    const decls = normalizeDecls(rule)
    if (!decls) return
    const ctx = contextOf(rule)
    lines.push(`${ctx ? ctx + ' >> ' : ''}${normalizeSelector(rule.selector)} { ${decls} }`)
  })

  // 宣言を持たない at-rule（@import 等）も落とさない
  root.walkAtRules(at => {
    if (at.nodes && at.nodes.length > 0) return
    lines.push(`${contextOf(at)}@${at.name} ${at.params.replace(/\s+/g, ' ').trim()};`)
  })

  return lines
}

function collectDistCss() {
  if (!fs.existsSync(DIST_ASSETS)) {
    console.error(`dist/assets が見つかりません。先に \`npm run build\` を実行してください: ${DIST_ASSETS}`)
    process.exit(2)
  }
  const files = fs.readdirSync(DIST_ASSETS).filter(f => f.endsWith('.css')).sort()
  if (files.length === 0) {
    console.error('dist/assets に CSS がありません。ビルドが失敗している可能性があります。')
    process.exit(2)
  }
  return files.map(f => ({
    label: f.replace(ASSET_HASH_RE, '.$1'),   // ハッシュ付きファイル名は比較対象から外す
    css: fs.readFileSync(path.join(DIST_ASSETS, f), 'utf-8'),
  }))
}

function writeSnapshot(outPath) {
  const all = []
  for (const { label, css } of collectDistCss()) all.push(...snapshotCss(css, label))
  all.sort()

  fs.mkdirSync(path.dirname(path.resolve(ROOT, outPath)), { recursive: true })
  fs.writeFileSync(path.resolve(ROOT, outPath), all.join('\n') + '\n', 'utf-8')
  console.log(`✅  CSSスナップショットを書き出しました: ${outPath}（${all.length} ルール）`)
}

function diffSnapshots(beforePath, afterPath) {
  const read = p => fs.readFileSync(path.resolve(ROOT, p), 'utf-8').split('\n').filter(Boolean)
  const before = read(beforePath)
  const after = read(afterPath)

  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  const removed = before.filter(l => !afterSet.has(l))
  const added = after.filter(l => !beforeSet.has(l))

  if (removed.length === 0 && added.length === 0) {
    console.log(`✅  CSSに意味的な差分はありません（${before.length} ルール）`)
    return 0
  }

  for (const l of removed) console.error(`- ${l}`)
  for (const l of added) console.error(`+ ${l}`)
  console.error(`\n❌  削除 ${removed.length} 件 / 追加 ${added.length} 件の差分があります。`)
  console.error('   リファクタリングでは描画結果を変えないことが条件です。意図した変更でなければ戻してください。')
  return 1
}

const args = process.argv.slice(2)
if (args[0] === '--diff') {
  if (args.length !== 3) {
    console.error('使い方: node scripts/css-snapshot.mjs --diff <before> <after>')
    process.exit(2)
  }
  process.exit(diffSnapshots(args[1], args[2]))
} else {
  writeSnapshot(args[0] ?? 'tmp/css-snapshot.txt')
}
