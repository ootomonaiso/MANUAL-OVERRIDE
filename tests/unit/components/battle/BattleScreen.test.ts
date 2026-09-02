import { describe, it, expect, afterEach, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import BattleScreen from '../../../../src/components/battle/BattleScreen.vue'
import { useBattleState, type BattleScheduler } from '../../../../src/composables/useBattleState'
import { BATTLE_CONTENT, BATTLE_EFFECTS } from '../../../../src/data/battleContent'
import { soundManager } from '../../../../src/plugins/SoundManager'
import { BATTLE } from '../../../../src/data/tunables'
import type { BattleStatus } from '../../../../src/domain/battle/types'

type Battle = ReturnType<typeof useBattleState>

interface Harness {
  host: HTMLElement
  app: App
  battle: Battle
  act: () => Promise<void>
}

let current: Harness | null = null

function seededPrng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * useBattleState.test.ts と同じ「プレイヤーが必ず勝つ」rng を使って画面をマウントする。
 * 行動はDOM上のボタンをクリックして行い、実際のUI経路を通す。
 */
/**
 * 演出の途中で止めるためのスケジューラ。set() されたコールバックを溜めるだけで自動実行しない。
 * これで「スキル名を出している最中」の画面を検証できる。
 */
function pausedScheduler(): BattleScheduler {
  return { set: () => 0, clear: () => {} }
}

function mountBattle(battle: Battle, beforeAct: () => void = () => {}): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(BattleScreen, { battle }) })
  app.mount(host)

  const act = async (): Promise<void> => {
    beforeAct()
    slotButtons(host)[0].click()
    await nextTick()
  }
  current = { host, app, battle, act }
  return current
}

function mount(seed = 4242, scheduler?: BattleScheduler): Harness {
  const prng = seededPrng(seed)
  let sinceAction = Number.POSITIVE_INFINITY
  const battle = useBattleState({ scheduler })
  battle.initRun(() => {
    if (sinceAction < 2) { sinceAction++; return 0.94 }
    return battle.state.enemies.some(e => e.alive) ? 0.99 : prng()
  })
  return mountBattle(battle, () => { sinceAction = 0 })
}

/** 敵の攻撃が必ず当たる盤面。被弾側の演出を見るために使う */
function mountTakingHits(): Harness {
  const battle = useBattleState()
  battle.initRun(() => 0.5)
  return mountBattle(battle)
}

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
})

function $(host: HTMLElement, sel: string): HTMLElement | null {
  return host.querySelector(sel)
}
function $$(host: HTMLElement, sel: string): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(sel)]
}
function slotButtons(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('.active-skill-bar .skill-slot')]
}
function textOf(host: HTMLElement, sel: string): string {
  return $(host, sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

/** 進行中に何度も変わる値なので、型の絞り込みを残さずに都度読み直す */
function statusOf(battle: Battle): BattleStatus {
  return battle.state.status
}

/** 現在の戦闘が終わるまでUIから攻撃し続ける */
async function fightUntilDraft(h: Harness): Promise<void> {
  for (let i = 0; i < 400 && h.battle.state.status === 'battle'; i++) await h.act()
}

describe('BattleScreen: 初期描画', () => {
  it('行動順・敵・プレイヤー・スキルバー・各パネルが揃って描画される', () => {
    const h = mount()
    expect($(h.host, '.turn-queue-bar')).not.toBeNull()
    expect($(h.host, '.enemy-row')).not.toBeNull()
    expect($(h.host, '.player-row')).not.toBeNull()
    expect($(h.host, '.active-skill-bar')).not.toBeNull()
    expect($(h.host, '.status-panel')).not.toBeNull()
    expect($(h.host, '.skill-list-panel')).not.toBeNull()
  })

  it('敵とプレイヤーのHPが数値で表示される', () => {
    const h = mount()
    const frames = $$(h.host, '.char-frame')
    expect(frames.length).toBeGreaterThanOrEqual(2)
    for (const f of frames) expect(f.textContent).toMatch(/\d+ \/ \d+/)
  })

  it('スキルスロットは4枠 + 守る + 何もしないで構成される', () => {
    const h = mount()
    expect(slotButtons(h.host)).toHaveLength(6)
    expect(textOf(h.host, '.active-skill-bar .skill-slot.builtin .slot-label')).toBe('守る')
  })

  it('未所持の枠は「空き」と表示され押せない', () => {
    const h = mount()
    const slots = slotButtons(h.host)
    expect(slots[1].textContent).toContain('空き')
    expect(slots[1].disabled).toBe(true)
  })

  it('所持スキルはラベルとレベルつきで枠に出る', () => {
    const h = mount()
    const owned = h.battle.state.player.actives[0]
    const label = BATTLE_CONTENT.skills.get(owned.id)?.label ?? ''
    expect(slotButtons(h.host)[0].textContent).toContain(label)
    expect(slotButtons(h.host)[0].textContent).toContain('Lv1')
  })

  it('敵が次に使うスキルが予告される', () => {
    const h = mount()
    const chip = textOf(h.host, '.next-skill-chip')
    expect(chip).not.toBe('')
    expect(chip).toContain(':')
  })

  it('ドラフト画面と詳細画面は戦闘中には出ていない', () => {
    const h = mount()
    expect($(h.host, '.draft-overlay')).toBeNull()
    expect($(h.host, '.detail-overlay')).toBeNull()
  })
})

describe('BattleScreen: 行動の操作', () => {
  it('スキル枠を押すと敵のHP表示が減る', async () => {
    const h = mount()
    const before = h.battle.state.enemies[0].hp
    await h.act()
    expect(h.battle.state.enemies[0].hp).toBeLessThan(before)
    expect($$(h.host, '.char-frame')[0].textContent)
      .toContain(String(Math.max(0, Math.floor(h.battle.state.enemies[0].hp))))
  })

  it('攻撃するとダメージポップアップが対象の上に出て、キューが掃ける', async () => {
    // ポップアップは多段ヒットをずらすため setTimeout 経由で積まれる。
    // （消える側は TransitionGroup の leave アニメーション依存のため DOM では検証しない）
    vi.useFakeTimers()
    try {
      const h = mount()
      await h.act()
      await nextTick()
      // popupMs を跨ぐと出た端から消えてしまうので、消える前の時点で見る
      vi.advanceTimersByTime(BATTLE.multiHitIntervalMs * 2)
      await nextTick()
      const enemyUnit = $$(h.host, '.char-unit.enemy')[0]
      expect(enemyUnit.querySelectorAll('.damage-popup').length).toBeGreaterThan(0)
      expect(h.battle.effectQueue.value).toHaveLength(0)   // 引き取った分はキューから消えている
    } finally {
      vi.useRealTimers()
    }
  })

  it('守るを押すとクールタイム表示が出て押せなくなる', async () => {
    const h = mount()
    const guard = slotButtons(h.host)[4]
    guard.click()
    await nextTick()
    const guardAfter = slotButtons(h.host)[4]
    expect(guardAfter.disabled).toBe(true)
    expect(guardAfter.textContent).toMatch(/\d/)
  })

  it('手番でなくなるとスキル枠が押せなくなる', async () => {
    const h = mount()
    await fightUntilDraft(h)
    await nextTick()
    expect(slotButtons(h.host).every(b => b.disabled)).toBe(true)
  })
})

describe('BattleScreen: 見た目と進行表示', () => {
  it('敵とプレイヤーがそれぞれのスプライトで描かれる', () => {
    const h = mount()
    const units = $$(h.host, '.char-unit')
    expect(units.length).toBeGreaterThanOrEqual(2)
    for (const u of units) expect(u.querySelector('.pixel-sprite')).not.toBeNull()
  })

  it('背景が描かれる', () => {
    const h = mount()
    expect($(h.host, '.battle-backdrop .backdrop-svg')).not.toBeNull()
    expect(h.battle.state.backgroundId).toBeTruthy()
  })

  it('右上にターン数と手番が出る', () => {
    const h = mount()
    expect(textOf(h.host, '.turn-indicator .turn-count')).toBe('ターン 1')
    expect(textOf(h.host, '.turn-indicator .turn-actor')).toBe('あなたの手番')
  })

  it('行動を選ぶとスキル名が提示され、攻撃モーションに切り替わる', async () => {
    const h = mount(4242, pausedScheduler())
    slotButtons(h.host)[0].click()
    await nextTick()
    expect($(h.host, '.skill-cast-banner')).not.toBeNull()
    expect($$(h.host, '.char-unit.player .sprite-box.attacking').length).toBe(1)
  })
})

describe('BattleScreen: パネルの開閉と表示切り替え', () => {
  it('ステータスパネルを畳んで開き直せる', async () => {
    const h = mount()
    const toggle = $(h.host, '.status-panel .panel-toggle') as HTMLButtonElement
    expect($(h.host, '.status-panel .panel-body')).not.toBeNull()
    toggle.click()
    await nextTick()
    expect($(h.host, '.status-panel .panel-body')).toBeNull()
    ;($(h.host, '.status-panel .panel-toggle') as HTMLButtonElement).click()
    await nextTick()
    expect($(h.host, '.status-panel .panel-body')).not.toBeNull()
  })

  it('スキル一覧パネルを畳んで開き直せる', async () => {
    const h = mount()
    const toggle = $(h.host, '.skill-list-panel .panel-toggle') as HTMLButtonElement
    expect($(h.host, '.skill-list-panel .panel-body')).not.toBeNull()
    toggle.click()
    await nextTick()
    expect($(h.host, '.skill-list-panel .panel-body')).toBeNull()
  })

  it('基礎値と実効値の表示を切り替えられる', async () => {
    const h = mount()
    const modeButton = $$(h.host, '.status-panel .panel-controls button')[0] as HTMLButtonElement
    expect(modeButton.textContent?.trim()).toBe('実効値')
    modeButton.click()
    await nextTick()
    expect(($$(h.host, '.status-panel .panel-controls button')[0]).textContent?.trim()).toBe('基礎値')
  })

  it('バフ差分の表示を切り替えられる', async () => {
    const h = mount()
    const diffButton = $$(h.host, '.status-panel .panel-controls button')[1] as HTMLButtonElement
    expect(diffButton.textContent?.trim()).toBe('バフオン')
    diffButton.click()
    await nextTick()
    expect(($$(h.host, '.status-panel .panel-controls button')[1]).textContent?.trim()).toBe('バフオフ')
  })

  it('全ステータスの行が並ぶ', () => {
    const h = mount()
    expect($$(h.host, '.status-panel .stat-row')).toHaveLength(10)
  })
})

describe('BattleScreen: スキル一覧の見え方', () => {
  it('所持しているスキルは名前が見える', () => {
    const h = mount()
    const ownedId = h.battle.state.player.actives[0].id
    const label = BATTLE_CONTENT.skills.get(ownedId)?.label ?? ''
    expect(textOf(h.host, '.skill-list-panel')).toContain(label)
  })

  it('未入手かつ未閲覧のスキルは伏せ字で表示される', () => {
    const h = mount()
    expect($$(h.host, '.skill-item.unseen').length).toBeGreaterThan(0)
    for (const el of $$(h.host, '.skill-item.unseen')) {
      expect(el.textContent).toContain('？？？')
    }
  })

  it('閲覧済みになったスキルは名前が見えるようになる', async () => {
    const h = mount()
    const unseenBefore = $$(h.host, '.skill-item.unseen').length
    const hiddenId = [...BATTLE_CONTENT.skills.keys()]
      .find(id => !h.battle.state.player.actives.some(a => a.id === id)) as string
    h.battle.markSeen([hiddenId])
    await nextTick()
    expect($$(h.host, '.skill-item.unseen').length).toBe(unseenBefore - 1)
    expect(textOf(h.host, '.skill-list-panel')).toContain(BATTLE_CONTENT.skills.get(hiddenId)?.label ?? '')
  })

  it('マウスを乗せただけでは効果文が開かない', async () => {
    const h = mount()
    const owned = $$(h.host, '.skill-item.owned')[0]
    owned.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    owned.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await nextTick()
    expect($$(h.host, '.skill-item.owned')[0].querySelector('.item-detail')).toBeNull()
  })

  it('項目をクリックすると効果文が開く', async () => {
    const h = mount()
    const owned = $$(h.host, '.skill-item.owned')[0]
    expect(owned.querySelector('.item-detail')).toBeNull()
    owned.click()
    await nextTick()
    expect($$(h.host, '.skill-item.owned')[0].querySelector('.item-detail')).not.toBeNull()
  })
})

describe('BattleScreen: キャラクター詳細', () => {
  it('プレイヤー枠を押すと詳細が開き、閉じられる', async () => {
    const h = mount()
    const frames = $$(h.host, '.char-frame')
    frames[frames.length - 1].click()
    await nextTick()
    expect($(h.host, '.detail-overlay')).not.toBeNull()
    expect(textOf(h.host, '.detail-title')).toBe(h.battle.state.player.label)
    ;($(h.host, '.detail-close') as HTMLButtonElement).click()
    await nextTick()
    expect($(h.host, '.detail-overlay')).toBeNull()
  })

  it('詳細には全ステータスと所持アクティブスキルが並ぶ', async () => {
    const h = mount()
    const frames = $$(h.host, '.char-frame')
    frames[frames.length - 1].click()
    await nextTick()
    expect($$(h.host, '.detail-overlay .stat-cell')).toHaveLength(10)
    expect($$(h.host, '.detail-overlay .skill-row').length).toBeGreaterThan(0)
  })

  it('敵の詳細を開くとその敵の名前が出る', async () => {
    const h = mount()
    $$(h.host, '.char-frame')[0].click()
    await nextTick()
    expect(textOf(h.host, '.detail-title')).toBe(h.battle.state.enemies[0].label)
  })

  it('詳細を開いたスキルは一覧でも閲覧済みになる', async () => {
    const h = mount()
    const unseenBefore = $$(h.host, '.skill-item.unseen').length
    $$(h.host, '.char-frame')[0].click()   // 敵の所持スキルが閲覧済みになる
    await nextTick()
    expect($$(h.host, '.skill-item.unseen').length).toBeLessThan(unseenBefore)
  })
})

describe('BattleScreen: ドラフト', () => {
  it('勝利するとカードが3枚出る', async () => {
    const h = mount()
    await fightUntilDraft(h)
    await nextTick()
    expect($$(h.host, '.draft-card')).toHaveLength(3)
  })

  it('各カードに種別・名前・効果文・フレーバーが載る', async () => {
    const h = mount()
    await fightUntilDraft(h)
    await nextTick()
    for (const card of $$(h.host, '.draft-card')) {
      expect(card.querySelector('.card-kind')?.textContent).toMatch(/アクティブ|パッシブ|特性/)
      expect(card.querySelector('.card-label')?.textContent?.trim()).not.toBe('')
      expect(card.querySelector('.card-effect')?.textContent?.trim()).not.toBe('')
      expect(card.querySelector('.card-flavor')?.textContent).toContain('「')
    }
  })

  it('カードを押すと次の戦闘が始まりカードが消える', async () => {
    const h = mount()
    await fightUntilDraft(h)
    await nextTick()
    ;($$(h.host, '.draft-card')[0] as HTMLButtonElement).click()
    await nextTick()
    expect($(h.host, '.draft-overlay')).toBeNull()
    expect(h.battle.state.status).toBe('battle')
    expect(h.battle.state.enemies.every(e => e.alive)).toBe(true)
  })

  it('獲得したスキルがスキルバーとスキル一覧に反映される', async () => {
    const h = mount()
    await fightUntilDraft(h)
    await nextTick()
    const beforeOwned = $$(h.host, '.skill-item.owned').length
    ;($$(h.host, '.draft-card')[0] as HTMLButtonElement).click()
    await nextTick()
    const afterOwned = $$(h.host, '.skill-item.owned').length
    // ステータス微増を引いた場合のみ所持数が変わらない
    const wasFallback = beforeOwned === afterOwned
    expect(wasFallback || afterOwned === beforeOwned + 1).toBe(true)
  })
})

describe('BattleScreen: アクティブ枠の入れ替え', () => {
  /** 未所持アクティブを優先して取り、枠が埋まって入れ替えを要求される所まで進める */
  async function advanceUntilSwap(h: Harness): Promise<boolean> {
    for (let i = 0; i < 12; i++) {
      await fightUntilDraft(h)
      if (statusOf(h.battle) !== 'drafting') return false
      await nextTick()
      const options = h.battle.state.draftOptions ?? []
      const idx = options.findIndex(o => o.kind === 'active' && !o.isFallback && o.currentLevel === undefined)
      ;($$(h.host, '.draft-card')[idx >= 0 ? idx : 0] as HTMLButtonElement).click()
      await nextTick()
      if (statusOf(h.battle) === 'swapping') return true
    }
    return false
  }

  it('枠が埋まると入れ替え先を選ぶ画面になる', async () => {
    const h = mount()
    expect(await advanceUntilSwap(h)).toBe(true)
    expect($(h.host, '.swap-picker')).not.toBeNull()
    expect($$(h.host, '.swap-slot')).toHaveLength(4)
    expect($(h.host, '.draft-cards')).toBeNull()
  })

  it('キャンセルするとカード選択へ戻る', async () => {
    const h = mount()
    expect(await advanceUntilSwap(h)).toBe(true)
    ;($(h.host, '.swap-cancel') as HTMLButtonElement).click()
    await nextTick()
    expect($$(h.host, '.draft-card')).toHaveLength(3)
  })

  it('枠を選ぶと新しいスキルがその枠に入って戦闘が再開する', async () => {
    const h = mount()
    expect(await advanceUntilSwap(h)).toBe(true)
    const incoming = h.battle.state.pendingSwapSkillId as string
    ;($$(h.host, '.swap-slot')[3] as HTMLButtonElement).click()
    await nextTick()
    expect(h.battle.state.status).toBe('battle')
    expect($(h.host, '.draft-overlay')).toBeNull()
    const label = BATTLE_CONTENT.skills.get(incoming)?.label ?? ''
    expect(slotButtons(h.host)[3].textContent).toContain(label)
  })

  it('外れたスキルは一覧で「保管中」として残る', async () => {
    const h = mount()
    expect(await advanceUntilSwap(h)).toBe(true)
    ;($$(h.host, '.swap-slot')[3] as HTMLButtonElement).click()
    await nextTick()
    expect($$(h.host, '.skill-item.stored').length).toBe(1)
    expect(textOf(h.host, '.skill-item.stored')).toContain('保管中')
  })
})

describe('BattleScreen: 対象選択', () => {
  it('敵が1体のときは対象選択を挟まずに攻撃する', async () => {
    const h = mount()
    expect(h.battle.state.enemies).toHaveLength(1)
    await h.act()
    expect($(h.host, '.focus-overlay')).toBeNull()
  })
})

describe('BattleScreen: 被弾の見え方', () => {
  it('敵に攻撃されると自キャラが一瞬だけ色を変える', async () => {
    vi.useFakeTimers()
    try {
      const h = mountTakingHits()
      slotButtons(h.host)[5].click()   // 何もしない → 敵の手番が回ってくる
      await nextTick()
      vi.advanceTimersByTime(BATTLE.multiHitIntervalMs)
      await nextTick()
      expect($(h.host, '.char-unit.player .sprite-box.flashing')).not.toBeNull()
      expect($$(h.host, '.char-unit.player .damage-popup').length).toBeGreaterThan(0)

      // フラッシュは一瞬で終わる（出しっぱなしにしない）
      vi.advanceTimersByTime(BATTLE.presentation.flashMs + 50)
      await nextTick()
      expect($(h.host, '.char-unit.player .sprite-box.flashing')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('BattleScreen: 効果音', () => {
  afterEach(() => { soundManager.register({}) })

  /** 鳴った SE の id を記録する差し替え実装 */
  function recordSfx(): string[] {
    const played: string[] = []
    soundManager.register({ playSfx: (id: string) => { played.push(id) } })
    return played
  }

  it('スキルJSONで指定した音が、発動時と着弾時にそれぞれ鳴る', async () => {
    vi.useFakeTimers()
    try {
      const h = mount()
      const skillId = h.battle.state.player.actives[0].id
      const def = BATTLE_CONTENT.skills.get(skillId)
      if (!def || def.kind !== 'active' || !def.sfx?.cast || !def.sfx?.impact) {
        throw new Error(`${skillId} に sfx が定義されていません`)
      }
      const played = recordSfx()
      await h.act()
      await nextTick()
      vi.advanceTimersByTime(BATTLE.multiHitIntervalMs * 4)
      expect(played).toContain(def.sfx.cast)
      expect(played).toContain(def.sfx.impact)
    } finally {
      vi.useRealTimers()
    }
  })

  it('スキル別の指定がない演出はエフェクトJSONの音を使う', async () => {
    vi.useFakeTimers()
    try {
      const h = mount()
      const played = recordSfx()
      slotButtons(h.host)[4].click()   // 守る
      await nextTick()
      vi.advanceTimersByTime(BATTLE.multiHitIntervalMs * 4)
      expect(played).toContain(BATTLE_EFFECTS.get('fx_guard')?.sfx)
    } finally {
      vi.useRealTimers()
    }
  })
})
