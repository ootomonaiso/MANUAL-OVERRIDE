import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  console.time('Load');
  await page.goto('http://localhost:5190', { waitUntil: 'networkidle' });
  console.timeEnd('Load');
  
  // タイトル
  await page.screenshot({ path: 'test_01_title.png' });
  console.log('✓ Title screen');
  
  // 開始
  await page.click('button');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test_02_start.png' });
  console.log('✓ Game started');
  
  // 早めのアクション（新速度でテスト）
  for (let i = 0; i < 40; i++) {
    const rand = Math.random();
    if (rand > 0.7) await page.press('Space');
    if (rand > 0.5) await page.press(Math.random() > 0.5 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(200);
  }
  
  await page.screenshot({ path: 'test_03_play.png' });
  console.log('✓ Played ~8 seconds');
  
  // スコア取得
  const scoreText = await page.textContent('[class*="score"]');
  console.log('Score visible:', !!scoreText);
  
  await browser.close();
  console.log('\n✓ Test complete');
})();
