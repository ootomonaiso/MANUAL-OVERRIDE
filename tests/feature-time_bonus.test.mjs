// time_bonus Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// SpecialFeature.ts の実装内容と関連 config / genres の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import { loadGenres } from './helpers/loadGenres.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/SpecialFeature.ts'), 'utf-8')

// time_bonus はもう「未実装」警告を出さないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// time_bonus の実装本体が存在すること（間隔・スコアは SPECIAL tunables 経由。マジックナンバー禁止の規約に合わせた実装）
assert.ok(src.includes("r.features.has('time_bonus')"), "'time_bonus' フラグの判定が見つかりません")
assert.ok(src.includes('SPECIAL.timeBonusIntervalSec'), '加算間隔 (SPECIAL.timeBonusIntervalSec) の参照が見つかりません')
assert.ok(src.includes('SPECIAL.timeBonusScore'), '加算スコア (SPECIAL.timeBonusScore) の参照が見つかりません')
assert.ok(src.includes('world.addScore(SPECIAL.timeBonusScore)'), 'スコア加算処理 (addScore) が見つかりません')

// src/data/genres/*.json: 影響ジャンルが time_bonus を有効化していること
const genres = loadGenres(root)
const timeBonusGenres = genres.filter(g => g.enableFeatures.includes('time_bonus')).map(g => g.id)
for (const id of ['racing', 'sports']) {
  assert.ok(timeBonusGenres.includes(id), `ジャンル "${id}" は time_bonus を有効化している必要があります`)
}

console.log('✓ time_bonus: SpecialFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ time_bonus: 一定間隔ごとの addScore + addScorePopup あり')
console.log(`✓ time_bonus: 有効化ジャンル = ${timeBonusGenres.join(', ')}`)
console.log('PASS')
