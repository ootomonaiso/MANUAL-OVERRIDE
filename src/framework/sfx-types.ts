/**
 * src/framework/sfx-types.ts
 *
 * JSON 駆動 SE システムの型定義。
 * 各型は src/data/sfx/*.json のスキーマと 1:1 に対応する。
 */

export type WaveType = 'sine' | 'triangle' | 'square' | 'sawtooth'

/** 帯域フィルタ（任意）。freqEnd を与えると指数スweep。 */
export interface SfxFilter {
  type: 'lowpass' | 'highpass' | 'bandpass'
  freq: number
  freqEnd?: number
  q?: number
}

/** オシレーター1音。 */
export interface SfxOscTrack {
  kind: 'osc'
  wave: WaveType
  freq: number
  freqEnd?: number
  durationSec: number
  volume: number
  delaySec?: number
  filter?: SfxFilter
}

/** ノイズ1音（白ノイズバッファ + 任意フィルタ）。 */
export interface SfxNoiseTrack {
  kind: 'noise'
  durationSec: number
  volume: number
  delaySec?: number
  filter?: SfxFilter
}

export type SfxTrack = SfxOscTrack | SfxNoiseTrack

/** 1つの効果音 = トラックの集合（同時/遅延で重なる）。 */
export interface SfxDef {
  id: string
  $comment?: string
  tracks: SfxTrack[]
}
