import { test, expect } from '@playwright/test'

/**
 * P0 ドーパミン改善 統合テスト
 *
 * ゲーム開始フロー: text=はじめる → text=わかった、プレイする → プレイフェーズ
 *
 * 確認項目:
 *   - HUD に SPD 表示と NEXT バーが存在すること
 *   - M キー押下 → MUTE 表示出現、再押下 → 消失
 *   - 数秒間プレイ → pageerror が 0 件
 *   - 既存スモークテストが引き続きパスすること
 */

test.describe('P0 ドーパミン — 統合', () => {
  test('SPD 表示と NEXT バーが HUD に存在する', async ({ page }) => {
    await page.goto('/')
    await page.click('text=はじめる')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })

    // チュートリアルイントロを通過
    await page.click('text=わかった、プレイする')

    // 数秒待って HUD が描画されるのを待つ
    await page.waitForTimeout(2000)

    // SPD 表示が画面左に表示されていること
    const spd = page.locator('.hud-spd')
    await expect(spd).toBeVisible({ timeout: 5000 })
    await expect(spd).toContainText('SPD')

    // NEXT バーが表示されていること
    const next = page.locator('.hud-next')
    await expect(next).toBeVisible({ timeout: 5000 })
    await expect(next).toContainText('NEXT')
  })

  test('M キーでミュート切替', async ({ page }) => {
    await page.goto('/')
    await page.click('text=はじめる')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })
    await page.click('text=わかった、プレイする')
    await page.waitForTimeout(1000)

    // 最初は MUTE 表示がないはず
    const muteOff = page.locator('.hud-muted')
    await expect(muteOff).not.toBeVisible({ timeout: 2000 })

    // M キーでミュート ON → MUTE 表示出現
    await page.keyboard.press('KeyM')
    await expect(muteOff).toBeVisible({ timeout: 3000 })

    // 再押下でミュート OFF → MUTE 表示消失
    await page.keyboard.press('KeyM')
    await expect(muteOff).not.toBeVisible({ timeout: 3000 })
  })

  test('数秒間プレイしても pageerror が 0 件', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await page.click('text=はじめる')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })
    await page.click('text=わかった、プレイする')

    // 3秒間プレイ（自動スクロール）
    await page.waitForTimeout(3000)

    // ジャンプ操作も追加
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)

    expect(errors).toHaveLength(0)
  })

  test('収束メーターが null のときは表示されない', async ({ page }) => {
    await page.goto('/')
    await page.click('text=はじめる')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5000 })
    await page.click('text=わかった、プレイする')
    await page.waitForTimeout(2000)

    // 初期状態ではベイズ収束メーターは表示されない（確率がすべて等しいため）
    const convergence = page.locator('.hud-convergence')
    await expect(convergence).not.toBeVisible({ timeout: 3000 })
  })
})
