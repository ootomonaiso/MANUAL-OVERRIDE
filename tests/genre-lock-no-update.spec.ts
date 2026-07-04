import { test, expect, startGame, bypassTutorial } from './e2e-helpers'

/**
 * Issue: ジャンル確定後も説明書が更新され続ける問題のテスト
 *
 * 修正内容:
 *   App.vue の activePlay から 'genreLocked' を削除し、
 *   ジャンル確定後の triggerUpdate() 呼び出しを止めた。
 *
 * テスト項目:
 *   1. ジャンル確定後、ChoicePanel（2択モーダル）が出現しない
 *   2. ジャンル確定後、ゲーム状態が正常に保持される
 *   3. JS エラーが発生しない
 */
test.describe('ジャンル確定後の説明書更新停止 (fix: no-manual-update-after-genre-lock)', () => {
  test('ジャンル確定後、ChoicePanel が出現しない', async ({ page, errors }) => {
    await startGame(page)
    await bypassTutorial(page)

    // ゲームを少しプレイ（ジャンプで firstJumpDone = true）
    await page.keyboard.press('Space')
    await page.waitForTimeout(1_000)

    // 複数回カード選択を試みる（ジャンル確定まで）
    for (let round = 0; round < 12; round++) {
      // ChoicePanel が表示されるまで待つ
      const choiceBtn = page.locator('.choice-btn').first()
      const isVisible = await choiceBtn.isVisible({ timeout: 8_000 }).catch(() => false)
      if (!isVisible) {
        // 10秒待っても出なかったら break（ジャンル確定または他の状態）
        break
      }
      try {
        await choiceBtn.click({ timeout: 3_000 })
      } catch {
        break
      }
      // ChoicePanel が消えるまで待つ
      await page.locator('[class*="choice-overlay"]').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(500)

      // ジャンル確定オーバーレイが出現したら break
      const revealOverlay = page.locator('[class*="gr-root"]')
      const isRevealed = await revealOverlay.first().isVisible({ timeout: 1_000 }).catch(() => false)
      if (isRevealed) break
    }

    // ジャンル確定オーバーレイ退場を待つ
    await page.waitForTimeout(4_000)

    // ChoicePanel が表示されていないことを確認
    const choiceOverlays = page.locator('[class*="choice-overlay"]')
    await choiceOverlays.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
    const choiceCount = await choiceOverlays.count()
    expect(choiceCount).toBe(0)

    expect(errors).toHaveLength(0)
  })

  test('ジャンル確定後、ゲーム状態が正常に保持される', async ({ page, errors }) => {
    await startGame(page)
    await bypassTutorial(page)

    // ジャンプで firstJumpDone = true
    await page.keyboard.press('Space')
    await page.waitForTimeout(1_000)

    // カード選択を繰り返す
    for (let round = 0; round < 12; round++) {
      const choiceBtn = page.locator('.choice-btn').first()
      const isVisible = await choiceBtn.isVisible({ timeout: 8_000 }).catch(() => false)
      if (!isVisible) break
      try {
        await choiceBtn.click({ timeout: 3_000 })
      } catch {
        break
      }
      await page.locator('[class*="choice-overlay"]').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(500)

      const revealOverlay = page.locator('[class*="gr-root"]')
      const isRevealed = await revealOverlay.first().isVisible({ timeout: 1_000 }).catch(() => false)
      if (isRevealed) break
    }

    // オーバーレイ退場を待つ
    await page.waitForTimeout(4_000)

    // キャンバスがまだ表示されている
    await expect(page.locator('canvas')).toBeVisible()
    expect(errors).toHaveLength(0)
  })

  test('ジャンル確定後、ゲームがクラッシュせずに継続する', async ({ page, errors }) => {
    await startGame(page)
    await bypassTutorial(page)

    // ジャンプで firstJumpDone = true
    await page.keyboard.press('Space')
    await page.waitForTimeout(1_000)

    // カード選択を繰り返す
    for (let round = 0; round < 12; round++) {
      const choiceBtn = page.locator('.choice-btn').first()
      const isVisible = await choiceBtn.isVisible({ timeout: 8_000 }).catch(() => false)
      if (!isVisible) break
      try {
        await choiceBtn.click({ timeout: 3_000 })
      } catch {
        break
      }
      await page.locator('[class*="choice-overlay"]').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(500)

      const revealOverlay = page.locator('[class*="gr-root"]')
      const isRevealed = await revealOverlay.first().isVisible({ timeout: 1_000 }).catch(() => false)
      if (isRevealed) break
    }

    // 確定後、さらに15秒プレイ
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Space')
      await page.waitForTimeout(1_000)
    }

    await expect(page.locator('canvas')).toBeVisible()
    expect(errors).toHaveLength(0)
  })
})
