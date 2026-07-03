// vertical_scroll Feature の実装確認テスト
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

// vertical_scroll は未実装警告リスト（['slide', 'gravity_flip']）に含まれていないこと
const unimplementedMatch = src.match(/for \(const f of \[([^\]]*)\] as const\)/)
assert.ok(unimplementedMatch, '未実装フィーチャーの警告ループが見つかりません')
assert.ok(!unimplementedMatch[1].includes("'vertical_scroll'"), 'vertical_scroll は未実装警告リストに残っていてはいけません')

// vertical_scroll の実装本体が存在すること
assert.ok(src.includes("features.has('vertical_scroll')"), "'vertical_scroll' フラグの判定が見つかりません")
assert.ok(src.includes("scrollAxis"), 'scrollAxis === \'y\' の判定が見つかりません')
assert.ok(src.includes('world.hazards'), 'ハザードへのドリフト処理が見つかりません')

// src/data/genres/*.json: 影響ジャンルが vertical_scroll を有効化し、縦スクロールであること
const genres = loadGenres(root)
const verticalGenres = genres.filter(g => g.enableFeatures.includes('vertical_scroll'))
const verticalIds = verticalGenres.map(g => g.id)
for (const id of ['aerial_stg', 'bullet_hell']) {
  assert.ok(verticalIds.includes(id), `ジャンル "${id}" は vertical_scroll を有効化している必要があります`)
}
for (const g of verticalGenres) {
  assert.strictEqual(g.scrollDirection, 'vertical', `ジャンル "${g.id}" は scrollDirection: "vertical" である必要があります`)
}

console.log('✓ vertical_scroll: MovementFeature に実装あり（未実装警告リストから除外済み）')
console.log('✓ vertical_scroll: scrollAxis==="y" 時にハザードドリフトを適用')
console.log(`✓ vertical_scroll: 有効化ジャンル = ${verticalIds.join(', ')}`)
console.log('PASS')
