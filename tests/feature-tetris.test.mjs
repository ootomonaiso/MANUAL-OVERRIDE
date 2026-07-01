// tetris: ジャンル定義の整合性テスト
//
// TetrisFeature.ts + tetris.json + config/genres.json の整合性を検証する。
// 閾値が低すぎないこと、scoreFormula に distance が使われていないこと、
// config/genres.json に重複定義がないことを確認する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/TetrisFeature.ts'), 'utf-8')

// ─── TetrisFeature.ts の静的検証 ────────────────────────────────

// tetris_mode フラグのガードが preUpdate / update / render に存在すること
assert.ok(src.includes("world.rules.features.has('tetris_mode')"),
  'preUpdate / update / render に tetris_mode フラグのガードが必要です')

// handles = 'tetris_mode' であること
assert.ok(src.includes("handles = 'tetris_mode'"),
  "TetrisFeature.handles が 'tetris_mode' ではありません")

// 10x20 グリッド
assert.ok(src.includes('const COLS = 10'), 'COLS が 10 ではありません')
assert.ok(src.includes('const ROWS = 20'), 'ROWS が 20 ではありません')

// 7-bag システム
assert.ok(src.includes("'I', 'O', 'T', 'S', 'Z', 'J', 'L'"),
  '7-bag システムのピース定義が見つかりません')

// SRS 準拠の壁蹴り
assert.ok(src.includes('[-1, 1, -2, 2]'), '水平壁蹴りの定義が見つかりません')
assert.ok(src.includes("state.piece.def.id === 'I'"), 'Iピースの垂直キックが見つかりません')

// ロックディレイ
assert.ok(src.includes('LOCK_DELAY'), 'LOCK_DELAY 定数が見つかりません')
assert.ok(src.includes('LOCK_RESETS_MAX'), 'LOCK_RESETS_MAX 定数が見つかりません')

// スコア式: combo * 300 + survivedSec * 10 (distance を使わない)
assert.ok(!src.includes('distance'), 'TetrisFeature.ts に distance 参照がありません')

// ─── tetris.json の静的検証 ─────────────────────────────────────

const tetrisJson = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/genres/tetris.json'), 'utf-8')
)

// 閾値が適切であること（他のジャンルの閾値 10-18 と同等以上）
const combo = tetrisJson.thresholds?.combo ?? 0
const craft = tetrisJson.thresholds?.craft ?? 0
assert.ok(combo >= 8, `combo 閾値が低すぎます: ${combo} (8以上が必要です)`)
assert.ok(craft >= 8, `craft 閾値が低すぎます: ${craft} (8以上が必要です)`)

// scoreFormula に distance を使わない（distance は tetris モードで凍結する）
assert.ok(!tetrisJson.scoreFormula.includes('distance'),
  `scoreFormula に distance が含まれています: "${tetrisJson.scoreFormula}"`)

// enableFeatures に tetris_mode が含まれる
assert.ok(tetrisJson.enableFeatures.includes('tetris_mode'),
  'enableFeatures に tetris_mode がありません')

// disableFeatures に auto_run が含まれる
assert.ok(tetrisJson.disableFeatures.includes('auto_run'),
  'disableFeatures に auto_run がありません')

// theme が tetris
assert.strictEqual(tetrisJson.theme, 'tetris', 'theme が tetris ではありません')

// scrollDirection が none
assert.strictEqual(tetrisJson.scrollDirection, 'none', 'scrollDirection が none ではありません')

// gravity が 0
assert.strictEqual(tetrisJson.gravity, 0, 'gravity が 0 ではありません')

// ─── config/genres.json に重複定義がないこと ──────────────────────

const genresConfig = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8')
)

const tetrisGenres = genresConfig.genres.filter(g => g.id === 'tetris')
assert.strictEqual(tetrisGenres.length, 0,
  `config/genres.json に tetris ジャンルの重複定義があります (${tetrisGenres.length}件)`)

// ─── テトリミノ定義の検証 ───────────────────────────────────────

const tetrominoIds = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
for (const id of tetrominoIds) {
  assert.ok(src.includes(`id: '${id}'`),
    `TetrisFeature.ts に ${id} テトリミノ定義が見つかりません`)
}

// ─── 結果表示 ────────────────────────────────────────────────────
console.log(`✓ tetris.json: thresholds.combo=${combo}, thresholds.craft=${craft}`)
console.log(`✓ tetris.json: scoreFormula="${tetrisJson.scoreFormula}"`)
console.log(`✓ tetris.json: theme="${tetrisJson.theme}", scrollDirection="${tetrisJson.scrollDirection}"`)
console.log(`✓ config/genres.json: tetris 重複定義なし (${tetrisGenres.length}件)`)
console.log('PASS')
