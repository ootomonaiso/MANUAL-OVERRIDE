import { test, expect } from '@playwright/test'

// 回帰: ローディング画面が疑似ロード完了後に自動で消え、タイトルへ遷移すること。
// #153 で修正 → #164 のマージで @complete ハンドラが失われ再発した経緯があるため、
// 「ロード画面が下のタイトルを覆ったまま進行不能になる」状態を明示的に検出する。
test('ローディング画面が自動で消えてタイトルへ遷移する', async ({ page }) => {
  await page.goto('/')

  // 起動直後はロード画面が見えている
  const loading = page.locator('.loading-screen')
  await expect(loading).toBeVisible()

  // 疑似ロード完了後、ロード画面が消えること（進行不能の再発検出）
  await expect(loading).toBeHidden({ timeout: 8000 })

  // タイトルの「はじめる」ボタンが操作可能であること
  await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible()
})
