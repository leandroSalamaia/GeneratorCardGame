// Translation Client Module for LotR LCG Card Generator
import { DEFAULT_OPENAI_MODEL } from './translationModels.js';

const STORAGE_KEY_PROVIDER = 'lotr_translation_provider';
const STORAGE_KEY_API_KEY = 'lotr_translation_key';
const STORAGE_KEY_MODEL = 'lotr_translation_model';

export const PROVIDERS = {
  GOOGLE: 'google',
  OPENAI: 'openai'
};

export const DEFAULT_MODELS = {
  google: '',
  openai: DEFAULT_OPENAI_MODEL
};

export function getTranslationSettings() {
  const provider = localStorage.getItem(STORAGE_KEY_PROVIDER) || PROVIDERS.GOOGLE;
  const apiKey = localStorage.getItem(STORAGE_KEY_API_KEY) || '';
  const model = localStorage.getItem(STORAGE_KEY_MODEL) || DEFAULT_MODELS[provider] || '';
  return { provider, apiKey, model };
}

export function saveTranslationSettings({ provider, apiKey, model }) {
  if (provider) localStorage.setItem(STORAGE_KEY_PROVIDER, provider);
  if (apiKey !== undefined) localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim());
  if (model !== undefined) localStorage.setItem(STORAGE_KEY_MODEL, model.trim());
}

export const TRAIT_TRANSLATIONS = {
  'Noble': 'Nobre',
  'Ranger': 'Guardião',
  'Warrior': 'Guerreiro',
  'Scout': 'Batedor',
  'Silvan': 'Silvestre',
  'Gondor': 'Gondor',
  'Rohan': 'Rohan',
  'Dúnedain': 'Dúnedain',
  'Dunedain': 'Dúnedain',
  'Dwarf': 'Anão',
  'Hobbit': 'Hobbit',
  'Istari': 'Istari',
  'Bree': 'Bree',
  'Dale': 'Vale',
  'Beorning': 'Beornin',
  'Woodman': 'Homem dos Bosques',
  'Noldor': 'Noldor',
  'Ent': 'Ent',
  'Eagle': 'Águia',
  'Creature': 'Criatura',
  'Spider': 'Aranha',
  'Orc': 'Orc',
  'Goblin': 'Goblin',
  'Troll': 'Troll',
  'Undead': 'Morto-vivo',
  'Nazgûl': 'Nazgûl',
  'Nazgul': 'Nazgûl',
  'Wose': 'Wose',
  'Giant': 'Gigante',
  'Dragon': 'Dragão',
  'Item': 'Item',
  'Weapon': 'Arma',
  'Armor': 'Armadura',
  'Shield': 'Escudo',
  'Title': 'Título',
  'Condition': 'Condição',
  'Skill': 'Perícia',
  'Song': 'Canção',
  'Spell': 'Feitiço',
  'Tactic': 'Tática',
  'Signal': 'Sinal',
  'Trap': 'Armadilha',
  'Pipe': 'Cachimbo',
  'Record': 'Registro',
  'Ring': 'Anel',
  'Artifact': 'Artefato',
  'Mount': 'Montaria',
  'Pony': 'Pônei',
  'Horse': 'Cavalo',
  'Boar': 'Javali',
  'Boon': 'Dádiva',
  'Burden': 'Fardo',
  'Disaster': 'Desastre',
  'Escape': 'Fuga',
  'Garrison': 'Guarnição',
  'Hazard': 'Perigo',
  'Shadow': 'Sombra',
  'Wilderlands': 'Terras Ermas',
  'Forest': 'Floresta',
  'Mountain': 'Montanha',
  'River': 'Rio',
  'Marsh': 'Pântano',
  'Swamp': 'Pântano',
  'Stronghold': 'Fortaleza',
  'Underground': 'Subterrâneo',
  'Road': 'Estrada',
  'Plains': 'Planícies',
  'Desert': 'Deserto',
  'City': 'Cidade',
  'Ruins': 'Ruínas',
  'Ocean': 'Oceano',
  'Coastland': 'Litoral',
  'Ship': 'Navio',
  'Corsair': 'Corsário',
  'Harad': 'Harad',
  'Mordor': 'Mordor',
  'Dol Guldur': 'Dol Guldur',
  'Mirkwood': 'Floresta das Trevas',
  'Lórien': 'Lórien',
  'Lorien': 'Lórien',
  'Rivendell': 'Valfenda',
  'Isengard': 'Isengard',
  'Moria': 'Moria'
};

export function translateTraitsFallback(traitsStr) {
  if (!traitsStr) return '';
  let res = traitsStr;
  for (const [en, pt] of Object.entries(TRAIT_TRANSLATIONS)) {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    res = res.replace(regex, pt);
  }
  return res;
}

export async function translateCardsBatch(cards, onProgress = null) {
  const expanded = cards.flatMap(c => c.questSides?.a && c.questSides?.b
    ? [c.questSide === 'a' ? { ...c, questSides: undefined } : c.questSides.a,
       c.questSide === 'b' ? { ...c, questSides: undefined } : c.questSides.b]
    : [c]);
  const translated = await translateFlatCardsBatch(expanded, onProgress);
  const byId = new Map(translated.map(c => [c.id, c]));
  return cards.map(c => {
    if (!c.questSides?.a || !c.questSides?.b) return byId.get(c.id || c.name);
    const a = byId.get(c.questSides.a.id), b = byId.get(c.questSides.b.id);
    return { ...(c.questSide === 'b' ? b : a), questSides: { a, b } };
  });
}

async function translateFlatCardsBatch(cards, onProgress = null) {
  const settings = getTranslationSettings();
  if (!settings.apiKey) {
    throw new Error('Chave de API não configurada. Clique em "⚙️ Tradução IA" no topo para inserir sua chave.');
  }

  if (!cards || cards.length === 0) return [];

  const BATCH_SIZE = 12;
  const results = [];
  const total = cards.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = cards.slice(i, i + BATCH_SIZE);
    
    if (onProgress) {
      onProgress({
        current: Math.min(i + 1, total),
        total,
        percentage: Math.round((i / total) * 100)
      });
    }

    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: settings.provider,
        apiKey: settings.apiKey,
        model: settings.model,
        cards: chunk
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Erro ao traduzir cartas');
    }

    if (!Array.isArray(data.cards) || data.cards.length !== chunk.length) throw new Error('Tradução incompleta.');
    const translatedChunk = chunk.map(original => {
      const translated = data.cards.find(c => c.id === (original.id || original.name));
      if (!translated) throw new Error('Carta ausente na tradução: ' + original.name);
      return { ...original, ...translated };
    });
    results.push(...translatedChunk);

    if (onProgress) {
      onProgress({
        current: Math.min(i + chunk.length, total),
        total,
        percentage: Math.round((Math.min(i + chunk.length, total) / total) * 100)
      });
    }
  }

  return results;
}

export async function translateSingleCard(card) {
  const [translated] = await translateCardsBatch([card]);
  return translated;
}
