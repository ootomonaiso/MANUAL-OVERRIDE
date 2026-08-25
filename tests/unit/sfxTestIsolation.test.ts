/**
 * tests/unit/sfxTestIsolation.test.ts
 *
 * production コード（src/tools/ 以外）が src/tools/ を import していないことを
 * 静的に検証する。sfx-test（テスト再生モード）と本番ゲームの経路を完全に分離するという
 * docs/sfx-test-mode.md の絶対条件1・2を、ESLint（no-restricted-imports）とは別経路で
 * 機械的に保証する。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SRC_ROOT = join(__dirname, '..', '..', 'src')

const TOOLS_IMPORT_PATTERN = /from\s+['"][^'"]*\/tools\//

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'tools') continue // sfx-test / genre-lab 自身のディレクトリは対象外
      collectSourceFiles(full, out)
    } else if (/\.(ts|vue)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('sfx-test isolation', () => {
  it('src/tools/ 以外の production コードは src/tools/ を import していない', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const content = readFileSync(file, 'utf-8')
      if (TOOLS_IMPORT_PATTERN.test(content)) {
        offenders.push(relative(SRC_ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })
})
