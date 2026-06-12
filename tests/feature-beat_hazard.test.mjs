// beat_hazard Feature の実装確認テスト
//
// beat_hazard は rhythmSystem.updateRhythm() でBPM同期のビートを刻み、
// 偶数拍ごとに beatHazardInverted を反転させる。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rhythmSystemSrc = fs.readFileSync(path.join(root, 'src/game/systems/rhythmSystem.ts'), 'utf-8')
const rhythmFeatureSrc = fs.readFileSync(path.join(root, 'src/game/systems/RhythmFeature.ts'), 'utf-8')

// beat_hazard の実装本体が存在すること
assert.ok(rhythmSystemSrc.includes("rules.features.has('beat_hazard')"), "'beat_hazard' フラグの判定が見つかりません")
assert.ok(rhythmSystemSrc.includes('beatHazardInverted'), 'beatHazardInverted の参照が見つかりません')
assert.ok(rhythmSystemSrc.includes('beatCount % 2 === 0'), '偶数拍での反転判定が見つかりません')

// RhythmFeature: 反転フラグを GameStats に同期していること
assert.ok(rhythmFeatureSrc.includes('setBeatHazardInverted'), 'setBeatHazardInverted の呼び出しが見つかりません')
assert.ok(rhythmFeatureSrc.includes('render('), 'ビートマーカーの描画処理 (render) が見つかりません')

// genres.json: rhythm ジャンルが beat_hazard を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const beatHazardGenres = genres.genres.filter(g => g.enableFeatures.includes('beat_hazard')).map(g => g.id)
assert.ok(beatHazardGenres.includes('rhythm'), 'ジャンル "rhythm" は beat_hazard を有効化している必要があります')

// rhythm_tuning.json に必要なパラメータが揃っていること
const rhythmTuning = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/rhythm_tuning.json'), 'utf-8'))
for (const key of ['minBpm', 'maxBpm', 'beatHazardFlipChance']) {
  assert.strictEqual(typeof rhythmTuning[key], 'number', `rhythm_tuning.json.${key} は number である必要があります`)
}

console.log('✓ beat_hazard: rhythmSystem に実装あり（BPM同期 + 偶数拍で危険色反転）')
console.log(`✓ beat_hazard: 有効化ジャンル = ${beatHazardGenres.join(', ')}`)
console.log('PASS')
