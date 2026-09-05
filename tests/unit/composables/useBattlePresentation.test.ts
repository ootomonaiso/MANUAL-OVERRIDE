import { describe, it, expect, vi, afterEach } from 'vitest'
import { toRaw } from 'vue'
import { useBattleState } from '../../../src/composables/useBattleState'
import { useBattlePresentation } from '../../../src/composables/useBattlePresentation'
import { BATTLE } from '../../../src/data/tunables'

type Battle = ReturnType<typeof useBattleState>

/**
 * 多段ヒットスキル（弾幕: repeat times:20）で、実際には全弾を待たず途中で敵が
 * 倒れるシナリオを作る。ユーザー報告「総合ダメージで死んでいると判定されて
 * 死亡エフェクトが早期に出る」の再現・検証用。
 *
 * 命中判定は必中・非クリティカルに固定する（damageOp は hit → crit の順に rng を引く）。
 */
function alwaysHitNoCrit(): () => number {
  return () => 0.5
}

function setup(): { battle: Battle } {
  const battle = useBattleState()
  battle.initRun(alwaysHitNoCrit())
  const raw = toRaw(battle.state)
  // skill_barrage をスロット0に装備し、確実に発動できる状態にする
  raw.player.actives = [{ id: 'skill_barrage', points: 0, level: 1, cooldown: 0, slotIndex: 0 }]
  raw.player.baseStats.int = 1000
  // 弾幕は magical, int参照 rate:0.08。Lv1倍率×1 → 1発 ≈ 80ダメージ。
  // 敵のHPを250に設定し、4発目(80*4=320>250)で必ず死ぬようにする
  raw.enemies[0].baseStats.hp = 250
  raw.enemies[0].hp = 250
  return { battle }
}

afterEach(() => { vi.useRealTimers() })

describe('useBattlePresentation: 多段ヒットで途中に敵が倒れるケース', () => {
  it('実際に倒れる前のヒットでは displayedAliveOf が true のままである', async () => {
    vi.useFakeTimers()
    const { battle } = setup()
    const presentation = useBattlePresentation(battle)
    const enemyId = battle.state.enemies[0].id

    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()   // watch(effectQueue.length) の pre-flush を通す

    expect(battle.state.enemies[0].alive).toBe(false)   // ロジックは同期で完結済み（真の状態）
    expect(presentation.displayedAliveOf(enemyId)).toBe(true)   // 表示はまだヒット演出前

    // 1発目・2発目・3発目の演出タイミングでは、まだ生存表示のまま
    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs * 0.5)
    expect(presentation.displayedAliveOf(enemyId)).toBe(true)
    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
    expect(presentation.displayedAliveOf(enemyId)).toBe(true)
    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
    expect(presentation.displayedAliveOf(enemyId)).toBe(true)
  })

  it('実際に倒した最後のヒット直後にだけ死亡表示へ切り替わる（早期に切り替わらない）', async () => {
    vi.useFakeTimers()
    const { battle } = setup()
    const presentation = useBattlePresentation(battle)
    const enemyId = battle.state.enemies[0].id

    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()

    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs * 10)   // 全ヒット分（実際は4発+defeatの5イベント）を流し切る
    expect(presentation.displayedAliveOf(enemyId)).toBe(false)
    expect(presentation.displayedHpOf(enemyId)).toBe(0)
  })

  it('HPバーは1発ずつ段階的に減り、最終ヒットで一気にゼロへ飛ばない', async () => {
    vi.useFakeTimers()
    const { battle } = setup()
    const presentation = useBattlePresentation(battle)
    const enemyId = battle.state.enemies[0].id

    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()

    const hpSamples: number[] = [presentation.displayedHpOf(enemyId)]
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
      hpSamples.push(presentation.displayedHpOf(enemyId))
    }
    // 単調非増加であること（減るか据え置きのみ。跳ね上がったり負のまま放置されない）
    for (let i = 1; i < hpSamples.length; i++) {
      expect(hpSamples[i]).toBeLessThanOrEqual(hpSamples[i - 1])
    }
    expect(hpSamples[hpSamples.length - 1]).toBe(0)
    // 1発目のヒットの時点ではまだ全滅表示になっていない（複数ステップに分かれている証拠）
    expect(hpSamples[1]).toBeGreaterThan(0)
  })
})
