/**
 * src/domain/skins.ts
 *
 * スキンの読み込み・解放判定・選択永続化。
 * skins.json は `import` 時に静的に読み込まれる。
 */

import skinsJson from '../data/skins.json'
import type { PlayerSkin, SaveRecords, SkinDef } from './types'

/** skins.json のスキーマ */
interface SkinsJson {
  skins: SkinDef[]
}

/**
 * スキン定義一覧を返す。
 */
export function loadSkins(): SkinDef[] {
  return (skinsJson as SkinsJson).skins
}

/**
 * ID からスキンを1つ取得する。
 */
export function getSkinById(id: string): SkinDef | undefined {
  return loadSkins().find(s => s.id === id)
}

/**
 * 選択済みスキンIDを localStorage から読み込む。
 * 未設定 / 無効な ID の場合は 'default' を返す。
 */
export function loadSelectedSkinId(key: string): string {
  try {
    const raw = localStorage.getItem(key)
    if (raw && getSkinById(raw)) return raw
  } catch {
    // no-op
  }
  return 'default'
}

/**
 * 選択済みスキンIDを localStorage に保存する。
 */
export function saveSelectedSkinId(key: string, id: string): void {
  try {
    localStorage.setItem(key, id)
  } catch {
    // no-op
  }
}

/**
 * スキンの解放判定。
 * - free → true
 * - record → records[metric] >= threshold
 */
export function isSkinUnlocked(skin: SkinDef, records: SaveRecords): boolean {
  if (skin.unlock.type === 'free') return true

  if (skin.unlock.type === 'record') {
    const metric = skin.unlock.metric
    switch (metric) {
      case 'totalDistance':
        return records.totalDistance >= skin.unlock.threshold
      case 'overallBestTotal':
        return records.overallBest !== null && records.overallBest.total >= skin.unlock.threshold
      case 'playCount':
        return records.playCount >= skin.unlock.threshold
      case 'totalPlayTime':
        return records.totalPlayTime >= skin.unlock.threshold
      default:
        return false
    }
  }

  return false
}

/**
 * SkinDef から描画用の PlayerSkin へ変換（unlock 情報を落とす）。
 */
export function toPlayerSkin(skin: SkinDef): PlayerSkin {
  return {
    id: skin.id,
    name: skin.name,
    body: skin.body,
    head: skin.head,
    limb: skin.limb,
    eye: skin.eye,
    accent: skin.accent,
  }
}
