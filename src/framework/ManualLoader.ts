/**
 * framework/ManualLoader.ts
 *
 * JSON ファイルから ManualVersion のマップを構築する。
 *
 * Vite の import.meta.glob を使い、src/data/manuals/*.json を
 * 自動収集する。新しいブランチを追加する場合はファイルを置くだけでOK。
 *
 * @example src/data/manualDeck.ts での使用例:
 * ```ts
 * import { loadFromGlob } from '../framework/ManualLoader'
 * const raw = import.meta.glob('./manuals/*.json', { eager: true })
 * export const MANUAL_DECK = loadFromGlob(raw)
 * ```
 */

import type { ManualVersion } from '../domain/types'
import type { ManualDeckFile, ManualEntryJSON } from './types'


const DEFAULT_HAZARDS = { colors: ['red'], safeColors: ['blue'] } as const

// ──────────────────────────────────────────────────────────────────────
// パブリック API
// ──────────────────────────────────────────────────────────────────────

/**
 * import.meta.glob の結果（{ [path]: module }）から MANUAL_DECK を構築。
 * ファイルの読み込み順序は確定していないため、ファイル間でキーが重複した
 * 場合は後勝ちで上書きされる（warningをコンソールに出力）。
 */
export function loadFromGlob(
  modules: Record<string, unknown>,
): Record<string, ManualVersion> {
  const deck: Record<string, ManualVersion> = {}

  for (const [filePath, mod] of Object.entries(modules)) {
    const raw = (mod as { default?: unknown })?.default ?? mod
    if (!_isManualDeckFile(raw)) {
      console.warn(`[ManualLoader] ${filePath}: 不正なフォーマット。"entries" 配列が必要です。`)
      continue
    }
    const entries = _parseFile(raw, filePath)
    for (const [key, ver] of entries) {
      if (deck[key]) {
        console.warn(`[ManualLoader] キー "${key}" が重複しています (${filePath})。上書きします。`)
      }
      deck[key] = ver
    }
  }

  return deck
}

/**
 * ManualDeckFile の配列から MANUAL_DECK を構築（静的インポート用）。
 * ```ts
 * import baseDeck from './manuals/base.json'
 * import stgDeck  from './manuals/stg.json'
 * export const MANUAL_DECK = buildFromFiles([baseDeck, stgDeck])
 * ```
 */
export function buildFromFiles(files: ManualDeckFile[]): Record<string, ManualVersion> {
  const deck: Record<string, ManualVersion> = {}
  for (const file of files) {
    for (const [key, ver] of _parseFile(file, file.id)) {
      deck[key] = ver
    }
  }
  return deck
}

/**
 * 既存の MANUAL_DECK にエントリーを追加（ManualBuilder と組み合わせて使う）。
 * ```ts
 * import { MANUAL_DECK } from './manualDeck'
 * import { ManualBuilder } from '../framework/ManualBuilder'
 * const [key, ver] = new ManualBuilder('2.0-dlc', '2.0').text('...').build()
 * extendDeck(MANUAL_DECK, [[key, ver]])
 * ```
 */
export function extendDeck(
  deck: Record<string, ManualVersion>,
  entries: Array<[string, ManualVersion]>,
): void {
  for (const [key, ver] of entries) {
    deck[key] = ver
  }
}

// ──────────────────────────────────────────────────────────────────────
// 内部ヘルパー
// ──────────────────────────────────────────────────────────────────────

function _parseFile(
  file: ManualDeckFile,
  filePath: string,
): Array<[string, ManualVersion]> {
  const result: Array<[string, ManualVersion]> = []

  for (const entry of file.entries) {
    const key = entry.key ?? entry.version

    if (!key) {
      console.warn(`[ManualLoader] ${filePath}: key も version も未指定のエントリーをスキップしました。`)
      continue
    }

    const ver = _parseEntry(entry)
    result.push([key, ver])
  }

  return result
}

function _parseEntry(entry: ManualEntryJSON): ManualVersion {
  const hazards = {
    colors:     entry.hazards?.colors     ?? [...DEFAULT_HAZARDS.colors],
    safeColors: entry.hazards?.safeColors ?? [...DEFAULT_HAZARDS.safeColors],
  }

  const choices = (entry.choices ?? []).map((c, idx) => ({
    id:             c.id ?? `${entry.key ?? entry.version}-choice-${idx}`,
    label:          c.label,
    hint:           c.hint,
    next:           c.next,
    genreParams:    c.genreParams,
    paramMultiplier: c.paramMultiplier,
  }))

  // image パスの正規化（ファイル名のみの場合は /manuals/ プレフィックスを付与）
  let image: string | undefined
  if (entry.image) {
    image = entry.image.startsWith('/') ? entry.image : `/manuals/${entry.image}`
  }

  // RuntimeOverrides → ManualRuntimeConfig 変換
  let runtimeConfig: ManualVersion['runtimeConfig']
  if (entry.runtimeOverrides) {
    const ov = entry.runtimeOverrides
    runtimeConfig = {
      scrollSpeed:    ov.scrollSpeed,
      gravity:        ov.gravity ?? ov.physics?.gravity,
      bpm:            ov.bpm,
      scrollDirection: ov.scrollDirection,
      environment:    ov.environment,
      playerMaxHp:    ov.playerMaxHp ?? ov.spawn?.enemyHpAmount,
      timescale:      ov.timescale,
      colorTouchScore: ov.colorTouchScore,
      forceGenreId:   ov.forceGenreId,
    }
    // すべて undefined なら runtimeConfig ごと省略
    if (Object.values(runtimeConfig).every(v => v === undefined)) {
      runtimeConfig = undefined
    }
  }

  return {
    version:       entry.version,
    manualText:    [...entry.manualText],
    image,
    imageAlt:      entry.imageAlt,
    choices,
    hazards,
    runtimeConfig,
    tutorialHint:  entry.tutorialHint,
    narrative:     entry.narrative,
    learningRules: entry.learningRules,
  }
}

function _isManualDeckFile(raw: unknown): raw is ManualDeckFile {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'entries' in raw &&
    Array.isArray((raw as ManualDeckFile).entries)
  )
}
