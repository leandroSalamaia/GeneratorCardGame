// Card State Management for LotR LCG Card Generator (All 9 Card Types)
import { LAYOUT_STORAGE_KEY, captureLayout, normalizeLayoutPresets, applyLayout } from './layoutPresets.js';
import { selectArtSource, captureArt } from './artVariants.js';
import { openLibraryStorage, readLibrary, writeLibrary } from './libraryStorage.js';

export const CARD_TYPES = {
  HERO: 'hero',
  ALLY: 'ally',
  ATTACHMENT: 'attachment',
  EVENT: 'event',
  ENEMY: 'enemy',
  LOCATION: 'location',
  TREACHERY: 'treachery',
  OBJECTIVE: 'objective',
  TREASURE: 'treasure',
  QUEST: 'quest'
};

export const CARD_TYPE_NAMES = {
  hero: 'Herói',
  ally: 'Aliado',
  attachment: 'Acessório',
  event: 'Evento',
  enemy: 'Inimigo',
  location: 'Local',
  treachery: 'Traição',
  objective: 'Objetivo',
  treasure: 'Tesouro',
  quest: 'Missão',
  Hero: 'Herói',
  Ally: 'Aliado',
  Attachment: 'Acessório',
  Event: 'Evento',
  Enemy: 'Inimigo',
  Location: 'Local',
  Treachery: 'Traição',
  Objective: 'Objetivo',
  Treasure: 'Tesouro',
  Quest: 'Missão'
};

export function getCardTypeName(type) {
  if (!type) return '';
  const key = String(type).toLowerCase().trim();
  return CARD_TYPE_NAMES[key] || type;
}

export const SPHERES = {
  LEADERSHIP: 'leadership',
  TACTICS: 'tactics',
  SPIRIT: 'spirit',
  LORE: 'lore',
  NEUTRAL: 'neutral'
};

export const SPHERE_NAMES = {
  leadership: 'Liderança',
  tactics: 'Táticas',
  spirit: 'Espírito',
  lore: 'Conhecimento',
  neutral: 'Neutro',
  Leadership: 'Liderança',
  Tactics: 'Táticas',
  Spirit: 'Espírito',
  Lore: 'Conhecimento',
  Neutral: 'Neutro'
};

export function getSphereName(sphere) {
  if (!sphere) return 'Neutro';
  const key = String(sphere).toLowerCase().trim();
  return SPHERE_NAMES[key] || sphere;
}

export const DEFAULT_ART_CONFIG = {
  zoom: 1.0,
  scaleX: 1.0,
  scaleY: 1.0,
  lockRatio: true,
  posX: 0,
  posY: 0,
  rotation: 0,
  brightness: 1.0,
  contrast: 1.0,
  feather: 0,
  bottomFade: 0
};

export const DEFAULT_QUEST_ART_CONFIG = {
  zoom: 1.13,
  scaleX: 1.13,
  scaleY: 1.16,
  lockRatio: false,
  posX: 3,
  posY: 12,
  rotation: 0,
  brightness: 1.0,
  contrast: 0.9,
  feather: 40,
  bottomFade: 0
};

export const DEFAULT_PRESETS = [
  {
    id: 'preset-aragorn',
    name: 'Aragorn',
    type: CARD_TYPES.HERO,
    sphere: SPHERES.LEADERSHIP,
    threatCost: '12',
    willpower: '2',
    attack: '3',
    defense: '2',
    health: '5',
    isUnique: true,
    traits: 'Dúnedain. Noble. Ranger.',
    ability: '<b>Sentinel.</b>\n<b>Response:</b> After Aragorn commits to a quest, spend 1 resource from his resource pool to ready him.',
    quote: '“I am Aragorn son of Arathorn; and if by life or death I can save you, I will.”\n–The Fellowship of the Ring',
    illustrator: 'Illus. Jeff Himmelman',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_hero.png',
    art: {
      zoom: 1.29,
      scaleX: 1.29,
      scaleY: 1.29,
      lockRatio: false,
      posX: -54,
      posY: 247,
      rotation: 0,
      brightness: 1.0,
      contrast: 1.0,
      feather: 0,
      bottomFade: 0
    },
    artMaskStrokes: []
  },
  {
    id: 'preset-gandalf',
    name: 'Gandalf',
    type: CARD_TYPES.ALLY,
    sphere: SPHERES.NEUTRAL,
    cost: '5',
    willpower: '4',
    attack: '4',
    defense: '4',
    health: '4',
    isUnique: false,
    traits: 'Istari.',
    ability: 'At the end of the round, discard Gandalf from play.\n<b>Response:</b> After Gandalf enters play, choose 1: draw 3 cards, or deal 4 damage to 1 enemy in play, or reduce your threat by 5.',
    quote: '“I am a servant of the Secret Fire, wielder of the flame of Anor.”\n–The Fellowship of the Ring',
    illustrator: 'Illus. Lucas Graciano',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_ally.png',
    art: { ...DEFAULT_ART_CONFIG },
    artMaskStrokes: []
  },
  {
    id: 'preset-steward-of-gondor',
    name: 'Steward of Gondor',
    type: CARD_TYPES.ATTACHMENT,
    sphere: SPHERES.LEADERSHIP,
    cost: '2',
    isUnique: true,
    traits: 'Gondor. Title.',
    ability: 'Attach to a hero.\nAttached hero gains the [leadership] resource icon.\n<b>Action:</b> Exhaust Steward of Gondor to add 2 resources to attached hero\'s resource pool.',
    quote: '“...we will fight till the end.”',
    illustrator: 'Illus. Magali Villeneuve',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_attachment.png',
    art: { ...DEFAULT_ART_CONFIG },
    artMaskStrokes: []
  },
  {
    id: 'preset-sneak-attack',
    name: 'Sneak Attack',
    type: CARD_TYPES.EVENT,
    sphere: SPHERES.LEADERSHIP,
    cost: '1',
    isUnique: false,
    traits: 'Tactic.',
    ability: '<b>Action:</b> Put 1 ally card into play from your hand. At the end of the round, if that ally is still in play, return it to your hand.',
    quote: '“...came upon them like a sudden storm.”',
    illustrator: 'Illus. David A. Nash',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_event.png',
    art: { ...DEFAULT_ART_CONFIG },
    artMaskStrokes: []
  },
  {
    id: 'preset-hill-troll',
    name: 'Hill Troll',
    type: CARD_TYPES.ENEMY,
    engagementThreat: '30',
    threat: '1',
    attack: '6',
    defense: '3',
    health: '9',
    victory: 'Victory 4.',
    traits: 'Troll.',
    ability: 'Excess combat damage dealt by Hill Troll (damage that is dealt beyond the remaining hit points of the character defending its attack) must be assigned as an increase to your threat level.',
    hasShadow: false,
    shadowText: '',
    encounterSet: 'mirkwood',
    cardNumber: '53/72',
    illustrator: 'Illus. Lucas Graciano',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_enemy.png',
    art: { ...DEFAULT_ART_CONFIG },
    artMaskStrokes: []
  },
  {
    id: 'preset-the-old-forest',
    name: 'The Old Forest',
    type: CARD_TYPES.LOCATION,
    threat: '3',
    questPoints: '4',
    victory: '',
    traits: 'Forest.',
    ability: '<b>Travel:</b> Each player must exhaust 1 character to travel here.\n<b>Forced:</b> After players travel to The Old Forest, raise each player\'s threat by 1.',
    hasShadow: true,
    shadowText: 'Shadow: Defending character gets -1 [defense] for this attack.',
    encounterSet: 'mirkwood',
    cardNumber: '1/15',
    illustrator: 'Illus. Ben Zweifel',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_location.png',
    art: { ...DEFAULT_ART_CONFIG },
    artMaskStrokes: []
  },
  {
    id: 'preset-caught-in-a-web',
    name: 'Caught in a Web',
    type: CARD_TYPES.TREACHERY,
    traits: '',
    ability: '<b>When Revealed:</b> The player with the highest threat level attaches this card to one of his heroes with no attached Caught in a Web.\n(Counts as a Condition attachment with the text: “Attached hero does not ready during the refresh phase unless you pay 2 resources.”)',
    hasShadow: true,
    shadowText: 'Shadow: Defending player exhausts a character he controls.',
    encounterSet: 'spiders',
    cardNumber: '5/15',
    illustrator: 'Illus. Tomasz Jedruszek',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_treachery.png',
    art: { ...DEFAULT_ART_CONFIG },
    artMaskStrokes: []
  },
  {
    id: 'preset-treasure-ring',
    name: 'The One Ring',
    type: CARD_TYPES.TREASURE,
    cost: '0',
    isUnique: true,
    traits: 'Artifact. Ring.',
    ability: 'Attach to the Ring-bearer.\nAttached hero gains +1 [willpower], +1 [attack], +1 [defense], and +1 hit point.',
    quote: '“One Ring to rule them all, One Ring to find them, One Ring to bring them all and in the darkness bind them.”',
    illustrator: 'Illus. Mike Nash',
    copyright: '©2012 Middle-earth Enterprises ©2012 FFG',
    artSample: '/assets/sample_art/sample_treasure.png',
    encounterSet: 'dungeons_deep_and_caverns_dim',
    cardNumber: '1/4',
    art: { ...DEFAULT_ART_CONFIG },
    artMaskStrokes: []
  },
  {
    id: 'preset-flies-and-spiders-1a',
    name: 'Flies and Spiders',
    stageTitle: 'Flies and Spiders',
    stage: '1',
    questSide: 'a',
    scenarioName: 'Passage Through Mirkwood',
    type: CARD_TYPES.QUEST,
    ability: '<b>Setup:</b> Search the encounter deck for 1 copy of the Forest Spider and 1 copy of the Old Forest Road, and add them to the staging area. Then, shuffle the encounter deck.',
    quote: 'You are traveling through Mirkwood forest, carrying an urgent message from King Thanduil to the Lady Galadriel of Lorien. As you move along the dark trail, the spiders gather around you...',
    encounterSet: 'passage_through_mirkwood',
    cardNumber: '119/120',
    illustrator: 'Illus. Ben Zweifel',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_quest_1a.jpg',
    art: { ...DEFAULT_QUEST_ART_CONFIG },
    questArtA: {
      customArt: '',
      artSample: '/assets/sample_art/sample_quest_1a.jpg',
      art: { ...DEFAULT_QUEST_ART_CONFIG },
      artMaskStrokes: []
    },
    questArtB: {
      customArt: '',
      artSample: '/assets/sample_art/sample_quest_1b.jpg',
      art: { ...DEFAULT_QUEST_ART_CONFIG },
      artMaskStrokes: []
    },
    artMaskStrokes: []
  },
  {
    id: 'preset-flies-and-spiders-1b',
    name: 'Flies and Spiders',
    stageTitle: 'Flies and Spiders',
    stage: '1',
    questSide: 'b',
    scenarioName: 'Passage Through Mirkwood',
    type: CARD_TYPES.QUEST,
    questPoints: '8',
    ability: '',
    quote: 'The nastiest things they saw were the cobwebs; dark dense cobwebs, with threads extraordinarily thick, often stretched from tree to tree, or tangled in the lower branches on either side of them.\n- The Hobbit',
    encounterSet: 'passage_through_mirkwood',
    cardNumber: '119/120',
    illustrator: 'Illus. Ben Zweifel',
    copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
    artSample: '/assets/sample_art/sample_quest_1b.jpg',
    art: { ...DEFAULT_QUEST_ART_CONFIG },
    questArtA: {
      customArt: '',
      artSample: '/assets/sample_art/sample_quest_1a.jpg',
      art: { ...DEFAULT_QUEST_ART_CONFIG },
      artMaskStrokes: []
    },
    questArtB: {
      customArt: '',
      artSample: '/assets/sample_art/sample_quest_1b.jpg',
      art: { ...DEFAULT_QUEST_ART_CONFIG },
      artMaskStrokes: []
    },
    artMaskStrokes: []
  }
];

export class CardState {
  constructor() {
    this.currentCard = JSON.parse(JSON.stringify(DEFAULT_PRESETS[0]));
    this.deck = [];
    this.savedCards = [];
    this.layoutPresets = {};
    this.listeners = [];
    
    this.loadFromStorage();
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || '{}');
      this.layoutPresets = normalizeLayoutPresets(saved.byType);
    } catch (error) { console.warn('Não foi possível carregar os layouts:', error); }
  }

  saveLayoutPresets(presets) {
    const clean = normalizeLayoutPresets(presets);
    // Commit only after storage succeeds, so the UI cannot report a false save.
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ version: 1, byType: clean }));
    this.layoutPresets = clean;
  }

  saveCurrentLayout() {
    this.saveLayoutPresets({ ...this.layoutPresets, [this.currentCard.type]: captureLayout(this.currentCard) });
    if (this.currentCard.type === CARD_TYPES.QUEST) {
      const current = this.currentCard;
      const adjusted = this.withSavedLayout(current);
      // Saving must never reframe the visible face. Only update the other
      // face and its slots; preserve every active artwork setting verbatim.
      current.questSides = adjusted.questSides;
      const otherSlot = current.questSide === 'b' ? 'questArtA' : 'questArtB';
      if (adjusted[otherSlot]) current[otherSlot] = adjusted[otherSlot];
    }
    this.syncCurrentFace();
    const index = this.savedCards.findIndex(card => card.id === this.currentCard.id);
    if (index >= 0) this.savedCards[index] = structuredClone(this.currentCard);
    this.notify('layout');
  }

  removeCurrentLayout() {
    const presets = { ...this.layoutPresets };
    delete presets[this.currentCard.type];
    this.saveLayoutPresets(presets);
  }

  withSavedLayout(card) {
    return applyLayout(card, this.layoutPresets[card.type]);
  }

  applyCurrentLayout() {
    if (!this.layoutPresets[this.currentCard.type]) return false;
    this.currentCard = this.withSavedLayout(this.currentCard);
    this.notify('layout');
    return true;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  syncCurrentFace() {
    const card = this.currentCard;
    const variant = card.art?.sourceKind === 'generated' ? 'generated' : card.art?.sourceKind === 'card' ? 'original' : '';
    if (variant && card.customArt) {
      card.artVariants ||= {};
      card.artVariants[variant] = captureArt(card);
    }
    if (card.type !== CARD_TYPES.QUEST) return;
    const side = (card.questSide || 'a').toLowerCase();
    const slot = 'questArt' + side.toUpperCase();
    card[slot] = { ...card[slot], customArt: card.customArt || '', artSample: card.artSample,
      art: { ...card.art }, artMaskStrokes: card.artMaskStrokes,
      originalProxyArt: card.originalProxyArt, generatedArt: card.generatedArt, artVariants: card.artVariants };
    if (card.questSides) {
      const { questSides, ...face } = card;
      questSides[side] = { ...face, art: { ...card.art }, offsets: { ...card.offsets } };
      // Both faces carry the same latest artwork slots, without replacing
      // either face's image, text or individual attribute positions.
      for (const target of Object.values(questSides)) {
        target.questArtA = card.questArtA;
        target.questArtB = card.questArtB;
      }
    }
  }

  notify(changeType = 'update') {
    this.syncCurrentFace();
    for (const listener of this.listeners) {
      listener(this.currentCard, changeType);
    }
    this.saveToStorage();
  }

  selectArtSource(selection) {
    if (!selectArtSource(this.currentCard, selection)) return false;
    if (this.currentCard.type === CARD_TYPES.QUEST) {
      const card = this.currentCard;
      const slot = 'questArt' + (card.questSide || 'a').toUpperCase();
      card[slot] = structuredClone({ customArt: card.customArt, art: card.art,
        originalProxyArt: card.originalProxyArt, generatedArt: card.generatedArt,
        artVariants: card.artVariants, artSample: card.artSample, artMaskStrokes: card.artMaskStrokes });
    }
    this.notify('art');
    return true;
  }

  updateField(key, value) {
    if (key === 'questSide' && this.currentCard.type === CARD_TYPES.QUEST) {
      const prevSide = (this.currentCard.questSide || 'a').toLowerCase();
      const newSide = (value || 'a').toLowerCase();
      if (prevSide !== newSide) {
        if (this.currentCard.questSides) {
          const { questSides, ...currentSide } = this.currentCard;
          questSides[prevSide] = JSON.parse(JSON.stringify(currentSide));
          if (questSides[newSide]) {
            this.currentCard = { ...JSON.parse(JSON.stringify(questSides[newSide])), questSides };
            this.notify('questSide');
            return;
          }
        }
        // 1. Save current side's art state
        const saveSlot = prevSide === 'a' ? 'questArtA' : 'questArtB';
        this.currentCard[saveSlot] = {
          originalProxyArt: this.currentCard.originalProxyArt,
          generatedArt: this.currentCard.generatedArt,
          artVariants: structuredClone(this.currentCard.artVariants || {}),
          customArt: this.currentCard.customArt || '',
          artSample: this.currentCard.artSample || (prevSide === 'a' ? '/assets/sample_art/sample_quest_1a.jpg' : '/assets/sample_art/sample_quest_1b.jpg'),
          art: { ...(this.currentCard.art || DEFAULT_QUEST_ART_CONFIG) },
          artMaskStrokes: [...(this.currentCard.artMaskStrokes || [])]
        };

        this.currentCard.questLetters ||= {};
        this.currentCard.questLetters[prevSide] = this.currentCard.questLetter || prevSide.toUpperCase();
        this.currentCard.questLetter = this.currentCard.questLetters[newSide] || newSide.toUpperCase();
        this.currentCard.questSide = newSide;

        // 2. Load destination side's art state
        const loadSlot = newSide === 'a' ? 'questArtA' : 'questArtB';
        const targetArt = this.currentCard[loadSlot];
        this.currentCard.originalProxyArt = targetArt?.originalProxyArt || '';
        this.currentCard.generatedArt = targetArt?.generatedArt || '';
        this.currentCard.artVariants = structuredClone(targetArt?.artVariants || {});
        if (targetArt) {
          this.currentCard.customArt = targetArt.customArt || '';
          this.currentCard.artSample = targetArt.artSample || (newSide === 'a' ? '/assets/sample_art/sample_quest_1a.jpg' : '/assets/sample_art/sample_quest_1b.jpg');
          this.currentCard.art = { ...(targetArt.art || DEFAULT_QUEST_ART_CONFIG) };
          this.currentCard.artMaskStrokes = [...(targetArt.artMaskStrokes || [])];
        } else {
          this.currentCard.customArt = '';
          this.currentCard.artSample = newSide === 'a' ? '/assets/sample_art/sample_quest_1a.jpg' : '/assets/sample_art/sample_quest_1b.jpg';
          this.currentCard.art = { ...DEFAULT_QUEST_ART_CONFIG };
          this.currentCard.artMaskStrokes = [];
        }
        this.notify('questSide');
        return;
      }
    }

    this.currentCard[key] = value;

    if (this.currentCard.type === CARD_TYPES.QUEST) {
      const side = (this.currentCard.questSide || 'a').toLowerCase();
      const slot = side === 'a' ? 'questArtA' : 'questArtB';
      if (!this.currentCard[slot]) this.currentCard[slot] = {};
      if (key === 'customArt' || key === 'artSample') {
        this.currentCard[slot][key] = value;
      }
    }

    if (key === 'type' && value === CARD_TYPES.QUEST) {
      if (!this.currentCard.art || (this.currentCard.art.posX === -54 && this.currentCard.art.posY === 247)) {
        this.currentCard.art = { ...DEFAULT_QUEST_ART_CONFIG };
      }
    }
    this.notify('field');
  }

  updateOffset(key, value) {
    if (!this.currentCard.offsets) {
      this.currentCard.offsets = {};
    }
    this.currentCard.offsets[key] = Number(value) || 0;
    this.notify('offset');
  }

  resetOffsets() {
    this.currentCard.offsets = {};
    this.notify('offset');
  }

  updateArt(artSettings) {
    this.currentCard.art = { ...this.currentCard.art, ...artSettings };
    if (this.currentCard.type === CARD_TYPES.QUEST) {
      const side = (this.currentCard.questSide || 'a').toLowerCase();
      const slot = side === 'a' ? 'questArtA' : 'questArtB';
      if (!this.currentCard[slot]) this.currentCard[slot] = {};
      this.currentCard[slot].art = { ...this.currentCard.art };
    }
    this.notify('art');
  }

  loadCard(cardData) {
    this.currentCard = JSON.parse(JSON.stringify(cardData));
    if (!this.currentCard.art || Object.keys(this.currentCard.art).length === 0) {
      this.currentCard.art = this.currentCard.type === CARD_TYPES.QUEST ? { ...DEFAULT_QUEST_ART_CONFIG } : { ...DEFAULT_ART_CONFIG };
    } else if (this.currentCard.type === CARD_TYPES.QUEST && (this.currentCard.art.posX === -54 && this.currentCard.art.posY === 247)) {
      this.currentCard.art = { ...DEFAULT_QUEST_ART_CONFIG };
    }
    if (!this.currentCard.artMaskStrokes) {
      this.currentCard.artMaskStrokes = [];
    }
    if (this.currentCard.type === CARD_TYPES.QUEST) {
      if (!this.currentCard.questArtA) {
        this.currentCard.questArtA = {
          customArt: (this.currentCard.questSide === 'a' ? this.currentCard.customArt : '') || '',
          artSample: (this.currentCard.questSide === 'a' ? this.currentCard.artSample : '') || '/assets/sample_art/sample_quest_1a.jpg',
          art: this.currentCard.questSide === 'a' && this.currentCard.art ? { ...this.currentCard.art } : { ...DEFAULT_QUEST_ART_CONFIG },
          artMaskStrokes: this.currentCard.questSide === 'a' && this.currentCard.artMaskStrokes ? [...this.currentCard.artMaskStrokes] : []
        };
      }
      if (!this.currentCard.questArtB) {
        this.currentCard.questArtB = {
          customArt: (this.currentCard.questSide === 'b' ? this.currentCard.customArt : '') || '',
          artSample: (this.currentCard.questSide === 'b' ? this.currentCard.artSample : '') || '/assets/sample_art/sample_quest_1b.jpg',
          art: this.currentCard.questSide === 'b' && this.currentCard.art ? { ...this.currentCard.art } : { ...DEFAULT_QUEST_ART_CONFIG },
          artMaskStrokes: this.currentCard.questSide === 'b' && this.currentCard.artMaskStrokes ? [...this.currentCard.artMaskStrokes] : []
        };
      }
    }
    this.notify('load');
  }

  resetArt() {
    if (this.currentCard.art?.sourceKind === 'generated') {
      this.updateArt({ sourceKind: 'generated', zoom: 1, scaleX: 1, scaleY: 1, lockRatio: true, posX: 0, posY: 0, rotation: 0, brightness: 1, contrast: 1, feather: 0, bottomFade: 0 });
      this.clearArtMaskStrokes();
      return;
    }
    if (this.currentCard.art?.sourceKind === 'card') {
      this.updateArt({ sourceKind: 'card', zoom: 1, scaleX: 1, scaleY: 1, lockRatio: true, posX: 0, posY: 0, rotation: 0, brightness: 1, contrast: 1, feather: 0, bottomFade: 0, proxyAlignment: true });
      this.clearArtMaskStrokes();
      return;
    }
    if (this.currentCard.type === CARD_TYPES.QUEST) {
      this.currentCard.art = { ...DEFAULT_QUEST_ART_CONFIG };
      const side = (this.currentCard.questSide || 'a').toLowerCase();
      const slot = side === 'a' ? 'questArtA' : 'questArtB';
      if (!this.currentCard[slot]) this.currentCard[slot] = {};
      this.currentCard[slot].art = { ...DEFAULT_QUEST_ART_CONFIG };
      this.currentCard[slot].artMaskStrokes = [];
    } else {
      this.currentCard.art = { ...DEFAULT_ART_CONFIG };
    }
    this.currentCard.artMaskStrokes = [];
    this.notify('art');
  }

  addArtMaskStroke(stroke) {
    if (!this.currentCard.artMaskStrokes) {
      this.currentCard.artMaskStrokes = [];
    }
    this.currentCard.artMaskStrokes.push(stroke);
    this.notify('art');
  }

  undoArtMaskStroke() {
    if (this.currentCard.artMaskStrokes && this.currentCard.artMaskStrokes.length > 0) {
      this.currentCard.artMaskStrokes.pop();
      this.notify('art');
    }
  }

  clearArtMaskStrokes() {
    this.currentCard.artMaskStrokes = [];
    this.notify('art');
  }

  addToDeck(card = null, count = null) {
    const cardToAdd = JSON.parse(JSON.stringify(card || this.currentCard));
    count ??= cardToAdd.quantity || 1;
    const existingIndex = this.deck.findIndex(item => (item.card.sourceUrl || item.card.id || item.card.name) === (cardToAdd.sourceUrl || cardToAdd.id || cardToAdd.name) && item.card.type === cardToAdd.type && item.card.questSide === cardToAdd.questSide && item.card.sphere === cardToAdd.sphere);
    
    if (existingIndex >= 0) {
      this.deck[existingIndex].count += Math.max(1, Math.floor(Number(count) || 1));
    } else {
      this.deck.push({
        id: 'deck-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        card: cardToAdd,
        count: Math.max(1, Math.floor(Number(count) || 1))
      });
    }
    this.saveToStorage();
    this.notify('deck');
  }

  removeFromDeck(deckItemId) {
    this.deck = this.deck.filter(item => item.id !== deckItemId);
    this.saveToStorage();
    this.notify('deck');
  }

  updateDeckCount(deckItemId, count) {
    const item = this.deck.find(i => i.id === deckItemId);
    if (item) {
      item.count = Math.max(1, Math.floor(Number(count) || 1));
      this.saveToStorage();
      this.notify('deck');
    }
  }

  clearDeck() {
    this.deck = [];
    this.saveToStorage();
    this.notify('deck');
  }

  getTotalDeckCount() {
    return this.deck.reduce((sum, item) => sum + item.count, 0);
  }

  saveCurrentToLibrary() {
    if (!this.currentCard.id || this.currentCard.id.startsWith('preset-')) {
      this.currentCard.id = 'saved-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    }
    if (this.currentCard.questSides) {
      for (const face of Object.values(this.currentCard.questSides)) face.id = this.currentCard.id;
    }
    this.syncCurrentFace();
    const current = JSON.parse(JSON.stringify(this.currentCard));
    const existingIndex = this.savedCards.findIndex(c => c.id === current.id);
    if (existingIndex >= 0) {
      this.savedCards[existingIndex] = current;
    } else {
      this.savedCards.unshift(current);
    }
    this.saveToStorage();
    this.notify('library');
    return current;
  }

  deleteFromLibrary(cardId) {
    this.savedCards = this.savedCards.filter(c => c.id !== cardId);
    this.saveToStorage();
    this.notify('library');
  }

  updateDeckItemCard(deckItemId, updatedCard) {
    const item = this.deck.find(i => i.id === deckItemId);
    if (item) {
      item.card = JSON.parse(JSON.stringify(updatedCard));
      this.saveToStorage();
      this.notify('deck');
    }
  }

  async initializeStorage() {
    if (typeof indexedDB === 'undefined') return;
    try {
      const db = await openLibraryStorage();
      const saved = await readLibrary(db);
      if (saved) {
        this.currentCard = saved.currentCard;
        this.deck = saved.deck;
        this.savedCards = saved.savedCards;
      } else {
        // The constructor already read legacy data. Commit it before removing
        // any legacy keys; a failed migration must leave the originals intact.
        await writeLibrary(db, this.storageSnapshot());
      }
      this.libraryDb = db;
      for (const key of ['lotr_card_gen_current', 'lotr_card_gen_deck', 'lotr_card_gen_saved']) localStorage.removeItem(key);
      this.storageError = '';
    } catch (error) {
      this.reportStorageError(error);
    }
  }

  storageSnapshot() {
    // IndexedDB clones values synchronously when put() is called. Avoid making
    // a second full copy of the library before that operation.
    return { currentCard: this.currentCard, deck: this.deck, savedCards: this.savedCards };
  }

  reportStorageError(error) {
    console.warn('Library save failed:', error);
    this.storageError = 'Não foi possível salvar as alterações neste navegador. Exporte sua biblioteca para preservá-las.';
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lotr-storage-error', { detail: this.storageError }));
  }

  saveToStorage() {
    if (this.libraryDb) {
      this.storageDirty = true;
      if (!this.pendingSave) this.pendingSave = new Promise(resolve => { this.resolveStorageSave = resolve; });
      // Coalesce slider/input events; keep a deadline so continuous editing
      // still saves periodically instead of delaying indefinitely.
      this.saveRequestedAt ||= Date.now();
      clearTimeout(this.storageTimer);
      this.storageTimer = setTimeout(() => this.flushStorage(), Math.min(450, Math.max(0, 2000 - (Date.now() - this.saveRequestedAt))));
      return this.pendingSave;
    }
    const sanitizeCard = c => c;

    try {
      localStorage.setItem('lotr_card_gen_current', JSON.stringify(sanitizeCard(this.currentCard)));
      localStorage.setItem('lotr_card_gen_deck', JSON.stringify(this.deck.map(d => ({ ...d, card: sanitizeCard(d.card) }))));
      localStorage.setItem('lotr_card_gen_saved', JSON.stringify(this.savedCards.map(sanitizeCard)));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
      this.storageError = 'Armazenamento cheio. Exporte sua biblioteca para preservar as alterações.';
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lotr-storage-error', { detail: this.storageError }));

    }
  }

  async flushStorage() {
    clearTimeout(this.storageTimer);
    if (!this.libraryDb || !this.storageDirty) return this.storageWrite;
    if (this.storageWrite) {
      await this.storageWrite;
      return this.flushStorage();
    }
    this.storageDirty = false;
    this.saveRequestedAt = 0;
    this.storageWrite = writeLibrary(this.libraryDb, this.storageSnapshot()).then(() => {
      this.storageError = '';
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lotr-storage-saved'));
    }).catch(error => this.reportStorageError(error));
    await this.storageWrite;
    this.storageWrite = null;
    if (this.storageDirty) return this.flushStorage();
    this.resolveStorageSave?.();
    this.resolveStorageSave = null;
    this.pendingSave = null;
  }

  loadFromStorage() {
    try {
      const savedCur = localStorage.getItem('lotr_card_gen_current');
      if (savedCur) {
        const parsed = JSON.parse(savedCur);
        if (parsed && parsed.name) {
          this.currentCard = parsed;
          if (this.currentCard.type === CARD_TYPES.QUEST && this.currentCard.art && (this.currentCard.art.posX === -54 && this.currentCard.art.posY === 247)) {
            this.currentCard.art = { ...DEFAULT_QUEST_ART_CONFIG };
          }
        }
      }

      const savedDeck = localStorage.getItem('lotr_card_gen_deck');
      if (savedDeck) {
        const parsedDeck = JSON.parse(savedDeck);
        if (Array.isArray(parsedDeck)) this.deck = parsedDeck;
      }

      const savedList = localStorage.getItem('lotr_card_gen_saved');
      if (savedList) {
        const parsedList = JSON.parse(savedList);
        if (Array.isArray(parsedList)) this.savedCards = parsedList;
      }
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
  }
}
