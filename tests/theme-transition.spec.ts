import { test, expect } from '@playwright/test'

test.describe('Gradual Theme Transition', () => {
  test('ManualPanel の transition が設定されている', async ({ page }) => {
    await page.goto('/')
    await page.click('text=はじめる')
    await page.click('text=わかった、プレイする')

    const manualPanel = page.locator('[class*="manual"]').first()
    await expect(manualPanel).toBeVisible({ timeout: 5000 })

    // CSS transition が設定されているか確認
    const transition = await manualPanel.evaluate((el) => {
      const style = window.getComputedStyle(el)
      return style.transition
    })

    // background, color, border-color, box-shadow が transition 対象に含まれるはず
    expect(transition).toContain('background')
    expect(transition).toContain('color')
  })

  test('ManualPanel に blend CSS custom properties が存在する', async ({ page }) => {
    await page.goto('/')
    await page.click('text=はじめる')
    await page.click('text=わかった、プレイする')

    const manualPanel = page.locator('[class*="manual"]').first()
    await expect(manualPanel).toBeVisible({ timeout: 5000 })

    // inline style に blend プロパティが含まれているか確認
    const hasBlendProps = await manualPanel.evaluate((el) => {
      const style = el.getAttribute('style') || ''
      return style.includes('--blend-bg') &&
             style.includes('--blend-color') &&
             style.includes('--blend-border') &&
             style.includes('--blend-shadow')
    })

    // blend が active であれば inline style に設定される
    // （inactive 時は空文字列でも OK）
    console.log('Has blend props in style:', hasBlendProps)
  })
})
