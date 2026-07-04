/**
 * tests/e2e-helpers.ts
 *
 * Playwright E2E テストの共通ヘルパー。
 * 重複するページ操作パターンを一元管理する。
 */

import { Page, test as base, expect } from '@playwright/test'

// ──────────────────────────────────────────────────────────────────────
// スタンドアロン関数（フィクスチャと共通利用）
// ──────────────────────────────────────────────────────────────────────

/** ゲームを開始する（タイトル画面 → ゲームプレイ） */
export async function startGame(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10_000 })
  await page.click('text=はじめる')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 })
}

/** チュートリアルイントロを通過する（存在する場合） */
export async function bypassTutorial(page: Page): Promise<boolean> {
  await page.waitForTimeout(1_000)
  const tutorialButton = page.locator('text=わかった、プレイする')
  const visible = await tutorialButton.isVisible({ timeout: 2_000 }).catch(() => false)
  if (visible) {
    await tutorialButton.click()
  }
  return visible
}

/** 選択肢モーダルがあれば最初の選択肢をクリックする */
export async function clickFirstChoice(page: Page): Promise<boolean> {
  const choiceButtons = page.locator('[class*="choice"]')
  const count = await choiceButtons.count()
  if (count > 0) {
    await choiceButtons.first().click()
    await page.waitForTimeout(500)
    return true
  }
  return false
}

/**
 * ジャンル確定を強制的にトリガーする。
 *
 * チュートリアル通過 → ジャンプ → カード選択を MAX_ROUNDS 回繰り返す。
 * 各ラウンド: triggerUpdate() 発火 → ChoicePanel 表示 → 選択 → genreLocked 判定
 */
export async function forceGenreLock(page: Page, maxRounds = 10): Promise<void> {
  // 最初のジャンプで firstJumpDone = true にする
  await page.keyboard.press('Space')
  await page.waitForTimeout(500)

  for (let round = 0; round < maxRounds; round++) {
    // ChoicePanel が表示されるまで待つ（最大5秒）
    const choiceBtn = page.locator('.choice-btn').first()
    const isVisible = await choiceBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    if (!isVisible) {
      // triggerUpdate が発火しない場合、Space で firstJumpDone を再確認
      await page.keyboard.press('Space')
      await page.waitForTimeout(500)
      continue
    }
    // 最初の選択肢をクリック（detached 時は無視）
    try {
      await choiceBtn.click({ timeout: 2_000 })
    } catch {
      // クリック失敗時は次のラウンドへ
    }
    // フェーズが genreLocked に遷移するのを待つ（ChoicePanel が消えるまで）
    await page.locator('[class*="choice-overlay"]').waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(300)
  }
}

// ──────────────────────────────────────────────────────────────────────
// カスタムフィクスチャ
// ──────────────────────────────────────────────────────────────────────

interface TestFixtures {
  errors: string[]
}

export const test = base.extend<TestFixtures>({
  errors: async ({ page }, use) => {
    // キー入力より前にリスナーを登録
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await use(errors)
  },
})

export { expect }
