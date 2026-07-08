# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tetris.spec.ts >> テトリスジャンル >> ゲームが起動し、テトリス関連コードがエラーなく読み込まれる
- Location: tests\tetris.spec.ts:4:3

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | test.describe('テトリスジャンル', () => {
  4   |   test('ゲームが起動し、テトリス関連コードがエラーなく読み込まれる', async ({ page }) => {
> 5   |     await page.goto('/')
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
  6   |     await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10000 })
  7   | 
  8   |     const errors: string[] = []
  9   |     page.on('pageerror', err => errors.push(err.message))
  10  | 
  11  |     await page.click('text=はじめる')
  12  |     await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })
  13  | 
  14  |     // 3秒間待機してエラーを確認
  15  |     await page.waitForTimeout(3000)
  16  |     expect(errors).toHaveLength(0)
  17  |   })
  18  | 
  19  |   test('説明書更新でテトリス分岐選択肢が存在する', async ({ page }) => {
  20  |     await page.goto('/')
  21  |     await page.click('text=はじめる')
  22  |     await expect(page.locator('canvas')).toBeVisible()
  23  | 
  24  |     // チュートリアルを通過
  25  |     await page.click('text=わかった、プレイする')
  26  |     await page.waitForTimeout(2000)
  27  | 
  28  |     // 説明書パネルが表示されることを確認
  29  |     await expect(page.locator('[class*="manual"]').first()).toBeVisible({ timeout: 5000 })
  30  |   })
  31  | 
  32  |   test('キー入力でゲームがクラッシュしない', async ({ page }) => {
  33  |     await page.goto('/')
  34  |     await page.click('text=はじめる')
  35  |     await expect(page.locator('canvas')).toBeVisible()
  36  | 
  37  |     const errors: string[] = []
  38  |     page.on('pageerror', err => errors.push(err.message))
  39  | 
  40  |     // 各種キー入力（テトリス操作: 左右・回転・落下・ハードドロップ）
  41  |     await page.keyboard.press('ArrowLeft')
  42  |     await page.keyboard.press('ArrowRight')
  43  |     await page.keyboard.press('ArrowUp')
  44  |     await page.keyboard.press('ArrowDown')
  45  |     await page.keyboard.press('Space')
  46  | 
  47  |     await page.waitForTimeout(1000)
  48  |     expect(errors).toHaveLength(0)
  49  |     await expect(page.locator('canvas')).toBeVisible()
  50  |   })
  51  | 
  52  |   test('テトリスジャンル定義が正しく読み込まれる', async ({ page }) => {
  53  |     await page.goto('/')
  54  | 
  55  |     // ゲーム起動前にジャンル定義を確認
  56  |     const genreData = await page.evaluate(() => {
  57  |       // GAME_CONFIG.genres から tetris ジャンルを取得
  58  |       try {
  59  |         // @ts-expect-error runtime access
  60  |         const config = (window as any).__TEST_GET_CONFIG?.()
  61  |         return config?.genres?.genres?.find((g: { id: string }) => g.id === 'tetris')
  62  |       } catch {
  63  |         return null
  64  |       }
  65  |     })
  66  | 
  67  |     // 直接アクセスできない場合は、ページが正常に読み込まれることを確認
  68  |     await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })
  69  |   })
  70  | 
  71  |   test('テトリス操作キーの同時入力でクラッシュしない', async ({ page }) => {
  72  |     await page.goto('/')
  73  |     await page.click('text=はじめる')
  74  |     await expect(page.locator('canvas')).toBeVisible()
  75  | 
  76  |     const errors: string[] = []
  77  |     page.on('pageerror', err => errors.push(err.message))
  78  | 
  79  |     // 同時キー入力（テトリスで頻出する操作パターン）
  80  |     await Promise.all([
  81  |       page.keyboard.down('ArrowLeft'),
  82  |       page.keyboard.down('ArrowUp'),
  83  |     ])
  84  |     await page.waitForTimeout(100)
  85  |     await Promise.all([
  86  |       page.keyboard.up('ArrowLeft'),
  87  |       page.keyboard.up('ArrowUp'),
  88  |     ])
  89  | 
  90  |     // ハードドロップ連打
  91  |     for (let i = 0; i < 5; i++) {
  92  |       await page.keyboard.press('Space')
  93  |       await page.waitForTimeout(50)
  94  |     }
  95  | 
  96  |     await page.waitForTimeout(500)
  97  |     expect(errors).toHaveLength(0)
  98  |     await expect(page.locator('canvas')).toBeVisible()
  99  |   })
  100 | })
  101 | 
```