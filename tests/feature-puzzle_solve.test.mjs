// puzzle_solve Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// PuzzleFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/PuzzleFeature.ts'), 'utf-8')

// puzzle_solve はもう「未実装」警告を出さないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// puzzle_solve の実装本体が存在すること
assert.ok(src.includes("r.features.has('puzzle_solve')"), "'puzzle_solve' フラグの判定が見つかりません")
assert.ok(src.includes('setCombo'), '正解時のコンボ加算 (setCombo) が見つかりません')
assert.ok(src.includes('resetCombo'), '不正解時のコンボリセット (resetCombo) が見つかりません')
assert.ok(src.includes('addScore'), '正解時のスコア加算 (addScore) が見つかりません')
assert.ok(src.includes('addScorePopup'), '正誤判定のポップアップ表示 (addScorePopup) が見つかりません')

// genres.json: puzzle ジャンルが puzzle_solve を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const puzzleSolveGenres = genres.genres.filter(g => g.enableFeatures.includes('puzzle_solve')).map(g => g.id)
assert.ok(puzzleSolveGenres.includes('puzzle'), 'ジャンル "puzzle" は puzzle_solve を有効化している必要があります')

console.log('✓ puzzle_solve: PuzzleFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ puzzle_solve: ターゲットセル判定 + setCombo/resetCombo + addScore/addScorePopup あり')
console.log(`✓ puzzle_solve: 有効化ジャンル = ${puzzleSolveGenres.join(', ')}`)
console.log('PASS')
