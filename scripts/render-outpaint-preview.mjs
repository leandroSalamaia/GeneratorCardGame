import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { CardRenderer } from '../src/renderer.js';
import { parseCardDetailHtml } from '../vite.config.js';

globalThis.document = { createElement: () => createCanvas(756, 1063) };
registerFont('public/assets/fonts/Vafthrudnir-Ext-Regular.otf', { family: 'LotrStats' });
const folder = process.argv[2] || 'scratch/local-ai/aragorn-sdxl';
const artFile = path.resolve(folder, 'extended-art.png');
const card = parseCardDetailHtml(fs.readFileSync('tests/fixtures/Aragorn-Core.html', 'utf8'), 'https://hallofbeorn.com/LotR/Details/Aragorn-Core');
card.customArt = artFile;
card.art = { sourceKind: 'art', posX: 0, posY: -73, scaleX: 1, scaleY: 1, brightness: 1, contrast: 1 };
const canvas = createCanvas(756, 1063), renderer = new CardRenderer(canvas);
renderer.manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
renderer.loadImage = async src => {
  if (!src) return null;
  try { return await loadImage(src === artFile ? artFile : 'public' + src); }
  catch { return null; }
};
await renderer.render(card);
fs.writeFileSync(path.join(folder, 'card-preview.png'), canvas.toBuffer('image/png'));
console.log('Saved card preview:', path.join(folder, 'card-preview.png'));
