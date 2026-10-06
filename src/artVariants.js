const clone = value => structuredClone(value);

export function artSources(card) {
  return {
    original: card.originalProxyArt || (card.art?.sourceKind === 'card' ? card.customArt : ''),
    generated: card.generatedArt || (card.art?.sourceKind === 'generated' ? card.customArt : ''),
  };
}

export function captureArt(card) {
  return clone({ art: card.art || {}, artSample: card.artSample || '', artMaskStrokes: card.artMaskStrokes || [] });
}

export function selectArtSource(card, selection) {
  const sources = artSources(card);
  if (!sources[selection]) return false;
  card.originalProxyArt = sources.original;
  card.generatedArt = sources.generated;
  card.artVariants ||= {};
  const current = card.art?.sourceKind === 'generated' ? 'generated' : card.art?.sourceKind === 'card' ? 'original' : '';
  if (current && card.customArt === sources[current]) card.artVariants[current] = captureArt(card);
  const saved = card.artVariants[selection];
  Object.assign(card, saved ? clone(saved) : {
    art: { sourceKind: selection === 'original' ? 'card' : 'generated', posX: 0, posY: 0,
      zoom: 1, scaleX: 1, scaleY: 1, rotation: 0, lockRatio: true, brightness: 1, contrast: 1,
      feather: 0, bottomFade: 0, proxyAlignment: true },
    artSample: '', artMaskStrokes: [],
  });
  card.customArt = sources[selection];
  return true;
}
