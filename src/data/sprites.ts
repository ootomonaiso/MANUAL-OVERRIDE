/**
 * src/data/sprites.ts
 *
 * src/data/sprites/*.json を自動収集し、SPRITES マップを構築する。
 * src/data/config.ts のジャンル自動収集と同型のパターン。
 *
 * ── スプライトを追加するには ──────────────────────────────────────
 * src/data/sprites/my_sprite.json を追加するだけ。
 * 形式は schemas/sprite.schema.json を参照。
 * ────────────────────────────────────────────────────────────────
 */

export interface SpriteDef {
  id: string
  w: number
  h: number
  palette: Record<string, string>
  frames: Record<string, readonly string[]>
}

const _modules = import.meta.glob('./sprites/*.json', { eager: true })

const _sprites: Record<string, SpriteDef> = {}
for (const [path, mod] of Object.entries(_modules)) {
  const raw = ((mod as { default?: unknown }).default ?? mod) as Partial<SpriteDef>
  if (typeof raw.id !== 'string') {
    console.error(`[sprites] ${path}: id が見つかりません。このスプライトはスキップされます。`)
    continue
  }
  if (_sprites[raw.id]) {
    console.warn(`[sprites] id "${raw.id}" が重複しています (${path})。上書きします。`)
  }
  _sprites[raw.id] = raw as SpriteDef
}

/** スプライトID → 定義のマップ。src/data/sprites/*.json を自動収集したもの。 */
export const SPRITES: Readonly<Record<string, SpriteDef>> = _sprites
