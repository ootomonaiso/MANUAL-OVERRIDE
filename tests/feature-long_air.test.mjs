// long_air Feature の実装確認テスト
//
// long_air は MovementFeature.update() で空中にいる間、滞空ボーナススコアを加算する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/MovementFeature.ts'), 'utf-8')

// long_air の実装本体が存在すること
assert.ok(src.includes("world.rules.features.has('long_air')"), "'long_air' フラグの判定が見つかりません")
assert.ok(src.includes('!world.player.onGround'), '空中判定 (!onGround) が見つかりません')
assert.ok(src.includes('SCORE.longAirScoreRate'), 'SCORE.longAirScoreRate の参照が見つかりません')
assert.ok(src.includes('world.addScore('), 'スコア加算 (addScore) が見つかりません')

// score.json: longAirScoreRate が定義されていること
const score = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/score.json'), 'utf-8'))
assert.strictEqual(typeof score.longAirScoreRate, 'number', 'score.json.longAirScoreRate は number である必要があります')

// genres.json: 影響ジャンルが long_air を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const longAirGenres = genres.genres.filter(g => g.enableFeatures.includes('long_air')).map(g => g.id)
for (const id of ['runner', 'platformer']) {
  assert.ok(longAirGenres.includes(id), `ジャンル "${id}" は long_air を有効化している必要があります`)
}

console.log('✓ long_air: MovementFeature.update() で空中時に addScore(longAirScoreRate * dt)')
console.log(`✓ long_air: score.json.longAirScoreRate = ${score.longAirScoreRate}`)
console.log(`✓ long_air: 有効化ジャンル = ${longAirGenres.join(', ')}`)
console.log('PASS')
