// 描画コードがゲームプレイ用のグローバル乱数を消費しないことを保証する回帰テスト。
//
// 背景（PixelArt化ブランチの独立監査 F-02）:
//   本ゲームは描画とゲームプレイの双方で同じグローバル `Math.random()` を使う。
//   メインループは「更新 → 描画」の順で回り、後続フレームの _spawnHazard() が
//   障害物寸法・安全判定・アイテム抽選を Math.random() から決める。
//   そのため描画側が乱数を消費すると、消費回数の変化がそのまま
//   ゲームプレイの抽選結果を変えてしまう（分布は不変でも再現性が失われる）。
//
//   PixelArt化に際し、描画側の乱数（エンジン炎の揺らぎ等）はすべて
//   runCycle / hazard.pulse ベースの決定論的な演出へ置き換え、
//   「描画は乱数を消費しない」という方針を採用した。本テストはその再発防止ガード。
//
// 判定方法: 描画メソッド（render / drawXxx / _drawXxx）の本体を波括弧の対応で
//   切り出し、その中に Math.random() が現れないことを静的に検査する。
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 描画メソッドとみなす名前（クラスメソッド定義の行頭パターン） */
const DRAW_METHOD = /^\s{2}(?:(?:private|public|protected|override|readonly|static|async)\s+)*(render|_?draw[A-Za-z0-9_]*)\s*\([^)]*\)\s*:\s*[^{]*\{\s*$/

/** 走査対象: canvas 描画を持つディレクトリ */
const TARGET_DIRS = ['src/genres', 'src/game/systems', 'src/game/render']
const EXTRA_FILES = ['src/game/sideScroller.ts', 'src/game/ParticleSystem.ts']

function collectFiles() {
  const out = []
  for (const dir of TARGET_DIRS) {
    const abs = path.join(root, dir)
    if (!fs.existsSync(abs)) continue
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.ts')) out.push(path.join(dir, f))
    }
  }
  for (const f of EXTRA_FILES) {
    if (fs.existsSync(path.join(root, f))) out.push(f)
  }
  return out
}

/** 描画メソッド本体に現れる Math.random() を列挙する */
function findRandomInDrawMethods(relPath) {
  const lines = fs.readFileSync(path.join(root, relPath), 'utf-8').split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(DRAW_METHOD)
    if (!m) continue
    // メソッド本体を波括弧の対応で切り出す
    let depth = 1
    for (let j = i + 1; j < lines.length && depth > 0; j++) {
      const line = lines[j]
      if (line.includes('Math.random()')) {
        hits.push({ method: m[1], line: j + 1, text: line.trim() })
      }
      depth += (line.match(/\{/g) || []).length
      depth -= (line.match(/\}/g) || []).length
    }
  }
  return hits
}

const files = collectFiles()
assert.ok(files.length > 0, '走査対象のファイルが見つかりません')

const violations = []
for (const f of files) {
  for (const h of findRandomInDrawMethods(f)) {
    violations.push(`${f}:${h.line} [${h.method}] ${h.text}`)
  }
}

assert.strictEqual(
  violations.length, 0,
  '描画メソッド内で Math.random() が使われています。\n' +
  '描画は決定論的に保ち、ゆらぎは runCycle / pulse など既存の状態から導出してください。\n' +
  '（理由: 描画が乱数を消費すると後続フレームのスポーン抽選がずれるため）\n' +
  violations.map(v => '  - ' + v).join('\n'),
)

console.log(`✓ render-purity: 描画メソッド ${files.length} ファイルにゲームプレイ乱数の消費なし`)

// 補足の健全性チェック: ゲームロジック側では引き続き乱数が使われていること
// （検査自体が空振りしていないことの確認）
const sideScroller = fs.readFileSync(path.join(root, 'src/game/sideScroller.ts'), 'utf-8')
assert.ok(
  sideScroller.includes('Math.random()'),
  'sideScroller.ts からゲームプレイ用の乱数が消えています（テストが空振りしている可能性）',
)
console.log('✓ render-purity: ゲームロジック側の乱数使用は維持されている（検査の健全性確認）')
