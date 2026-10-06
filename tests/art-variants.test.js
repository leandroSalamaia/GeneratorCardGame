import test from 'node:test';
import assert from 'node:assert/strict';
import { selectArtSource } from '../src/artVariants.js';
import { extendImportedCards } from '../src/importArt.js';
import { CardState } from '../src/cardState.js';

test('previously imported cards can switch back and retain independent framing and masks', () => {
  const card = { originalProxyArt: '/original', customArt: '/ai', art: { sourceKind: 'generated', posX: 33 }, artMaskStrokes: [{ x: 2 }] };
  assert.equal(selectArtSource(card, 'original'), true);
  assert.equal(card.customArt, '/original');
  assert.equal(card.art.sourceKind, 'card');
  assert.equal(card.art.posX, 0);
  assert.deepEqual(card.artMaskStrokes, []);
  card.art.posX = 19;
  selectArtSource(card, 'generated');
  assert.equal(card.customArt, '/ai');
  assert.equal(card.art.posX, 33);
  assert.deepEqual(card.artMaskStrokes, [{ x: 2 }]);
  selectArtSource(card, 'original');
  assert.equal(card.art.posX, 19);
  const reloaded = JSON.parse(JSON.stringify(card));
  selectArtSource(reloaded, 'generated');
  assert.equal(reloaded.customArt, '/ai');
  assert.equal(reloaded.art.posX, 33);
});

test('import retains the original framing and unavailable choices do not change the card', async () => {
  const original = { type: 'hero', customArt: '/original', art: { sourceKind: 'card', posX: 7 } };
  assert.equal(selectArtSource(original, 'generated'), false);
  const { cards: [card] } = await extendImportedCards([original], async () => ({ url: '/ai' }));
  selectArtSource(card, 'original');
  assert.equal(card.art.posX, 7);
  assert.equal(card.generatedArt, '/ai');
});

for (const nested of [true, false]) test(`quest artwork selection stays independent across sides (nested=${nested})`, async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const slot = side => ({ type: 'quest', questSide: side, customArt: '/' + side, art: { sourceKind: 'card', posX: 0 } });
  const card = { ...slot('a'), questArtA: slot('a'), questArtB: slot('b') };
  if (nested) card.questSides = { a: slot('a'), b: slot('b') };
  const { cards: [imported] } = await extendImportedCards([card], async ({ image }) => ({ url: '/ai' + image }));
  const state = new CardState();
  state.loadCard(imported);
  state.selectArtSource('original');
  state.updateField('questSide', 'b');
  assert.equal(state.currentCard.customArt, '/ai/b');
  state.selectArtSource('original');
  assert.equal(state.currentCard.customArt, '/b');
  state.updateField('questSide', 'a');
  assert.equal(state.currentCard.customArt, '/a');
  state.selectArtSource('generated');
  assert.equal(state.currentCard.customArt, '/ai/a');
});
