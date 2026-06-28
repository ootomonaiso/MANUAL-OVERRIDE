import { reactive, readonly } from 'vue'
import type { DebugSettings } from './types'

const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  forceGenre: null,
  showManual: true,
}

export function useDebugSettings() {
  const debugSettings = reactive<DebugSettings>({ ...DEFAULT_DEBUG_SETTINGS })

  /** OKボタン押下時に呼ばれる。デバッグ設定を反映する */
  function applyDebug(settings: DebugSettings) {
    Object.assign(debugSettings, settings)
  }

  /** デバッグ設定を初期状態へ戻す */
  function resetDebug() {
    Object.assign(debugSettings, DEFAULT_DEBUG_SETTINGS)
  }

  return {
    debugSettings: readonly(debugSettings) as DebugSettings,
    applyDebug,
    resetDebug,
  }
}
