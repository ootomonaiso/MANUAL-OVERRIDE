// exp Feature の実装確認テスト
//
// exp は RpgFeature.update() の item_pickup 処理内で、expアイテム取得時に
// p.exp を加算しスコアに反映する。scoreFormula 側でも exp 変数が利用される。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/RpgFeature.ts'), 'utf-8')

// exp の実装本体が存在すること
assert.ok(src.includes("item.type === 'exp'"), "exp アイテム取得判定が見つかりません")
assert.ok(src.includes('p.exp += SPAWN.expItemExpGain'), 'p.exp の加算が見つかりません')
assert.ok(src.includes('SPAWN.expItemScore'), 'expItemScore によるスコア加算が見つかりません')

// entities.ts: Player に exp が定義されていること
const entities = fs.readFileSync(path.join(root, 'src/game/entities.ts'), 'utf-8')
assert.ok(entities.includes('exp = 0'), 'Player.exp の初期値定義が見つかりません')

// spawn.json: expItemExpGain / expItemScore が定義されていること
const spawn = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/spawn.json'), 'utf-8'))
for (const key of ['expItemExpGain', 'expItemScore']) {
  assert.strictEqual(typeof spawn[key], 'number', `spawn.json.${key} は number である必要があります`)
}

// genres.json: 影響ジャンルが exp を有効化し、scoreFormula で exp を使用していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const expGenres = genres.genres.filter(g => g.enableFeatures.includes('exp')).map(g => g.id)
for (const id of ['rpg', 'dungeon', 'hack_slash', 'idle']) {
  assert.ok(expGenres.includes(id), `ジャンル "${id}" は exp を有効化している必要があります`)
  const g = genres.genres.find(g => g.id === id)
  assert.ok(g.scoreFormula.includes('exp'), `ジャンル "${id}" の scoreFormula は exp を使用している必要があります`)
}

console.log('✓ exp: RpgFeature.update() の item_pickup で p.exp を加算 + addScore')
console.log(`✓ exp: spawn.json.expItemExpGain = ${spawn.expItemExpGain}, expItemScore = ${spawn.expItemScore}`)
console.log(`✓ exp: 有効化ジャンル = ${expGenres.join(', ')}`)
console.log('PASS')
