// "base"（横スクロールアクション）はジャンルロックの確定先（lockedGenre）には
// ならない初期状態であり、genres.json の thresholds も {} で manualReveal も空文字。
// ここでは「1.0 の最初の選択肢を1つ選んだ直後でも genreLocked にならず、
// base のまま次の説明書更新（2.0-a/2.0-b）へ進める」ことを確認する。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BASE_URL, MAX_ATTEMPTS, loadGenres, waitForChoicePanel } from './genre-helper.mjs';

const genres = loadGenres();
const base = genres.find(g => g.id === 'base');
if (!base) throw new Error('genre "base" not found in genres.json');
if (base.manualReveal !== '') {
  throw new Error(`base.manualReveal expected to be empty, got "${base.manualReveal}"`);
}
if (Object.keys(base.thresholds).length !== 0) {
  throw new Error(`base.thresholds expected to be empty, got ${JSON.stringify(base.thresholds)}`);
}

async function attemptOnce(page) {
  const unexpectedWarnings = [];
  const handler = msg => {
    if (msg.type() === 'warning' && !msg.text().includes('[ManualValidator]')) {
      unexpectedWarnings.push(msg.text());
    }
  };
  page.on('console', handler);

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.click('text=はじめる');
    await page.waitForTimeout(500);
    if (await page.locator('text=わかった、プレイする').isVisible().catch(() => false)) {
      await page.click('text=わかった、プレイする');
    }
    await page.waitForTimeout(500);

    // 1.0 の選択肢が出るまで進める
    if (!(await waitForChoicePanel(page))) {
      throw new Error('1.0 の選択肢が表示されなかった（プレイヤー死亡）');
    }

    // どちらの選択肢でも genreParams が全ジャンルのしきい値未満であることを
    // _analyze-genre-paths.mjs の分析で確認済み（{enemy:1,range:1} / {tempo:2,aerial:1}）。
    // ここでは「ステージに登場するものに個性を加える」を選び、base のまま継続することを確認する。
    await page.locator('.choice-btn').first().click();
    await page.locator('.choice-btn').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);

    const lockedAfterFirstChoice = await page.locator('.genre-locked-banner .genre-locked-text').isVisible().catch(() => false);
    if (lockedAfterFirstChoice) {
      throw new Error('1.0 の選択肢を1つ選んだだけで genreLocked になってしまった（base のまま継続できない）');
    }

    // 次の説明書更新（2.0-a/2.0-b）の選択肢が表示されるまで進められることを確認
    if (!(await waitForChoicePanel(page))) {
      throw new Error('2.0-a/2.0-b の選択肢が表示されなかった（プレイヤー死亡 or base のまま継続できない）');
    }

    await fs.promises.mkdir(path.join(ROOT, 'tests/screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'tests/screenshots/genre-base.png') });

    if (unexpectedWarnings.length > 0) {
      throw new Error(`unexpected console.warn: ${JSON.stringify(unexpectedWarnings)}`);
    }
  } finally {
    page.off('console', handler);
  }
}

let lastError = null;
let ok = false;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await attemptOnce(page);
    await browser.close();
    ok = true;
    console.log(`PASS: genre-base (base のまま 2.0 まで継続できることを確認)${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
    break;
  } catch (err) {
    lastError = err;
    await browser.close();
  }
}
if (!ok) {
  throw new Error(`genre-base failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`);
}
