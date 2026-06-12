// auto_run Feature の実装確認テスト
//
// auto_run は MovementFeature.preUpdate() で「常に右方向へ進む」処理を担当する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/MovementFeature.ts'), 'utf-8')

// auto_run の実装本体が存在すること
assert.ok(src.includes("r.features.has('auto_run')"), "'auto_run' フラグの判定が見つかりません")
assert.ok(src.includes('isAutoRun'), 'isAutoRun フラグの参照が見つかりません')
assert.ok(src.includes('movingRight = isAutoRun || input.keys.has(rightKey)'), 'auto_run 時に強制右移動する処理が見つかりません')

// genres.json: 影響ジャンルが auto_run を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const autoRunGenres = genres.genres.filter(g => g.enableFeatures.includes('auto_run')).map(g => g.id)
for (const id of ['base', 'runner', 'racing', 'bullet_runner']) {
  assert.ok(autoRunGenres.includes(id), `ジャンル "${id}" は auto_run を有効化している必要があります`)
}

// disableFeatures: rpg/platformer など手動移動ジャンルは auto_run を無効化していること
for (const id of ['rpg', 'platformer', 'puzzle']) {
  const g = genres.genres.find(g => g.id === id)
  assert.ok(g.disableFeatures.includes('auto_run'), `ジャンル "${id}" は disableFeatures に auto_run を含む必要があります`)
}

console.log('✓ auto_run: MovementFeature に実装あり（有効時は右移動を強制）')
console.log(`✓ auto_run: 有効化ジャンル = ${autoRunGenres.join(', ')}`)
console.log('PASS')
