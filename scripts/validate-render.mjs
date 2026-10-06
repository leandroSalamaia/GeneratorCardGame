import fs from 'node:fs';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { CardRenderer } from '../src/renderer.js';
import { parseCardDetailHtml } from '../vite.config.js';

globalThis.document = { createElement: () => createCanvas(756, 1063) };
registerFont('public/assets/fonts/Vafthrudnir-Ext-Regular.otf', { family: 'LotrStats' });
fs.mkdirSync('scratch/validation', { recursive: true });
for (const slug of ['Aragorn-Core', 'Gandalf-Core', 'Steward-of-Gondor-Core', 'Sneak-Attack-Core', 'Old-Forest-Road-Core', 'Caught-in-a-Web-Core', 'Flies-and-Spiders-Core', 'Forest-Spider-Core', 'Glamdring-THOHaUH', 'Gandalf%27s-Map-Core']) {
  const card = parseCardDetailHtml(fs.readFileSync('tests/fixtures/' + slug + '.html', 'utf8'), 'https://hallofbeorn.com/LotR/Details/' + slug);
  const cards = card.questSides ? Object.values(card.questSides) : [card];
  for (const c of cards) {
    const canvas = createCanvas(756, 1063);
    const renderer = new CardRenderer(canvas);
    renderer.manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
    renderer.loadImage = async src => {
      if (!src) return null;
      let file = 'public' + src;
      if (src.startsWith('/api/local-image')) file = new URL(src, 'http://localhost').searchParams.get('path');
      try { return await loadImage(file); } catch { return null; }
    };
    await renderer.render(c);
    fs.writeFileSync('scratch/validation/' + slug + (c.type === 'quest' ? '-' + c.questSide : '') + '.png', canvas.toBuffer('image/png'));
    console.log('Rendered', c.name, c.questSide);
  }
}
