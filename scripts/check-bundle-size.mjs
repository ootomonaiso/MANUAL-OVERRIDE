#!/usr/bin/env node
/**
 * Post-build bundle size checker.
 * Reads dist/assets/, reports sizes, enforces budgets.
 * Writes bundle-report.md for CI PR comment.
 * Exit 1 if any budget is exceeded.
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { gzipSync } from 'zlib'

// ── Budgets (bytes) ───────────────────────────────────────────────────────
const BUDGETS = {
  totalJs:   800 * 1024,   // 800 KB
  totalCss:  100 * 1024,   // 100 KB
  totalDist: 2000 * 1024,  // 2 MB (entire dist)
}

// ─────────────────────────────────────────────────────────────────────────

function fmt(bytes) {
  if (bytes < 1024)           return `${bytes} B`
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function gzipSize(filePath) {
  try {
    return gzipSync(readFileSync(filePath)).length
  } catch {
    return 0
  }
}

function status(ok) {
  return ok ? '✅' : '❌'
}

function bar(value, budget, width = 20) {
  const ratio = Math.min(value / budget, 1)
  const filled = Math.round(ratio * width)
  const colour = ratio > 0.9 ? '🟥' : ratio > 0.7 ? '🟨' : '🟩'
  return colour.repeat(filled) + '⬜'.repeat(width - filled)
}

// ── Collect dist/assets ───────────────────────────────────────────────────
const ASSETS_DIR = 'dist/assets'
const DIST_DIR   = 'dist'

let assets
try {
  assets = readdirSync(ASSETS_DIR)
    .filter(f => !f.startsWith('.'))
    .map(name => {
      const full = join(ASSETS_DIR, name)
      const size = statSync(full).size
      const gz   = gzipSize(full)
      return { name, ext: extname(name), size, gz }
    })
    .sort((a, b) => b.size - a.size)
} catch (e) {
  console.error('❌  dist/assets not found — run `npm run build` first')
  process.exit(1)
}

// ── Totals ────────────────────────────────────────────────────────────────
const jsFiles  = assets.filter(f => f.ext === '.js')
const cssFiles = assets.filter(f => f.ext === '.css')

const totalJs  = jsFiles.reduce((s, f) => s + f.size, 0)
const totalCss = cssFiles.reduce((s, f) => s + f.size, 0)

// Walk entire dist for total size
function walkSize(dir) {
  let total = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    total += s.isDirectory() ? walkSize(full) : s.size
  }
  return total
}
const totalDist = walkSize(DIST_DIR)

const jsOk   = totalJs   <= BUDGETS.totalJs
const cssOk  = totalCss  <= BUDGETS.totalCss
const distOk = totalDist <= BUDGETS.totalDist
const allOk  = jsOk && cssOk && distOk

// ── Markdown report ───────────────────────────────────────────────────────
const assetRows = assets
  .map(f => `| \`${f.name}\` | ${fmt(f.size)} | ${fmt(f.gz)} |`)
  .join('\n')

const report = `## 📦 Bundle Size Report

### アセット詳細

| ファイル | サイズ | gzip後 |
|--------|-------:|-------:|
${assetRows}

### バジェット

| 種別 | 現在 | 上限 | 使用率 | 状態 |
|------|-----:|-----:|--------|:----:|
| JavaScript | ${fmt(totalJs)} | ${fmt(BUDGETS.totalJs)} | ${bar(totalJs, BUDGETS.totalJs)} | ${status(jsOk)} |
| CSS | ${fmt(totalCss)} | ${fmt(BUDGETS.totalCss)} | ${bar(totalCss, BUDGETS.totalCss)} | ${status(cssOk)} |
| dist 全体 | ${fmt(totalDist)} | ${fmt(BUDGETS.totalDist)} | ${bar(totalDist, BUDGETS.totalDist)} | ${status(distOk)} |

${allOk
  ? '✅ **すべてのバジェット内です**'
  : '❌ **バジェット超過があります。ビルド結果を確認してください。**'}
`

writeFileSync('bundle-report.md', report)

// ── Console output ────────────────────────────────────────────────────────
console.log('\n📦  Bundle Size Report\n')
console.log(`  JavaScript : ${fmt(totalJs).padStart(9)} / ${fmt(BUDGETS.totalJs)}  ${status(jsOk)}`)
console.log(`  CSS        : ${fmt(totalCss).padStart(9)} / ${fmt(BUDGETS.totalCss)}  ${status(cssOk)}`)
console.log(`  dist total : ${fmt(totalDist).padStart(9)} / ${fmt(BUDGETS.totalDist)}  ${status(distOk)}`)
console.log()

if (!allOk) {
  console.error('❌  Bundle size budget exceeded')
  process.exit(1)
} else {
  console.log('✅  All budgets OK')
}
