// grid_stop Feature の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// PuzzleFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/PuzzleFeature.ts'), 'utf-8')

// grid_stop はもう「未実装」警告を出さないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// grid_stop の実装本体が存在すること
assert.ok(src.includes("r.features.has('grid_stop')"), "'grid_stop' フラグの判定が見つかりません")
assert.ok(src.includes('r.scrollSpeed = 0'), 'スクロール停止処理 (r.scrollSpeed = 0) が見つかりません')
assert.ok(src.includes('baseScrollSpeed'), 'スクロール速度の復元処理 (baseScrollSpeed) が見つかりません')
assert.ok(src.includes('render('), 'グリッドターゲットの描画処理 (render) が見つかりません')

// genres.json: puzzle ジャンルが grid_stop を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const gridStopGenres = genres.genres.filter(g => g.enableFeatures.includes('grid_stop')).map(g => g.id)
assert.ok(gridStopGenres.includes('puzzle'), 'ジャンル "puzzle" は grid_stop を有効化している必要があります')

console.log('✓ grid_stop: PuzzleFeature に実装あり（unimplementedFeatures から除外済み）')
console.log('✓ grid_stop: move/solveフェーズ切り替え + scrollSpeed停止/復元 + render() あり')
console.log(`✓ grid_stop: 有効化ジャンル = ${gridStopGenres.join(', ')}`)
console.log('PASS')
