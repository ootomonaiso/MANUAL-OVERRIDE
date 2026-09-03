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
  const criticals = reactive(new Map<string, boolean>())
  const screenShake = ref(0)
  const timing = BATTLE.presentation

  // ── 表示用HP・生死（多段ヒットを段階的に見せる） ──────────────
  // 効果解決（ロジック）は同期で即座に完了するため、3連撃のようなスキルは
  // 1回目のヒットで battle.state 上のHPが最終値まで一気に減り、alive も即 false に
  // なる（damageCalc.ts の applyDamage 参照）。これをそのまま画面へ出すと、
  // 「3発の合計で倒せる敵が1発目で死んだように見える」演出になってしまう。
  // ここでは表示専用のHP・生死を別に持ち、fx_hit_* の再生（later() で間隔を空けて
  // 呼ばれる play()）に合わせて少しずつ真の値へ近づけることで、見た目の減り方を
  // ヒットのタイミングに合わせる。
  const displayedHp = reactive(new Map<string, number>())
  const displayedAlive = reactive(new Map<string, boolean>())
  const hpStepDelta = new Map<string, number>()
  const hpStepRemaining = new Map<string, number>()
  /**
   * fx_critical/fx_super_critical は fx_hit_* とは別のキュー要素として、少し遅れて
   * 再生される（drain の段間隔ぶん）。被弾フラッシュと同時にクリティカル演出を
   * 出したいので、バッチの時点で「このヒットはクリティカルだった」と分かる分は
   * 先に印を付けておき、fx_hit_* の再生と同時に発火させる。
   */
  const criticalHitReqs = new WeakSet<EffectRequest>()

  function trueHpOf(id: string): number {
    if (battle.state.player.id === id) return battle.state.player.hp
    return battle.state.enemies.find(e => e.id === id)?.hp ?? 0
  }
  function trueAliveOf(id: string): boolean {
    if (battle.state.player.id === id) return battle.state.player.alive
    return battle.state.enemies.find(e => e.id === id)?.alive ?? true
  }

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
    if (who) {
      if (req.effectId.startsWith('fx_hit_')) {
        if (criticalHitReqs.has(req)) {
          criticals.set(who, true)
          later(timing.flashMs, () => { criticals.delete(who) })
        }
        const remaining = hpStepRemaining.get(who) ?? 0
        if (remaining <= 1) {
          displayedHp.set(who, trueHpOf(who))
          hpStepRemaining.delete(who)
        } else {
          displayedHp.set(who, (displayedHp.get(who) ?? trueHpOf(who)) + (hpStepDelta.get(who) ?? 0))
          hpStepRemaining.set(who, remaining - 1)
        }
      } else if (req.effectId === 'fx_heal') {
        displayedHp.set(who, trueHpOf(who))
      } else if (req.effectId === 'fx_defeat') {
        displayedAlive.set(who, false)
      }
    }
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
    if (req.effectId === 'fx_critical' || req.effectId === 'fx_super_critical') {
      criticals.set(who, true)
      later(timing.flashMs, () => { criticals.delete(who) })
    }
    if (req.effectId === 'fx_critical') {
      pushPopup(who, { key: seq++, text: 'CRITICAL', color: def?.visual.color ?? 'var(--battle-number)', isLabel: true })
    }
    if (req.effectId === 'fx_super_critical') {
      const stacks = req.payload?.critStacks ?? 2
      pushPopup(who, { key: seq++, text: `SUPER CRITICAL ×${stacks}`, color: def?.visual.color ?? 'var(--battle-number)', isLabel: true })
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
    const pending: EffectRequest[] = []
    let req = battle.consumeEffect()
    while (req) { pending.push(req); req = battle.consumeEffect() }

    // 対象ごとに今回何回ヒットするかを先に数え、表示HPを1ヒットぶんずつ真の値へ
    // 近づける歩幅を決める（同じ対象への複数ヒットが均等な減り方に見えるようにする）
    const hitCounts = new Map<string, number>()
    for (const r of pending) {
      if (r.combatantId && r.effectId.startsWith('fx_hit_')) {
        hitCounts.set(r.combatantId, (hitCounts.get(r.combatantId) ?? 0) + 1)
      }
    }
    for (const [id, count] of hitCounts) {
      const before = displayedHp.has(id) ? (displayedHp.get(id) as number) : trueHpOf(id)
      displayedHp.set(id, before)
      hpStepDelta.set(id, (trueHpOf(id) - before) / count)
      hpStepRemaining.set(id, count)
    }

    for (let i = 0; i < pending.length; i++) {
      const r = pending[i]
      if (!r.combatantId || !r.effectId.startsWith('fx_hit_')) continue
      for (let j = i + 1; j < pending.length; j++) {
        const next = pending[j]
        if (next.combatantId !== r.combatantId) continue
        if (next.effectId.startsWith('fx_hit_')) break
        if (next.effectId === 'fx_critical' || next.effectId === 'fx_super_critical') {
          criticalHitReqs.add(r)
          break
        }
      }
    }

    pending.forEach((r, index) => {
      later(index * BATTLE.multiHitIntervalMs, () => { play(r) })
    })
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
    // 新しい戦闘の開始時、前の戦闘の敵IDが再利用されうる（spawnEnemyFromDef は
    // 「defId#formationIndex」で命名するため）。表示専用HPを持ち越すと、
    // 新しい敵が前の戦闘の残りHPのまま出現して見えてしまうためクリアする。
    if (status === 'battle' && (previous === 'drafting' || previous === 'swapping')) {
      displayedHp.clear()
      displayedAlive.clear()
      hpStepDelta.clear()
      hpStepRemaining.clear()
    }
    if (status === 'drafting') soundManager.playSfx('battle_victory')
    if (status === 'finished' && battle.state.runOutcome === 'lost') soundManager.playSfx('battle_lost')
  })

  onScopeDispose(() => { clearTimers() })

  return {
    popupsOf: (combatantId: string): DamagePopup[] => popups.get(combatantId) ?? [],
    flashOf: (combatantId: string): FlashKind | null => flashes.get(combatantId) ?? null,
    criticalOf: (combatantId: string): boolean => criticals.get(combatantId) ?? false,
    displayedHpOf: (combatantId: string): number => displayedHp.get(combatantId) ?? trueHpOf(combatantId),
    displayedAliveOf: (combatantId: string): boolean => displayedAlive.get(combatantId) ?? trueAliveOf(combatantId),
    screenShake,
  }
}
