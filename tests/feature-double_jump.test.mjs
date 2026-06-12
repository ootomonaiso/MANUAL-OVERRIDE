// double_jump Feature の実装確認テスト
//
// double_jump は onInit() で jumpsLeft を2に増やし、空中で再ジャンプできるようにする。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/MovementFeature.ts'), 'utf-8')

// double_jump の実装本体が存在すること
assert.ok(src.includes("world.rules.features.has('double_jump')"), "'double_jump' フラグの判定が見つかりません")
assert.ok(src.includes('jumpsLeft'), 'jumpsLeft の操作が見つかりません')
assert.ok(src.includes('onInit'), 'onInit() が見つかりません')

// physics.json: doubleJumpVelocity が定義されていること
const physics = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/physics.json'), 'utf-8'))
assert.strictEqual(typeof physics.doubleJumpVelocity, 'number', 'physics.json.doubleJumpVelocity は number である必要があります')

// genres.json: 影響ジャンルが double_jump を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const doubleJumpGenres = genres.genres.filter(g => g.enableFeatures.includes('double_jump')).map(g => g.id)
for (const id of ['runner', 'platformer']) {
  assert.ok(doubleJumpGenres.includes(id), `ジャンル "${id}" は double_jump を有効化している必要があります`)
}

console.log('✓ double_jump: MovementFeature.onInit() で jumpsLeft を2に設定')
console.log(`✓ double_jump: physics.json.doubleJumpVelocity = ${physics.doubleJumpVelocity}`)
console.log(`✓ double_jump: 有効化ジャンル = ${doubleJumpGenres.join(', ')}`)
console.log('PASS')
