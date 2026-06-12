// just_input Feature の実装確認テスト
//
// just_input はビートタイミングに合わせたジャンプ/シュート入力を評価し、
// quality > 0.5 のとき大幅ボーナスを加算する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const featureSrc = fs.readFileSync(path.join(root, 'src/game/systems/RhythmFeature.ts'), 'utf-8')
const systemSrc = fs.readFileSync(path.join(root, 'src/game/systems/rhythmSystem.ts'), 'utf-8')

// just_input の実装本体が存在すること
assert.ok(featureSrc.includes("r.features.has('just_input')"), "'just_input' フラグの判定が見つかりません")
assert.ok(featureSrc.includes('evaluateTiming'), 'evaluateTiming の呼び出しが見つかりません')
assert.ok(featureSrc.includes('quality > 0.5'), 'quality > 0.5 の判定が見つかりません')
assert.ok(featureSrc.includes('world.addBeatHit()'), 'addBeatHit の呼び出しが見つかりません')
assert.ok(featureSrc.includes('world.addScore(bonus)'), 'ボーナススコア加算が見つかりません')

// rhythmSystem.ts: evaluateTiming が justWindowMs に基づいて品質を返すこと
assert.ok(systemSrc.includes('export function evaluateTiming'), 'evaluateTiming のエクスポートが見つかりません')
assert.ok(systemSrc.includes('justWindowMs'), 'justWindowMs の参照が見つかりません')

// genres.json: 影響ジャンルが just_input を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const justInputGenres = genres.genres.filter(g => g.enableFeatures.includes('just_input')).map(g => g.id)
for (const id of ['rhythm', 'sports']) {
  assert.ok(justInputGenres.includes(id), `ジャンル "${id}" は just_input を有効化している必要があります`)
}

console.log('✓ just_input: RhythmFeature に実装あり（evaluateTiming + quality>0.5 でボーナス加算）')
console.log(`✓ just_input: 有効化ジャンル = ${justInputGenres.join(', ')}`)
console.log('PASS')
