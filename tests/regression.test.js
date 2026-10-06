import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCanvas } from 'canvas';
import config, { parseCardDetailHtml } from '../vite.config.js';
import { selectLocalArt, normalizeName, mergeTranslations, normalizeIcons, protectTranslationCards } from '../server/card-utils.js';
import { EventEmitter } from 'node:events';
import { CardRenderer } from '../src/renderer.js';
import { layoutRichText } from '../src/textLayout.js';
import { CardState } from '../src/cardState.js';
import { translateCardsBatch } from '../src/translator.js';

const parse = slug => parseCardDetailHtml(fs.readFileSync(new URL('./fixtures/' + encodeURIComponent(slug) + '.html', import.meta.url), 'utf8'), 'https://hallofbeorn.com/LotR/Details/' + slug);
test('imports actual hero stats, all traits, identity and metadata', () => {
  const c = parse('Aragorn-Core');
  assert.equal(c.traits, 'Dúnedain. Noble. Ranger.');
  assert.deepEqual([c.threatCost, c.willpower, c.attack, c.defense, c.health], ['12', '2', '3', '2', '5']);
  assert.equal(c.cardNumber, '1');
  assert.equal(c.cardSet, 'Core Set');
  assert.equal(c.scenarioName, '');
  assert.equal(c.hasShadow, false);
  assert.equal(c.id, parse('Aragorn-Core').id);
  assert.equal(c.art.sourceKind, 'card');
});
test('preserves separate ability list choices', () => {
  const c = parse('Gandalf-Core');
  assert.equal((c.ability.match(/• /g) || []).length, 3);
  assert.match(c.ability, /draw 3 cards\n/);
});
test('recognizes location metadata and does not use the card set as scenario', () => {
  const c = parse('Old-Forest-Road-Core');
  assert.equal(c.type, 'location');
  assert.equal(c.threat, '1');
  assert.equal(c.questPoints, '3');
  assert.equal(c.scenarioName, 'Passage Through Mirkwood');
  assert.equal(c.encounterSet, 'mirkwood');
});
test('quest points are not confused with stage and both sides retain separate text', () => {
  const c = parse('Flies-and-Spiders-Core');
  assert.equal(c.stage, '1');
  assert.equal(c.questPoints, '8');
  assert.match(c.questSides.a.ability, /Setup/);
  assert.equal(c.questSides.b.ability, '');
  assert.match(c.questSides.b.quote, /cobwebs/);
  assert.equal(c.questSides.b.questSide, 'b');
  assert.notEqual(c.questSides.a.id, c.questSides.b.id);
});
test('invalid pages fail rather than creating invented cards', () => {
  assert.throws(() => parseCardDetailHtml('<h1>Not Found</h1>', 'https://hallofbeorn.com/LotR/Details/nope'));
});
test('missing stats remain blank', () => {
  const c = parse('Caught-in-a-Web-Core');
  for (const key of ['cost', 'health', 'threatCost', 'questPoints']) assert.equal(c[key], '');
});
test('enemy keeps attack symbols and shadow separate from ability', () => {
  const c = parse('Forest-Spider-Core');
  assert.deepEqual([c.engagementThreat, c.threat, c.attack, c.defense, c.health], ['25', '2', '2', '1', '4']);
  assert.match(c.ability, /\[attack\]/);
  assert.match(c.shadowText, /Shadow:/);
  assert.doesNotMatch(c.ability, /Shadow:/);
});
test('treasure keeps zero cost and objective remains an objective', () => {
  const treasure = parse('Glamdring-THOHaUH');
  assert.equal(treasure.type, 'treasure'); assert.equal(treasure.cost, '0');
  const objective = parse('Gandalf%27s-Map-Core');
  assert.equal(objective.type, 'objective'); assert.equal(objective.objectiveStyle, 'item');
  assert.equal(objective.encounterSet, 'dolguldur');
});

const record = (fileName, expansion = '01 core set') => ({ fileName, fullPath: expansion + '/' + fileName, expansion, cleanName: normalizeName(fileName.replace(/^\d+\s*-\s*/, '').replace(/\.jpg$/i, '').replace(/\s*\(errata\)/i, '')) });
test('image matching requires full name, treats apostrophes like filename underscores', () => {
  const records = [record('001 - Aragorn.jpg'), record('002 - Aragorn_s Bow.jpg')];
  assert.equal(selectLocalArt(records, "Aragorn's Bow"), records[1].fullPath);
  assert.equal(selectLocalArt(records, 'Arag'), '');
});
test('image matching disambiguates printings and prefers errata', () => {
  const records = [record('001 - Aragorn.jpg'), record('001 - Aragorn (errata).jpg'), record('001 - Aragorn.jpg', '02 other set')];
  assert.equal(selectLocalArt(records, 'Aragorn'), '');
  assert.equal(selectLocalArt(records, 'Aragorn', 'Core Set'), records[1].fullPath);
});
test('quest image matching never substitutes a different stage or side', () => {
  const records = [record('119 - 1A - Flies and Spiders.jpg'), record('119 - 1B - Flies and Spiders.jpg')];
  assert.equal(selectLocalArt(records, 'Flies and Spiders', 'Core Set', '1', 'b'), records[1].fullPath);
  assert.equal(selectLocalArt(records, 'Flies and Spiders', 'Core Set', '2', 'b'), '');
});
const original = { id: 'one', name: 'A Name - Subtitle', type: 'event', ability: 'Gain [attack].', traits: '', quote: '', shadowText: '', scenarioName: '', stageTitle: '', victory: '', cost: '0' };
test('translation uses IDs, preserves legitimate title punctuation and non-text fields', () => {
  const result = mergeTranslations([original], [{ ...original, name: 'Um Nome - Subtítulo', cost: '99', type: 'enemy', ability: 'Ganhe [attack].' }]);
  assert.equal(result[0].name, 'Um Nome - Subtítulo');
  assert.equal(result[0].cost, '0');
  assert.equal(result[0].type, 'event');
});
test('incomplete, duplicated and symbol-damaging translations fail', () => {
  assert.throws(() => mergeTranslations([original], []));
  assert.throws(() => mergeTranslations([original], [{ ...original, ability: 'Ganhe ataque.' }]));
  assert.throws(() => mergeTranslations([original], [{ ...original, id: 'other' }]));
  assert.throws(() => mergeTranslations([original, { ...original, id: 'two' }], [original, original]));
});
test('Dúnedain Mark restores its protected attack icon after translation', () => {
  const card = { ...original, id: 'mark', name: 'Dúnedain Mark', ability: 'Attached hero gets +1 [attack].' };
  const [protectedCard] = protectTranslationCards([card]);
  assert.equal(protectedCard.ability, 'Attached hero gets +1 __LOTR_ICON_0__.');
  assert.equal(card.ability, 'Attached hero gets +1 [attack].');
  const [result] = mergeTranslations([card], [{ ...protectedCard, ability: 'O herói vinculado recebe +1 __LOTR_ICON_0__.' }]);
  assert.equal(result.ability, 'O herói vinculado recebe +1 [attack].');
});
test('explicit Portuguese icon labels and whitespace are normalized safely', () => {
  const card = { ...original, ability: '+1 [attack], +1 [defense], +1 [willpower], [leadership].' };
  const [result] = mergeTranslations([card], [{ ...card, ability: '+1 [ Ataque ], +1 [DEFESA], +1 [força de vontade], [liderança].' }]);
  assert.equal(result.ability, '+1 [attack], +1 [defense], +1 [willpower], [leadership].');
});
test('repeated icons and separate fields restore their own occurrences', () => {
  const card = { ...original, ability: '[attack] [attack] [defense]', shadowText: '[threat]' };
  const [protectedCard] = protectTranslationCards([card]);
  assert.equal(protectedCard.ability, '__LOTR_ICON_0__ __LOTR_ICON_1__ __LOTR_ICON_2__');
  assert.equal(protectedCard.shadowText, '__LOTR_ICON_0__');
  const [result] = mergeTranslations([card], [protectedCard]);
  assert.equal(result.ability, card.ability);
  assert.equal(result.shadowText, card.shadowText);
});
test('missing, wrong, duplicated and unknown icons still fail with field diagnostics', () => {
  for (const ability of ['Ganhe ataque.', 'Ganhe [defesa].', '[ataque] [ataque]', '__LOTR_ICON_7__', '__LOTR_ICON_bad__']) {
    assert.throws(() => mergeTranslations([original], [{ ...original, ability }]), /ability/);
  }
});
test('translation endpoint protects provider payloads and restores icons for both providers', async () => {
  let middleware;
  config.plugins[0].configureServer({ middlewares: { use: fn => { middleware = fn; } } });
  const previousFetch = globalThis.fetch;
  const previousModel = globalThis.__cachedGeminiModel;
  const card = { ...original, id: 'mark', name: 'Dúnedain Mark', ability: 'Attached hero gets +1 [attack].' };
  try {
    for (const [provider, model] of [['openai','mock-model'], ['openai','gpt-6-luna'], ['openai','gpt-6.1-sol'], ['openai','gpt-6-astra'], ['google','mock-model']]) {
      globalThis.__cachedGeminiModel = 'mock-model';
      let called = false;
      globalThis.fetch = async (url, options) => {
        called = true;
        const payload = JSON.parse(options.body);
        if (provider === 'openai') {
          assert.equal(payload.model, model);
          if (model.startsWith('gpt-6')) {
            assert.equal(payload.reasoning_effort, 'low');
            assert.ok(!('temperature' in payload));
          } else assert.equal(payload.temperature, 0.3);
        }
        const prompt = provider === 'openai' ? payload.messages[1].content : payload.contents[0].parts[0].text;
        assert.ok(prompt.includes('Attached hero gets +1 __LOTR_ICON_0__.'));
        assert.ok(!prompt.includes('Attached hero gets +1 [attack].'));
        const text = JSON.stringify({ cards: [{ ...card, ability: 'O herói vinculado recebe +1 __LOTR_ICON_0__.' }] });
        return { ok: true, json: async () => provider === 'openai' ? { choices: [{ message: { content: text } }] } : { candidates: [{ content: { parts: [{ text }] } }] } };
      };
      const response = await new Promise((resolve, reject) => {
        const req = new EventEmitter(); req.url = '/api/translate'; req.method = 'POST';
        const res = { setHeader() {}, end: body => resolve(JSON.parse(body)) };
        Promise.resolve(middleware(req, res, () => reject(Error('Route not handled')))).catch(reject);
        req.emit('data', JSON.stringify({ provider, apiKey: 'mock-key', model, cards: [card] }));
        req.emit('end');
      });
      assert.equal(called, true);
      assert.equal(response.success, true, JSON.stringify(response));
      assert.equal(response.cards[0].ability, 'O herói vinculado recebe +1 [attack].');
    }
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.__cachedGeminiModel = previousModel;
  }
});
test('modern Hall of Beorn icons become tokens, decorative watermarks do not', () => {
  assert.equal(normalizeIcons('<img src="/Images/attack-med.png" loading="lazy">'), '[attack]');
  assert.match(normalizeIcons('<img src="/Images/Leadership.png" style="opacity:.08">'), /^<img/);
});
test('long text and unbroken words fit within measured line width', () => {
  const renderer = new CardRenderer(createCanvas(756, 1063));
  const rows = layoutRichText(renderer.ctx, '<b>Ação:</b> ' + 'palavra '.repeat(120) + 'x'.repeat(180), 200, 22, s => renderer.tokenizeText(s));
  assert.ok(rows.length > 10);
  for (const row of rows) assert.ok(row.reduce((n, t) => n + t.width, 0) <= 200.01);
});
test('canvas rendering is serialized and card inputs are snapshots', async () => {
  const renderer = new CardRenderer(createCanvas(756, 1063));
  const events = [];
  renderer.renderFrame = async card => { events.push('start:' + card.name); await new Promise(r => setTimeout(r, 5)); events.push('end:' + card.name); };
  const c = { name: 'first' };
  const first = renderer.render(c); c.name = 'mutated';
  await Promise.all([first, renderer.render({ name: 'second' })]);
  assert.deepEqual(events, ['start:first', 'end:first', 'start:second', 'end:second']);
});
test('deck keeps sides and editions separate and does not share mutable card data', () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const state = new CardState();
  const c = parse('Flies-and-Spiders-Core');
  state.addToDeck(c.questSides.a);
  state.addToDeck(c.questSides.b);
  c.questSides.a.name = 'changed';
  assert.equal(state.deck.length, 2);
  assert.notEqual(state.deck[0].card.name, 'changed');
  state.updateDeckCount(state.deck[0].id, '2');
  assert.equal(state.getTotalDeckCount(), 3);
});
test('changing quest side preserves edited rules and images', () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const state = new CardState(); state.loadCard(parse('Flies-and-Spiders-Core'));
  state.updateField('ability', 'Texto A editado'); state.updateField('questSide', 'b');
  assert.equal(state.currentCard.ability, '');
  state.updateField('questSide', 'a');
  assert.equal(state.currentCard.ability, 'Texto A editado');
});
test('translation client translates both quest sides and restores their association', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: key => key === 'lotr_translation_key' ? 'mock-key' : null };
  globalThis.fetch = async (url, options) => {
    const { cards } = JSON.parse(options.body);
    assert.equal(cards.length, 2);
    assert.equal(cards[0].ability, 'Edição atual do lado A');
    return { ok: true, json: async () => ({ success: true, cards: cards.map(c => ({ ...c, name: 'Moscas e Aranhas', quote: 'Texto do lado ' + c.questSide })) }) };
  };
  try {
    const card = parse('Flies-and-Spiders-Core');
    card.ability = 'Edição atual do lado A';
    const [result] = await translateCardsBatch([card]);
    assert.equal(result.questSides.a.quote, 'Texto do lado a');
    assert.equal(result.questSides.b.quote, 'Texto do lado b');
    assert.equal(result.name, 'Moscas e Aranhas');
  } finally { globalThis.fetch = previousFetch; }
});
