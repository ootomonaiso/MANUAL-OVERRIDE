import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5189', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // クリック「はじめる」
  await page.click('text=はじめる');
  await page.waitForTimeout(3000);
  
  // スクリーンショット
  await page.screenshot({ path: 'gameplay.png' });
  console.log('Gameplay screenshot taken');
  
  // 操作を試す: スペースキーでジャンプ
  await page.press('Space');
  await page.waitForTimeout(500);
  
  // もう一度スクリーンショット
  await page.screenshot({ path: 'gameplay2.png' });
  console.log('After jump screenshot taken');
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'gameplay3.png' });
  console.log('After 3s screenshot taken');
  
  await browser.close();
})();
