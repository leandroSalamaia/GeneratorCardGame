import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../scratch/browser-check/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5178', { waitUntil: 'networkidle' });
  await page.locator('[data-tab="tab-text"]').click();
  await page.locator('#input-quick-single-card').fill('https://hallofbeorn.com/LotR/Details/Aragorn-Core');
  await page.locator('#btn-quick-import-single').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('lotr_card_gen_current') || '{}').art?.sourceKind === 'generated', null, { timeout: 180000 });
  await page.waitForFunction(() => document.getElementById('quick-ai-status').textContent.includes('prontas'));
  await page.waitForTimeout(1500);
  const card = await page.evaluate(() => JSON.parse(localStorage.getItem('lotr_card_gen_current')));
  assert.equal(card.name, 'Aragorn');
  assert.ok(card.originalProxyArt.startsWith('/api/local-image'));
  const cached = await page.evaluate(async card => (await fetch('/api/extend-import-art', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: card.originalProxyArt, type: card.type }),
  })).json(), card);
  assert.equal(cached.cached, true);
  const image = await page.locator('#card-canvas').evaluate(canvas => canvas.toDataURL('image/png'));
  fs.writeFileSync('scratch/validation/ai-import-aragorn.png', Buffer.from(image.split(',')[1], 'base64'));
  await page.locator('[data-ai-import]').first().uncheck();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-ai-import]').first().isChecked(), false);
  assert.deepEqual(errors, []);
  console.log('Verified live Hall of Beorn import, generated art, original retained, persistent opt-out and cache reuse.');
} finally { await browser.close(); }
