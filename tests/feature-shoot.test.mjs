// shoot Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// shootSystem.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/shootSystem.ts'), 'utf-8')

// shoot の実装本体が存在すること
assert.ok(src.includes("rules.features.has('shoot')"), "'shoot' フラグの判定が見つかりません")
assert.ok(src.includes('new Bullet('), '弾の生成 (new Bullet) が見つかりません')
assert.ok(src.includes('shotCooldown'), 'shotCooldown による連射制御が見つかりません')

// shoot.json に必要なパラメータが揃っていること
const shoot = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/shoot.json'), 'utf-8'))
for (const key of ['bulletSpeed', 'bulletWidth', 'bulletHeight', 'shotCooldown', 'baseScorePerKill']) {
  assert.strictEqual(typeof shoot[key], 'number', `shoot.json.${key} は number である必要があります`)
}

// genres.json: 影響ジャンルが shoot を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const shootGenres = genres.genres.filter(g => g.enableFeatures.includes('shoot')).map(g => g.id)
for (const id of ['stg', 'aerial_stg', 'bullet_hell', 'bullet_runner', 'arena', 'hack_slash']) {
  assert.ok(shootGenres.includes(id), `ジャンル "${id}" は shoot を有効化している必要があります`)
}

// 無効ジャンル（base, runner）が shoot を有効化していないこと
for (const id of ['base', 'runner']) {
  const g = genres.genres.find(g => g.id === id)
  assert.ok(!g.enableFeatures.includes('shoot'), `ジャンル "${id}" は shoot を有効化していてはいけません`)
}

console.log('✓ shoot: shootSystem に実装あり（弾発射 + shotCooldown 制御）')
console.log('✓ shoot: shoot.json に bulletSpeed/bulletWidth/bulletHeight/shotCooldown/baseScorePerKill あり')
console.log(`✓ shoot: 有効化ジャンル = ${shootGenres.join(', ')}`)
console.log('PASS')
