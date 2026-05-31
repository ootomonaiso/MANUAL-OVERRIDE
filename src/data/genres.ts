/**
 * genres.ts
 *
 * ジャンル定義テーブル。
 * src/data/config.ts の GAME_CONFIG.genres から値を再エクスポートする薄いラッパー。
 * 既存のインポーター（genreResolver.ts等）との互換性を維持。
 */

import type { GenreDef, GenreId, FeatureId, ManualTheme, EnvironmentId, ScrollDirection } from '../domain/types'
import { GAME_CONFIG } from './config'

export const GENRES: GenreDef[] = GAME_CONFIG.genres.genres.map(g => ({
  id:              g.id as GenreId,
  label:           g.label,
  thresholds:      g.thresholds,
  enableFeatures:  g.enableFeatures as FeatureId[],
  disableFeatures: g.disableFeatures as FeatureId[],
  scoreFormula:    g.scoreFormula,
  manualReveal:    g.manualReveal,
  endingFlavor:    g.endingFlavor,
  theme:           g.theme as ManualTheme,
  bgColor:         g.bgColor,
  environment:     g.environment as EnvironmentId | undefined,
  scrollDirection: g.scrollDirection as ScrollDirection | undefined,
}))

export const BASE_GENRE_ID = 'base' as const
