import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLocalArt } from '../server/card-utils.js';

const root = 'D:/LOTR EXPANSIONS/Enhanced Proxies/21 - Standalone Scenarios/06 - The Ruins of Belegost';
const records = [
  { fullPath: `${root}/Quest/001 - 1A - Ruins of the First Age.jpg`, fileName: '001 - 1A - Ruins of the First Age.jpg', cleanName: '1a ruins of the first age', expansion: '21 standalone scenarios 06 the ruins of belegost quest' },
  { fullPath: `${root}/Quest/001 - 1B - Ruins of the First Age.jpg`, fileName: '001 - 1B - Ruins of the First Age.jpg', cleanName: '1b ruins of the first age', expansion: '21 standalone scenarios 06 the ruins of belegost quest' },
  { fullPath: `${root}/Encounter/014 - Blue Mountain Gem.jpg`, fileName: '014 - Blue Mountain Gem.jpg', cleanName: 'blue mountain gem', expansion: '21 standalone scenarios 06 the ruins of belegost encounter' },
];

test('local art lookup understands quest stage prefixes and keeps sides separate', () => {
  assert.match(selectLocalArt(records, 'Ruins of the First Age', 'The Ruins of Belegost', '1', 'a'), /001 - 1A/);
  assert.match(selectLocalArt(records, 'Ruins of the First Age', 'The Ruins of Belegost', '1', 'b'), /001 - 1B/);
});

test('local art lookup still handles objective names without a stage prefix', () => {
  assert.match(selectLocalArt(records, 'Blue Mountain Gem', 'The Ruins of Belegost'), /Blue Mountain Gem/);
});
