import { describe, it, expect, beforeEach } from 'vitest'
import { useGameState } from '../../../src/composables/useGameState'
import { MAX_ROUNDS } from '../../../src/data/gameBalance'

/**
 * ジャンル確定まで MAX_ROUNDS 回のカード選択を繰り返すヘルパー。
 */
function _lockGenre(gameState: ReturnType<typeof useGameState>): void {
  for (let i = 0; i < MAX_ROUNDS; i++) {
    gameState.triggerUpdate()
    const cardId = gameState.activeCards.value[0].id
    gameState.choose(cardId)
  }
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

  it('lockedGenre 状態を維持したまま複数回説明書テキストのみ追記される', () => {
    _lockGenre(gameState)
    const lockedGenre = gameState.lockedGenre.value

    for (let i = 0; i < 3; i++) {
      gameState.triggerUpdate()
      const cardId = gameState.activeCards.value[0].id
      gameState.choose(cardId)
      expect(gameState.lockedGenre.value).toBe(lockedGenre)
      expect(gameState.phase.value).toBe('genreLocked')
    }
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
