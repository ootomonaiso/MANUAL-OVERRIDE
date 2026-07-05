#!/usr/bin/env node
// Markdown 内の相対リンク（[text](path) 形式）がリポジトリ内の実在ファイルを指しているか検証する。
// http(s):// や mailto: 、# のみのアンカーは対象外。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.pw-browsers', '.claude'])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g

let errorCount = 0
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf-8')
  let m
  while ((m = LINK_RE.exec(text))) {
    let target = m[1].trim()
    if (/^(https?:|mailto:|#)/.test(target)) continue
    target = target.split('#')[0]
    if (!target) continue
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target))
    if (!fs.existsSync(resolved)) {
      console.error(`[broken link] ${path.relative(ROOT, file)}: "${target}" → ${path.relative(ROOT, resolved)} が存在しません`)
      errorCount++
    }
  }
}

if (errorCount > 0) {
  console.error(`\n${errorCount} 件のリンク切れが見つかりました。`)
  process.exit(1)
} else {
  console.log('✅  Markdown内の相対リンクはすべて実在するファイルを指しています')
}
