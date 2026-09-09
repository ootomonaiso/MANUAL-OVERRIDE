import { test, expect } from '@playwright/test'

test.describe('プラットフォームアクション（縦スクロール）', () => {
  test('ゲームが起動し、プラットフォーム関連コードがエラーなく読み込まれる', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10000 })

    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    // デバッグパネルの select に "platformer" を設定
    // Playwright の selectOption は v-model と相性が悪い場合があるため、
    // 直接 option をクリックする（select の dropdown を開いてから）
    await page.locator('.debug-select').click()
    // select の option 要素を直接クリック（native dropdown 経由）
    await page.evaluate(() => {
      const select = document.querySelector('select.debug-select') as HTMLSelectElement
      if (select) {
        // option 要素を直接操作
        for (const option of select.options) {
          if (option.value === 'platformer') {
            option.selected = true
            select.dispatchEvent(new Event('change', { bubbles: true }))
            break
          }
        }
      }
    })
    await page.waitForTimeout(300) // Vue の v-model バインディングが反映されるまで待つ
    await page.click('.debug-ok')

    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })

    // t≈3.5s: プレイヤーは画面下端で静止中（生存）、プラットフォームが上から降下してきて
    // いるはず。溶岩はまだオフスクリーン（出現は ≈6.7s）。ここでジャンプせず、
    // 二段ジャンプの予算（jumpsLeft=2）を残す。
    await page.waitForTimeout(3500)
    // キー入力テスト（水平移動のみ）
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight')
    await page.screenshot({ path: 'tmp/platformer-e2e-early.png' })

    // t≈5.5s: 中間時点のスクリーンショット（空の色・プラットフォーム確認用）
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'tmp/platformer-e2e-mid.png' })

    // t≈6.0s: 二段ジャンプで空中に留まり、溶岩が画面下端に到達（≈6.7s）したときに
    // プレイヤーが下端より上にあるようにする。すると溶岩は下端より上へ上昇し可視化される。
    await page.waitForTimeout(500)
    await page.keyboard.press('Space')   // ジャンプ 1
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')   // 二段ジャンプ
    await page.waitForTimeout(1350)      // t≈7.5s: プレイヤーは空中、溶岩は下端から可視
    await page.screenshot({ path: 'tmp/platformer-e2e-lava.png' })

    expect(errors).toHaveLength(0)
  })
})
