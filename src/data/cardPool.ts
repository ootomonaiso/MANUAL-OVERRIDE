import type { ManualCard } from '../domain/types'

const _rawModules = import.meta.glob(
  ['./cards/*.json', '!./cards/TEMPLATE.json'],
  { eager: true },
)

export const CARD_POOL: ManualCard[] = []

for (const mod of Object.values(_rawModules)) {
  const data = mod as { cards?: ManualCard[] }
  if (Array.isArray(data.cards)) {
    CARD_POOL.push(...data.cards)
  }
}

/**
 * genreAffinity と genreWeights（各ジャンルの収束進捗 0〜1）を掛け合わせた実効重みを返す。
 * 傾向が強いジャンルに向かうカードほど最大 1.75x まで重みが上がる。
 */
function _effectiveWeight(card: ManualCard, genreWeights?: Record<string, number>): number {
  const base = card.weight ?? 1
  if (!genreWeights || !card.genreAffinity?.length) return base
  const affinityScore = card.genreAffinity.reduce((sum, g) => sum + (genreWeights[g] ?? 0), 0)
  return base * (1 + Math.min(1.5, affinityScore) * 0.5)
}

/**
 * 重み付きランダムサンプリングで n 枚選ぶ。
 * excludeIds に含まれるカードは候補から除外する（直前の選択肢を再出現させない）。
 * genreWeights が渡された場合、affinity が合うカードの重みを最大 1.75x に増幅する。
 */
export function sampleCards(
  n: number,
  excludeIds?: Set<string>,
  genreWeights?: Record<string, number>,
): ManualCard[] {
  const available = excludeIds
    ? CARD_POOL.filter(c => !excludeIds.has(c.id))
    : [...CARD_POOL]

  if (available.length <= n) return [...available]

  const result: ManualCard[] = []
  const used = new Set<string>()

  while (result.length < n) {
    const pool = available.filter(c => !used.has(c.id))
    if (pool.length === 0) break

    const totalWeight = pool.reduce((s, c) => s + _effectiveWeight(c, genreWeights), 0)
    let rand = Math.random() * totalWeight

    for (const card of pool) {
      rand -= _effectiveWeight(card, genreWeights)
      if (rand <= 0) {
        result.push(card)
        used.add(card.id)
        break
      }
    }
  }

  return result
}
