import { test, expect } from '@playwright/test'

/**
 * ゲーム起動と基本操作のE2Eテスト。
 *
 * テトリスのゲームロジック自体はユニットテスト (TetrisFeature.test.ts) で網羅的に検証している。
 * ここでは、テトリスで使われるキー入力を送信してもゲームがクラッシュしないことを確認する。
 */

test.describe('Game keyboard input smoke test', () => {
  test('Game starts and does not crash with tetris control keys', async ({ page }) => {
    await page.goto('/')
    await page.click('text=はじめる')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 })

    // Tetris control keys: left, right, rotate (Space), hard drop (ArrowDown)
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(100)
    await page.keyboard.press('Space')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)

    await expect(page.locator('canvas')).toBeVisible()
    expect(errors).toHaveLength(0)
  })

  test('Canvas exists with valid size after game start', async ({ page }) => {
    await page.goto('/')
    await page.click('text=はじめる')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 })

    const canvas = page.locator('canvas')
    const boundingBox = await canvas.boundingBox()
    expect(boundingBox).not.toBeNull()
    expect(boundingBox!.width).toBeGreaterThan(0)
    expect(boundingBox!.height).toBeGreaterThan(0)
  })
})
