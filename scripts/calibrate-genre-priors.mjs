#!/usr/bin/env node
// bayes.json の genrePriors 較正ツール。
// genre-reach-sim.mjs と同じロジックのモンテカルロで「有効ジャンル」のランダム
// プレイ収束分布を測り、出現率がほぼ均等になるよう各ジャンルの尤度倍率
// (genrePriors) を反復的に求める（IPF風の対数空間アップデート + 直近平均化）。
//
// 使い方: node scripts/calibrate-genre-priors.mjs <repoRoot>
// 出力された genrePriors オブジェクトを src/data/config/bayes.json に貼り付ける。
// thresholds やカードプールの genreParams/genreAffinity を変更した場合は再実行すること。

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] ?? '.'
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

const genres = readdirSync(join(ROOT, 'src/data/genres'))
  .filter(f => f.endsWith('.json') && !f.startsWith('TEMPLATE'))
  .map(f => read(`src/data/genres/${f}`))

const cards = readdirSync(join(ROOT, 'src/data/cards'))
  .filter(f => f.endsWith('.json') && !f.startsWith('TEMPLATE'))
  .flatMap(f => read(`src/data/cards/${f}`).cards)

const bayes = read('src/data/config/bayes.json')
const gb = read('src/data/config/game_balance.json')
const MAX_ROUNDS = gb.maxRounds
const FALLBACK = gb.defaultFallbackGenre
const JITTER = 0.4

// 較正対象: resolvable !== false の全ジャンル（base を除く）
const TARGET_IDS = genres
  .filter(g => g.id !== 'base' && g.resolvable !== false)
  .map(g => g.id)

const isCandidate = g => g.id !== 'base' && g.resolvable !== false

function posteriors(acc, priors) {
  const un = {}
  for (const g of genres) {
    if (g.resolvable === false) continue
    const prior = priors[g.id] ?? 1
    const entries = Object.entries(g.thresholds)
    if (entries.length === 0) {
      const total = Object.values(acc).reduce((s, v) => s + v, 0)
      un[g.id] = prior * Math.exp(-bayes.baseDecay * total)
      continue
    }
    let dev = 0
    for (const [axis, th] of entries) dev += Math.max(0, th - (acc[axis] ?? 0))
    un[g.id] = prior * Math.exp(-bayes.decayRate * dev)
  }
  const sum = Object.values(un).reduce((s, v) => s + v, 0)
  const post = {}
  for (const g of genres) post[g.id] = (un[g.id] ?? 0) / sum
  return post
}

function ranked(post) {
  return genres.filter(isCandidate)
    .map(g => ({ id: g.id, prob: post[g.id] ?? 0 }))
    .sort((a, b) => b.prob - a.prob)
}

function judge(rk) {
  const [top, second] = rk
  if (!top || top.prob < bayes.minProb) return null
  if (second && top.prob < bayes.dominanceRatio * second.prob) return null
  return top.id
}

function effWeight(card, gw) {
  const base = card.weight ?? 1
  if (!gw || !card.genreAffinity?.length) return base
  const a = card.genreAffinity.reduce((s, g) => s + (gw[g] ?? 0), 0)
  return base * (1 + Math.min(1.5, a) * 0.5)
}

function sample2(exclude, gw) {
  const pool = cards.filter(c => !exclude.has(c.id))
  const out = []
  while (out.length < 2 && pool.length > 0) {
    const total = pool.reduce((s, c) => s + effWeight(c, gw), 0)
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

const randomPicker = (a, b) => (Math.random() < 0.5 ? a : b)

function playOnce(priors) {
  const acc = {}
  let exclude = new Set()
  let post = null
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const pair = sample2(exclude, post)
    if (pair.length === 0) break
    const card = pair.length === 1 ? pair[0] : randomPicker(pair[0], pair[1])
    exclude = new Set(pair.map(c => c.id))
    const jitter = 1 + (Math.random() - 0.5) * JITTER
    const mult = card.paramMultiplier ?? 1
    for (const [k, v] of Object.entries(card.genreParams ?? {})) {
      acc[k] = (acc[k] ?? 0) + v * jitter * mult
    }
    post = posteriors(acc, priors)
    const conv = judge(ranked(post))
    if (conv) return conv === 'base' ? FALLBACK : conv
  }
  const top = ranked(posteriors(acc, priors))[0]
  const id = top?.id ?? FALLBACK
  return id === 'base' ? FALLBACK : id
}

function simulate(priors, n) {
  const dist = {}
  for (let i = 0; i < n; i++) {
    const g = playOnce(priors)
    dist[g] = (dist[g] ?? 0) + 1
  }
  return dist
}

// ── 反復較正 ─────────────────────────────────────────────────
const N = 20000
const ITERS = 30
const BURN_IN = 14
const DAMPING = 0.35
const MIN_PRIOR = 0.1
const MAX_PRIOR = 15.0

let priors = Object.fromEntries(TARGET_IDS.map(id => [id, 1]))
const logPriorSum = Object.fromEntries(TARGET_IDS.map(id => [id, 0]))
let avgCount = 0

console.log(`較正対象ジャンル (${TARGET_IDS.length}): ${TARGET_IDS.join(', ')}\n`)

for (let iter = 0; iter < ITERS; iter++) {
  const dist = simulate(priors, N)
  const target = 1 / TARGET_IDS.length
  const line = TARGET_IDS.map(id => `${id}:${((dist[id] ?? 0) / N * 100).toFixed(1)}%`).join(' ')
  console.log(`iter ${iter}: ${line}`)

  for (const id of TARGET_IDS) {
    const obs = Math.max((dist[id] ?? 0) / N, 0.001)
    const logRatio = DAMPING * Math.log(target / obs)
    const nextLog = Math.log(priors[id]) + logRatio
    priors[id] = Math.min(MAX_PRIOR, Math.max(MIN_PRIOR, Math.exp(nextLog)))
  }

  if (iter >= BURN_IN) {
    for (const id of TARGET_IDS) logPriorSum[id] += Math.log(priors[id])
    avgCount++
  }
}

const averagedPriors = Object.fromEntries(
  TARGET_IDS.map(id => [id, Number(Math.exp(logPriorSum[id] / avgCount).toFixed(3))]),
)

console.log('\n■ genrePriors (bayes.json に貼り付ける値):')
console.log(JSON.stringify(averagedPriors, null, 2))

console.log('\n■ 検証シミュレーション (N=50000):')
const finalDist = simulate(averagedPriors, 50000)
for (const id of TARGET_IDS) {
  console.log(`  ${id.padEnd(15)} ${((finalDist[id] ?? 0) / 50000 * 100).toFixed(2)}%`)
}
