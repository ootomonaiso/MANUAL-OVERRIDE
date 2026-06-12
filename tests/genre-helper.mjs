// genre-<id>.mjs 共通ヘルパー。
// 説明書の選択肢を順にクリックし、対象ジャンルにロックされることを確認する。
//
// 横スクロールパートはハザード（障害物）の出現がランダムであり、
// ジャンプ連打だけでは稀に被弾してゲームが進行しなくなる（プレイヤー死亡で
// shouldUpdate が発生しなくなる）。ジャンル分岐確認テストの本来の目的は
// 選択肢の遷移と genreLocked 判定の確認であり、横スクロール部分の生存性
// テストではないため、?e2eNoDeath=1 でハザード衝突死を無効化して実行する。
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL_RAW = process.env.GAME_URL || 'http://localhost:5173';
export const BASE_URL = BASE_URL_RAW + (BASE_URL_RAW.includes('?') ? '&' : '?') + 'e2eNoDeath=1';

const MAX_ATTEMPTS = 3;
const MAX_JUMPS_PER_STEP = 1500;
const STUCK_LIMIT = 40; // distance表示が変化しないフレーム数（プレイヤー死亡の検知）

async function readDistance(page) {
  const text = await page.locator('.hud-dist-text').textContent().catch(() => null);
  if (!text) return null;
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * 選択肢パネルが表示されるまでジャンプし続ける。
 * プレイヤーが死亡して進行が止まった（distance表示が変化しない）場合は
 * 早期に false を返し、呼び出し側でリトライ（ブラウザ再起動）させる。
 */
export async function waitForChoicePanel(page) {
  let lastDist = await readDistance(page);
  let stuckCount = 0;
  for (let i = 0; i < MAX_JUMPS_PER_STEP; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(15);
    if (await page.locator('.choice-btn').first().isVisible().catch(() => false)) {
      return true;
    }
    const dist = await readDistance(page);
    if (dist !== null && dist === lastDist) {
      stuckCount++;
      if (stuckCount >= STUCK_LIMIT) return false; // プレイヤー死亡と判断
    } else {
      stuckCount = 0;
      lastDist = dist;
    }
  }
  return false;
}

export { MAX_ATTEMPTS };

export function loadGenres() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/config/genres.json'), 'utf-8')).genres;
}

// ManualValidator は advanced-branch.json (ver 9.0-15.0) が
// 通常プレイでは到達不能なことに起因する既知の警告/エラーを大量に出す。
// このプロジェクト固有の既存課題であり、ジャンルスクリプトの確認対象外として除外する。
function isKnownManualValidatorNoise(text) {
  return text.includes('[ManualValidator]');
}

async function attemptOnce(page, { genreId, choiceLabels, target }) {
  const unexpectedWarnings = [];
  const handler = msg => {
    if (msg.type() === 'warning' && !isKnownManualValidatorNoise(msg.text())) {
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

    for (const label of choiceLabels) {
      const found = await waitForChoicePanel(page);
      if (!found) {
        throw new Error(`choice-btn did not appear before clicking "${label}" (player likely died)`);
      }
      const btn = page.locator('.choice-btn').filter({ has: page.locator('.choice-label', { hasText: label }) });
      if (await btn.count() === 0) {
        const labels = await page.locator('.choice-label').allTextContents();
        throw new Error(`choice label "${label}" not found. visible labels: ${JSON.stringify(labels)}`);
      }
      await btn.first().click();
      // 選択肢パネルが閉じる（離脱トランジション）のを待ってから次へ進む
      await page.locator('.choice-btn').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(300);
    }

    let locked = false;
    for (let i = 0; i < 100; i++) {
      if (await page.locator('.genre-locked-banner .genre-locked-text').isVisible().catch(() => false)) {
        locked = true;
        break;
      }
      await page.keyboard.press('Space');
      await page.waitForTimeout(15);
    }
    if (!locked) {
      throw new Error('genre-locked-banner did not appear');
    }

    const text = (await page.locator('.genre-locked-banner .genre-locked-text').textContent()).trim();
    if (text !== target.manualReveal) {
      throw new Error(`manualReveal mismatch: expected "${target.manualReveal}", got "${text}"`);
    }

    await fs.promises.mkdir(path.join(ROOT, 'tests/screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, `tests/screenshots/genre-${genreId}.png`) });

    if (unexpectedWarnings.length > 0) {
      throw new Error(`unexpected console.warn: ${JSON.stringify(unexpectedWarnings)}`);
    }

    return text;
  } finally {
    page.off('console', handler);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.genreId 確認対象のジャンルID（src/data/config/genres.json の id）
 * @param {string[]} opts.choiceLabels 1.0 から順にクリックする選択肢ラベル
 */
export async function runGenreLockTest({ genreId, choiceLabels }) {
  const genres = loadGenres();
  const target = genres.find(g => g.id === genreId);
  if (!target) throw new Error(`genre "${genreId}" not found in genres.json`);

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      const text = await attemptOnce(page, { genreId, choiceLabels, target });
      await browser.close();
      console.log(`PASS: genre-${genreId} -> manualReveal="${text}"${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      return;
    } catch (err) {
      lastError = err;
      await browser.close();
    }
  }
  throw new Error(`genre-${genreId} failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`);
}
