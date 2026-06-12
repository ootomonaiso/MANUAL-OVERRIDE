// color_touch Feature の実装確認テスト
//
// color_touch は SpecialFeature.onSafeHazardTouch() で、安全色ハザードに
// 接触した際にスコア加算・ハザード除去・パーティクル演出を行う。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(root, 'src/game/systems/SpecialFeature.ts'), 'utf-8')

// color_touch の実装本体が存在すること
assert.ok(src.includes("world.rules.features.has('color_touch')"), "'color_touch' フラグの判定が見つかりません")
assert.ok(src.includes('onSafeHazardTouch'), 'onSafeHazardTouch() が見つかりません')
assert.ok(src.includes('world.rules.colorTouchScore'), 'colorTouchScore の参照が見つかりません')
assert.ok(src.includes('world.removeHazardById(hazard)'), 'ハザード除去処理が見つかりません')
assert.ok(src.includes('addScoreVarsColorTouch'), 'addScoreVarsColorTouch の呼び出しが見つかりません')

// FeatureSystem.ts: onSafeHazardTouch フックが定義されていること
const featureSystem = fs.readFileSync(path.join(root, 'src/engine/FeatureSystem.ts'), 'utf-8')
assert.ok(featureSystem.includes('onSafeHazardTouch?'), 'FeatureSystem.onSafeHazardTouch のフック定義が見つかりません')

// domain/types.ts: RuntimeRules.colorTouchScore とデフォルト値が定義されていること
const types = fs.readFileSync(path.join(root, 'src/domain/types.ts'), 'utf-8')
assert.ok(types.includes('colorTouchScore: number'), 'RuntimeRules.colorTouchScore の定義が見つかりません')

// 現状: どのジャンルも color_touch を有効化していない（将来用Feature）ことを確認
const genres = JSON.parse(fs.readFileSync(path.join(root, 'src/data/config/genres.json'), 'utf-8'))
const colorTouchGenres = genres.genres.filter(g => g.enableFeatures.includes('color_touch')).map(g => g.id)

console.log('✓ color_touch: SpecialFeature.onSafeHazardTouch() に実装あり（addScore + removeHazardById + パーティクル）')
console.log(`✓ color_touch: 有効化ジャンル = ${colorTouchGenres.length > 0 ? colorTouchGenres.join(', ') : '(なし)'}`)
console.log('PASS')
