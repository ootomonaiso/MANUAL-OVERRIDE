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
 * splice で選出済み要素を除去することで毎回の filter 再生成を省く。
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

  const pool = [...available]
  const result: ManualCard[] = []

  while (result.length < n && pool.length > 0) {
    const totalWeight = pool.reduce((s, c) => s + _effectiveWeight(c, genreWeights), 0)
    let rand = Math.random() * totalWeight
    let idx = pool.length - 1  // 浮動小数点誤差で rand > 0 のまま末尾到達した場合のガード
    for (let i = 0; i < pool.length; i++) {
      rand -= _effectiveWeight(pool[i], genreWeights)
      if (rand <= 0) { idx = i; break }
    }
    result.push(...pool.splice(idx, 1))
  }

  return result
}
