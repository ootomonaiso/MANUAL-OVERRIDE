// movement Feature の実装確認テスト
//
// movement は「常時有効・すべてのジャンルで使用」される基本左右移動 Feature。
// MovementFeature.preUpdate() / ExtraMovementFeature のフォールバック実装を静的に検証する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const movementSrc = fs.readFileSync(path.join(root, 'src/game/systems/MovementFeature.ts'), 'utf-8')
const extraSrc = fs.readFileSync(path.join(root, 'src/game/systems/ExtraMovementFeature.ts'), 'utf-8')

// MovementFeature.handles に movement が含まれること
assert.ok(movementSrc.includes("readonly handles = ['movement'"), "MovementFeature.handles に 'movement' が含まれている必要があります")

// preUpdate で moveLeft/moveRight キーから p.vx を設定していること
assert.ok(movementSrc.includes('preUpdate'), 'preUpdate() が見つかりません')
assert.ok(movementSrc.includes('r.controls.moveLeft'), 'moveLeft キーの参照が見つかりません')
assert.ok(movementSrc.includes('r.controls.moveRight'), 'moveRight キーの参照が見つかりません')
assert.ok(movementSrc.includes('p.vx ='), 'p.vx の設定が見つかりません')

// ruleEngine.ts: resolvedFeatures に常に 'movement' が追加されること
const ruleEngine = fs.readFileSync(path.join(root, 'src/domain/ruleEngine.ts'), 'utf-8')
assert.ok(ruleEngine.includes("resolvedFeatures.add('movement')"), "ruleEngine.ts で 'movement' が常に有効化されている必要があります")

// ExtraMovementFeature: MovementFeature 系が非アクティブな場合のフォールバック移動も用意されていること
assert.ok(extraSrc.includes('MOVEMENT_FEATURE_HANDLES'), 'MOVEMENT_FEATURE_HANDLES によるフォールバック判定が見つかりません')
assert.ok(extraSrc.includes('PLAYER_PHYSICS.runSpeed'), 'フォールバック移動での runSpeed 参照が見つかりません')

console.log("✓ movement: ruleEngine が常に 'movement' を有効化")
console.log('✓ movement: MovementFeature.preUpdate() で左右移動を p.vx に反映')
console.log('✓ movement: ExtraMovementFeature にフォールバック基本移動あり')
console.log('PASS')
