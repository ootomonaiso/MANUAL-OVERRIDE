// tests/feature-*.test.mjs を全件実行するランナー。
// 各テストは `node tests/feature-x.test.mjs` 単体で完結する静的アサーションだが、
// シェルのグロブ展開に依存すると Windows で動かないため Node 側で列挙する。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = path.join(root, 'tests')
const files = fs.readdirSync(testsDir).filter(f => /^feature-.*\.test\.mjs$/.test(f)).sort()

let failed = 0
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(testsDir, file)], { stdio: 'inherit' })
  if (result.status !== 0) failed++
}

console.log(`\n${files.length - failed}/${files.length} feature tests passed`)
process.exit(failed > 0 ? 1 : 0)
