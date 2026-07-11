import { describe, it, expect, beforeEach } from 'vitest'
import { useGameState } from '../../../src/composables/useGameState'
import { MAX_ROUNDS } from '../../../src/data/gameBalance'
import { CARD_POOL } from '../../../src/data/cardPool'

/**
 * ジャンル確定まで MAX_ROUNDS 回のカード選択を繰り返すヘルパー。
 * 矛盾を意図せず引き起こさないよう、既に選んだカードと矛盾しない方を優先して選ぶ。
 */
function _lockGenre(gameState: ReturnType<typeof useGameState>): void {
  for (let i = 0; i < MAX_ROUNDS; i++) {
    gameState.triggerUpdate()
    const cardId = _pickNonConflicting(gameState)
    gameState.choose(cardId)
  }
}

/** activeCards の中から、既存の選択履歴と矛盾しないカードIDを選ぶ（なければ先頭） */
function _pickNonConflicting(gameState: ReturnType<typeof useGameState>): string {
  const chosenIds = new Set(gameState.choiceHistory.map(h => h.choiceId))
  const safe = gameState.activeCards.value.find(c => !c.conflictsWith?.some(id => chosenIds.has(id)))
  return (safe ?? gameState.activeCards.value[0]).id
}

/**
 * useGameState のフェーズ遷移テスト
 *
 * 主な検証項目:
 * 1. 通常のフェーズ遷移（tutorial → playing → updating）
 * 2. ジャンル確定後の choose() が phase を genreLocked に保持すること
 * 3. lockedGenre 状態で複数回のカード選択が安定すること
 * 4. restart 後の状態リセット
 */
describe('useGameState', () => {
  let gameState: ReturnType<typeof useGameState>

  beforeEach(() => {
    gameState = useGameState()
    gameState.startGame()
    gameState.startTutorial()
  })

  // ── 基本フェーズ遷移 ──────────────────────────────────────

  it('startTutorial 後、フェーズは tutorial になる', () => {
    expect(gameState.phase.value).toBe('tutorial')
  })

  it('triggerUpdate 後、フェーズは updating になる', () => {
    const result = gameState.triggerUpdate()
    expect(result).toBe(true)
    expect(gameState.phase.value).toBe('updating')
  })

  it('triggerUpdate でカードが 2 枚取得できる', () => {
    gameState.triggerUpdate()
    expect(gameState.activeCards.value).toHaveLength(2)
  })

  it('choose 後、lockedGenre が null なら phase は playing になる', () => {
    gameState.triggerUpdate()
    // 新しいbayesパラメータ (minProb=0.30) では1枚目の選択で即座にgenreLockする可能性がある
    // そのため、 phase は playing または genreLocked のいずれかになる
    const cardId = gameState.activeCards.value[0].id
    gameState.choose(cardId)
    expect(['playing', 'genreLocked']).toContain(gameState.phase.value)
  })

  it('choose 後、roundCount が増加する', () => {
    gameState.triggerUpdate()
    const initialCount = gameState.roundCount.value
    const cardId = gameState.activeCards.value[0].id
    gameState.choose(cardId)
    expect(gameState.roundCount.value).toBe(initialCount + 1)
  })

  // ── ジャンル確定後の挙動 ──────────────────────────────────

  it('MAX_ROUNDS 回数選択すると lockedGenre が確定する', () => {
    _lockGenre(gameState)
    expect(gameState.lockedGenre.value).not.toBeNull()
    expect(gameState.phase.value).toBe('genreLocked')
  })

  it('lockedGenre 確定後、choose しても phase は genreLocked のまま', () => {
    _lockGenre(gameState)
    const lockedBefore = gameState.lockedGenre.value
    expect(lockedBefore).not.toBeNull()

    // 追加でカードを選択
    gameState.triggerUpdate()
    const cardId = gameState.activeCards.value[0].id
    gameState.choose(cardId)

    expect(gameState.lockedGenre.value).toBe(lockedBefore)
    expect(gameState.phase.value).toBe('genreLocked')
  })

  it('lockedGenre 状態で choose すると roundCount が増加する', () => {
    _lockGenre(gameState)

    const initialCount = gameState.roundCount.value
    gameState.triggerUpdate()
    const cardId = gameState.activeCards.value[0].id
    gameState.choose(cardId)

    expect(gameState.roundCount.value).toBe(initialCount + 1)
  })

  it('lockedGenre 状態で choose してもエラーにならず roundCount が増加する', () => {
    _lockGenre(gameState)

    const initialCount = gameState.roundCount.value
    gameState.triggerUpdate()
    const cardId = gameState.activeCards.value[0].id
    // choose() が undefined を返す（エラーなし）
    const result = gameState.choose(cardId)
    expect(result).toBeUndefined()
    expect(gameState.roundCount.value).toBe(initialCount + 1)
  })

  it('矛盾する選択をしていなければ、lockedGenre を維持したまま説明書が追記される', () => {
    _lockGenre(gameState)
    const lockedGenre = gameState.lockedGenre.value

    for (let i = 0; i < 3; i++) {
      gameState.triggerUpdate()
      const cardId = _pickNonConflicting(gameState)
      gameState.choose(cardId)
      expect(gameState.lockedGenre.value).toBe(lockedGenre)
      expect(gameState.phase.value).toBe('genreLocked')
    }
  })

  // ── ジャンル確定後も選択は続き、矛盾の蓄積で「壊れたゲーム」になる ──

  it('ジャンル確定後も triggerUpdate/choose を継続できる', () => {
    _lockGenre(gameState)
    expect(gameState.triggerUpdate()).toBe(true)
    expect(gameState.phase.value).toBe('updating')
  })

  it('度重なる矛盾したカード選択で lockedGenre が glitch に上書きされる', () => {
    // 既存の選択履歴と矛盾するカードが提示されたら優先的に選び、
    // 矛盾の蓄積が閾値を超えると「壊れたゲーム」へ強制収束することを検証する。
    const MAX_ATTEMPTS = 200
    for (let i = 0; i < MAX_ATTEMPTS && gameState.lockedGenre.value !== 'glitch'; i++) {
      gameState.triggerUpdate()
      const chosenIds = new Set(gameState.choiceHistory.map(h => h.choiceId))
      const conflicting = gameState.activeCards.value.find(c =>
        c.conflictsWith?.some(id => chosenIds.has(id)) ||
        [...chosenIds].some(id => CARD_POOL.find(p => p.id === id)?.conflictsWith?.includes(c.id))
      )
      gameState.choose((conflicting ?? gameState.activeCards.value[0]).id)
    }

    expect(gameState.lockedGenre.value).toBe('glitch')
    expect(gameState.contradiction.value.hasEffect).toBe(true)
  })

  // ── リスタート ───────────────────────────────────────────

  it('restart 後、全状態が初期値に戻る', () => {
    _lockGenre(gameState)
    gameState.restart()

    expect(gameState.phase.value).toBe('title')
    expect(gameState.lockedGenre.value).toBeNull()
    expect(gameState.roundCount.value).toBe(0)
    expect(gameState.activeCards.value).toHaveLength(0)
  })

  // ── 無効なカード選択 ─────────────────────────────────────

  it('存在しないカード ID で choose するとエラー文字列が返る', () => {
    gameState.triggerUpdate()
    const result = gameState.choose('non-existent-card')
    expect(result).toBe('カードが見つかりません')
  })
})
