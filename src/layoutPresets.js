const TYPES = ['hero', 'ally', 'attachment', 'event', 'enemy', 'location', 'treachery', 'objective', 'treasure', 'quest'];
export const LAYOUT_STORAGE_KEY = 'lotr_card_gen_layouts';
const OFFSET_NAMES = ['health', 'cost', 'willpower', 'attack', 'defense', 'questPoints', 'type', 'heroType', 'name', 'flavorText', 'questEncounter', 'questAdditional'];
const number = (value, fallback) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;

export function captureLayout(card) {
  const art = card.art || {}, offsets = card.offsets || {};
  const zoom = number(art.zoom, 1);
  const geometry = {
    posX: number(art.posX, 0), posY: number(art.posY, 0),
    zoom: Math.max(.01, zoom),
    scaleX: Math.max(.01, number(art.scaleX, zoom)),
    scaleY: Math.max(.01, number(art.scaleY, zoom)),
    rotation: number(art.rotation, 0), lockRatio: art.lockRatio !== false,
    proxyAlignment: art.proxyAlignment !== false
  };
  const positions = {};
  for (const name of OFFSET_NAMES) for (const axis of ['X', 'Y']) {
    const legacy = name === 'cost' ? offsets['threatCost' + axis] : name === 'type' ? offsets['traits' + axis] : 0;
    positions[name + axis] = number(offsets[name + axis], number(legacy, 0));
  }
  return { art: geometry, offsets: positions };
}

export function normalizeLayoutPresets(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const type of TYPES) {
    const layout = value[type];
    if (layout && typeof layout === 'object' && layout.art && layout.offsets) result[type] = captureLayout(layout);
  }
  return result;
}

export function applyLayout(card, preset) {
  const result = JSON.parse(JSON.stringify(card));
  if (!preset) return result;
  const layout = captureLayout(preset);
  const apply = target => {
    target.art = { ...target.art, ...layout.art };
    target.offsets = { ...layout.offsets };
    for (const variant of Object.values(target.artVariants || {})) {
      variant.art = { ...variant.art, ...layout.art };
    }
    // Keep side-specific images, masks and sourceKind while updating their geometry.
    for (const slot of ['questArtA', 'questArtB']) {
      if (target[slot]) {
        target[slot].art = { ...target[slot].art, ...layout.art };
        for (const variant of Object.values(target[slot].artVariants || {})) {
          variant.art = { ...variant.art, ...layout.art };
        }
      }
    }
  };
  apply(result);
  if (result.questSides) for (const side of ['a', 'b']) {
    if (result.questSides[side]) apply(result.questSides[side]);
  }
  return result;
}
