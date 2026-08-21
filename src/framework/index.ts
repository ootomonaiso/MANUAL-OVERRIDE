/**
 * framework/index.ts
 * マニュアルデッキ + ゲーム設定フレームワークの公開 API。
 *
 * # Manual API
 * 新しいブランチを追加する方法は 2 通り：
 * ① JSON ファイルを追加（コンテンツのみ、TS 不要）
 *    → src/data/manuals/ に *.json を追加するだけで自動収集される
 * ② ManualBuilder で TypeScript から定義（プログラム的に生成したい場合）
 *    → build() で得たタプルを extendDeck() に渡す
 *
 * # Config API
 * ゲームパラメータを JSON で管理：
 * - src/data/config/*.json に各セクション定義
 * - src/data/config.ts でグロブ収集・検証
 */

// Manual API (existing)
export { ManualBuilder } from './ManualBuilder'
export { loadFromGlob, buildFromFiles, extendDeck } from './ManualLoader'
export { validateDeck, devValidate } from './ManualValidator'
export type { ManualDeckFile, ManualEntryJSON, ChoiceJSON } from './types'

// Config API (new)
export { loadConfigFromGlob, normalizeGenreDef } from './ConfigLoader'
export { validateGameConfig, devValidateConfig, devValidateSfx } from './ConfigValidator'
export type {
  GameConfigMap,
  GameConfigSection,
  PhysicsConfig,
  ShootConfig,
  ThrowConfig,
  VfxConfig,
  CameraConfig,
  BackgroundConfig,
  HazardVfxConfig,
  UiConfig,
  ScoreConfig,
  DifficultyConfig,
  BossConfig,
  RhythmTuningConfig,
  StealthConfig,
  GenreParamsConfig,
  GameBalanceConfig,
  GenresConfig,
  GenreDefJSON,
  GenreDefJSONInput,
  SpawnConfig,
} from './config-types'

// SFX API
export { SFX_DEFS } from './SfxLoader'
export type { SfxDef, SfxTrack, SfxOscTrack, SfxNoiseTrack, SfxFilter, WaveType } from './sfx-types'
