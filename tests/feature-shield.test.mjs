// shield Feature の実装確認テスト
//
// shield は RpgFeature.onPlayerHit() で、シールドが残っている間は
// HPを減らさずに被弾を防ぎ、一定時間後にリチャージされる。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/RpgFeature.ts'), 'utf-8')

// shield の実装本体が存在すること
assert.ok(src.includes("world.rules.features.has('shield')"), "'shield' フラグの判定が見つかりません")
assert.ok(src.includes('p.shield'), 'p.shield の参照が見つかりません')
assert.ok(src.includes('p.shieldRecharge'), 'p.shieldRecharge の参照が見つかりません')
assert.ok(src.includes('SHIELD_RECHARGE_SEC'), 'シールド再チャージ秒数 (SHIELD_RECHARGE_SEC) の定義が見つかりません')

// shield 消費時は modifyPlayerHp(-1) より前に return し、HPを減らさないこと
const hitMethod = src.match(/onPlayerHit\(world: MutableWorld\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''
const shieldBlockEnd = hitMethod.indexOf('return')
const hpCallIndex = hitMethod.indexOf('modifyPlayerHp(-1)')
assert.ok(shieldBlockEnd > -1 && shieldBlockEnd < hpCallIndex, 'shield 消費時は modifyPlayerHp(-1) より前に return している必要があります')

// entities.ts: Player に shield/shieldRecharge が定義されていること
const entities = fs.readFileSync(path.join(root, 'src/game/entities.ts'), 'utf-8')
assert.ok(entities.includes('shield = 0'), 'Player.shield の初期値定義が見つかりません')
assert.ok(entities.includes('shieldRecharge = 0'), 'Player.shieldRecharge の初期値定義が見つかりません')

// onInit: シールド有効ジャンルではシールドを満タンにすること
assert.ok(src.includes('onInit'), 'onInit() が見つかりません')
assert.ok(/onInit[\s\S]*?player\.shield = 1/.test(src), 'onInit() でシールドを1に初期化する処理が見つかりません')

// genres.json: survival ジャンルが shield を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const shieldGenres = genres.genres.filter(g => g.enableFeatures.includes('shield')).map(g => g.id)
assert.ok(shieldGenres.includes('survival'), 'ジャンル "survival" は shield を有効化している必要があります')

console.log('✓ shield: RpgFeature に実装あり（被弾時にHPの代わりにシールドを消費 + リチャージ）')
console.log(`✓ shield: 有効化ジャンル = ${shieldGenres.join(', ')}`)
console.log('PASS')
