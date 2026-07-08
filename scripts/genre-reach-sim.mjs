#!/usr/bin/env node
// カードプール到達性シミュレータ。
// ゲーム本体のロジック（cardPool.sampleCards / useGameState.choose / genreResolver）を
// Node 用に再現し、モンテカルロで各ジャンルへの到達しやすさを測る。
//
// 使い方: node genre-reach-sim.mjs <repoRoot>

import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const ROOT = process.argv[2] ?? '.'

// ── データ読み込み ──────────────────────────────────────────
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

const genres = readdirSync(join(ROOT, 'src/data/genres'))
  .filter(f => f.endsWith('.json') && !f.startsWith('TEMPLATE'))
  .map(f => read(`src/data/genres/${f}`))

const cards = readdirSync(join(ROOT, 'src/data/cards'))
  .filter(f => f.endsWith('.json') && !f.startsWith('TEMPLATE'))
  .flatMap(f => read(`src/data/cards/${f}`).cards)

const bayes = read('src/data/config/bayes.json')
const gb    = read('src/data/config/game_balance.json')
const MAX_ROUNDS = gb.maxRounds
const FALLBACK   = gb.defaultFallbackGenre
const JITTER     = 0.4 // useGameState.PARAM_JITTER_RANGE

// ── genreResolver.computeBayesianPosteriors の再現 ─────────
// base は原点、resolvable:false（glitch 等）は矛盾トリガー専用の特殊ジャンル。
// 後者は尤度計算・ランキングから完全に除外する（genreResolver と同じ扱い）。
const isCandidate = g => g.id !== 'base' && g.resolvable !== false

function posteriors(acc) {
  const un = {}
  for (const g of genres) {
    if (g.resolvable === false) continue
    const entries = Object.entries(g.thresholds)
    if (entries.length === 0) {
      const total = Object.values(acc).reduce((s, v) => s + v, 0)
      un[g.id] = Math.exp(-bayes.baseDecay * total)
      continue
    }
    let dev = 0
    for (const [axis, th] of entries) dev += Math.max(0, th - (acc[axis] ?? 0))
    un[g.id] = Math.exp(-bayes.decayRate * dev)
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

// ── cardPool.sampleCards の再現 ─────────────────────────────
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

// ── 1プレイのシミュレーション ───────────────────────────────
// picker(cardA, cardB) => 選ぶカード
function playOnce(picker) {
  const acc = {}
  let exclude = new Set()
  let post = null
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const pair = sample2(exclude, post)
    if (pair.length === 0) break
    const card = pair.length === 1 ? pair[0] : picker(pair[0], pair[1])
    exclude = new Set(pair.map(c => c.id))

    const jitter = 1 + (Math.random() - 0.5) * JITTER
    const mult = card.paramMultiplier ?? 1
    for (const [k, v] of Object.entries(card.genreParams ?? {})) {
      acc[k] = (acc[k] ?? 0) + v * jitter * mult
    }

    post = posteriors(acc)
    const conv = judge(ranked(post))
    if (conv) return conv === 'base' ? FALLBACK : conv
  }
  const top = ranked(posteriors(acc))[0]
  const id = top?.id ?? FALLBACK
  return id === 'base' ? FALLBACK : id
}

// ── プレイヤーモデル ────────────────────────────────────────
const randomPicker = (a, b) => (Math.random() < 0.5 ? a : b)

// target のジャンルへ行きたいプレイヤー: 閾値軸との内積が大きい方を選ぶ
function focusedPicker(target) {
  const th = genres.find(g => g.id === target).thresholds
  const score = c => Object.entries(c.genreParams ?? {})
    .reduce((s, [k, v]) => s + (k in th ? v : 0), 0)
  return (a, b) => {
    const sa = score(a), sb = score(b)
    if (sa === sb) return randomPicker(a, b)
    return sa > sb ? a : b
  }
}

// ── 実行 ────────────────────────────────────────────────────
const N_RANDOM = 20000
const N_FOCUS  = 3000

console.log(`カード総数: ${cards.length} / ジャンル数: ${genres.length} / MAX_ROUNDS: ${MAX_ROUNDS}\n`)

const dist = {}
for (let i = 0; i < N_RANDOM; i++) {
  const g = playOnce(randomPicker)
  dist[g] = (dist[g] ?? 0) + 1
}
console.log(`■ ランダムプレイヤー ${N_RANDOM} 回の最終ジャンル分布:`)
for (const g of genres.filter(isCandidate)) {
  const n = dist[g.id] ?? 0
  const pct = (n / N_RANDOM * 100).toFixed(1).padStart(5)
  console.log(`  ${g.id.padEnd(15)} ${pct}%  ${'#'.repeat(Math.round(n / N_RANDOM * 100))}`)
}

console.log(`\n■ 狙い撃ちプレイヤー（各ジャンル ${N_FOCUS} 回）の到達成功率:`)
const weak = []
for (const g of genres.filter(isCandidate)) {
  let hit = 0
  const picker = focusedPicker(g.id)
  for (let i = 0; i < N_FOCUS; i++) {
    if (playOnce(picker) === g.id) hit++
  }
  const rate = hit / N_FOCUS * 100
  if (rate < 25) weak.push(g.id)
  console.log(`  ${g.id.padEnd(15)} ${rate.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(rate / 2))}`)
}

console.log(`\n狙っても到達率25%未満: ${weak.length > 0 ? weak.join(', ') : 'なし'}`)
