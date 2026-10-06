import { captureArt } from './artVariants.js';

export async function extendImportedCards(cards, request, progress = () => {}) {
  const warnings = [], memo = new Map();
  let count = 0;
  const extend = async card => {
    if (!card.customArt || card.art?.sourceKind !== 'card') return card;
    const original = card.customArt;
    const key = card.type + '|' + original;
    if (!memo.has(key)) {
      progress(++count, card.name || card.originalName || 'Carta');
      memo.set(key, request({ image: original, type: card.type }));
    }
    try {
      const result = await memo.get(key);
      return { ...card, originalProxyArt: original, generatedArt: result.url,
        artVariants: { original: captureArt(card) }, customArt: result.url, artSample: '', artMaskStrokes: [],
        art: { ...card.art, sourceKind: 'generated', posX: 0, posY: 0, scaleX: 1, scaleY: 1, zoom: 1, rotation: 0, lockRatio: true } };
    } catch (error) { warnings.push(`${card.name}: ${error.message}`); return card; }
  };
  const result = [];
  for (const input of cards) {
    let card = structuredClone(input);
    if (card.type === 'quest') {
      const slots = {};
      for (const side of ['a','b']) {
        const slot = card['questArt' + side.toUpperCase()] || card.questSides?.[side];
        if (slot?.customArt) slots[side] = await extend({ ...slot, type: 'quest', name: `${card.name} (${side.toUpperCase()})` });
      }
      for (const side of ['a','b']) {
        if (!slots[side]) continue;
        const { customArt, art, originalProxyArt, generatedArt, artVariants, artSample, artMaskStrokes } = slots[side];
        const artSlot = { customArt, art, originalProxyArt, generatedArt, artVariants, artSample, artMaskStrokes };
        card['questArt' + side.toUpperCase()] = artSlot;
        if (card.questSides?.[side]) card.questSides[side] = { ...card.questSides[side], ...artSlot };
      }
      if (card.questSides) for (const side of ['a','b']) if (card.questSides[side]) {
        card.questSides[side].questArtA = structuredClone(card.questArtA);
        card.questSides[side].questArtB = structuredClone(card.questArtB);
      }
      const selected = card['questArt' + (card.questSide || 'a').toUpperCase()];
      if (selected) Object.assign(card, selected);
    } else card = await extend(card);
    result.push(card);
  }
  return { cards: result, warnings };
}
