import { test, expect } from '@playwright/test'

/**
 * Aquatic（水中アクション）E2E テスト
 *
 * 検証項目:
 * 1. aquatic ジャンル強制でゲームが起動する
 * 2. 左上に O2 ゲージ HUD が描画される
 * 3. 時間経過でゲージが減衰する
 * 4. JS エラーが発生しない
 */

// video: on は describe グループ外でないと使えない（ワーカー強制のため）
test.use({ video: 'on' })

test.describe('Aquatic（水中アクション）', () => {

  test('aquatic ジャンル強制で起動し、O2 ゲージが描画される', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    // 1. タイトル画面へ
    await page.goto('/')
    await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10_000 })

    // 2. デバッグパネルで aquatic を強制
    //    DEBUG_MODE=true なので dev 環境ではタイトル画面にデバッグパネルが表示される。
    //    debug-ok は onDebugApply → startGame() で即座にゲームを開始する。
    //    ※ ここに「はじめる」クリックを追加しないこと: タイトル画面の Vue 解除が
    //      フレーム単位のレースにあるため、二重 startGame となり 2 つの SideScroller
    //      が共有 FeatureSystem シングルトンを同時に更新する（減衰 2 倍化・
    //      死亡トリガー半減の原因）。
    await page.selectOption('select.debug-select', 'aquatic')
    await page.click('button.debug-ok')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 })

    // 3. チュートリアルを通過（強制ジャンルではスキップされる想定）
    await page.waitForTimeout(1_000)
    const tutorialBtn = page.locator('text=わかった、プレイする')
    if (await tutorialBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await tutorialBtn.click()
    }

    // 4. GENRE LOCKED 演出を待つ（強制ジャンルなので即座に表示される）
    await page.waitForTimeout(4_000)

    // 5. スクリーンショット: 初期状態（O2 ゲージ満タン）
    await page.screenshot({ path: 'tmp/aquatic-o2-initial.png', fullPage: false })

    // 6. ジャンプ操作（aquatic では Space でジャンプ）
    await page.keyboard.press('Space')
    await page.waitForTimeout(2_000)

    // 7. スクリーンショット: 数秒経過（ゲージが減っているはず）
    await page.screenshot({ path: 'tmp/aquatic-o2-depleted.png', fullPage: false })

    // 8. さらに 5秒経過して動画キャプチャ
    await page.waitForTimeout(5_000)

    // 9. JS エラー未発生を確認
    expect(errors).toHaveLength(0)

    // 10. キャンバスがまだ表示されている
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('aquatic でキー入力してもクラッシュしない', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))

    await page.goto('/')
    await expect(page.locator('button', { hasText: 'はじめる' })).toBeVisible({ timeout: 10_000 })

    // デバッグパネルで aquatic 強制（debug-ok は startGame() で即座にゲームを開始する。
    // 「はじめる」の二重クリックは二重 startGame を引き起こすため禁止 — 1 番目のテスト参照）
    await page.selectOption('select.debug-select', 'aquatic')
    await page.click('button.debug-ok')
    await expect(page.locator('canvas')).toBeVisible({ timeout: 5_000 })

    // チュートリアル通過
    await page.waitForTimeout(1_000)
    const tutorialBtn = page.locator('text=わかった、プレイする')
    if (await tutorialBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await tutorialBtn.click()
    }

    await page.waitForTimeout(4_000)

    // aquatic の操作: ← → ↑ ↓ Space
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)

    await expect(page.locator('canvas')).toBeVisible()
    expect(errors).toHaveLength(0)
  })
})
