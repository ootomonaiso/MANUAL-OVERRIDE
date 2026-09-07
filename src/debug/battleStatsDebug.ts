/**
 * debug/battleStatsDebug.ts
 * デバッグ用の戦闘統計トラッカー（DEBUG_MODE時のみ有効）。
 *
 * 「n戦目に平均何ダメージ出しているか/受けているか」「n戦目の属性別ダメージ」
 * 「n戦目の平均ステータス」を、複数回のラン（プレイ）をまたいで集計する。
 * ラン1回ぶんでは battleIndex ごとに1サンプルしか取れないため、同じ battleIndex を
 * 何度も（＝何度もリロード・周回して）通過することで平均値の意味が出てくる想定。
 *
 * localStorage へ永続化するためブラウザのリロードをまたいで保持される。
 * プレイヤー側・敵側のバランスを大きく変えた時はデータの意味が失われるため、
 * window.__battleStatsDebug.clear() で手動破棄する（自動破棄はしない）。
 *
 * 計測は effectOps/damage.ts（'damage' op、通常の攻撃・スキルダメージ全般）でのみ行う。
 * DOT・カウンター反撃・自傷（selfDamageFromDealt）等の特殊経路は含まれない
 * （デバッグ用の簡易集計として割り切っている）。
 */

import { DEBUG_MODE } from './const'
import type { Combatant, Element, EffectiveStats, GrowthStatKey } from '../domain/battle/types'
import { GROWTH_STAT_KEYS } from '../domain/battle/types'

const STORAGE_KEY = 'manual-override:debugBattleStats:v1'
const ELEMENTS: readonly Element[] = ['physical', 'magical', 'special', 'none']

interface PerBattleAggregate {
  /** この battleIndex を何回分サンプリングしたか */
  count: number
  dmgDealtSum: number
  dmgTakenSum: number
  dmgByElementSum: Record<Element, number>
  statsSum: Record<GrowthStatKey, number>
}

interface StoredData {
  version: 1
  perBattle: Record<string, PerBattleAggregate>
}

function emptyAggregate(): PerBattleAggregate {
  return {
    count: 0, dmgDealtSum: 0, dmgTakenSum: 0,
    dmgByElementSum: { physical: 0, magical: 0, special: 0, none: 0 },
    statsSum: { hp: 0, str: 0, def: 0, int: 0, ref: 0, agi: 0 },
  }
}

function emptyStore(): StoredData {
  return { version: 1, perBattle: {} }
}

function load(): StoredData {
  if (typeof localStorage === 'undefined') return emptyStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as Partial<StoredData>
    if (parsed.version !== 1 || typeof parsed.perBattle !== 'object' || !parsed.perBattle) return emptyStore()
    return parsed as StoredData
  } catch {
    return emptyStore()
  }
}

function save(data: StoredData): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* 容量超過等はデバッグ用のため無視 */ }
}

// ── 進行中の戦闘の累積（メモリ上。戦闘終了時に localStorage へ反映する） ──
let currentBattleIndex: number | null = null
let dmgDealt = 0
let dmgTaken = 0
let dmgByElement: Record<Element, number> = { physical: 0, magical: 0, special: 0, none: 0 }
let statsSnapshot: EffectiveStats | null = null

/** 戦闘開始時（useBattleState.ts::startBattle）に呼ぶ。累積をリセットし、プレイヤーの実効ステータスを控える */
export function beginBattleStatsDebug(battleIndex: number, playerEffectiveStats: EffectiveStats): void {
  if (!DEBUG_MODE) return
  currentBattleIndex = battleIndex
  dmgDealt = 0
  dmgTaken = 0
  dmgByElement = { physical: 0, magical: 0, special: 0, none: 0 }
  statsSnapshot = { ...playerEffectiveStats }
}

/** damage op が命中を確定させ HP へ反映した直後に呼ぶ */
export function recordDamageDebug(source: Combatant, target: Combatant, element: Element, amount: number): void {
  if (!DEBUG_MODE || currentBattleIndex === null) return
  if (source.isPlayer) {
    dmgDealt += amount
    dmgByElement[element] += amount
  }
  if (target.isPlayer) dmgTaken += amount
}

/** 戦闘終了（勝敗・ギブアップ問わず）時に呼ぶ。累積を localStorage の平均集計へ加算する */
export function endBattleStatsDebug(): void {
  if (!DEBUG_MODE || currentBattleIndex === null || !statsSnapshot) return
  const data = load()
  const key = String(currentBattleIndex)
  const agg = data.perBattle[key] ?? emptyAggregate()
  agg.count++
  agg.dmgDealtSum += dmgDealt
  agg.dmgTakenSum += dmgTaken
  for (const el of ELEMENTS) agg.dmgByElementSum[el] += dmgByElement[el]
  for (const stat of GROWTH_STAT_KEYS) agg.statsSum[stat] += statsSnapshot[stat]
  data.perBattle[key] = agg
  save(data)
  currentBattleIndex = null
  statsSnapshot = null
}

/** 手動で全データを破棄する（プレイヤー・敵のバランスを大きく変えた時用） */
export function clearBattleStatsDebug(): void {
  save(emptyStore())
  currentBattleIndex = null
  statsSnapshot = null
}

export interface BattleStatsRow {
  /** 1始まりの戦闘番号（n戦目。他画面表示と同じく battleIndex+1） */
  battleNumber: number
  samples: number
  avgDamageDealt: number
  avgDamageTaken: number
  avgDamageByElement: Record<Element, number>
  avgStats: Record<GrowthStatKey, number>
}

/** 集計結果を行データとして返す（battleNumber昇順） */
export function getBattleStatsDebugRows(): BattleStatsRow[] {
  const data = load()
  return Object.entries(data.perBattle)
    .map(([key, agg]) => {
      const c = agg.count || 1
      const avgStats = {} as Record<GrowthStatKey, number>
      for (const stat of GROWTH_STAT_KEYS) avgStats[stat] = agg.statsSum[stat] / c
      const avgDamageByElement = {} as Record<Element, number>
      for (const el of ELEMENTS) avgDamageByElement[el] = agg.dmgByElementSum[el] / c
      return {
        battleNumber: Number(key) + 1,
        samples: agg.count,
        avgDamageDealt: agg.dmgDealtSum / c,
        avgDamageTaken: agg.dmgTakenSum / c,
        avgDamageByElement,
        avgStats,
      }
    })
    .sort((a, b) => a.battleNumber - b.battleNumber)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** CSV文字列に変換する（Claude・人間どちらも読みやすい単純な列構成） */
export function getBattleStatsDebugCsv(): string {
  const header = [
    'battleNumber', 'samples', 'avgDamageDealt', 'avgDamageTaken',
    'avgDmgPhysical', 'avgDmgMagical', 'avgDmgSpecial', 'avgDmgNone',
    ...GROWTH_STAT_KEYS.map(stat => `avg${stat}`),
  ]
  const lines = [header.join(',')]
  for (const r of getBattleStatsDebugRows()) {
    lines.push([
      r.battleNumber, r.samples,
      round1(r.avgDamageDealt), round1(r.avgDamageTaken),
      round1(r.avgDamageByElement.physical), round1(r.avgDamageByElement.magical),
      round1(r.avgDamageByElement.special), round1(r.avgDamageByElement.none),
      ...GROWTH_STAT_KEYS.map(stat => round1(r.avgStats[stat])),
    ].join(','))
  }
  return lines.join('\n')
}

/**
 * devtools コンソール / Claude Browser の javascript_tool から直接呼べるよう window へ公開する。
 * 例: window.__battleStatsDebug.getCsv() / .clear()
 */
declare global {
  interface Window {
    __battleStatsDebug?: {
      getCsv: () => string
      getRows: () => BattleStatsRow[]
      clear: () => void
    }
  }
}

if (DEBUG_MODE && typeof window !== 'undefined') {
  window.__battleStatsDebug = {
    getCsv: getBattleStatsDebugCsv,
    getRows: getBattleStatsDebugRows,
    clear: clearBattleStatsDebug,
  }
}
