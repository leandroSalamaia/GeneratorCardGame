import test from 'node:test';
import assert from 'node:assert/strict';
import { extendImportedCards } from '../src/importArt.js';
import { validateArtSource, artCacheKey } from '../server/local-art-ai.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CardState } from '../src/cardState.js';

test('reset keeps generated art anchored at the top of its artwork window', () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const state = new CardState();
  state.currentCard.art = { sourceKind: 'generated', posY: 88, scaleX: 2 };
  state.resetArt();
  assert.equal(state.currentCard.art.sourceKind, 'generated');
  assert.equal(state.currentCard.art.posY, 0);
  assert.equal(state.currentCard.art.scaleX, 1);
});

test('AI import retains originals, deduplicates images and preserves card text', async () => {
  const card = { name: 'Hero', ability: 'rules', type: 'hero', customArt: '/original', art: { sourceKind: 'card' } };
  let calls = 0;
  const result = await extendImportedCards([card, card], async () => { calls++; return { url: '/generated' }; });
  assert.equal(calls, 1);
  assert.equal(result.cards[0].originalProxyArt, '/original');
  assert.equal(result.cards[0].art.sourceKind, 'generated');
  assert.equal(result.cards[0].ability, 'rules');
  assert.equal(card.customArt, '/original');
});

test('AI failures preserve the original card with a visible warning', async () => {
  const card = { name: 'Hero', type: 'hero', customArt: '/original', art: { sourceKind: 'card' } };
  const result = await extendImportedCards([card], async () => { throw Error('GPU unavailable'); });
  assert.deepEqual(result.cards[0], card);
  assert.match(result.warnings[0], /GPU unavailable/);
});

test('quest sides retain distinct generated art and rules through nested slots', async () => {
  const slot = side => ({ customArt: '/' + side, art: { sourceKind: 'card' } });
  const card = { type: 'quest', name: 'Quest', questSide: 'a', questArtA: slot('a'), questArtB: slot('b'), questSides: {
    a: { ...slot('a'), ability: 'setup' }, b: { ...slot('b'), ability: 'resolution' },
  } };
  const { cards: [result] } = await extendImportedCards([card], async ({ image }) => ({ url: '/generated' + image }));
  assert.equal(result.customArt, '/generated/a');
  assert.equal(result.questSides.b.customArt, '/generated/b');
  assert.equal(result.questSides.a.questArtB.customArt, '/generated/b');
  assert.equal(result.questSides.b.ability, 'resolution');
});

test('AI source validation blocks outside paths and cache keys separate card types', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lotr-ai-'));
  try {
    fs.writeFileSync(path.join(dir, 'card.png'), 'test');
    const url = '/api/local-image?path=' + encodeURIComponent(path.join(dir, 'card.png'));
    assert.equal(validateArtSource(url, dir), fs.realpathSync(path.join(dir, 'card.png')));
    assert.throws(() => validateArtSource('https://example.com/image.png', dir));
    assert.throws(() => validateArtSource('/api/local-image?path=' + encodeURIComponent(import.meta.filename), dir));
    assert.notEqual(artCacheKey(path.join(dir, 'card.png'), 'hero'), artCacheKey(path.join(dir, 'card.png'), 'ally'));
  } finally { fs.rmSync(dir, { recursive: true }); }
});
