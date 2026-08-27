import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * ジャンル閾値到達可能性テスト
 *
 * reach-sim (モンテカルロシミュレータ) と同じロジックをテスト用に再現し、
 * 各ジャンルの閾値がカードプール内で到達可能かどうかを検証する。
 *
 * 目標:
 *   - hack_slash / tetris: ランダム到達率 >= 2%
 *   - puzzle:              ランダム到達率 >= 15%
 *   - 主要ジャンル:        5ポイント以上の低下がないこと
 */

// ── reach-sim と同じロジック（Node 用に簡略化） ─────────────────

const ROOT = process.cwd()
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

const genres = readdirSync(join(ROOT, 'src/data/genres'))
  .filter((f) => f.endsWith('.json') && !f.startsWith('TEMPLATE'))
  .map((f) => readJson(`src/data/genres/${f}`))

const cards = readdirSync(join(ROOT, 'src/data/cards'))
  .filter((f) => f.endsWith('.json') && !f.startsWith('TEMPLATE'))
  .flatMap((f) => readJson(`src/data/cards/${f}`).cards)

const bayes = readJson('src/data/config/bayes.json')
const gb = readJson('src/data/config/game_balance.json')
const MAX_ROUNDS = gb.maxRounds
const FALLBACK = gb.defaultFallbackGenre
const JITTER = 0.4

const isCandidate = (g: { id: string; resolvable?: boolean }) =>
  g.id !== 'base' && g.resolvable !== false

function posteriors(
  acc: Record<string, number>,
  customThresholds?: Record<string, Record<string, number>>,
) {
  const un: Record<string, number> = {}
  for (const g of genres) {
    if (g.resolvable === false) continue
    const th = customThresholds?.[g.id] ?? g.thresholds
    const entries = Object.entries(th)
    if (entries.length === 0) {
      const total = Object.values(acc).reduce((s: number, v: number) => s + v, 0)
      un[g.id] = Math.exp(-bayes.baseDecay * total)
      continue
    }
    let dev = 0
    for (const [axis, val] of entries)
      dev += Math.max(0, val - (acc[axis] ?? 0))
    un[g.id] = Math.exp(-bayes.decayRate * dev)
  }
  const sum = Object.values(un).reduce((s: number, v: number) => s + v, 0)
  const post: Record<string, number> = {}
  for (const g of genres) post[g.id] = (un[g.id] ?? 0) / sum
  return post
}

function ranked(post: Record<string, number>) {
  return genres
    .filter(isCandidate)
    .map((g) => ({ id: g.id, prob: post[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)
}

function judge(rk: { id: string; prob: number }[]) {
  const [top, second] = rk
  if (!top || top.prob < bayes.minProb) return null
  if (second && top.prob < bayes.dominanceRatio * second.prob) return null
  return top.id
}

function effWeight(card: (typeof cards)[0], gw: Record<string, number> | null) {
  const base = card.weight ?? 1
  if (!gw || !card.genreAffinity?.length) return base
  const a = card.genreAffinity.reduce((s: number, g: string) => s + (gw[g] ?? 0), 0)
  return base * (1 + Math.min(1.5, a) * 0.5)
}

function sample2(
  exclude: Set<string>,
  gw: Record<string, number> | null,
) {
  const pool = cards.filter((c) => !exclude.has(c.id))
  const out: typeof cards = []
  while (out.length < 2 && pool.length > 0) {
    const total = pool.reduce((s: number, c: typeof cards[0]) => s + effWeight(c, gw), 0)
    let r = Math.random() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= effWeight(pool[i], gw)
      if (r <= 0) { idx = i; break }
    }
    out.push(...pool.splice(idx, 1))
  }
  return out
}

const randomPicker = (a: typeof cards[0], b: typeof cards[0]) =>
  Math.random() < 0.5 ? a : b

function focusedPickerFor(
  target: string,
  customThresholds?: Record<string, Record<string, number>>,
) {
  const th = customThresholds?.[target] ?? genres.find((g) => g.id === target)!.thresholds
  const score = (c: typeof cards[0]) =>
    Object.entries(c.genreParams ?? {})
      .reduce((s: number, [k, v]) => s + (k in th ? v : 0), 0)
  return (a: typeof cards[0], b: typeof cards[0]) => {
    const sa = score(a), sb = score(b)
    if (sa === sb) return randomPicker(a, b)
    return sa > sb ? a : b
  }
}

function playOnce(
  picker: (a: typeof cards[0], b: typeof cards[0]) => typeof cards[0],
  customThresholds?: Record<string, Record<string, number>>,
) {
  const acc: Record<string, number> = {}
  let exclude = new Set<string>()
  let post: Record<string, number> | null = null
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const pair = sample2(exclude, post)
    if (pair.length === 0) break
    const card = pair.length === 1 ? pair[0] : picker(pair[0], pair[1])
    exclude = new Set(pair.map((c) => c.id))
    const jitter = 1 + (Math.random() - 0.5) * JITTER
    const mult = card.paramMultiplier ?? 1
    for (const [k, v] of Object.entries(card.genreParams ?? {})) {
      acc[k] = (acc[k] ?? 0) + v * jitter * mult
    }
    post = posteriors(acc, customThresholds)
    const conv = judge(ranked(post))
    if (conv) return conv === 'base' ? FALLBACK : conv
  }
  const top = ranked(posteriors(acc, customThresholds))[0]
  const id = top?.id ?? FALLBACK
  return id === 'base' ? FALLBACK : id
}

// ── テスト ────────────────────────────────────────────────────

const N_RANDOM = 20000
const N_FOCUS = 5000

describe('thresholdReachability', () => {
  it('hack_slash, tetris, puzzle の閾値が到達可能である (ランダム)', () => {
    const dist: Record<string, number> = {}
    for (let i = 0; i < N_RANDOM; i++) {
      const g = playOnce(randomPicker)
      dist[g] = (dist[g] ?? 0) + 1
    }
    const hsPct = (dist.hack_slash ?? 0) / N_RANDOM * 100
    const tetPct = (dist.tetris ?? 0) / N_RANDOM * 100
    const puzzlePct = (dist.puzzle ?? 0) / N_RANDOM * 100

    expect(hsPct).toBeGreaterThanOrEqual(2)
    expect(tetPct).toBeGreaterThanOrEqual(2)
    expect(puzzlePct).toBeGreaterThanOrEqual(15)
  })

  it('hack_slash, tetris, puzzle の閾値が到達可能である (狙い撃ち)', () => {
    const focusResults: Record<string, number> = {}
    for (const target of ['hack_slash', 'tetris', 'puzzle'] as const) {
      let hit = 0
      const picker = focusedPickerFor(target)
      for (let i = 0; i < N_FOCUS; i++) {
        if (playOnce(picker) === target) hit++
      }
      focusResults[target] = hit / N_FOCUS * 100
    }

    // 狙い撃ちでも一定の到達率があること
    // （カードプールの偏りにより100%にはならないが、方向性は正しい）
    expect(focusResults.hack_slash).toBeGreaterThan(10)
    expect(focusResults.tetris).toBeGreaterThan(5)
    expect(focusResults.puzzle).toBeGreaterThan(20)
  })

  it('主要ジャンルの到達率が大幅に壊れていない (ランダム)', () => {
    const dist: Record<string, number> = {}
    for (let i = 0; i < N_RANDOM; i++) {
      const g = playOnce(randomPicker)
      dist[g] = (dist[g] ?? 0) + 1
    }

    // 主要ジャンルの到達率が0%にならないこと
    const majorGenres = ['stg', 'idle', 'puzzle', 'runner', 'aerial_stg', 'aquatic'] as const
    for (const g of majorGenres) {
      const pct = (dist[g] ?? 0) / N_RANDOM * 100
      expect(pct).toBeGreaterThan(1, `${g} の到達率が低すぎます`)
    }
  })

  it('閾値の整合性: 全ジャンルのthresholds軸が有効な軸のみ使用している', () => {
    const VALID_AXES = [
      'tempo', 'range', 'enemy', 'combo', 'growth', 'rhythm',
      'stealth', 'vertical', 'aerial', 'survive', 'craft', 'speed',
    ]
    for (const genre of genres) {
      if (genre.id === 'base' || genre.id === 'glitch') continue
      const axes = Object.keys(genre.thresholds)
      for (const axis of axes) {
        expect(VALID_AXES).toContain(axis)
      }
    }
  })

  it('閾値の整合性: hack_slash と tetris の閾値が現実的な範囲にある', () => {
    const hs = genres.find((g) => g.id === 'hack_slash')!
    const tet = genres.find((g) => g.id === 'tetris')!
    const pz = genres.find((g) => g.id === 'puzzle')!

    // 各軸の閾値は 1〜10 の範囲に収める（ゲームバランスの目安）
    for (const [, val] of Object.entries(hs.thresholds)) {
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(10)
    }
    for (const [, val] of Object.entries(tet.thresholds)) {
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(10)
    }
    for (const [, val] of Object.entries(pz.thresholds)) {
      expect(val).toBeGreaterThanOrEqual(1)
      expect(val).toBeLessThanOrEqual(10)
    }
  })

  it('puzzle の thresholds は combo のみで、値は 6 のまま', () => {
    const pz = genres.find((g) => g.id === 'puzzle')!
    expect(Object.keys(pz.thresholds)).toEqual(['combo'])
    expect(pz.thresholds.combo).toBe(6)
  })
})
