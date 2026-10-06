import test from 'node:test';
import assert from 'node:assert/strict';
import { productEncounterLinks } from '../server/card-utils.js';

test('product filter uses section membership and retains objective and quest links', () => {
  const link = name => `<a href="/LotR/Details/${name}"><span>${name}</span></a>`;
  const html = `${link('hero')}<span>Player Cards</span>${link('objective')}${link('enemy')}<span>Encounter Cards</span>${link('quest-c')}${link('quest-e')}<span>Quest Cards</span>`;
  assert.deepEqual([...productEncounterLinks(html)], ['/LotR/Details/objective', '/LotR/Details/enemy', '/LotR/Details/quest-c', '/LotR/Details/quest-e']);
  assert.equal(productEncounterLinks(`${link('hero')}<span>Player Cards</span>`).size, 0);
});
