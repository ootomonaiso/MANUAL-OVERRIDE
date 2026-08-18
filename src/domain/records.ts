/**
 * src/domain/records.ts
 *
 * 記録（自己ベスト / ジャンル別ベスト / 累積統計）の純粋関数。
 * localStorage への读写は loadRecords / saveRecords が担当し、
 * recordGame 自体は副作用を持たない。
 */

import type {
  BestEntry,
  GameResult,
  RecordUpdateResult,
  SaveRecords,
} from './types'

export const DEFAULT_RECORDS: SaveRecords = {
  overallBest: null,
  perGenre: {},
  playCount: 0,
  totalDistance: 0,
  totalPlayTime: 0,
}

/**
 * localStorage から記録を読み込む。
 * 壊れた JSON や QuotaExceeded 等は try/catch で DEFAULT_RECORDS を返す。
 */
export function loadRecords(key: string): SaveRecords {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { ...DEFAULT_RECORDS }
    const parsed = JSON.parse(raw) as SaveRecords
    // 最低限の形状チェック
    if (parsed && typeof parsed.playCount === 'number' && typeof parsed.totalDistance === 'number') {
      return parsed
    }
    return { ...DEFAULT_RECORDS }
  } catch {
    return { ...DEFAULT_RECORDS }
  }
}

/**
 * 記録を localStorage に保存する。
 * QuotaExceeded 等は console.warn して無視（ゲームを止めない）。
 */
export function saveRecords(key: string, r: SaveRecords): void {
  try {
    localStorage.setItem(key, JSON.stringify(r))
  } catch (e) {
    console.warn('[records] save failed:', e)
  }
}

/**
 * 純粋関数: 1ゲームの結果から記録を更新する。
 * - playCount +1, totalDistance += distance, totalPlayTime += survivedSec
 * - overallBest: total が旧値より大きければ更新（newOverall=true）
 * - perGenre[genre]: total が旧値より大きければ更新（newGenre=true）
 *
 * 副作用なし（保存は呼び出し側が saveRecords で行う）。
 */
export function recordGame(prev: SaveRecords, result: GameResult): RecordUpdateResult {
  const now = new Date().toISOString()

  const newOverallBest: BestEntry = {
    total: result.total,
    play: result.play,
    throw: result.throw,
    genre: result.genre,
    distance: result.distance,
    date: now,
  }

  const newPerGenre: Record<string, BestEntry> = { ...prev.perGenre }
  const prevGenreBest = prev.perGenre[result.genre]
  const newGenre = !prevGenreBest || result.total > prevGenreBest.total
  if (newGenre) {
    newPerGenre[result.genre] = newOverallBest
  }

  const newOverall = !prev.overallBest || result.total > prev.overallBest.total
  const updated: SaveRecords = {
    overallBest: newOverall ? newOverallBest : prev.overallBest,
    perGenre: newPerGenre,
    playCount: prev.playCount + 1,
    totalDistance: prev.totalDistance + result.distance,
    totalPlayTime: prev.totalPlayTime + result.survivedSec,
  }

  return {
    records: updated,
    newOverall,
    newGenre,
  }
}
