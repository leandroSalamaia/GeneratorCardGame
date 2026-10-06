import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from 'canvas';
import { CardRenderer } from '../src/renderer.js';

test('shadow ornament appears between ability and shadow and text stays within bounds', async () => {
  const canvas = createCanvas(756, 1063);
  const renderer = new CardRenderer(canvas);
  const ornament = await loadImage(new URL('../public/assets/icons/shadow_symbol.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  renderer.loadImage = async src => src.endsWith('shadow_symbol.png') ? ornament : null;
  const draws = [], labels = [];
  const drawImage = renderer.ctx.drawImage.bind(renderer.ctx);
  const fillText = renderer.ctx.fillText.bind(renderer.ctx);
  renderer.ctx.drawImage = (...args) => { draws.push(args); drawImage(...args); };
  renderer.ctx.fillText = (...args) => { labels.push(args); fillText(...args); };
  await renderer.renderRulesBlock({ name: 'Troll', ability: 'Ability.', hasShadow: true, shadowText: '<b>Sombra:</b> Attack.', quote: 'Quote.' }, 88, 760, 580, 970);
  assert.equal(draws.length, 1);
  const [, x, y, width, height] = draws[0];
  assert.equal(x + width / 2, 88 + 580 / 2);
  const ability = labels.find(([text]) => text === 'Ability.');
  const shadow = labels.find(([text]) => text === 'Sombra:');
  assert.ok(y > ability[2]);
  assert.ok(shadow[2] > y + height);
  assert.ok(labels.every(([, , baseline]) => baseline <= 970));
  draws.length = 0;
  await renderer.renderRulesBlock({ ability: 'Ability.', hasShadow: true, shadowText: '  ' }, 88, 760, 580, 970);
  assert.equal(draws.length, 0);
});
