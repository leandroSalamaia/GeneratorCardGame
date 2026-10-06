export function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function productCardQuantities(html) {
  const result = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']*\/LotR\/Details\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const count = match[2].match(/<span\b[^>]*>\s*(\d+)\s*<\/span>\s*<\/span>\s*$/i);
    if (count && Number(count[1]) > 0) result.set(match[1], Number(count[1]));
  }
  return result;
}

export function productEncounterLinks(html) {
  const selected = new Set();
  let pending = [];
  // Each product section ends with its total (Player/Encounter/Quest Cards).
  // Classify by the section rather than type: an Objective is an encounter.
  const tokens = /<a\b[^>]*href=["']([^"']*\/LotR\/Details\/[^"']+)["'][^>]*>[\s\S]*?<\/a>|>\s*(Player Cards|Encounter Cards|Quest Cards)\s*<\/span>/gi;
  for (const match of html.matchAll(tokens)) {
    if (match[1]) pending.push(match[1]);
    else {
      if (!/^Player Cards$/i.test(match[2])) for (const link of pending) selected.add(link);
      pending = [];
    }
  }
  return selected;
}

export function selectLocalArt(records, name, expansion = '', stage = '', side = '', number = '') {
  const wanted = normalizeName(name), set = normalizeName(expansion);
  if (!wanted) return '';
  let candidates = records.filter(r => r.cleanName.replace(/^\d+[ab]\s*-?\s*/, '') === wanted);
  if (side) {
    const stageSide = new RegExp('(?:^|[- ])(?:' + (stage || '\\d+') + ')' + side + '(?:[- ]|$)', 'i');
    candidates = candidates.filter(r => stageSide.test(r.fileName || '') || stageSide.test(r.cleanName || ''));
  }
  if (set) {
    const matching = candidates.filter(r => r.expansion.includes(set));
    if (matching.length) candidates = matching;
  }
  // The proxy collection contains the same quest scan in both Encounter and
  // Quest folders. Prefer the Quest folder for side-specific lookups so the
  // duplicate names do not make the result ambiguous.
  if (candidates.length > 1) {
    const preferred = candidates.filter(r => side ? /\bquest\b/i.test(r.expansion) : /\bencounter\b/i.test(r.expansion));
    if (preferred.length) candidates = preferred;
  }
  if (number) {
    const numbered = candidates.filter(r => Number(r.fileName.match(/^\d+/)?.[0]) === Number(number));
    if (numbered.length) candidates = numbered;
  }
  if (new Set(candidates.map(r => r.expansion)).size > 1) return '';
  candidates.sort((a, b) => Number(/\(errata\)/i.test(b.fileName)) - Number(/\(errata\)/i.test(a.fileName)) || a.fullPath.localeCompare(b.fullPath));
  return candidates[0]?.fullPath || '';
}

export function divContent(html, className) {
  const match = new RegExp('<div\\b[^>]*class=["\x27][^"\x27]*\\b' + className + '\\b[^"\x27]*["\x27][^>]*>', 'i').exec(html);
  if (!match) return '';
  const start = match.index + match[0].length;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = start;
  let depth = 1, tag;
  while ((tag = tags.exec(html))) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
    if (!depth) return html.slice(start, tag.index);
  }
  return '';
}

export function normalizeIcons(html) {
  return html.replace(/<img\b[^>]*>/gi, tag => {
    const m = tag.match(/(?:icon-|\/Images\/)(Leadership|Tactics|Spirit|Lore|Willpower|Attack|Defense|Threat)(?:["'\s.-])/i);
    return m && !/opacity\s*:|position\s*:\s*absolute/i.test(tag) ? '[' + m[1].toLowerCase() + ']' : tag;
  });
}

export function divContents(html, className) {
  const starts = [...html.matchAll(new RegExp('<div\\b[^>]*class=["\x27][^"\x27]*\\b' + className + '\\b[^"\x27]*["\x27][^>]*>', 'gi'))];
  return starts.map(m => divContent(html.slice(m.index), className));
}

const translationFields = ['name', 'traits', 'ability', 'shadowText', 'quote', 'scenarioName', 'stageTitle', 'victory'];
const iconPattern = /\[(?:leadership|tactics|spirit|lore|attack|defense|willpower|threat)\]/gi;
const iconAliases = {
  leadership: 'leadership', lideranca: 'leadership',
  tactics: 'tactics', tatica: 'tactics', taticas: 'tactics',
  spirit: 'spirit', espirito: 'spirit',
  lore: 'lore', conhecimento: 'lore', saber: 'lore',
  attack: 'attack', ataque: 'attack',
  defense: 'defense', defesa: 'defense',
  willpower: 'willpower', vontade: 'willpower', 'forca de vontade': 'willpower',
  threat: 'threat', ameaca: 'threat'
};

function canonicalizeIcons(text) {
  return text.replace(/\[([^\[\]\r\n]+)\]/g, (match, label) => {
    const icon = iconAliases[normalizeName(label)];
    return icon ? '[' + icon + ']' : match;
  });
}

// Each marker identifies one occurrence in its field. The provider translates
// the surrounding prose; the application restores the original game icon.
export function protectTranslationCards(cards) {
  return cards.map(card => {
    const result = { ...card };
    for (const key of translationFields) {
      let index = 0;
      result[key] = String(card[key] || '').replace(iconPattern, () => '__LOTR_ICON_' + index++ + '__');
    }
    return result;
  });
}

function restoreTranslationIcons(original, translated, cardName, field) {
  const expected = original.match(iconPattern) || [];
  const restored = translated.replace(/__LOTR_ICON_(\d+)__/gi, (marker, index) => {
    if (!expected[Number(index)]) throw Error('Marcador de símbolo desconhecido em ' + cardName + ' (' + field + ').');
    return expected[Number(index)].toLowerCase();
  });
  const canonical = canonicalizeIcons(restored);
  const tokens = text => (text.match(iconPattern) || []).map(x => x.toLowerCase()).sort().join(', ');
  if (/__LOTR_ICON_/i.test(canonical) || tokens(original) !== tokens(canonical)) {
    throw Error('A tradução alterou símbolos da carta ' + cardName + ' (' + field + '). Esperado: ' + (tokens(original) || 'nenhum') + '; recebido: ' + (tokens(canonical) || 'nenhum') + '. Tente traduzir esta carta novamente.');
  }
  return canonical;
}

export function mergeTranslations(originals, response) {
  if (!Array.isArray(response) || response.length !== originals.length) throw Error('Tradução incompleta: quantidade de cartas diferente do pedido.');
  const byId = new Map();
  for (const c of response) {
    if (!c || typeof c.id !== 'string' || byId.has(c.id)) throw Error('Tradução retornou identificadores inválidos ou duplicados.');
    byId.set(c.id, c);
  }
  return originals.map(original => {
    const c = byId.get(original.id || original.name);
    if (!c) throw Error('Tradução não encontrada para ' + original.name);
    const result = { ...original, originalName: original.originalName || original.name, language: 'pt-BR' };
    for (const key of translationFields) {
      if (typeof c[key] !== 'string' || (original[key] && !c[key].trim())) throw Error('Tradução inválida no campo ' + key + ' de ' + original.name);
      result[key] = restoreTranslationIcons(original[key] || '', c[key], original.name, key).trim();
    }
    result.name = result.name.replace(/^[★•]\s*/, '');
    result.heroBannerText = original.type === 'hero' ? 'HERÓI' : original.heroBannerText;
    return result;
  });
}
