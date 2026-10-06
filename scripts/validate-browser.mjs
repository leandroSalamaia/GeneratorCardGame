import fs from 'node:fs';
import { chromium } from '../scratch/browser-check/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:5178', { waitUntil: 'networkidle' });
const result = await page.evaluate(async () => {
  const { CardRenderer } = await import('/src/renderer.js');
  const response = await fetch('/api/import-hall-of-beorn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://hallofbeorn.com/LotR/Details/Flies-and-Spiders-Core' })
  });
  const data = await response.json();
  if (!data.success) throw Error(JSON.stringify(data));
  const canvas = document.createElement('canvas');
  const renderer = new CardRenderer(canvas); await renderer.initialize();
  if (!renderer.manifest) throw Error('Asset manifest failed to load');
  await renderer.render(data.cards[0].questSides.b);
  return { name: data.cards[0].name, sides: Object.keys(data.cards[0].questSides), width: canvas.width, height: canvas.height, image: canvas.toDataURL('image/png') };
});
fs.writeFileSync('scratch/validation/browser-quest.png', Buffer.from(result.image.split(',')[1], 'base64'));
delete result.image;
const pdfDownload = page.waitForEvent('download');
await page.evaluate(async () => {
  const { PdfProxyExporter } = await import('/src/pdfExporter.js');
  const request = slug => fetch('/api/import-hall-of-beorn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://hallofbeorn.com/LotR/Details/' + slug }) }).then(r => r.json());
  const quest = (await request('Flies-and-Spiders-Core')).cards[0];
  const ally = (await request('Gandalf-Core')).cards[0];
  window.validationQuest = quest;
  await new PdfProxyExporter().generatePdf([{ card: quest, count: 1 }, { card: ally, count: 1 }], { cardsPerPage: 1 });
});
await (await pdfDownload).saveAs('scratch/validation/export.pdf');
const zipDownload = page.waitForEvent('download');
await page.evaluate(async () => {
  const { ImageBatchExporter } = await import('/src/imageExporter.js');
  await new ImageBatchExporter().exportDeckAsZip([{ card: window.validationQuest, count: 1 }]);
});
await (await zipDownload).saveAs('scratch/validation/export.zip');
const { default: JSZip } = await import('jszip');
const zip = await JSZip.loadAsync(fs.readFileSync('scratch/validation/export.zip'));
result.pngFiles = Object.keys(zip.files);
if (result.pngFiles.length !== 2) errors.push('Quest ZIP must contain both sides');
const pdf = fs.readFileSync('scratch/validation/export.pdf').toString('latin1');
result.pdfPages = (pdf.match(/\/Type \/Page\b/g) || []).length;
if (result.pdfPages !== 2) errors.push('Expected two PDF pages with cardsPerPage=1');
console.log(JSON.stringify({ ...result, errors }));
await browser.close();
if (errors.length) process.exitCode = 1;
