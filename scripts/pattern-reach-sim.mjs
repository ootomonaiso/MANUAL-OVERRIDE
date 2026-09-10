#!/usr/bin/env node
// パターン系ジャンル（runner / bullet_runner / platformer）向けの到達可能性ヒューリスティック検証。
// 「最大水平・垂直ギャップを定数と比較する」単純な不等式チェック（plan/spec-pattern-system.md）。
// 実際のジャンプ軌道はシミュレートしない。
//
// 地面は常に連続する（穴は仕様変更で撤廃済み）。跳び越える必要があるのはトゲ（spike）のみ。
// トゲ同士の間隔が minSpikeLandingGapPx 未満なら「間に安全に着地できない」とみなし、
// 連続するトゲを1つのクラスタとして結合してから、クラスタ全体の幅を検証する。
//
// 使い方: node scripts/pattern-reach-sim.mjs <repoRoot>

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.argv[2] ?? '.'
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

const C = read('src/data/config/patterns.json')

let failed = 0
const fail = msg => { failed++; console.error(`  ❌  ${msg}`) }
const ok   = msg => console.log(`  ✅  ${msg}`)

// ─────────────────────────────────────────────────────────────────────────
// Runner / Bullet Runner: 水平・固定長の区間パターン
// ─────────────────────────────────────────────────────────────────────────
function checkRunnerPatterns() {
  const file = read('src/data/patterns/runner.json')
  console.log(`\n■ Runner パターン検証（${file.patterns.length}件、patternLengthPx=${file.patternLengthPx}）`)

  for (const pattern of file.patterns) {
    const entries = pattern.entries
    const spikes = entries
      .filter(e => e.kind === 'spike')
      .map(e => ({ x0: e.x, x1: e.x + e.w }))
      .sort((a, b) => a.x0 - b.x0)
    const springs = entries.filter(e => e.kind === 'spring')

    // 近接するトゲをクラスタへ結合する（間に安全に着地できないとみなす間隔）
    const clusters = []
    for (const s of spikes) {
      const last = clusters[clusters.length - 1]
      if (last && s.x0 - last.x1 < C.minSpikeLandingGapPx) {
        last.x1 = Math.max(last.x1, s.x1)
      } else {
        clusters.push({ x0: s.x0, x1: s.x1 })
      }
    }

    for (const cluster of clusters) {
      // クラスタ手前にスプリングがあれば、通常の跳躍距離チェックは免除する
      // （バネの発射力は物理定数の想定外のため、ヒューリスティックでは検証しない）
      const springAssisted = springs.some(s => s.x <= cluster.x0 && s.x + s.w > cluster.x0 - 200)
      if (springAssisted) {
        console.log(`     (spring-assisted, skip) ${pattern.id}: spike cluster ${cluster.x0}-${cluster.x1}`)
        continue
      }
      const width = cluster.x1 - cluster.x0
      if (width > C.maxDoubleJumpGapPx) {
        fail(`${pattern.id}: トゲクラスタ ${cluster.x0}-${cluster.x1} の幅 ${width}px が maxDoubleJumpGapPx(${C.maxDoubleJumpGapPx}) を超えています`)
      }
    }
  }

  if (failed === 0) ok(`全 ${file.patterns.length} パターンが到達可能性チェックを通過しました`)
}

checkRunnerPatterns()

// ─────────────────────────────────────────────────────────────────────────
// Platformer: 垂直・1画面1部屋の到達可能性（床→entries→exit を y 昇順の経路として検証）
//
// entries は route タグ（例 "a" / "b"）で複数経路に分かれうる。同タグ + タグなし
// （全ルート共通）の entries を集めて y 昇順の1本道を構成し、経路ごとに独立検証する。
// タグを一切持たない部屋は従来通り entries 全体を単一経路として扱う（後方互換）。
// ─────────────────────────────────────────────────────────────────────────
function checkPlatformerPatterns() {
  const file = read('src/data/patterns/platformer.json')
  console.log(`\n■ Platformer パターン検証（${file.patterns.length}件）`)

  for (const room of file.patterns) {
    const routeTags = [...new Set(room.entries.map(e => e.route).filter(Boolean))]
    const routes = routeTags.length > 0 ? routeTags : [undefined]

    for (const routeTag of routes) {
      const routeEntries = room.entries.filter(e => e.route === undefined || e.route === routeTag)
      const platforms = routeEntries.filter(e => e.kind === 'oneWayPlatform')
      const springs = routeEntries.filter(e => e.kind === 'spring')
      const label = routeTag ? `${room.id}[route:${routeTag}]` : room.id
      // 床（y=0, x=0幅いっぱい） → entries → exit を y 昇順でつなぐ。exit はランタイムで
      // 常に帯いっぱいの幅に上書きされる（sideScroller.ts _seedClimbRoom）ため、
      // 床と同じくw:Infinityとして扱い、JSON上のexit.x/wはyだけの参考値とする
      const chain = [{ x: 0, y: 0, w: Infinity, h: 0 }, ...platforms, { ...room.exit, w: Infinity }].sort((a, b) => a.y - b.y)

      for (let i = 1; i < chain.length; i++) {
        const from = chain[i - 1]
        const to = chain[i]
        const dy = to.y - from.y
        // 床とexitは帯幅いっぱい（w:Infinity）＝プレイヤーはどのxからでも踏み切れる／
        // どのxへでも着地できるため、それらに接続する一歩は水平距離チェックの対象外とする
        const dx = (from.w === Infinity || to.w === Infinity) ? 0 : Math.abs(to.x - from.x)

        // 直前にバネがあれば、通常の到達距離チェックは免除する（バネの発射力は想定外のため）
        const springAssisted = springs.some(s => Math.abs(s.y - from.y) < 40)
        if (springAssisted) {
          console.log(`     (spring-assisted, skip) ${label}: y${from.y}→y${to.y}`)
          continue
        }
        if (dy > C.maxDoubleJumpRisePx) {
          fail(`${label}: y${from.y}→y${to.y} の上昇量 ${dy}px が maxDoubleJumpRisePx(${C.maxDoubleJumpRisePx}) を超えています`)
        }
        if (dx > C.maxDoubleJumpGapPx) {
          fail(`${label}: y${from.y}→y${to.y} の水平距離 ${dx}px が maxDoubleJumpGapPx(${C.maxDoubleJumpGapPx}) を超えています`)
        }
      }
    }
  }

  if (failed === 0) ok(`全 ${file.patterns.length} 部屋が到達可能性チェックを通過しました`)
}

checkPlatformerPatterns()

// ─────────────────────────────────────────────────────────────────────────
// Aquatic: 垂直・エンドレス連結の到達可能性（岩=oneWayPlatform の連続する y ギャップ・
// 水平オフセットが、小重力の自由落下で到達可能な範囲に収まっているか検証する）。
//
// Runner/Platformer のジャンプ距離ベースの定数とは異なり、Aquatic は「小重力での自由落下」
// が主要な移動手段のため、専用の定数（src/data/config/aquatic.json の maxFallGapPx /
// maxFallDriftPx）を使う。セグメント境界（y=0 / y=segmentLengthPx）付近にも岩が必要
// （ランダムに連結する隣接セグメントとの接続点で理不尽な落下ギャップが生まれないようにする
// ため、双方の境界からの許容距離を maxFallGapPx の半分とする簡易ヒューリスティック）。
//
// 注意: entries の x/w は referenceWidthPx を基準とした座標であり、実行時には実際の
// 可動域帯幅へスケーリングされる（帯幅は画面サイズ依存）。本検証は referenceWidthPx を
// 実行時の典型値とみなし、スケーリング前の座標のまま maxFallDriftPx と比較する簡易
// ヒューリスティックである（実際の帯幅が referenceWidthPx から大きく外れる場合は
// 到達難度が変わりうる点に留意）。
// ─────────────────────────────────────────────────────────────────────────
function checkAquaticPatterns() {
  const AC = read('src/data/config/aquatic.json')
  const file = read('src/data/patterns/aquatic.json')
  console.log(`\n■ Aquatic パターン検証（${file.patterns.length}件、segmentLengthPx=${file.segmentLengthPx}）`)

  const boundaryMargin = AC.maxFallGapPx / 2

  for (const pattern of file.patterns) {
    const rocks = pattern.entries
      .filter(e => e.kind === 'oneWayPlatform')
      .sort((a, b) => a.y - b.y)

    if (rocks.length === 0) {
      fail(`${pattern.id}: 岩（oneWayPlatform）が1つもありません`)
      continue
    }

    const first = rocks[0]
    if (first.y > boundaryMargin) {
      fail(`${pattern.id}: 最初の岩が y=${first.y} と深すぎます（segmentLengthPx境界からの許容 ${boundaryMargin}px を超過）`)
    }
    const last = rocks[rocks.length - 1]
    const distFromEnd = file.segmentLengthPx - (last.y + last.h)
    if (distFromEnd > boundaryMargin) {
      fail(`${pattern.id}: 最後の岩がセグメント終端から ${distFromEnd}px 離れすぎています（許容 ${boundaryMargin}px）`)
    }

    for (let i = 1; i < rocks.length; i++) {
      const prev = rocks[i - 1]
      const next = rocks[i]
      const dy = next.y - (prev.y + prev.h)
      if (dy > AC.maxFallGapPx) {
        fail(`${pattern.id}: 岩の間の落下ギャップ ${dy}px（y${prev.y}→y${next.y}）が maxFallGapPx(${AC.maxFallGapPx}) を超えています`)
      }
      const prevRight = prev.x + prev.w
      const nextRight = next.x + next.w
      const dx = next.x >= prevRight ? next.x - prevRight
               : prev.x >= nextRight ? prev.x - nextRight
               : 0  // 水平範囲が重なっている＝真下に落ちるだけで届く
      if (dx > AC.maxFallDriftPx) {
        fail(`${pattern.id}: 岩の間の水平オフセット ${dx}px（y${prev.y}→y${next.y}）が maxFallDriftPx(${AC.maxFallDriftPx}) を超えています`)
      }
    }
  }

  if (failed === 0) ok(`全 ${file.patterns.length} パターンが到達可能性チェックを通過しました`)
}

checkAquaticPatterns()

console.log(`\n${'─'.repeat(48)}`)
if (failed > 0) {
  console.error(`\n💥  パターン到達可能性検証に失敗しました（${failed}件のエラー）`)
  process.exit(1)
} else {
  console.log('\n✅  全パターンが到達可能性ヒューリスティック検証を通過しました')
}
