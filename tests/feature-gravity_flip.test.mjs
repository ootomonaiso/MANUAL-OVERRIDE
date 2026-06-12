// gravity_flip Feature の未実装確認テスト
//
// gravity_flip は domain/types.ts に FeatureId として定義されているが、
// どのジャンルからも有効化されておらず、ExtraMovementFeature でも実装されていない。
// 有効化された場合は console.warn で警告を出す状態であることを確認する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/ExtraMovementFeature.ts'), 'utf-8')

// gravity_flip は unimplementedFeatures に含まれ、警告対象であること
const unimplementedMatch = src.match(/unimplementedFeatures = \[([^\]]*)\]/)
assert.ok(unimplementedMatch, 'unimplementedFeatures 配列が見つかりません')
assert.ok(unimplementedMatch[1].includes("'gravity_flip'"), 'gravity_flip は unimplementedFeatures に含まれている必要があります')
assert.ok(src.includes('console.warn'), '未実装時の console.warn が見つかりません')

// genres.json: どのジャンルも gravity_flip を有効化していないこと
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const flipGenres = genres.genres.filter(g => g.enableFeatures.includes('gravity_flip')).map(g => g.id)
assert.strictEqual(flipGenres.length, 0, `gravity_flip は未実装のためどのジャンルも有効化してはいけません（現在: ${flipGenres.join(', ')}）`)

console.log('✓ gravity_flip: ExtraMovementFeature の unimplementedFeatures に含まれ、有効化時に警告される')
console.log('✓ gravity_flip: 有効化ジャンルなし（想定どおり）')
console.log('PASS')
