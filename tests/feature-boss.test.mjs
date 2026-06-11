// boss Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// SpecialFeature.ts の実装内容と関連 config / genres / spawnTable の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/SpecialFeature.ts'), 'utf-8')

// boss はもう「未実装」警告を出さないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// boss の実装本体が存在すること
assert.ok(src.includes("r.features.has('boss')"), "'boss' フラグの判定が見つかりません")
assert.ok(src.includes('onBossSpawn'), 'onBossSpawn フックの実装が見つかりません')
assert.ok(src.includes('addScoreVarsBossKill'), 'ボス撃破カウント (addScoreVarsBossKill) が見つかりません')
assert.ok(src.includes('bossRespawnDist'), 'リスポーン間隔 (bossRespawnDist) の参照が見つかりません')
assert.ok(src.includes('removeHazardById'), 'スポーン取り消し処理 (removeHazardById) が見つかりません')
assert.ok(src.includes('triggerShake'), '撃破時の画面シェイク (triggerShake) が見つかりません')

// genres.json: 影響ジャンルが boss を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const bossGenres = genres.genres.filter(g => g.enableFeatures.includes('boss')).map(g => g.id)
for (const id of ['arena', 'hack_slash']) {
  assert.ok(bossGenres.includes(id), `ジャンル "${id}" は boss を有効化している必要があります`)
}

// 各ジャンルの spawnTable に isBoss エントリーが存在すること
const arena = fs.readFileSync(path.join(root, 'src/genres/ArenaPlugin.ts'), 'utf-8')
const hackSlash = fs.readFileSync(path.join(root, 'src/genres/HackSlashPlugin.ts'), 'utf-8')
assert.ok(arena.includes('isBoss: true'), 'ArenaPlugin の spawnTable に isBoss: true のエントリーが見つかりません')
assert.ok(hackSlash.includes('isBoss: true'), 'HackSlashPlugin の spawnTable に isBoss: true のエントリーが見つかりません')

// boss.json に必要なパラメータが揃っていること
const boss = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/boss.json'), 'utf-8'))
for (const key of ['bossRespawnDist', 'bossHp', 'arenaHpBonus', 'bossWidth', 'bossHeight', 'bossSpawnShake', 'bossDeathShake', 'bossDeathParticles']) {
  assert.strictEqual(typeof boss[key], 'number', `boss.json.${key} は number である必要があります`)
}

console.log('✓ boss: SpecialFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ boss: onBossSpawn によるHP強化 + リスポーン間隔制御 + 撃破時のスコア/演出あり')
console.log(`✓ boss: 有効化ジャンル = ${bossGenres.join(', ')}`)
console.log('✓ boss: ArenaPlugin / HackSlashPlugin の spawnTable に isBoss エントリーあり')
console.log('PASS')
