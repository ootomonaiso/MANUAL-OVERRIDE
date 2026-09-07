import { describe, it, expect, vi, afterEach } from 'vitest'
import { toRaw } from 'vue'
import { useBattleState } from '../../../src/composables/useBattleState'
import { useBattlePresentation } from '../../../src/composables/useBattlePresentation'
import { BATTLE } from '../../../src/data/tunables'
import { BATTLE_EFFECTS } from '../../../src/data/rpg/battleContent'
import type { Combatant } from '../../../src/domain/battle/types'

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

/** 命中判定・クリティカル判定（rng() < chance）の両方を必ず通す。critRate を1へ上書きした上で使う */
function alwaysHitAndCrit(): () => number {
  return () => 0
}

/**
 * enemyCount:1（既定）は従来どおりの単体編成。
 * enemyCount:2 は、1体目を倒した直後に同一コールスタック内で2体目の announce が
 * 割り込むケース（バグ再現用）を作るための2体編成。2体目は skill_barrage の対象
 * にはならず（focusRange: single, centerEnemyIndex:0 で常に enemies[0] を狙う）、
 * 1体目が力尽きたあとの手番として登場するだけの役なので、1体目のクローンに
 * 「絶対に落ちないだけの体力」を与えて使い回す。
 */
function setup(enemyCount: 1 | 2 = 1): { battle: Battle } {
  const battle = useBattleState()
  battle.initRun(alwaysHitNoCrit())
  const raw = toRaw(battle.state)
  // ここから下は、検証対象（多段ヒットの段階表示）に必要な条件だけを残した固定フィクスチャ。
  // initRun が引くエンカウントも初期プレイヤーも実データ（enemy-sets / battle.json）依存で
  // 増減するため、実データのまま検証すると意図と無関係な理由で壊れる。
  raw.enemies.splice(1)
  // skill_barrage をスロット0に装備し、確実に発動できる状態にする
  raw.player.actives = [{ id: 'skill_barrage', points: 0, level: 1, cooldown: 0, slotIndex: 0 }]
  raw.player.traits = []
  raw.player.passives = []
  raw.player.baseStats.int = 1000
  // 弾幕は magical, int参照 rate:0.08。Lv1倍率×1 → 1発 ≈ 80ダメージ。
  // 敵のHPを250に設定し、4発目(80*4=320>250)で必ず死ぬようにする。
  // 1発あたりのダメージが敵の防御・属性相性で揺れると「何発で倒れるか」が変わるため、
  // 減衰要素（REF/DEF・特性・パッシブ）と回避（AGI由来）をここで無効化する。
  const enemy = raw.enemies[0]
  enemy.baseStats = { ...enemy.baseStats, hp: 250, def: 0, ref: 0, agi: 0 }
  enemy.hp = 250
  enemy.traits = []
  enemy.passives = []
  if (enemyCount === 2) {
    // JSON往復で参照を切った上でIDだけ差し替える。actionPattern等は敵定義由来のまま
    // 使い回してよい（この2体目自身の行動内容は検証対象ではない）。
    const second = JSON.parse(JSON.stringify(enemy)) as Combatant
    second.id = `${enemy.id}_second`
    second.formationIndex = 1
    second.baseStats = { ...second.baseStats, hp: 999999 }
    second.hp = 999999
    raw.enemies.push(second)
    // 行動速度キューは「プレイヤーが行動を決めた瞬間」に selectAction が組み立てる
    // ようになった（CLAUDE_TASKS.md参照）ため、ここで turnQueue を手動で組み直す必要はない
    // ——追加した2体目も含め、selectAction 呼び出し時点の state.enemies から自動的に
    // 反映される。player.baseStats.agi はいずれの敵よりも高い前提（enemyの agi:0 参照）
    // 2体目自身の攻撃内容は検証対象外。その手番でプレイヤーが倒れて戦闘終了に
    // 分岐すると検証したい状態遷移と無関係な経路に入ってしまうため、確実に耐えられる
    // だけの体力を与えておく。
    raw.player.baseStats = { ...raw.player.baseStats, hp: 999999 }
    raw.player.hp = 999999
  }
  return { battle }
}

/**
 * fx_hit_magical が1回だけ発生し、多段ヒットの重なりでタイマーが競合しない
 * 最小構成（BUG: durationMs の検証用）。skill_fireball は単発の damage op なので、
 * 「対象1体につきヒント演出1回」を保証しやすい。撃破演出(fx_defeat)まで混ざると
 * その shake がヒットの shake クリアと競合して読みづらくなるため、敵は倒さない。
 */
function setupSingleHit(): { battle: Battle } {
  const battle = useBattleState()
  battle.initRun(alwaysHitNoCrit())
  const raw = toRaw(battle.state)
  raw.enemies.splice(1)
  raw.player.actives = [{ id: 'skill_fireball', points: 0, level: 1, cooldown: 0, slotIndex: 0 }]
  raw.player.traits = []
  raw.player.passives = []
  // fireball は magical, int参照 rate:1 → 1発 ≈ 50ダメージ。敵のHPを大きく残し、
  // 確実に生存させる（撃破演出を混入させないため）。
  raw.player.baseStats.int = 50
  const enemy = raw.enemies[0]
  enemy.baseStats = { ...enemy.baseStats, hp: 250, def: 0, ref: 0, agi: 0 }
  enemy.hp = 250
  enemy.traits = []
  enemy.passives = []
  return { battle }
}

/**
 * setupSingleHit と同じ構成に、critRate:1 の上書きを足しただけの派生。damageOp は
 * critRate>=1 のとき rng を1回も引かずに1重クリティカルを確定させる（rollCriticalStacks
 * 参照）ため、alwaysHitAndCrit（rng=0固定）と組み合わせれば「必ず1重クリティカルで
 * 命中する」を安定して再現できる。screenCriticalFlash / criticalOf の消灯タイミング検証用。
 */
function setupSingleCrit(): { battle: Battle } {
  const battle = useBattleState()
  battle.initRun(alwaysHitAndCrit())
  const raw = toRaw(battle.state)
  raw.enemies.splice(1)
  raw.player.actives = [{ id: 'skill_fireball', points: 0, level: 1, cooldown: 0, slotIndex: 0 }]
  raw.player.traits = []
  raw.player.passives = []
  raw.player.baseStats.int = 50
  raw.player.baseStats.critRate = 1
  const enemy = raw.enemies[0]
  enemy.baseStats = { ...enemy.baseStats, hp: 250, def: 0, ref: 0, agi: 0 }
  enemy.hp = 250
  enemy.traits = []
  enemy.passives = []
  return { battle }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

describe('useBattlePresentation: 2体編成で1体目が倒れた直後に2体目の手番が来るケース', () => {
  it('1体目の演出が1発も再生されていないうちは、2体目の announce で真値へ上書きされない', async () => {
    vi.useFakeTimers()
    const { battle } = setup(2)
    const presentation = useBattlePresentation(battle)
    const firstEnemyId = battle.state.enemies[0].id

    // 既定の同期スケジューラでは、プレイヤーの1手番（1体目を撃破）→ afterAction()
    // → processTurns() → 2体目の手番（announce）までが同一コールスタック内で
    // 完結する。effectQueue の drain() は sync watch ではないため、この時点では
    // まだ1体目ぶんの fx_hit_* / fx_defeat は1つも引き取られていない。
    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()   // watch(effectQueue.length) の pre-flush を通す（drain() 自体はここで走る）

    // ロジックは同期で完結済み: 1体目は真に死んでいる
    expect(battle.state.enemies.find(e => e.id === firstEnemyId)?.alive).toBe(false)
    // 2体目の announce が挟まっても、1体目の段階表示（撃破前のベースライン）は
    // 上書きされず残っているべき。修正前は displayedAliveOf が即 false、
    // displayedHpOf が即 0 になっていた（ヒット演出を1つも再生する前に）。
    expect(presentation.displayedAliveOf(firstEnemyId)).toBe(true)
    expect(presentation.displayedHpOf(firstEnemyId)).toBe(250)

    // 演出を最後まで流し切れば、最終的には正しく撃破表示へ収束する
    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs * 10)
    expect(presentation.displayedAliveOf(firstEnemyId)).toBe(false)
    expect(presentation.displayedHpOf(firstEnemyId)).toBe(0)
  })

  it('表示HPを動かさないエフェクト（継続ダメージの通知）はベースライン確保を止めない', () => {
    vi.useFakeTimers()
    const { battle } = setup(1)
    const presentation = useBattlePresentation(battle)
    const raw = toRaw(battle.state)
    const enemyId = raw.enemies[0].id

    // 継続ダメージは fx_debuff だけを積み、play() は displayedHp を書き換えない。
    // つまりHPバーを追随させる経路は announce のベースライン確保しか無いので、
    // 「キューに何か残っている」だけで一律に見送ると、この敵のHPバーが取り残される。
    // プレイヤーは pass するので、この敵に飛ぶ被弾エフェクトは無い（DOT だけを隔離できる）。
    raw.enemies[0].periodicSelfEffects = [{ kind: 'trueDamagePercentMaxHp', ratio: 0.1, sourceId: 'test_dot' }]
    const hpBefore = raw.enemies[0].hp

    // 1手番目: ラウンド終了時に継続ダメージが入り、fx_debuff がキューに積まれる。
    // この時点では次の announce がまだ来ないので表示は追いつかない（従来からの挙動）。
    battle.selectAction({ kind: 'builtin', action: 'pass' })
    const hpAfterFirstDot = raw.enemies[0].hp
    expect(hpAfterFirstDot).toBeLessThan(hpBefore)
    expect(presentation.displayedHpOf(enemyId)).toBe(hpBefore)

    // 2手番目の announce。この敵のキューには fx_debuff しか残っていないので、
    // ベースライン確保は見送られず、HPバーが1回目の継続ダメージに追随する。
    // キューの中身を問わず見送っていた頃は、ここが hpBefore のまま取り残されていた。
    battle.selectAction({ kind: 'builtin', action: 'pass' })
    expect(presentation.displayedHpOf(enemyId)).toBe(hpAfterFirstDot)
  })
})

describe('useBattlePresentation: エフェクトごとの durationMs が消灯タイミングを駆動する', () => {
  it('fx_hit_magical.durationMs(260ms) が被弾フラッシュ・画面シェイクの消灯を決める（flashMs一律ではない）', async () => {
    vi.useFakeTimers()
    const { battle } = setupSingleHit()
    const presentation = useBattlePresentation(battle)
    const enemyId = battle.state.enemies[0].id

    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()

    // pending: [fx_cast_magical(player) @0ms, fx_hit_magical(enemy) @multiHitIntervalMs]。
    // ヒットは1回だけなので、後続ヒットによるタイマーの重なりが起きない。
    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
    expect(presentation.flashOf(enemyId)).toBe('damage')
    expect(presentation.screenShake.value).toBeGreaterThan(0)

    // ヒットから240ms経過時点。flashMs(220ms)一律のままなら既に消えているはずだが、
    // fx_hit_magical.durationMs(260ms)が使われていればまだ消えない。
    vi.advanceTimersByTime(240)
    expect(presentation.flashOf(enemyId)).toBe('damage')
    expect(presentation.screenShake.value).toBeGreaterThan(0)

    // ヒットから260ms経過（= durationMs）で消える
    vi.advanceTimersByTime(20)
    expect(presentation.flashOf(enemyId)).toBeNull()
    expect(presentation.screenShake.value).toBe(0)
  })

  it('エフェクト定義が見つからない場合は timing.flashMs(220ms) へフォールバックする', async () => {
    vi.useFakeTimers()
    vi.spyOn(BATTLE_EFFECTS, 'get').mockReturnValue(undefined)
    const { battle } = setupSingleHit()
    const presentation = useBattlePresentation(battle)
    const enemyId = battle.state.enemies[0].id

    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()

    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
    expect(presentation.flashOf(enemyId)).toBe('damage')

    // durationMs(本来260ms)ではなく flashMs(220ms)で消える
    vi.advanceTimersByTime(219)
    expect(presentation.flashOf(enemyId)).toBe('damage')
    vi.advanceTimersByTime(1)
    expect(presentation.flashOf(enemyId)).toBeNull()
  })
})

describe('useBattlePresentation: CSS側と同期させるための消灯尺の公開（flashDurationMsOf 等）', () => {
  it('flashDurationMsOf / screenShakeDurationMs は play() が実際に使った durationMs(260ms) を返す', async () => {
    vi.useFakeTimers()
    const { battle } = setupSingleHit()
    const presentation = useBattlePresentation(battle)
    const enemyId = battle.state.enemies[0].id

    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()

    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
    expect(presentation.flashOf(enemyId)).toBe('damage')
    // BattleScreen.vue/CharacterFrame.vue が --fx-dur / --shake-dur として渡す値が
    // 実際の消灯タイミング（durationMs=260ms）と一致していることを確認する
    expect(presentation.flashDurationMsOf(enemyId)).toBe(260)
    expect(presentation.screenShakeDurationMs.value).toBe(260)
  })

  it('screenCriticalFlash は screenCriticalFlashMs(380ms) で消える（旧計算式 flashMs+80=300ms ではない）', async () => {
    vi.useFakeTimers()
    const { battle } = setupSingleCrit()
    const presentation = useBattlePresentation(battle)
    const enemyId = battle.state.enemies[0].id

    battle.selectAction({ kind: 'active', slotIndex: 0 }, 0)
    await Promise.resolve()

    // fx_hit_magical（クリティカル併発）の再生タイミング
    vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
    expect(presentation.criticalOf(enemyId)).toBe(true)
    expect(presentation.screenCriticalFlash.value).toBe(true)

    // 旧実装なら flashMs+80=300ms 経過時点で消えていたはずだが、まだ消えない
    vi.advanceTimersByTime(300)
    expect(presentation.screenCriticalFlash.value).toBe(true)

    // screenCriticalFlashMs(380ms) 経過（トリガーから残り80ms）で消える
    vi.advanceTimersByTime(80)
    expect(presentation.screenCriticalFlash.value).toBe(false)
  })
})
