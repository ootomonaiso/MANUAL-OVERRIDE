// tower Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// SpecialFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/SpecialFeature.ts'), 'utf-8')

// tower はもう「未実装」警告を出さないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// tower の実装本体が存在すること
assert.ok(src.includes("r.features.has('tower')"), "'tower' フラグの判定が見つかりません")
assert.ok(src.includes('removeHazardById'), 'ハザード撃破処理 (removeHazardById) が見つかりません')
assert.ok(src.includes('render(ctx'), 'タワーの描画処理 (render) が見つかりません')

// genres.json: 影響ジャンルが tower を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const towerGenres = genres.genres.filter(g => g.enableFeatures.includes('tower')).map(g => g.id)
for (const id of ['tower_def', 'idle']) {
  assert.ok(towerGenres.includes(id), `ジャンル "${id}" は tower を有効化している必要があります`)
}

console.log('✓ tower: SpecialFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ tower: ハザード自動撃破 + render() による描画あり')
console.log(`✓ tower: 有効化ジャンル = ${towerGenres.join(', ')}`)
console.log('PASS')
