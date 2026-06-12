// charge_shot Feature の未実装確認テスト
//
// charge_shot は domain/types.ts に FeatureId として定義されているが、
// どのジャンルからも有効化されておらず、ShootFeature でも実装されていない。
// 有効化された場合は console.warn で警告を出す状態であることを確認する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/ShootFeature.ts'), 'utf-8')

// charge_shot は unimplementedFeatures に含まれ、警告対象であること
const unimplementedMatch = src.match(/unimplementedFeatures = \[([^\]]*)\]/)
assert.ok(unimplementedMatch, 'unimplementedFeatures 配列が見つかりません')
assert.ok(unimplementedMatch[1].includes("'charge_shot'"), 'charge_shot は unimplementedFeatures に含まれている必要があります')
assert.ok(src.includes('console.warn'), '未実装時の console.warn が見つかりません')

// charge_shot の実装本体は存在しないこと（チャージ用の状態管理が無い）
assert.ok(!src.includes('chargeTimer') && !src.includes('chargeLevel'), 'charge_shot の実装らしきコードが見つかりました（要再確認）')

// genres.json: どのジャンルも charge_shot を有効化していないこと
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const chargeGenres = genres.genres.filter(g => g.enableFeatures.includes('charge_shot')).map(g => g.id)
assert.strictEqual(chargeGenres.length, 0, `charge_shot は未実装のためどのジャンルも有効化してはいけません（現在: ${chargeGenres.join(', ')}）`)

console.log('✓ charge_shot: ShootFeature の unimplementedFeatures に含まれ、有効化時に警告される')
console.log('✓ charge_shot: 実装コードなし、有効化ジャンルなし（想定どおり）')
console.log('PASS')
