/**
 * src/data/rpg/battleGuide.ts
 * rpg ジャンルの遊び方ガイド・用語集の読み込み（src/data/rpg/battle-guide.json）。
 * HelpGuide.vue / GlossaryTerm.vue から参照する。
 */

import raw from './battle-guide.json'

export interface GuideSection {
  id: string
  title: string
  body: string[]
}

export interface GlossaryTermDef {
  label: string
  body: string
}

/**
 * battle-guide.json には JSON Schema が無く validate-json.mjs の対象外
 * （単体ファイルは walkJson の対象ディレクトリに含まれない）。
 * 他のローダー（battleContent.ts / battleBackgrounds.ts）は不正データを
 * 検証してスキップする一方、ここは無検証キャストだったため揃える
 * （docs/refactoring/06-data-config.md §5-4）。
 */
function _validateSections(v: unknown): GuideSection[] {
  if (!Array.isArray(v)) {
    console.error('[battleGuide] sections が配列ではありません。空配列にフォールバックします。')
    return []
  }
  return v as GuideSection[]
}
function _validateTerms(v: unknown): Record<string, GlossaryTermDef> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    console.error('[battleGuide] terms がオブジェクトではありません。空オブジェクトにフォールバックします。')
    return {}
  }
  return v as Record<string, GlossaryTermDef>
}

export const BATTLE_GUIDE_SECTIONS: readonly GuideSection[] = _validateSections(raw.sections)
export const BATTLE_GLOSSARY: Readonly<Record<string, GlossaryTermDef>> = _validateTerms(raw.terms)
