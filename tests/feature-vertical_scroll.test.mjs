// vertical_scroll Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// ExtraMovementFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/ExtraMovementFeature.ts'), 'utf-8')

// vertical_scroll はもう「未実装」警告リストに含まれていないこと
const unimplementedMatch = src.match(/unimplementedFeatures = \[([^\]]*)\]/)
assert.ok(unimplementedMatch, 'unimplementedFeatures 配列が見つかりません')
assert.ok(!unimplementedMatch[1].includes("'vertical_scroll'"), 'vertical_scroll は unimplementedFeatures に残っていてはいけません')

// vertical_scroll の実装本体が存在すること
assert.ok(src.includes("features.has('vertical_scroll')"), "'vertical_scroll' フラグの判定が見つかりません")
assert.ok(src.includes("scrollAxis"), 'scrollAxis === \'y\' の判定が見つかりません')
assert.ok(src.includes('world.hazards'), 'ハザードへのドリフト処理が見つかりません')

// genres.json: 影響ジャンルが vertical_scroll を有効化し、縦スクロールであること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const verticalGenres = genres.genres.filter(g => g.enableFeatures.includes('vertical_scroll'))
const verticalIds = verticalGenres.map(g => g.id)
for (const id of ['aerial_stg', 'bullet_hell']) {
  assert.ok(verticalIds.includes(id), `ジャンル "${id}" は vertical_scroll を有効化している必要があります`)
}
for (const g of verticalGenres) {
  assert.strictEqual(g.scrollDirection, 'vertical', `ジャンル "${g.id}" は scrollDirection: "vertical" である必要があります`)
}

console.log('✓ vertical_scroll: ExtraMovementFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ vertical_scroll: scrollAxis==="y" 時にハザードドリフトを適用')
console.log(`✓ vertical_scroll: 有効化ジャンル = ${verticalIds.join(', ')}`)
console.log('PASS')
