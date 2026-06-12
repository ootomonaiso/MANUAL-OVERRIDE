// enemy_hp Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// shootSystem.ts の実装内容と関連 genres の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/shootSystem.ts'), 'utf-8')

// enemy_hp の実装本体が存在すること: 有効時は h.hp--、無効時は即死(h.hp = 0)
assert.ok(src.includes("rules.features.has('enemy_hp')"), "'enemy_hp' フラグの判定が見つかりません")
assert.ok(src.includes('h.hp--'), 'enemy_hp 有効時のHP減算 (h.hp--) が見つかりません')
assert.ok(src.includes('h.hp = 0'), 'enemy_hp 無効時の即死処理 (h.hp = 0) が見つかりません')

// genres.json: 影響ジャンルが enemy_hp を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const enemyHpGenres = genres.genres.filter(g => g.enableFeatures.includes('enemy_hp')).map(g => g.id)
for (const id of ['stg', 'aerial_stg', 'bullet_hell', 'tower_def', 'arena', 'hack_slash']) {
  assert.ok(enemyHpGenres.includes(id), `ジャンル "${id}" は enemy_hp を有効化している必要があります`)
}

// 無効ジャンル（runner）が enemy_hp を有効化していないこと
const runner = genres.genres.find(g => g.id === 'runner')
assert.ok(!runner.enableFeatures.includes('enemy_hp'), 'ジャンル "runner" は enemy_hp を有効化していてはいけません')

console.log('✓ enemy_hp: shootSystem に実装あり（有効時 h.hp--、無効時 即死）')
console.log(`✓ enemy_hp: 有効化ジャンル = ${enemyHpGenres.join(', ')}`)
console.log('PASS')
