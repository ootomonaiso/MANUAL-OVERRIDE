// spread_shot Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// shootSystem.ts の実装内容と関連 config / genres の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/shootSystem.ts'), 'utf-8')

// spread_shot の実装本体が存在すること（縦・横モード両方）
const matches = [...src.matchAll(/rules\.features\.has\('spread_shot'\)/g)]
assert.strictEqual(matches.length, 2, "'spread_shot' フラグの判定は縦・横の2モード分必要です")
assert.ok(src.includes('spreadShotCount'), 'spreadShotCount の参照が見つかりません')
assert.ok(src.includes('spreadAngleStepRad'), 'spreadAngleStepRad の参照が見つかりません')

// shoot.json に必要なパラメータが揃っていること
const shoot = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/shoot.json'), 'utf-8'))
for (const key of ['spreadShotCount', 'spreadAngleStepRad']) {
  assert.strictEqual(typeof shoot[key], 'number', `shoot.json.${key} は number である必要があります`)
}
assert.ok(shoot.spreadShotCount >= 3, 'spreadShotCount は扇状弾として3以上である必要があります')

// genres.json: 影響ジャンルが spread_shot を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const spreadGenres = genres.genres.filter(g => g.enableFeatures.includes('spread_shot')).map(g => g.id)
for (const id of ['aerial_stg', 'bullet_hell']) {
  assert.ok(spreadGenres.includes(id), `ジャンル "${id}" は spread_shot を有効化している必要があります`)
}

// 縦・横モードどちらも spreadShotCount 個の弾を for ループで生成すること
const spreadBlocks = src.match(/spread_shot'\)\) \{[\s\S]*?\n {6}\}/g) ?? []
assert.strictEqual(spreadBlocks.length, 2, 'spread_shot の分岐は縦・横の2モード分必要です')
for (const block of spreadBlocks) {
  assert.ok(block.includes('for (let i = 0; i < SHOOT.spreadShotCount; i++)'), 'spreadShotCount 回のループで弾を生成する必要があります')
  assert.ok(block.includes('new Bullet('), '弾の生成 (new Bullet) が見つかりません')
}

console.log('✓ spread_shot: shootSystem に実装あり（扇状 spreadShotCount 発の弾を生成）')
console.log('✓ spread_shot: shoot.json に spreadShotCount/spreadAngleStepRad あり')
console.log(`✓ spread_shot: 有効化ジャンル = ${spreadGenres.join(', ')}`)
console.log('PASS')
