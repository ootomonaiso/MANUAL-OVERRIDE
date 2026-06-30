// lights_out Feature (LightsOut パズル) の実装確認テスト
//
// 実行環境にブラウザ/開発サーバーが無くても判定できるよう、
// PuzzleFeature.ts の実装内容と関連 config の整合性を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/PuzzleFeature.ts'), 'utf-8')

// 未実装警告が残っていないこと
assert.ok(!src.includes('is not yet implemented'), 'unimplemented警告が残っています')
assert.ok(!/unimplementedFeatures/.test(src), 'unimplementedFeatures が残っています')

// lights_out の実装本体が存在すること
assert.ok(src.includes("handles = ['lights_out']"), "'lights_out' を handles に持つ必要があります")
assert.ok(src.includes("r.scrollSpeed = 0") || src.includes('rules.scrollSpeed = 0'), 'スクロール停止処理が見つかりません')
assert.ok(src.includes('baseScrollSpeed'), 'スクロール速度の復元処理 (baseScrollSpeed) が見つかりません')

// 正解→次の問題へ進む処理（puzzleCount のインクリメント + 再生成）
assert.ok(src.includes('_handleSolved'), '正解処理 (_handleSolved) が見つかりません')
assert.ok(src.includes('puzzleCount++'), '正解/時間切れ後の出題カウント加算が見つかりません')
assert.ok(src.includes('_startPuzzle'), '次の問題生成 (_startPuzzle) が見つかりません')
assert.ok(src.includes('setCombo'), '正解時のコンボ加算 (setCombo) が見つかりません')

// 演出（フラッシュ・パーティクル・シェイク・サウンド）
assert.ok(src.includes('solveFx') && src.includes('damageFx'), 'クリア/ダメージのフラッシュ演出が見つかりません')
assert.ok(src.includes('addParticle'), 'パーティクル演出 (addParticle) が見つかりません')
assert.ok(src.includes('triggerShake'), '画面シェイク演出 (triggerShake) が見つかりません')
assert.ok(src.includes('soundManager'), '効果音 (soundManager) が見つかりません')

// 操作抑止（プレイヤー速度を 0 に固定）
assert.ok(src.includes('player.vx = 0') && src.includes('player.vy = 0'), 'パズル中のプレイヤー静止処理が見つかりません')

// genres.json: puzzle ジャンルが lights_out を有効化していること
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const lightsOutGenres = genres.genres.filter(g => g.enableFeatures.includes('lights_out')).map(g => g.id)
assert.ok(lightsOutGenres.includes('puzzle'), 'ジャンル "puzzle" は lights_out を有効化している必要があります')

// 単一ソース（src/data/genres/puzzle.json）でも一致していること
const puzzleGenre = JSON.parse(fs.readFileSync(path.join(root, 'src/data/genres/puzzle.json'), 'utf-8'))
assert.ok(puzzleGenre.enableFeatures.includes('lights_out'), 'genres/puzzle.json も lights_out を有効化している必要があります')

console.log('✓ lights_out: PuzzleFeature に実装あり')
console.log('✓ lights_out: 正解→次の問題へ進む処理 + クリア/ダメージ演出 + 操作抑止あり')
console.log(`✓ lights_out: 有効化ジャンル = ${lightsOutGenres.join(', ')}`)
console.log('PASS')
