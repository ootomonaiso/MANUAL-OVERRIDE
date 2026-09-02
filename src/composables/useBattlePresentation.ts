/**
 * composables/useBattlePresentation.ts
 *
 * 効果解決（ロジック）とエフェクト再生（演出）を分離する方針（docs/genre/rpg/09-effects.md）に従い、
 * useBattleState.effectQueue に積まれたリクエストを引き取って
 *  - ダメージ／回復のポップアップ（対象キャラの上に出す）
 *  - 被弾フラッシュ（通常は赤、シールドで受けたときは青）
 *  - 効果音（エフェクトJSONの sfx、スキルJSONの sfx で上書き可）
 *  - 画面シェイク
 * へ振り分けるだけの層。戦闘の状態はここでは一切変更しない。
 */

import { ref, reactive, watch, onScopeDispose } from 'vue'
import type { EffectRequest, EffectTiming } from '../domain/battle/types'
import { BATTLE_EFFECTS, BATTLE_CONTENT } from '../data/battleContent'
import { BATTLE } from '../data/tunables'
import { soundManager } from '../plugins/SoundManager'
import type { useBattleState } from './useBattleState'

export type FlashKind = 'damage' | 'shield' | 'heal'

export interface DamagePopup {
  key: number
  text: string
  color: string
  /** 数値ではなく「CRITICAL」等の語を出すポップアップ（見た目を分ける） */
  isLabel: boolean
}

/** 着弾側の演出に使うタイミング。詠唱側（onCast）と効果音の引き当て先が変わる */
const IMPACT_TIMINGS: ReadonlySet<EffectTiming> = new Set<EffectTiming>([
  'onHit', 'onHeal', 'onShield', 'onMiss', 'onDefeat',
])

const POPUP_COLOR_SHIELD = 'var(--battle-category-aegis)'

export function useBattlePresentation(battle: ReturnType<typeof useBattleState>) {
  const popups = reactive(new Map<string, DamagePopup[]>())
  const flashes = reactive(new Map<string, FlashKind>())
  const screenShake = ref(0)
  const timing = BATTLE.presentation

  let seq = 0
  let timers: number[] = []

  function later(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      timers = timers.filter(t => t !== id)
      fn()
    }, ms)
    timers.push(id)
  }

  function clearTimers(): void {
    for (const id of timers) window.clearTimeout(id)
    timers = []
  }

  /** エフェクト・スキル両方の定義から、実際に鳴らす SE の id を決める */
  function resolveSfxId(req: EffectRequest, timingOfEffect: EffectTiming, fallback: string | undefined): string | undefined {
    const skillId = req.payload?.skillId
    const skill = skillId ? BATTLE_CONTENT.skills.get(skillId) : undefined
    if (skill && skill.kind === 'active' && skill.sfx) {
      const override = IMPACT_TIMINGS.has(timingOfEffect) ? skill.sfx.impact : skill.sfx.cast
      if (override) return override
    }
    return fallback
  }

  function flashKindOf(req: EffectRequest): FlashKind | null {
    if (req.effectId.startsWith('fx_hit_')) {
      return req.payload?.absorbedByShield ? 'shield' : 'damage'
    }
    if (req.effectId === 'fx_heal') return 'heal'
    if (req.effectId === 'fx_shield_gain') return 'shield'
    return null
  }

  function pushPopup(combatantId: string, popup: DamagePopup): void {
    const list = popups.get(combatantId) ?? []
    popups.set(combatantId, [...list, popup])
    later(timing.popupMs, () => {
      const current = popups.get(combatantId)
      if (!current) return
      const rest = current.filter(p => p.key !== popup.key)
      if (rest.length > 0) popups.set(combatantId, rest)
      else popups.delete(combatantId)
    })
  }

  function play(req: EffectRequest): void {
    const def = BATTLE_EFFECTS.get(req.effectId)
    const timingOfEffect: EffectTiming = def?.timing ?? 'onSystem'
    const sfxId = resolveSfxId(req, timingOfEffect, def?.sfx)
    if (sfxId) soundManager.playSfx(sfxId)

    if (def?.visual.shake) {
      screenShake.value = Math.max(screenShake.value, def.visual.shake)
      later(timing.flashMs, () => { screenShake.value = 0 })
    }

    const who = req.combatantId
    if (!who) return

    const kind = flashKindOf(req)
    if (kind) {
      flashes.set(who, kind)
      later(timing.flashMs, () => {
        if (flashes.get(who) === kind) flashes.delete(who)
      })
    }

    const text = req.payload?.text ?? (req.effectId === 'fx_miss' ? 'MISS' : null)
    if (text !== null) {
      const color = req.payload?.absorbedByShield
        ? POPUP_COLOR_SHIELD
        : (def?.visual.color ?? 'var(--battle-number)')
      pushPopup(who, { key: seq++, text, color, isLabel: text === 'MISS' })
    }
    if (req.effectId === 'fx_critical') {
      pushPopup(who, { key: seq++, text: 'CRITICAL', color: def?.visual.color ?? 'var(--battle-number)', isLabel: true })
    }
    if (req.effectId === 'fx_weakness') {
      pushPopup(who, { key: seq++, text: '弱点', color: def?.visual.color ?? 'var(--battle-number)', isLabel: true })
    }
    if (req.effectId === 'fx_resisted') {
      pushPopup(who, { key: seq++, text: '耐性', color: def?.visual.color ?? 'var(--battle-number)', isLabel: true })
    }
  }

  /** キューに積まれた分をまとめて引き取り、多段ヒットは間隔を空けて再生する */
  function drain(): void {
    let index = 0
    let req = battle.consumeEffect()
    while (req) {
      const current = req
      later(index * BATTLE.multiHitIntervalMs, () => { play(current) })
      index++
      req = battle.consumeEffect()
    }
  }

  watch(() => battle.effectQueue.value.length, (length) => { if (length > 0) drain() })

  // スキル名の提示に合わせて詠唱音を鳴らす。seq を見るのは同じスキルの連続使用でも鳴らすため。
  // flush:'sync' なのは、提示から解決までを待たずに進める場面（テスト等）でも
  // 「提示された瞬間のスキル」を取り逃さないようにするため。
  watch(() => battle.presentation.seq, () => {
    const p = battle.presentation
    if (p.phase !== 'announce') return
    const skill = p.skillId ? BATTLE_CONTENT.skills.get(p.skillId) : undefined
    if (skill && skill.kind === 'active' && skill.sfx?.cast) soundManager.playSfx(skill.sfx.cast)
    else soundManager.playSfx('battle_turn_start')
  }, { flush: 'sync' })

  watch(() => battle.state.status, (status, previous) => {
    if (status === previous) return
    if (status === 'drafting') soundManager.playSfx('battle_victory')
    if (status === 'finished' && battle.state.runOutcome === 'lost') soundManager.playSfx('battle_lost')
  })

  onScopeDispose(() => { clearTimers() })

  return {
    popupsOf: (combatantId: string): DamagePopup[] => popups.get(combatantId) ?? [],
    flashOf: (combatantId: string): FlashKind | null => flashes.get(combatantId) ?? null,
    screenShake,
  }
}
