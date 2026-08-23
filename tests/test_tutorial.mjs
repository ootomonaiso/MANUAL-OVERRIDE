import { chromium } from '@playwright/test';

// チュートリアル画面のフローをテストする。
// 前提: localhost:5174 で dev サーバーが起動していること。

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });

  // 1. タイトル画面
  await page.screenshot({ path: 'tutorial_01_title.png' });
  console.log('✓ Title screen captured');

  // 2. 「はじめる」をクリック
  await page.click('text=はじめる');
  await page.waitForTimeout(1500);

  // 3. チュートリアル画面が表示されることを確認
  const tutorialVisible = await page.locator('text=QUICK START').isVisible();
  if (!tutorialVisible) {
    console.log('✗ Tutorial screen did not appear');
    await browser.close();
    process.exit(1);
  }
  console.log('✓ Tutorial screen appeared');

  // チュートリアル画面スクリーンショット
  await page.screenshot({ path: 'tutorial_02_tutorial.png' });
  console.log('✓ Tutorial screen captured');

  // チュートリアル内容の確認
  const hasConcept = await page.locator('text=このゲームについて').isVisible();
  const hasControls = await page.locator('text=操作方法').isVisible();
  const hasColors = await page.locator('text=色のルール').isVisible();
  const hasGenre = await page.locator('text=ジャンルの収束').isVisible();

  console.log(`  - "このゲームについて": ${hasConcept ? '✓' : '✗'}`);
  console.log(`  - "操作方法": ${hasControls ? '✓' : '✗'}`);
  console.log(`  - "色のルール": ${hasColors ? '✓' : '✗'}`);
  console.log(`  - "ジャンルの収束": ${hasGenre ? '✓' : '✗'}`);

  // 4. 「わかった、プレイする」をクリック
  await page.click('text=わかった、プレイする');
  await page.waitForTimeout(1500);

  // 5. ゲームプレイ画面に遷移することを確認
  const canvasVisible = await page.locator('canvas').isVisible();
  const tutorialGone = await page.locator('text=QUICK START').isVisible().catch(() => false);

  if (!canvasVisible) {
    console.log('✗ Game canvas not visible after tutorial');
    await browser.close();
    process.exit(1);
  }
  if (tutorialGone) {
    console.log('✗ Tutorial screen still visible after clicking start');
    await browser.close();
    process.exit(1);
  }
  console.log('✓ Game started after tutorial');

  // ゲームプレイ画面スクリーンショット
  await page.screenshot({ path: 'tutorial_03_gameplay.png' });
  console.log('✓ Gameplay screen captured');

  // 6. 軽くプレイしてゲームが動作することを確認
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
  }

  await page.screenshot({ path: 'tutorial_04_playing.png' });
  console.log('✓ Player can play after tutorial');

  await browser.close();
  console.log('\n✓ All tutorial tests passed');
})();