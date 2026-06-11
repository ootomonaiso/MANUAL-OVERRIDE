// dash Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// ExtraMovementFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/ExtraMovementFeature.ts'), 'utf-8')

// dash はもう「未実装」警告リストに含まれていないこと
const unimplementedMatch = src.match(/unimplementedFeatures = \[([^\]]*)\]/)
assert.ok(unimplementedMatch, 'unimplementedFeatures 配列が見つかりません')
assert.ok(!unimplementedMatch[1].includes("'dash'"), 'dash は unimplementedFeatures に残っていてはいけません')

// dash の実装本体が存在すること
assert.ok(src.includes("r.features.has('dash')"), "'dash' フラグの判定が見つかりません")
assert.ok(src.includes('dashSpeed'), 'PLAYER_PHYSICS.dashSpeed の参照が見つかりません')
assert.ok(src.includes('dashIframesSec'), '無敵フレーム(dashIframesSec)の参照が見つかりません')

// physics.json に dash 用パラメータが揃っていること
const physics = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/physics.json'), 'utf-8'))
for (const key of ['dashSpeed', 'dashDurationSec', 'dashCooldownSec', 'dashIframesSec']) {
  assert.strictEqual(typeof physics[key], 'number', `physics.json.${key} は number である必要があります`)
}

// sideScroller.ts: ActionStats.dashes がダッシュ入力時にインクリメントされること
const sideScroller = fs.readFileSync(path.join(root, 'src/game/sideScroller.ts'), 'utf-8')
assert.ok(sideScroller.includes('stats.dashes'), 'ActionStats.dashes のインクリメント処理が見つかりません')
assert.ok(sideScroller.includes("features.has('dash')"), "sideScroller.ts に 'dash' フラグの判定が見つかりません")

// genres.json: 影響ジャンルが dash を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const dashGenres = genres.genres.filter(g => g.enableFeatures.includes('dash')).map(g => g.id)
for (const id of ['racing', 'arena', 'hack_slash', 'sports']) {
  assert.ok(dashGenres.includes(id), `ジャンル "${id}" は dash を有効化している必要があります`)
}

console.log('✓ dash: ExtraMovementFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ dash: physics.json に dashSpeed/dashDurationSec/dashCooldownSec/dashIframesSec あり')
console.log(`✓ dash: 有効化ジャンル = ${dashGenres.join(', ')}`)
console.log('PASS')
