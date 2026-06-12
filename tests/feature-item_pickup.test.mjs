// item_pickup Feature の実装確認テスト
//
// item_pickup は RpgFeature.update() でアイテムとプレイヤーの衝突判定を行い、
// exp/hpアイテムの収集・onItemPickup フック発火を担当する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/RpgFeature.ts'), 'utf-8')

// item_pickup の実装本体が存在すること
assert.ok(src.includes("world.rules.features.has('item_pickup')"), "'item_pickup' フラグの判定が見つかりません")
assert.ok(src.includes('rectsOverlap(p.rect, iRect'), 'アイテムとの衝突判定 (rectsOverlap) が見つかりません')
assert.ok(src.includes('item.alive = false'), 'アイテム消費処理 (item.alive = false) が見つかりません')
assert.ok(src.includes('addScoreVarsItemCollected'), 'addScoreVarsItemCollected の呼び出しが見つかりません')
assert.ok(src.includes('onItemPickup?.(world, item.type)'), 'onItemPickup フックの発火が見つかりません')

// genres.json: 影響ジャンルが item_pickup を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const itemGenres = genres.genres.filter(g => g.enableFeatures.includes('item_pickup')).map(g => g.id)
for (const id of ['rpg', 'survival', 'dungeon', 'aquatic', 'idle', 'tower_def']) {
  assert.ok(itemGenres.includes(id), `ジャンル "${id}" は item_pickup を有効化している必要があります`)
}

// itemsCollected を ScoreVar として使うジャンル（survival/dungeon/aquatic/idle）も含まれること
for (const id of ['survival', 'dungeon', 'aquatic', 'idle']) {
  const g = genres.genres.find(g => g.id === id)
  assert.ok(g.scoreFormula.includes('itemsCollected'), `ジャンル "${id}" の scoreFormula は itemsCollected を使用している必要があります`)
}

console.log('✓ item_pickup: RpgFeature.update() に実装あり（衝突判定 + 収集 + フック発火）')
console.log(`✓ item_pickup: 有効化ジャンル = ${itemGenres.join(', ')}`)
console.log('PASS')
