import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { productCardQuantities } from '../server/card-utils.js';
import { parseCardDetailHtml } from '../vite.config.js';
import { CardState } from '../src/cardState.js';

test('product quantities use the last count rather than the card title or type', () => {
  const html = `<a href="/LotR/Details/Escort-RoR"><span><span><span>Escort</span><span>(Ally)</span></span><span>3</span></span></a>`;
  assert.equal(productCardQuantities(html).get('/LotR/Details/Escort-RoR'), 3);
});

test('detail quantity survives markup and is used by the deck, with explicit counts supported', () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const html = fs.readFileSync('tests/fixtures/Aragorn-Core.html', 'utf8').replace('#1 (x1)', '#1 (<b>x3</b>)');
  const card = parseCardDetailHtml(html, 'https://hallofbeorn.com/LotR/Details/Aragorn-Core');
  assert.equal(card.quantity, 3);
  const state = new CardState();
  state.addToDeck(card);
  assert.equal(state.deck[0].count, 3);
  state.addToDeck(card, 1);
  assert.equal(state.deck[0].count, 4);
});
