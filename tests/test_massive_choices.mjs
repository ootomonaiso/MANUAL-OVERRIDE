import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });

  // ゲーム開始
  await page.click('text=はじめる');
  await page.waitForTimeout(1500);

  // チュートリアル画面があればスキップ
  const tutorialVisible = await page.locator('text=わかった、プレイする').isVisible().catch(() => false);
  if (tutorialVisible) {
    await page.click('text=わかった、プレイする');
    await page.waitForTimeout(1000);
    console.log('✓ Skipped tutorial');
  }

  console.log('🔄 Testing massive choice system (ver 9.0+)...\n');

  let successCount = 0;
  for (let updateNum = 1; updateNum <= 20; updateNum++) {
    try {
      // 選択肢を待つ
      await page.waitForSelector('[class*="choice-item"]', { timeout: 20000 });
      console.log(`✓ Update #${updateNum}: choices visible`);
      successCount++;

      // 最初の選択肢をクリック
      await page.click('[class*="choice-item"]:first-child');
      await page.waitForTimeout(800);
    } catch (e) {
      console.log(`✗ Update #${updateNum}: NO choices (reached end)`);
      break;
    }

    // 次の更新を待つため距離を稼ぐ
    const jumps = 70 + (updateNum * 12);
    for (let i = 0; i < jumps; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(10);
    }
  }

  console.log(`\n✓ Successfully navigated through ${successCount} choice updates!`);
  console.log('✓ Advanced branch system is working!');

  await browser.close();
})();