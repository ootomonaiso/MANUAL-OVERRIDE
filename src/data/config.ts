/**
 * src/data/config.ts
 *
 * ゲーム設定の統合エントリーポイント。
 * src/data/config/*.json を自動収集し、GAME_CONFIG を構築。
 */

import { loadConfigFromGlob, devValidateConfig } from '../framework'

const _rawModules = import.meta.glob('./config/*.json', { eager: true })

export const GAME_CONFIG = loadConfigFromGlob(_rawModules)

devValidateConfig(GAME_CONFIG)
