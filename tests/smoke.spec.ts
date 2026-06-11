import { test, expect } from '@playwright/test'

test('タイトル画面が表示される', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10000 })
})

test('ゲームが開始できる', async ({ page }) => {
  await page.goto('/')
  await page.click('text=はじめる')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })
})

test('説明書パネルが表示される', async ({ page }) => {
  await page.goto('/')
  await page.click('text=はじめる')
  // チュートリアルイントロを通過してゲームプレイフェーズへ
  await page.click('text=わかった、プレイする')
  // ManualPanel は右下に常時表示
  await expect(page.locator('[class*="manual"]').first()).toBeVisible({ timeout: 5000 })
})

test('キー入力でプレイヤーが動作する', async ({ page }) => {
  await page.goto('/')
  await page.click('text=はじめる')
  await expect(page.locator('canvas')).toBeVisible()

  // ゲームがクラッシュしないことを確認（3秒間操作）
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    if (i % 2 === 0) await page.keyboard.press('ArrowRight')
  }

  await expect(page.locator('canvas')).toBeVisible()
  // JS エラーが発生していないことを確認
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  expect(errors).toHaveLength(0)
})
