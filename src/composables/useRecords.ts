/**
 * src/composables/useRecords.ts
 *
 * 記録の ViewModel。
 * 読み込み / 更新 / 保存をラップし、Vue のリアクティブ state として公開する。
 */

import { ref, readonly } from 'vue'
import { recordGame as recordGamePure, loadRecords, saveRecords, DEFAULT_RECORDS } from '../domain/records'
import type { SaveRecords, GameResult, RecordUpdateResult } from '../domain/types'
import { RECORDS } from '../data/tunables'
import { soundManager } from '../plugins/SoundManager'

export function useRecords() {
  const records = ref<SaveRecords>(loadRecords(RECORDS.storageKey))
  const lastUpdate = ref<RecordUpdateResult | null>(null)

  function recordGame(result: GameResult): RecordUpdateResult {
    const res = recordGamePure(records.value, result)
    records.value = res.records
    saveRecords(RECORDS.storageKey, res.records)
    lastUpdate.value = res
    if (res.newOverall || res.newGenre) {
      soundManager.onRecordUpdate()
    }
    return res
  }

  function reset(): void {
    records.value = { ...DEFAULT_RECORDS }
    lastUpdate.value = null
  }

  return {
    records: readonly(records),
    lastUpdate: readonly(lastUpdate),
    recordGame,
    reset,
  }
}
