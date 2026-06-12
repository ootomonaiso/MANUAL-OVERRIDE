// slow_precise Feature の実装確認テスト
//
// slow_precise は MovementFeature.preUpdate() で移動速度を slowPreciseRatio 倍に減速する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/MovementFeature.ts'), 'utf-8')

// slow_precise の実装本体が存在すること
assert.ok(src.includes("r.features.has('slow_precise')"), "'slow_precise' フラグの判定が見つかりません")
assert.ok(src.includes('PHYSICS.slowPreciseRatio'), 'PHYSICS.slowPreciseRatio の参照が見つかりません')
assert.ok(src.includes('PLAYER_PHYSICS.runSpeed * PHYSICS.slowPreciseRatio'), 'runSpeed への倍率適用が見つかりません')

// physics.json: slowPreciseRatio が 0〜1 の範囲であること
const physics = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/physics.json'), 'utf-8'))
assert.strictEqual(typeof physics.slowPreciseRatio, 'number', 'physics.json.slowPreciseRatio は number である必要があります')
assert.ok(physics.slowPreciseRatio > 0 && physics.slowPreciseRatio < 1, 'slowPreciseRatio は 0〜1 の範囲である必要があります')

// genres.json: 影響ジャンルが slow_precise を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const slowGenres = genres.genres.filter(g => g.enableFeatures.includes('slow_precise')).map(g => g.id)
for (const id of ['rpg', 'dungeon', 'aquatic', 'horror', 'stealth_action']) {
  assert.ok(slowGenres.includes(id), `ジャンル "${id}" は slow_precise を有効化している必要があります`)
}

console.log('✓ slow_precise: MovementFeature に実装あり（runSpeed × slowPreciseRatio）')
console.log(`✓ slow_precise: physics.json.slowPreciseRatio = ${physics.slowPreciseRatio}`)
console.log(`✓ slow_precise: 有効化ジャンル = ${slowGenres.join(', ')}`)
console.log('PASS')
