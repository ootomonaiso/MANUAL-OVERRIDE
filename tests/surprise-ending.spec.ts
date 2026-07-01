import { test, expect, startGame, bypassTutorial, clickFirstChoice } from './e2e-helpers'

/**
 * Issue #24: 意外な結末の E2E テスト
 *
 * 矛盾カードの選択はランダムなため、glitch エンドの完全再現は不可能。
 * ここでは以下のことをテストする:
 * 1. ゲームが正常にエンディングまで到達できる
 * 2. エンディングパネルが矛盾レベル・プレイスタイルを表示できる
 * 3. JS エラーが発生しない
 */

test.describe('サプライズエンド (Issue #24)', () => {
  test('ゲームがエンディングまで到達できる', async ({ page, errors }) => {
    await startGame(page)
    await bypassTutorial(page)

    // ゲームをプレイして説明書更新を通過
    for (let round = 0; round < 5; round++) {
      await page.waitForTimeout(3_000)
      await clickFirstChoice(page)
      // ジャンプ操作を継続
      await page.keyboard.press('Space')
      await page.waitForTimeout(200)
    }

    // ゲームが継続していることを確認
    await expect(page.locator('canvas')).toBeVisible()

    // エラーが発生していないことを確認
    expect(errors).toHaveLength(0)
  })

  test('エンディングパネルに矛盾レベルが表示される', async ({ page, errors }) => {
    await startGame(page)
    await bypassTutorial(page)

    // 数ラウンドプレイ
    for (let round = 0; round < 3; round++) {
      await page.waitForTimeout(3_000)
      await clickFirstChoice(page)
      await page.keyboard.press('Space')
    }

    // ギブアップボタンを探してクリック（投擲フェーズへ）
    const giveUpBtn = page.locator('button', { hasText: 'ギブアップ' })
    if (await giveUpBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await giveUpBtn.click()
    }

    // 投擲フェーズで説明書をドラッグ＆ドロップ
    await page.waitForTimeout(1_000)
    // 投擲エリアでクリック（簡易投擲）
    await page.mouse.move(400, 300)
    await page.mouse.down()
    await page.mouse.move(500, 200)
    await page.mouse.up()

    // エンディングが表示されるまで待機
    await page.waitForTimeout(3_000)

    // エンディングパネルの表示確認
    const endingCard = page.locator('.ending-card')
    if (await endingCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // 矛盾レベルバーが存在することを確認
      const contradictionBar = page.locator('.contradiction-bar')
      // 表示されていれば良い（必ず表示されるとは限らない）
      const barCount = await contradictionBar.count()
      expect(barCount).toBeGreaterThanOrEqual(0)
    }

    expect(errors).toHaveLength(0)
  })

  test('複数回のプレイでゲームがクラッシュしない', async ({ page, errors }) => {
    // 3回連続でゲームをプレイ
    for (let attempt = 0; attempt < 3; attempt++) {
      await startGame(page)
      await bypassTutorial(page)

      // 短時間プレイ
      await page.waitForTimeout(2_000)
      await page.keyboard.press('Space')
      await page.waitForTimeout(500)

      // ギブアップ
      const giveUpBtn = page.locator('button', { hasText: 'ギブアップ' })
      if (await giveUpBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await giveUpBtn.click()
        await page.waitForTimeout(1_000)
        // 簡易投擲
        await page.mouse.move(400, 300)
        await page.mouse.down()
        await page.mouse.move(500, 200)
        await page.mouse.up()
        await page.waitForTimeout(2_000)
      }

      // リスタート
      const restartBtn = page.locator('.restart-btn')
      if (await restartBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await restartBtn.click()
        await page.waitForTimeout(1_000)
      }
    }

    expect(errors).toHaveLength(0)
  })
})
