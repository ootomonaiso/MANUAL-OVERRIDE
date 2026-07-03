// src/data/genres/*.json が実際にゲームへロードされる唯一のジャンル定義（src/data/config.ts 参照）。
// src/data/config/genres.json の `genres` 配列は themeColors 抽出後は使われない死んだデータなので、
// テストで参照してはいけない（参照すると実際の挙動と無関係に緑になってしまう）。
import fs from 'node:fs'
import path from 'node:path'

export function loadGenres(root) {
  const dir = path.join(root, 'src/data/genres')
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')))
}
