// dash Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// MovementFeature.ts（旧 ExtraMovementFeature.ts はここに統合済み）の実装内容と
// 関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import { loadGenres } from './helpers/loadGenres.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/MovementFeature.ts'), 'utf-8')

// dash は未実装警告リスト（['slide', 'gravity_flip']）に含まれていないこと
const unimplementedMatch = src.match(/for \(const f of \[([^\]]*)\] as const\)/)
assert.ok(unimplementedMatch, '未実装フィーチャーの警告ループが見つかりません')
assert.ok(!unimplementedMatch[1].includes("'dash'"), 'dash は未実装警告リストに残っていてはいけません')

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

// src/data/genres/*.json: 影響ジャンルが dash を有効化していること
const genres = loadGenres(root)
const dashGenres = genres.filter(g => g.enableFeatures.includes('dash')).map(g => g.id)
for (const id of ['racing', 'arena', 'hack_slash', 'sports']) {
  assert.ok(dashGenres.includes(id), `ジャンル "${id}" は dash を有効化している必要があります`)
}

console.log('✓ dash: MovementFeature に実装あり（未実装警告リストから除外済み）')
console.log('✓ dash: physics.json に dashSpeed/dashDurationSec/dashCooldownSec/dashIframesSec あり')
console.log(`✓ dash: 有効化ジャンル = ${dashGenres.join(', ')}`)
console.log('PASS')
