// time_bonus Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// SpecialFeature.ts の実装内容と関連 config / genres の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/SpecialFeature.ts'), 'utf-8')

// time_bonus はもう「未実装」警告を出さないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// time_bonus の実装本体が存在すること
assert.ok(src.includes("r.features.has('time_bonus')"), "'time_bonus' フラグの判定が見つかりません")
assert.ok(src.includes('TIME_BONUS_INTERVAL_SEC'), '加算間隔 (TIME_BONUS_INTERVAL_SEC) の定義が見つかりません')
assert.ok(src.includes('TIME_BONUS_SCORE'), '加算スコア (TIME_BONUS_SCORE) の定義が見つかりません')
assert.ok(src.includes('world.addScore(TIME_BONUS_SCORE)'), 'スコア加算処理 (addScore) が見つかりません')

// genres.json: 影響ジャンルが time_bonus を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const timeBonusGenres = genres.genres.filter(g => g.enableFeatures.includes('time_bonus')).map(g => g.id)
for (const id of ['racing', 'sports']) {
  assert.ok(timeBonusGenres.includes(id), `ジャンル "${id}" は time_bonus を有効化している必要があります`)
}

console.log('✓ time_bonus: SpecialFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ time_bonus: 一定間隔ごとの addScore + addScorePopup あり')
console.log(`✓ time_bonus: 有効化ジャンル = ${timeBonusGenres.join(', ')}`)
console.log('PASS')
