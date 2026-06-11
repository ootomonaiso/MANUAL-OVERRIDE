// stealth_mode Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// SpecialFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/SpecialFeature.ts'), 'utf-8')

// stealth_mode はもう「未実装」警告を出さないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// stealth_mode の実装本体が存在すること
assert.ok(src.includes("r.features.has('stealth_mode')"), "'stealth_mode' フラグの判定が見つかりません")
assert.ok(src.includes('STEALTH'), 'STEALTH 設定の参照が見つかりません')
assert.ok(src.includes('addScoreVarsStealthBonus'), 'addScoreVarsStealthBonus の呼び出しが見つかりません')
assert.ok(src.includes('p.invincible'), 'ステルス時の無敵化処理が見つかりません')

// stealth.json に必要なパラメータが揃っていること
const stealth = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/stealth.json'), 'utf-8'))
for (const key of ['stealthAlpha', 'stealthDurationSec', 'stealthSafeBonus']) {
  assert.strictEqual(typeof stealth[key], 'number', `stealth.json.${key} は number である必要があります`)
}

// genres.json: 影響ジャンルが stealth_mode を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const stealthGenres = genres.genres.filter(g => g.enableFeatures.includes('stealth_mode')).map(g => g.id)
for (const id of ['stealth_action', 'horror']) {
  assert.ok(stealthGenres.includes(id), `ジャンル "${id}" は stealth_mode を有効化している必要があります`)
}

console.log('✓ stealth_mode: SpecialFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ stealth_mode: stealth.json に stealthAlpha/stealthDurationSec/stealthSafeBonus あり')
console.log(`✓ stealth_mode: 有効化ジャンル = ${stealthGenres.join(', ')}`)
console.log('PASS')
