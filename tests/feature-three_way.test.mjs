// three_way Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// shootSystem.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/shootSystem.ts'), 'utf-8')

// three_way の実装本体が存在すること（縦・横モード両方）
assert.ok(src.includes("rules.features.has('three_way')"), "'three_way' フラグの判定が見つかりません")
assert.ok(src.includes('threeWaySpeedRatio'), 'threeWaySpeedRatio の参照が見つかりません')
assert.ok(src.includes('threeWayYRatio'), 'threeWayYRatio の参照が見つかりません')

// 縦・横モード両方で3発生成されること（new Bullet が3回連続で呼ばれる箇所が2か所あるはず）
const threeWayBlocks = src.match(/three_way'\)\) \{[\s\S]*?\n {6}\}/g) ?? []
assert.strictEqual(threeWayBlocks.length, 2, 'three_way の分岐は縦・横の2モード分必要です')
for (const block of threeWayBlocks) {
  const bulletCount = (block.match(/new Bullet\(/g) ?? []).length
  assert.strictEqual(bulletCount, 3, 'three_way は3発の弾を生成する必要があります')
}

// shoot.json に必要なパラメータが揃っていること
const shoot = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/shoot.json'), 'utf-8'))
for (const key of ['threeWaySpeedRatio', 'threeWayYRatio']) {
  assert.strictEqual(typeof shoot[key], 'number', `shoot.json.${key} は number である必要があります`)
}

// genres.json: stg ジャンルが three_way を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const threeWayGenres = genres.genres.filter(g => g.enableFeatures.includes('three_way')).map(g => g.id)
assert.ok(threeWayGenres.includes('stg'), 'ジャンル "stg" は three_way を有効化している必要があります')

console.log('✓ three_way: shootSystem に実装あり（縦/横モードそれぞれ3way弾を生成）')
console.log('✓ three_way: shoot.json に threeWaySpeedRatio/threeWayYRatio あり')
console.log(`✓ three_way: 有効化ジャンル = ${threeWayGenres.join(', ')}`)
console.log('PASS')
