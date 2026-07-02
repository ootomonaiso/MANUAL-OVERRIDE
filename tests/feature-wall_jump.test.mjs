// wall_jump Feature の実装確認テスト
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

// wall_jump は未実装警告リスト（['slide', 'gravity_flip']）に含まれていないこと
const unimplementedMatch = src.match(/for \(const f of \[([^\]]*)\] as const\)/)
assert.ok(unimplementedMatch, '未実装フィーチャーの警告ループが見つかりません')
assert.ok(!unimplementedMatch[1].includes("'wall_jump'"), 'wall_jump は未実装警告リストに残っていてはいけません')

// wall_jump の実装本体が存在すること
assert.ok(src.includes("r.features.has('wall_jump')"), "'wall_jump' フラグの判定が見つかりません")
assert.ok(src.includes('wallJumpPushSpeed'), 'PLAYER_PHYSICS.wallJumpPushSpeed の参照が見つかりません')
assert.ok(src.includes('jumpsLeft'), 'jumpsLeft の操作（ジャンプ権の復活）が見つかりません')
assert.ok(src.includes('playerMinX') && src.includes('playerMaxXRatio'), '画面端（壁）判定の参照が見つかりません')

// physics.json に wall_jump 用パラメータが揃っていること
const physics = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/physics.json'), 'utf-8'))
for (const key of ['wallJumpPushSpeed', 'playerMinX', 'playerMaxXRatio']) {
  assert.strictEqual(typeof physics[key], 'number', `physics.json.${key} は number である必要があります`)
}

// src/data/genres/*.json: 影響ジャンルが wall_jump を有効化していること
const genres = loadGenres(root)
const wallJumpGenres = genres.filter(g => g.enableFeatures.includes('wall_jump')).map(g => g.id)
for (const id of ['platformer']) {
  assert.ok(wallJumpGenres.includes(id), `ジャンル "${id}" は wall_jump を有効化している必要があります`)
}

console.log('✓ wall_jump: MovementFeature に実装あり（未実装警告リストから除外済み）')
console.log('✓ wall_jump: physics.json に wallJumpPushSpeed/playerMinX/playerMaxXRatio あり')
console.log(`✓ wall_jump: 有効化ジャンル = ${wallJumpGenres.join(', ')}`)
console.log('PASS')
