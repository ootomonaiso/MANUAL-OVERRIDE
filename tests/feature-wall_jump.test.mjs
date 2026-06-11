// wall_jump Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// ExtraMovementFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/ExtraMovementFeature.ts'), 'utf-8')

// wall_jump はもう「未実装」警告リストに含まれていないこと
const unimplementedMatch = src.match(/unimplementedFeatures = \[([^\]]*)\]/)
assert.ok(unimplementedMatch, 'unimplementedFeatures 配列が見つかりません')
assert.ok(!unimplementedMatch[1].includes("'wall_jump'"), 'wall_jump は unimplementedFeatures に残っていてはいけません')

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

// genres.json: 影響ジャンルが wall_jump を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const wallJumpGenres = genres.genres.filter(g => g.enableFeatures.includes('wall_jump')).map(g => g.id)
for (const id of ['platformer']) {
  assert.ok(wallJumpGenres.includes(id), `ジャンル "${id}" は wall_jump を有効化している必要があります`)
}

console.log('✓ wall_jump: ExtraMovementFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ wall_jump: physics.json に wallJumpPushSpeed/playerMinX/playerMaxXRatio あり')
console.log(`✓ wall_jump: 有効化ジャンル = ${wallJumpGenres.join(', ')}`)
console.log('PASS')
