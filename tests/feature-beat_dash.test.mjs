// beat_dash Feature の実装確認テスト
//
// beat_dash はビートに合わせたダッシュキー入力（評価 quality > 0.5）で
// 一定時間 beatDashMult 倍の速度を p.vx に適用する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/RhythmFeature.ts'), 'utf-8')

// beat_dash の実装本体が存在すること
assert.ok(src.includes("r.features.has('beat_dash')"), "'beat_dash' フラグの判定が見つかりません")
assert.ok(src.includes('_updateBeatDash'), '_updateBeatDash() の呼び出しが見つかりません')
assert.ok(src.includes('RHYTHM_TUNING.beatDashMult'), 'RHYTHM_TUNING.beatDashMult の参照が見つかりません')
assert.ok(src.includes('RHYTHM_TUNING.beatDashFrames'), 'RHYTHM_TUNING.beatDashFrames の参照が見つかりません')
assert.ok(src.includes('evaluateTiming'), 'evaluateTiming によるタイミング評価が見つかりません')
assert.ok(src.includes('p.vx = this.beatDash.dir * PLAYER_PHYSICS.runSpeed * RHYTHM_TUNING.beatDashMult'), '加速時の p.vx 設定が見つかりません')

// onManualUpdated でリセットされること
assert.ok(/onManualUpdated[\s\S]*?beatDash = \{ timer: 0, dir: 1 \}/.test(src), 'onManualUpdated() で beatDash 状態がリセットされる必要があります')

// rhythm_tuning.json: beatDashMult / beatDashFrames が定義されていること
const rhythmTuning = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/rhythm_tuning.json'), 'utf-8'))
assert.strictEqual(typeof rhythmTuning.beatDashMult, 'number', 'rhythm_tuning.json.beatDashMult は number である必要があります')
assert.strictEqual(typeof rhythmTuning.beatDashFrames, 'number', 'rhythm_tuning.json.beatDashFrames は number である必要があります')
assert.ok(rhythmTuning.beatDashMult > 1, 'beatDashMult は加速のため1より大きい必要があります')

// genres.json: rhythm ジャンルが beat_dash を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const beatDashGenres = genres.genres.filter(g => g.enableFeatures.includes('beat_dash')).map(g => g.id)
assert.ok(beatDashGenres.includes('rhythm'), 'ジャンル "rhythm" は beat_dash を有効化している必要があります')

console.log('✓ beat_dash: RhythmFeature に実装あり（ビートタイミング判定 + runSpeed×beatDashMult）')
console.log(`✓ beat_dash: rhythm_tuning.json.beatDashMult = ${rhythmTuning.beatDashMult}, beatDashFrames = ${rhythmTuning.beatDashFrames}`)
console.log(`✓ beat_dash: 有効化ジャンル = ${beatDashGenres.join(', ')}`)
console.log('PASS')
