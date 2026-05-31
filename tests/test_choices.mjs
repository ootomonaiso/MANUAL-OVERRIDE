import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  // ゲーム開始
  await page.click('text=はじめる');
  await page.waitForTimeout(2000);
  
  console.log('Testing choice progression...');
  
  for (let updateNum = 1; updateNum <= 5; updateNum++) {
    // 選択肢を待つ
    try {
      await page.waitForSelector('[class*="choice-item"]', { timeout: 15000 });
      console.log(`✓ Update #${updateNum}: choices visible`);
      
      // 1回目の選択肢をクリック
      await page.click('[class*="choice-item"]:first-child');
      await page.waitForTimeout(800);
    } catch (e) {
      console.log(`✗ Update #${updateNum}: NO choices appeared`);
      break;
    }
    
    // 次の更新を待つため、キャンバスをクリックしてジャンプキーを送信
    const jumps = 80 + (updateNum * 20);
    for (let i = 0; i < jumps; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(15);
    }
  }
  
  console.log('Test completed');
  await browser.close();
})();
