import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ジャンルの scoreFormula が参照するスコア変数を、そのジャンルが enableFeatures で
 * 実際に「生成できる」か静的に検証する特性化テスト。
 *
 * 各スコア変数は特定の Feature が有効なときだけ値が入る（producer）。
 * enableFeatures にどの producer も無い変数は、その式の項が常時 0 になる（= 死に項）。
 *
 * 本テストは docs/BUG_REPORT.md の M-2 を再現・固定化するもの。現状の死に項集合を
 * 明示的にアサートしておくことで、将来ジャンルを修正/追加した際に差分が検出される。
 * production コードは変更しない（データの静的検査のみ）。
 */

// スコア変数 → それを生成する Feature 群（src/game/systems/*.ts の setKills/setCombo/
// addScoreVars*/addBeatHit の呼び出し元 Feature を実コードから確認済み）
const PRODUCERS: Record<string, string[]> = {
  kills:          ['shoot', 'survival_melee', 'tower'],
  combo:          ['shoot', 'lights_out', 'tetris_mode', 'tower'],
  maxCombo:       ['shoot', 'lights_out', 'tetris_mode', 'tower'],
  exp:            ['item_pickup', 'survival_level'],
  bossKills:      ['boss'],
  stealthBonus:   ['stealth_mode'],
  colorTouches:   ['color_touch'],
  itemsCollected: ['item_pickup', 'survival_hunger', 'survival_melee'],
  beatHits:       ['beat_hazard', 'just_input', 'beat_dash'],
}
// Feature 非依存で常に値が入る変数
const ALWAYS = new Set(['distance', 'survivedSec', 'accuracy', 'deaths'])

interface GenreJson {
  id: string
  enableFeatures?: string[]
  scoreFormula?: string
}

function loadGenres(): GenreJson[] {
  const dir = join(process.cwd(), 'src/data/genres')
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as GenreJson)
}

/** 式に現れる変数トークン（数値・演算子を除く）を抽出 */
function extractVars(formula: string): string[] {
  return (formula.match(/[a-zA-Z_]+/g) ?? []).filter(t => isNaN(Number(t)))
}

describe('ジャンル scoreFormula のスコア変数カバレッジ', () => {
  const genres = loadGenres().filter(g => g.id !== 'base')

  it('式に現れる変数はすべて既知（producer マップに定義済み or 常時利用可能）である', () => {
    const unknown: string[] = []
    for (const g of genres) {
      for (const v of extractVars(g.scoreFormula ?? '')) {
        if (!ALWAYS.has(v) && !(v in PRODUCERS)) unknown.push(`${g.id}:${v}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('現状の「死に項」（enableFeatures に producer が無い変数）は既知の集合と一致する', () => {
    const dead: string[] = []
    for (const g of genres) {
      const en = new Set(g.enableFeatures ?? [])
      for (const v of extractVars(g.scoreFormula ?? '')) {
        if (ALWAYS.has(v)) continue
        const producers = PRODUCERS[v]
        if (producers && !producers.some(p => en.has(p))) dead.push(`${g.id}:${v}`)
      }
    }
    // 現状 main で構造的に常時 0 になる項（docs/BUG_REPORT.md M-2）。
    // tower_def は producer(tower) を持つが ShootFeature に上書きされる別問題（H-1）なのでここには出ない。
    expect(dead.sort()).toEqual([
      'dungeon:kills',
      'platformer:combo',
      'racing:combo',
      'rhythm:combo',
      'rpg:kills',
      'runner:combo',
      'sports:combo',
    ])
  })
})
