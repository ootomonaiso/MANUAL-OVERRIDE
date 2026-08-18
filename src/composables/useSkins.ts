/**
 * src/composables/useSkins.ts
 *
 * スキンの ViewModel。
 * スキン一覧 / 解放判定 / 選択を管理する。
 * records を引数で受け取り、解放判定に使用する。
 */

import { ref, computed, readonly, type Ref } from 'vue'
import type { SaveRecords, SkinDef, PlayerSkin } from '../domain/types'
import { loadSkins, getSkinById, loadSelectedSkinId, saveSelectedSkinId, isSkinUnlocked } from '../domain/skins'
import { RECORDS } from '../data/tunables'
import { soundManager } from '../plugins/SoundManager'

export function useSkins(recordsRef: Ref<SaveRecords>) {
  const skins = ref<SkinDef[]>(loadSkins())
  const selectedId = ref<string>(loadSelectedSkinId(RECORDS.skinStorageKey))

  const selectedSkin = computed<SkinDef>(() => getSkinById(selectedId.value) ?? skins.value[0])

  const unlocked = computed(() =>
    new Set(skins.value.filter(s => isSkinUnlocked(s, recordsRef.value)).map(s => s.id)),
  )

  function select(id: string): boolean {
    if (!unlocked.value.has(id)) return false
    selectedId.value = id
    saveSelectedSkinId(RECORDS.skinStorageKey, id)
    soundManager.onSkinSelect()
    return true
  }

  function toPlayerSkin(id: string): PlayerSkin | null {
    const skin = getSkinById(id)
    if (!skin) return null
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

  return {
    skins: readonly(skins),
    selectedId: readonly(selectedId),
    selectedSkin,
    unlocked,
    select,
    toPlayerSkin,
  }
}
