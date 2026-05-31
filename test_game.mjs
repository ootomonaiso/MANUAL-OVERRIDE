import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:5190', { waitUntil: 'networkidle' });
  
  await page.screenshot({ path: 'gameplay_01_title.png' });
  console.log('✓ Title');
  
  // 開始
  await page.click('button');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'gameplay_02_start.png' });
  console.log('✓ Started');
  
  // プレイ
  for (let i = 0; i < 15; i++) {
    if (Math.random() > 0.7) await page.press('Space');
    if (Math.random() > 0.6) await page.press(Math.random() > 0.5 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: 'gameplay_03_play.png' });
  console.log('✓ Played');
  
  await browser.close();
})();
