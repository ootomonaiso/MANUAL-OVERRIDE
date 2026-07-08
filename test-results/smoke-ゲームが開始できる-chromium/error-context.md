# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> ゲームが開始できる
- Location: tests\smoke.spec.ts:8:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test('タイトル画面が表示される', async ({ page }) => {
  4  |   await page.goto('/')
  5  |   await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10000 })
  6  | })
  7  | 
  8  | test('ゲームが開始できる', async ({ page }) => {
> 9  |   await page.goto('/')
     |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
  10 |   await page.click('text=はじめる')
  11 |   await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })
  12 | })
  13 | 
  14 | test('説明書パネルが表示される', async ({ page }) => {
  15 |   await page.goto('/')
  16 |   await page.click('text=はじめる')
  17 |   // チュートリアルイントロを通過してゲームプレイフェーズへ
  18 |   await page.click('text=わかった、プレイする')
  19 |   // ManualPanel は右下に常時表示
  20 |   await expect(page.locator('[class*="manual"]').first()).toBeVisible({ timeout: 5000 })
  21 | })
  22 | 
  23 | test('キー入力でプレイヤーが動作する', async ({ page }) => {
  24 |   await page.goto('/')
  25 |   await page.click('text=はじめる')
  26 |   await expect(page.locator('canvas')).toBeVisible()
  27 | 
  28 |   // ゲームがクラッシュしないことを確認（3秒間操作）
  29 |   for (let i = 0; i < 6; i++) {
  30 |     await page.keyboard.press('Space')
  31 |     await page.waitForTimeout(300)
  32 |     if (i % 2 === 0) await page.keyboard.press('ArrowRight')
  33 |   }
  34 | 
  35 |   await expect(page.locator('canvas')).toBeVisible()
  36 |   // JS エラーが発生していないことを確認
  37 |   const errors: string[] = []
  38 |   page.on('pageerror', err => errors.push(err.message))
  39 |   expect(errors).toHaveLength(0)
  40 | })
  41 | 
```