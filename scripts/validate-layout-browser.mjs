import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../scratch/browser-check/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5178', { waitUntil: 'networkidle' });
  // Isolate layout validation from the optional GPU generation workflow.
  await page.evaluate(() => {
    const option = document.querySelector('[data-ai-import]');
    option.checked = false; option.dispatchEvent(new Event('change'));
  });
  const current = () => page.evaluate(() => JSON.parse(localStorage.getItem('lotr_card_gen_current')));
  const layouts = () => page.evaluate(() => JSON.parse(localStorage.getItem('lotr_card_gen_layouts')).byType);
  const slider = async (id, value) => page.locator(id).evaluate((el, value) => {
    el.value = value; el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

  await page.locator('#offset-name-y').fill('12');
  await page.locator('#offset-health-x').fill('-8');
  await page.locator('[data-tab="tab-art"]').click();
  await slider('#slider-pos-x', 32); await slider('#slider-pos-y', -18);
  await slider('#slider-rotation', 5);
  await page.locator('#btn-save-type-layout').click();
  assert.equal((await layouts()).hero.art.posX, 32);
  assert.equal((await layouts()).hero.offsets.nameY, 12);

  await slider('#slider-pos-x', 80);
  await page.locator('#btn-apply-type-layout').click();
  assert.equal((await current()).art.posX, 32);
  await page.locator('[data-tab="tab-general"]').click();
  await page.locator('[data-type="ally"]').click();
  assert.equal(await page.locator('#btn-apply-type-layout').isDisabled(), true);
  await page.locator('#offset-name-y').fill('4');
  await page.locator('#btn-save-type-layout').click();
  await page.locator('[data-type="hero"]').click();
  assert.equal((await current()).offsets.nameY, 12);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await layouts()).hero.art.posX, 32);
  assert.equal((await layouts()).ally.offsets.nameY, 4);

  // Imported cards receive the saved geometry before entering the editor or deck.
  const inputCard = { ...(await current()), id: 'test-layout-import', name: 'Novo Herói', customArt: '', art: { sourceKind: 'card', posX: 0, posY: 0, brightness: .7 }, offsets: {} };
  await page.route('**/api/import-hall-of-beorn', route => route.fulfill({ json: { success: true, expansionName: 'Teste', cards: [inputCard] } }));
  await page.locator('[data-tab="tab-text"]').click();
  await page.locator('#input-quick-single-card').fill('Novo Herói');
  await page.locator('#btn-quick-import-single').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('lotr_card_gen_current') || '{}').id === 'test-layout-import');
  assert.equal((await current()).art.posX, 32);
  assert.equal((await current()).art.sourceKind, 'card');
  assert.equal((await current()).art.brightness, .7);
  assert.equal((await current()).offsets.healthX, -8);

  await page.locator('[data-tab="tab-presets"]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-json').click();
  const download = await downloadPromise;
  fs.mkdirSync('scratch/validation', { recursive: true });
  await download.saveAs('scratch/validation/layout-backup.json');
  const backup = JSON.parse(fs.readFileSync('scratch/validation/layout-backup.json', 'utf8'));
  assert.equal(backup.layoutPresets.hero.art.posX, 32);
  await page.locator('#btn-remove-type-layout').click();
  assert.equal((await layouts()).hero, undefined);
  assert.equal((await current()).art.posX, 32);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#input-import-json').setInputFiles('scratch/validation/layout-backup.json');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('lotr_card_gen_layouts')).byType.hero?.art.posX === 32);
  assert.deepEqual(errors, []);
  await page.locator('[data-tab="tab-general"]').click();
  await page.locator('.panel-content').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: 'scratch/validation/layout-controls.png' });
  await page.locator('[data-tab="tab-art"]').click();
  assert.equal(await page.locator('#proxy-framing-controls').isVisible(), true);
  await page.locator('#input-proxy-alignment').uncheck();
  await page.locator('#btn-save-type-layout').click();
  assert.equal((await layouts()).hero.art.proxyAlignment, false);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-tab="tab-art"]').click();
  assert.equal(await page.locator('#input-proxy-alignment').isChecked(), false);
  await page.locator('#btn-restore-proxy-framing').click();
  const restored = await current();
  assert.equal(restored.art.proxyAlignment, true);
  assert.equal(restored.art.posX, 0);
  assert.equal(restored.art.scaleX, 1);
  assert.equal(restored.art.rotation, 0);
  assert.equal(restored.art.brightness, .7);
  assert.equal(restored.offsets.healthX, -8);
  assert.deepEqual(errors, []);
  console.log('Proxy framing UI verified: toggle, saved layout, reload, restore geometry without changing color or attributes.');
  console.log('Layout UI verified: save, apply, separate types, reload, automatic import, JSON backup/restore and deletion. No page errors.');
} finally { await browser.close(); }
