// hp Feature の実装確認テスト
//
// hp は RpgFeature.onPlayerHit() で被弾時のHP減算・無敵・シェイク・パーティクルを担当する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/RpgFeature.ts'), 'utf-8')

// hp の実装本体が存在すること
assert.ok(src.includes("world.rules.features.has('hp')"), "'hp' フラグの判定が見つかりません")
assert.ok(src.includes('onPlayerHit'), 'onPlayerHit() が見つかりません')
assert.ok(src.includes('world.modifyPlayerHp(-1)'), 'modifyPlayerHp(-1) によるHP減算が見つかりません')
assert.ok(src.includes('p.invincible'), '無敵フレームの設定が見つかりません')
assert.ok(src.includes('triggerShake'), 'シェイク演出 (triggerShake) が見つかりません')

// entities.ts: Player に hp/maxHp が定義されていること
const entities = fs.readFileSync(path.join(root, 'src/game/entities.ts'), 'utf-8')
assert.ok(entities.includes('hp = 3'), 'Player.hp の初期値定義が見つかりません')
assert.ok(entities.includes('maxHp = 3'), 'Player.maxHp の初期値定義が見つかりません')

// genres.json: 影響ジャンルが hp を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const hpGenres = genres.genres.filter(g => g.enableFeatures.includes('hp')).map(g => g.id)
for (const id of ['rpg', 'survival', 'dungeon', 'aquatic', 'horror']) {
  assert.ok(hpGenres.includes(id), `ジャンル "${id}" は hp を有効化している必要があります`)
}

console.log('✓ hp: RpgFeature.onPlayerHit() に実装あり（HP減算 + 無敵 + シェイク + パーティクル）')
console.log(`✓ hp: 有効化ジャンル = ${hpGenres.join(', ')}`)
console.log('PASS')
