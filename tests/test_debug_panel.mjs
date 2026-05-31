import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  
  // ゲーム開始
  await page.locator('.title-btn').click();
  await page.waitForTimeout(1500);
  
  // DebugPanel の情報を取得
  const debugPanel = page.locator('.debug-panel');
  
  // フェーズ情報
  const phaseText = await debugPanel.locator('.phase-badge').textContent();
  console.log(`Phase: ${phaseText}`);
  
  // 累積パラメータを確認
  const paramsDisplay = await debugPanel.locator('.params-display').textContent();
  console.log(`Accumulated params: ${paramsDisplay}`);
  
  // 最初の選択肢を取得
  const choices = await page.locator('.choice-item');
  const choiceCount = await choices.count();
  console.log(`Choices available: ${choiceCount}`);
  
  // 選択肢をテスト（最初の分岐を選択）
  if (choiceCount > 0) {
    // スクロール待機
    await page.waitForTimeout(500);
    
    // 最初の選択肢（ステージに個性を加える）
    const firstChoice = page.locator('.choice-item').first();
    const choiceLabel = await firstChoice.locator('.choice-label').textContent();
    console.log(`\nSelecting first choice: "${choiceLabel}"`);
    
    // ゲームプレイ中にするまで待機
    await page.waitForFunction(() => {
      const style = document.querySelector('.choice-panel')?.style.opacity;
      return style === undefined || style !== '1';
    }, { timeout: 5000 }).catch(() => {});
    
    // 選択パネルが表示されるまで待機
    const choicePanel = page.locator('.choice-panel');
    if (await choicePanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('✓ Choice panel is visible');
      
      // 最初の選択肢をクリック
      const selectableChoices = page.locator('.choice-item');
      if (await selectableChoices.count() > 0) {
        await selectableChoices.first().click();
        console.log('✓ First choice selected');
        await page.waitForTimeout(1000);
      }
    }
  }
  
  // スクリーンショット
  await page.screenshot({ path: '/tmp/game-after-choice.png' });
  
  console.log('\n✅ Debug panel test completed!');
} catch (e) {
  console.error('Test error:', e.message);
  console.error(e.stack);
} finally {
  await browser.close();
}
