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

export const BATTLE_GUIDE_SECTIONS: readonly GuideSection[] = raw.sections
export const BATTLE_GLOSSARY: Readonly<Record<string, GlossaryTermDef>> = raw.terms
