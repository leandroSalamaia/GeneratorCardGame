import test from 'node:test';
import assert from 'node:assert/strict';
import { CardState, DEFAULT_PRESETS } from '../src/cardState.js';
import { LAYOUT_STORAGE_KEY, captureLayout, applyLayout } from '../src/layoutPresets.js';

test('updating quest layout applies size and position to both faces and artwork variants', () => {
  storage();
  const state = new CardState();
  const side = name => ({ type: 'quest', name, customArt: '/' + name,
    art: { sourceKind: 'card', posX: 0, scaleX: 1 },
    artVariants: { original: { art: { sourceKind: 'card', posX: 0, scaleX: 1 } } } });
  state.loadCard({ ...side('front'), questSide: 'a', questSides: { a: side('front'), b: { ...side('back'), questSide: 'b' } } });
  state.updateArt({ posX: 37, posY: -22, scaleX: 1.3, scaleY: 1.7 });
  state.saveCurrentLayout();
  state.updateField('questSide', 'b');
  assert.equal(state.currentCard.customArt, '/back');
  assert.equal(state.currentCard.art.posX, 37);
  assert.equal(state.currentCard.art.posY, -22);
  assert.equal(state.currentCard.art.scaleY, 1.7);
  assert.equal(state.currentCard.artVariants.original.art.scaleX, 1.3);
});

test('saving quest layout preserves active artwork settings and offsets verbatim', () => {
  storage(); const state = new CardState();
  state.loadCard({ type: 'quest', questSide: 'b', name: 'Partial artwork settings',
    customArt: '/back', art: { sourceKind: 'art', posX: 47, posY: -29, sourceRotation: 180 },
    offsets: { questEncounterX: -31, questAdditionalY: 14 },
    questSides: { a: { type: 'quest', questSide: 'a', customArt: '/front', art: { posX: 0 } } } });
  const art = structuredClone(state.currentCard.art), offsets = structuredClone(state.currentCard.offsets);
  const current = state.currentCard;
  state.saveCurrentLayout();
  assert.equal(state.currentCard, current);
  assert.deepEqual(state.currentCard.art, art);
  assert.deepEqual(state.currentCard.offsets, offsets);
  assert.equal(state.currentCard.customArt, '/back');
  assert.deepEqual(state.currentCard.questSides.b.art, art);
  state.updateField('questSide', 'a');
  assert.equal(state.currentCard.art.posX, 47);
  assert.equal(state.currentCard.offsets.questEncounterX, -31);
  state.updateField('questSide', 'b');
  assert.deepEqual(state.currentCard.art, art);
});

function storage() {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  return values;
}

test('saved quest reload retains icon positions and latest artwork on both faces', () => {
  storage();
  const state = new CardState();
  const face = side => ({ id: 'preset-quest', type: 'quest', questSide: side,
    name: 'Quest', customArt: '/' + side, art: { sourceKind: 'card', posX: 0, posY: 0 } });
  state.loadCard({ ...face('a'), questSides: { a: face('a'), b: face('b') } });
  state.updateArt({ posX: 81, posY: -19 });
  state.updateOffset('questEncounterX', -23);
  state.updateOffset('questAdditionalY', 17);
  state.saveCurrentToLibrary();
  const restored = new CardState();
  restored.loadCard(restored.savedCards[0]);
  assert.equal(restored.currentCard.questSides.a.offsets.questEncounterX, -23);
  assert.equal(restored.currentCard.questSides.a.art.posX, 81);
  assert.equal(restored.currentCard.questArtA.art.posY, -19);
  restored.updateField('questSide', 'b');
  restored.updateArt({ posX: -40, posY: 62 });
  restored.updateOffset('questEncounterY', 11);
  restored.saveCurrentToLibrary();
  assert.equal(restored.savedCards.length, 1);
  restored.updateField('questSide', 'a');
  assert.equal(restored.currentCard.art.posX, 81);
  assert.equal(restored.currentCard.offsets.questAdditionalY, 17);
  assert.equal(restored.currentCard.questArtB.art.posY, 62);
  restored.updateField('questSide', 'b');
  assert.equal(restored.currentCard.art.posX, -40);
  assert.equal(restored.currentCard.offsets.questEncounterY, 11);
});

test('updating saved quest layout persists art and icon positions in library and preset', () => {
  storage(); const state = new CardState();
  const face = side => ({ type: 'quest', questSide: side, name: 'Quest', customArt: '/' + side, art: { posX: 0 } });
  state.loadCard({ ...face('a'), questSides: { a: face('a'), b: face('b') } });
  state.saveCurrentToLibrary();
  state.updateArt({ posX: 53, posY: -71, scaleX: 1.4, scaleY: 1.2 });
  state.updateOffset('questEncounterX', -35); state.updateOffset('questAdditionalY', 12);
  state.saveCurrentLayout();
  const restored = new CardState();
  assert.equal(restored.layoutPresets.quest.offsets.questEncounterX, -35);
  restored.loadCard(restored.savedCards[0]);
  for (const side of ['b', 'a']) {
    restored.updateField('questSide', side);
    assert.equal(restored.currentCard.art.posX, 53);
    assert.equal(restored.currentCard.art.posY, -71);
    assert.equal(restored.currentCard.art.scaleY, 1.2);
    assert.equal(restored.currentCard.offsets.questEncounterX, -35);
    assert.equal(restored.currentCard.offsets.questAdditionalY, 12);
    assert.equal(restored.currentCard.customArt, '/' + side);
  }
});

test('layouts persist per type without sharing mutable positions', () => {
  storage();
  const state = new CardState();
  state.updateArt({ posX: 35, posY: -15, scaleX: 1.4, scaleY: 1.1, rotation: 7, lockRatio: false });
  state.updateOffset('heroTypeY', 12); state.updateOffset('attackX', -3);
  state.saveCurrentLayout();
  state.updateArt({ posX: 99 }); state.updateOffset('attackX', 40);
  assert.equal(state.layoutPresets.hero.art.posX, 35);
  state.updateField('type', 'ally'); state.saveCurrentLayout();
  const restored = new CardState();
  assert.equal(restored.layoutPresets.hero.art.posX, 35);
  assert.equal(restored.layoutPresets.hero.offsets.attackX, -3);
  assert.equal(restored.layoutPresets.ally.art.posX, 99);
});

test('applying layout preserves card content, image, source mode and effects', () => {
  const preset = captureLayout({ art: { posX: 50, posY: 30, zoom: 1.2, sourceKind: 'art', brightness: .4 }, offsets: { healthY: 8 } });
  const card = { ...DEFAULT_PRESETS[0], customArt: '/my-image.png', art: { sourceKind: 'card', brightness: 1.5, contrast: .8, posX: 0 }, offsets: { healthY: 1, nameY: 20 }, artMaskStrokes: [{ size: 5, points: [{ x: 1, y: 2 }] }] };
  const changed = applyLayout(card, preset);
  assert.equal(changed.art.posX, 50); assert.equal(changed.art.scaleX, 1.2);
  assert.equal(changed.art.sourceKind, 'card'); assert.equal(changed.art.brightness, 1.5);
  assert.equal(changed.offsets.healthY, 8); assert.equal(changed.offsets.nameY, 0);
  assert.equal(changed.customArt, card.customArt); assert.equal(changed.name, card.name);
  assert.deepEqual(changed.artMaskStrokes, card.artMaskStrokes);
  assert.equal(card.art.posX, 0);
  assert.equal(preset.art.sourceKind, undefined); assert.equal(preset.art.brightness, undefined);
});

test('quest layout follows both sides through side switching', () => {
  storage();
  const state = new CardState();
  const makeSide = side => ({ type: 'quest', name: side, questSide: side, ability: 'rules-' + side, customArt: '/' + side, art: { sourceKind: 'card', posX: 0 }, questArtA: { customArt: '/a', art: { sourceKind: 'card' } }, questArtB: { customArt: '/b', art: { sourceKind: 'card' } } });
  state.loadCard({ ...makeSide('a'), questSides: { a: makeSide('a'), b: makeSide('b') } });
  state.updateArt({ posX: 24 }); state.updateOffset('questPointsY', 6); state.saveCurrentLayout();
  state.updateArt({ posX: 100 }); state.applyCurrentLayout();
  state.updateField('questSide', 'b');
  assert.equal(state.currentCard.art.posX, 24);
  assert.equal(state.currentCard.questArtB.art.posX, 24);
  assert.equal(state.currentCard.offsets.questPointsY, 6);
  assert.equal(state.currentCard.customArt, '/b'); assert.equal(state.currentCard.ability, 'rules-b');
  state.updateField('questSide', 'a'); assert.equal(state.currentCard.art.posX, 24);
});

test('removing saved layout preserves current card and other types', () => {
  storage(); const state = new CardState();
  state.saveCurrentLayout();
  state.updateField('type', 'ally'); state.saveCurrentLayout();
  state.updateField('type', 'hero');
  const before = structuredClone(state.currentCard);
  state.removeCurrentLayout();
  assert.deepEqual(state.currentCard, before);
  assert.equal(new CardState().layoutPresets.hero, undefined);
  assert.ok(new CardState().layoutPresets.ally);
  assert.equal(state.applyCurrentLayout(), false);
});

test('failed writes do not report an in-memory layout as saved', () => {
  storage(); const state = new CardState(); state.saveCurrentLayout();
  const before = structuredClone(state.layoutPresets);
  state.updateArt({ posX: 120 });
  globalThis.localStorage.setItem = () => { throw Error('Quota exceeded'); };
  assert.throws(() => state.saveCurrentLayout(), /Quota/);
  assert.deepEqual(state.layoutPresets, before);
});

test('library layout round trip excludes unexpected fields and supports legacy offsets', () => {
  const values = storage(); const state = new CardState();
  state.saveLayoutPresets({ hero: { art: { posX: '10', scaleX: 'bad', image: 'private image' }, offsets: { threatCostX: 9, traitsY: 11, unknown: 99 }, ability: 'do not copy' }, invalid: {} });
  const backup = JSON.parse(JSON.stringify({ layoutPresets: state.layoutPresets }));
  values.delete(LAYOUT_STORAGE_KEY);
  const restored = new CardState(); restored.saveLayoutPresets(backup.layoutPresets);
  assert.equal(restored.layoutPresets.hero.art.posX, 10);
  assert.equal(restored.layoutPresets.hero.art.scaleX, 1);
  assert.equal(restored.layoutPresets.hero.offsets.costX, 9);
  assert.equal(restored.layoutPresets.hero.offsets.typeY, 11);
  assert.equal(restored.layoutPresets.hero.art.image, undefined);
  assert.equal(restored.layoutPresets.hero.ability, undefined);
});

test('loading an existing library card does not override its individual positions', () => {
  storage(); const state = new CardState(); state.updateArt({ posX: 22 }); state.saveCurrentLayout();
  const existing = { ...DEFAULT_PRESETS[0], art: { posX: 55 }, offsets: { nameY: 8 } };
  state.loadCard(existing);
  assert.equal(state.currentCard.art.posX, 55); assert.equal(state.currentCard.offsets.nameY, 8);
  const newCard = state.withSavedLayout(existing);
  assert.equal(newCard.art.posX, 22); assert.equal(existing.art.posX, 55);
});
