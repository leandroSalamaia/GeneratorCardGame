import { selectLocalArt, divContent, divContents, normalizeIcons, mergeTranslations, protectTranslationCards, productCardQuantities } from './server/card-utils.js';
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { extendLocalArt, ART_CACHE } from './server/local-art-ai.js';
import { DEFAULT_OPENAI_MODEL, openAITranslationParameters } from './src/translationModels.js';
import { productEncounterLinks } from './server/card-utils.js';

const LOCAL_PROXIES_DIR = process.env.LOTR_PROXIES_DIR || 'D:/LOTR EXPANSIONS/Enhanced Proxies';

function normalizeStr(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let localArtIndex = [];

function buildLocalArtIndex() {
  const records = [];
  if (!fs.existsSync(LOCAL_PROXIES_DIR)) {
    console.log(`[Local Art Indexer] Directory not found: ${LOCAL_PROXIES_DIR}`);
    return records;
  }

  function scan(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          scan(full);
        } else if (/\.(jpg|png|jpeg)$/i.test(item)) {
          const parts = full.split(path.sep);
          const expansion = path.relative(LOCAL_PROXIES_DIR, full).split(path.sep).slice(0, -1).join(' ');
          const cleanFileName = item
            .replace(/^\d+\s*-\s*/, '')
            .replace(/^\d+[a-z]\s*-\s*/i, '')
            .replace(/\.(jpg|png|jpeg)$/i, '')
            .replace(/\s*\(errata\)/i, '');

          records.push({
            fullPath: full,
            fileName: item,
            cleanName: normalizeStr(cleanFileName),
            expansion: normalizeStr(expansion)
          });
        }
      }
    } catch (e) {
      console.warn('[Local Art Indexer] Error scanning:', e.message);
    }
  }

  scan(LOCAL_PROXIES_DIR);
  console.log(`[Local Art Indexer] Successfully indexed ${records.length} high-DPI cards from ${LOCAL_PROXIES_DIR}`);
  return records;
}

localArtIndex = buildLocalArtIndex();

function findLocalArt(name, expansion = '', stage = '', side = '', number = '') {
  return selectLocalArt(localArtIndex, name, expansion, stage, side, number);
}
async function fetchHall(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== 'hallofbeorn.com' || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use um endereço do Hall of Beorn.');
  parsed.protocol = 'https:';
  parsed.searchParams.set('Lang', 'EN');
  const response = await fetch(parsed, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error('Hall of Beorn retornou HTTP ' + response.status);
  return response;
}
// Scraper function for Hall of Beorn (Text/Stats only, Art comes from local Enhanced Proxies)
async function scrapeHallOfBeorn(inputUrlOrQuery, importScope = 'all') {
  let url = (inputUrlOrQuery || '').trim();
  if (!url) throw new Error('Nome da carta ou URL é obrigatória.');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://hallofbeorn.com/LotR?Query=${encodeURIComponent(url)}&View=Browse`;
  }

  console.log(`[Vite API] Fetching Hall of Beorn: ${url}`);
  const resp = await fetchHall(url);
  const html = await resp.text();

  // If this is a single card details page
  if (url.includes('/LotR/Details/')) {
    const card = parseCardDetailHtml(html, url, '');
    return {
      success: true,
      expansionName: card.scenarioName || card.name || 'Single Card',
      cards: [card]
    };
  }

  // Expansion / Product / Search results page
  const titleMatch = html.match(/<h2[^>]*>\s*<a[^>]*>(.*?)<\/a>\s*<\/h2>/i) ||
                     html.match(/<title>(.*?)<\/title>/i);
  let expansionName = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : 'Hall of Beorn';

  const detailLinkRegex = /href=["'](\/LotR\/Details\/[^"']+)["']/gi;
  const links = new Set();
  let match;
  while ((match = detailLinkRegex.exec(html)) !== null) {
    // Product pages HTML-encode apostrophes in slugs (&#x27;). Decode before fetching;
    // otherwise cards such as Book of Aule's Children and Naurlhûg's Lair fail silently.
    links.add('https://hallofbeorn.com' + decodeHtmlEntities(match[1]));
  }

  let cardUrls = Array.from(links);
  if (importScope === 'encounter-quest' && url.includes('/Products/')) {
    const selected = new Set([...productEncounterLinks(html)].map(link => 'https://hallofbeorn.com' + decodeHtmlEntities(link)));
    cardUrls = cardUrls.filter(link => selected.has(link));
    if (!cardUrls.length) throw Error('Este produto não contém Encounter Cards ou Quest Cards. Selecione “Todas as cartas” para importar as cartas de jogador.');
  }
  const quantities = new Map([...productCardQuantities(html)].map(([url, count]) => ['https://hallofbeorn.com' + decodeHtmlEntities(url), count]));
  if (cardUrls.length === 0) {
    throw new Error(`Nenhuma carta encontrada para: "${inputUrlOrQuery}". Verifique o nome ou link.`);
  }

  const cards = new Array(cardUrls.length);
  const warnings = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < cardUrls.length) {
      const index = nextIndex++;
      try {
        const response = await fetchHall(cardUrls[index]);
        cards[index] = parseCardDetailHtml(await response.text(), cardUrls[index], expansionName);
        if (quantities.has(cardUrls[index])) {
          cards[index].quantity = quantities.get(cardUrls[index]);
          for (const side of Object.values(cards[index].questSides || {})) side.quantity = cards[index].quantity;
        }
      } catch (error) { warnings.push({ url: cardUrls[index], error: error.message }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, cardUrls.length) }, worker));
  const imported = cards.filter(Boolean);
  if (!imported.length) throw new Error('Nenhuma carta pôde ser importada. ' + (warnings[0]?.error || ''));
  return {
    success: true,
    expansionName: cardUrls.length === 1 ? (imported[0]?.name || 'Single Card') : expansionName,
    warnings,
    cards: imported
  };
}

function decodeHtmlEntities(text) {
  if (!text) return '';
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“');
}

function parseCardDetailHtml(cardHtml, cardUrl, expName = '', sideIndex = 0) {
  // Name
  const nameMatch = cardHtml.match(/<div style="font-size:1\.75em;font-family:Verdana;">(.*?)<\/div>/i) ||
                    cardHtml.match(/<h2[^>]*>(.*?)<\/h2>/i);
  if (!nameMatch) throw new Error('Página sem nome de carta reconhecível: ' + cardUrl);
  let name = nameMatch[1];
  name = decodeHtmlEntities(name.replace(/<[^>]+>/g, '')).trim();

  // Type
  const typeMatch = cardHtml.match(/<div style="font-weight:bold;font-size:20pt;">(.*?)<\/div>/i);
  const rawType = typeMatch ? decodeHtmlEntities(typeMatch[1]).trim() : 'Attachment';

  let type = rawType.toLowerCase();
  type = type.replace(/ú/g, 'u').replace(/ó/g, 'o').replace(/é/g, 'e').replace(/á/g, 'a').replace(/í/g, 'i');

  if (/side.?quest/i.test(type)) throw new Error('Missões paralelas precisam de um layout próprio, ainda não disponível.');
  if (type.includes('objective') || type.includes('objetiv') || type.includes('objectif')) {
    type = 'objective';
  } else if (type.includes('hero') || type.includes('heroe') || type.includes('heroi')) {
    type = 'hero';
  } else if (type.includes('ally') || type.includes('aliad') || type.includes('allie')) {
    type = 'ally';
  } else if (type.includes('enemy') || type.includes('enemig') || type.includes('inimig') || type.includes('ennemi')) {
    type = 'enemy';
  } else if (type === 'ort' || type.includes('location') || type.includes('lugar') || type.includes('local') || type.includes('lieu')) {
    type = 'location';
  } else if (type.includes('treachery') || type.includes('traic') || type.includes('traitr')) {
    type = 'treachery';
  } else if (type.includes('objective') || type.includes('objetiv') || type.includes('objectif')) {
    type = 'objective';
  } else if (type.includes('treasure') || type.includes('tesor') || type.includes('tresor')) {
    type = 'treasure';
  } else if (
    type.includes('quest') || 
    type.includes('busqued') || 
    type.includes('mision') || 
    type.includes('missao') || 
    type.includes('quete') || 
    cardHtml.includes('icon-Quest') ||
    cardHtml.includes('Quest Stage') ||
    cardHtml.includes('Búsqueda') ||
    cardHtml.includes('B&#xFA;squeda') ||
    /-[1-9][AB]\.png/i.test(cardHtml)
  ) {
    type = 'quest';
  } else if (type.includes('event') || type.includes('evenem')) {
    type = 'event';
  } else {
    type = 'attachment';
  }

  const cardSetMatch = cardHtml.match(/<a[^>]*href=["'][^"']*[?&]CardSet=[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  const cardSet = cardSetMatch ? decodeHtmlEntities(cardSetMatch[1].replace(/<[^>]+>/g, '')).trim() : expName;

  // Sphere
  let sphere = 'neutral';
  if (cardHtml.includes('/Images/Leadership')) sphere = 'leadership';
  else if (cardHtml.includes('/Images/Tactics')) sphere = 'tactics';
  else if (cardHtml.includes('/Images/Spirit')) sphere = 'spirit';
  else if (cardHtml.includes('/Images/Lore')) sphere = 'lore';
  else if (cardHtml.includes('/Images/Baggins')) sphere = 'baggins';
  else if (cardHtml.includes('/Images/Fellowship')) sphere = 'fellowship';

  // Scenario name (for Objective cards & scenarios)
  let scenarioName = '';
  const scenMatch = cardHtml.match(/title="Search for ([^"]+) \([A-Z]{2}\)"/i) ||
                    cardHtml.match(/<a title="([^"]+)" href="\/LotR\?EncounterSet=[^"]*">/i) ||
                    cardHtml.match(/<a[^>]+href=['"]\/LotR\?Scenario=([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
  if (scenMatch) {
    scenarioName = decodeHtmlEntities(scenMatch[1]).replace(/\+/g, ' ').trim();
  }

  // Extract Stat Boxes
  let cost = '';
  let threatCost = '';
  let engagementThreat = '';
  let willpower = '';
  let attack = '';
  let defense = '';
  let health = '';
  let threat = '';
  let questPoints = '';
  let objectiveStyle = 'item';

  const sBox = cardHtml.match(/<div class="statValueBox[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="statTextBox/i);
  let nums = [];
  const statValues = divContent(cardHtml, 'statValueBox');
  if (statValues) {
    const rawTokens = statValues.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    nums = rawTokens.filter(t => /^\d+$/.test(t) || /^[Xx–—-]$/.test(t));
    if (type === 'hero' && nums.length >= 5) {
      threatCost = nums[0];
      willpower = nums[1];
      attack = nums[2];
      defense = nums[3];
      health = nums[4];
    } else if (type === 'ally' && nums.length >= 5) {
      cost = nums[0];
      willpower = nums[1];
      attack = nums[2];
      defense = nums[3];
      health = nums[4];
    } else if (type === 'enemy' && nums.length >= 5) {
      engagementThreat = nums[0];
      threat = nums[1];
      attack = nums[2];
      defense = nums[3];
      health = nums[4];
    } else if (type === 'location') {
      if (nums.length >= 2) {
        threat = nums[0];
        questPoints = nums[1];
      } else if (nums.length === 1) {
        threat = nums[0];
      }
    } else if (type === 'quest' && nums.length >= 2) {
      questPoints = nums[nums.length - 1];
    } else if (type === 'objective') {
      if (nums.length >= 4) {
        objectiveStyle = 'ally';
        willpower = nums[0];
        attack = nums[1];
        defense = nums[2];
        health = nums[3];
      } else {
        objectiveStyle = 'item';
        willpower = '';
        attack = '';
        defense = '';
        health = '';
        cost = '';
      }
    } else if (nums.length >= 1) {
      cost = nums[0];
    }
  }

  // Fallback for Quest Points on Quest cards if not in statValueBox
  if (type === 'quest' && !questPoints) {
    const questMatch = cardHtml.match(/Quest Points:\s*(\d+)/i) ||
                       cardHtml.match(/(\d+)\s*<img[^>]*class=['"]icon-Quest['"]/i) ||
                       cardHtml.match(/Quest\s*Points?[:\s]+(\d+)/i);
    if (questMatch) {
      questPoints = questMatch[1].trim();
    }
  }

  // Victory
  const victoryMatch = cardHtml.match(/class=['"]victory-span['"][^>]*>Victory\s*(\d+)\.?<\/span>/i) ||
                       cardHtml.match(/Victory\s*(\d+)\.?/i);
  const victory = victoryMatch ? `Victory ${victoryMatch[1]}.` : '';

  // Card Number
  const cardNumMatch = decodeHtmlEntities(cardHtml.replace(/<[^>]+>/g, '')).match(/#(\d+)\s*\(\s*x\s*(\d+)\s*\)/i);
  const cardNumber = cardNumMatch ? cardNumMatch[1] : '';
  const quantity = cardNumMatch ? Math.max(1, Number(cardNumMatch[2])) : 1;

  // Traits
  const traits = [...cardHtml.matchAll(/<a[^>]*title=["']Trait Search["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, '')).trim()).join(' ');

  // Ability text (extracted comprehensively from statTextBox including blockquote and nested formatting)
  let ability = '';
  const sBoxMatch = cardHtml.match(/<div class="statTextBox[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|\s*<div class="statFooterBox)/i);
  const ruleBoxes = divContents(cardHtml, 'statTextBox');
  const rulesContent = ruleBoxes[sideIndex] || '';
  if (rulesContent) {
    let content = normalizeIcons(rulesContent);
    // Remove encounter card back background image
    content = content.replace(/<img[^>]+encounter-card-back[^>]*>/gi, '');
    // Remove traits header div
    content = content.replace(/<div style="text-align:center;">[\s\S]*?<\/div>/gi, '');
    // Remove flavor text if any inside statTextBox
    content = content.replace(/<p[^>]*class=['"][^'"]*flavor-text[^'"]*['"][^>]*>[\s\S]*?<\/p>/gi, '');
    // Remove shadow text if any inside statTextBox
    content = content.replace(/<p[^>]*class=['"][^'"]*shadow-text[^'"]*['"][^>]*>[\s\S]*?<\/p>/gi, '');

    // Format blockquote and paragraphs
    content = content.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, '\n$1\n');
    content = content.replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n');
    content = content.replace(/<br\s*\/?>/gi, '\n');
    content = content.replace(/<li\b[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '\n');
    content = content.replace(/<div[^>]*text-align:center[^>]*>[\s\S]*?<\/div>/gi, '');

    // Sphere and stat icons
    content = content.replace(/<img[^>]+class=['"]icon-Leadership['"][^>]*\/>/gi, '[leadership]');
    content = content.replace(/<img[^>]+class=['"]icon-Tactics['"][^>]*\/>/gi, '[tactics]');
    content = content.replace(/<img[^>]+class=['"]icon-Spirit['"][^>]*\/>/gi, '[spirit]');
    content = content.replace(/<img[^>]+class=['"]icon-Lore['"][^>]*\/>/gi, '[lore]');
    content = content.replace(/<img[^>]+class=['"]icon-Attack['"][^>]*\/>/gi, '[attack]');
    content = content.replace(/<img[^>]+class=['"]icon-Defense['"][^>]*\/>/gi, '[defense]');
    content = content.replace(/<img[^>]+class=['"]icon-Willpower['"][^>]*\/>/gi, '[willpower]');
    content = content.replace(/<img[^>]+class=['"]icon-Threat['"][^>]*\/>/gi, '[threat]');
    content = content.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');

    content = decodeHtmlEntities(content);

    // Strip tags except <b>, </b>, <strong>, </strong>, <i>, </i>, <em>, </em>
    content = content.replace(/<(?!(\/?(b|strong|i|em))\b)[^>]+>/gi, '');

    // Normalize strong/em to b/i
    content = content.replace(/<(\/?)strong>/gi, '<$1b>').replace(/<(\/?)em>/gi, '<$1i>');

    // Auto-bold standard LotR keywords if not already bolded
    const keywords = [
      'Action:', 'Response:', 'Forced:', 'When Revealed:', 'Setup:', 'Travel:',
      'Combat Action:', 'Planning Action:', 'Quest Action:', 'Refresh Action:',
      'Shadow:', 'Sentinel.', 'Ranged.', 'Guarded.', 'Surge.'
    ];
    for (const kw of keywords) {
      const escaped = kw.replace('.', '\\.');
      const regex = new RegExp(`(?<!<b>)\\b(${escaped})(?!<\\/b>)`, 'g');
      content = content.replace(regex, '<b>$1</b>');
    }

    // Fix leading quote trapped inside <b>
    content = content.replace(/<b>(["'“‘])(.*?)(<\/b>)/gi, '$1<b>$2$3');

    ability = content.split('\n').map(l => l.trim()).filter(Boolean).join('\n\n');
  } else {
    const mainTextMatches = [...cardHtml.matchAll(/<p class=['"]main-text['"]>(.*?)<\/p>/gi)];
    ability = mainTextMatches.map(m => {
      let t = m[1];
      t = t.replace(/<img[^>]+class=['"]icon-Leadership['"][^>]*\/>/gi, '[leadership]');
      t = t.replace(/<img[^>]+class=['"]icon-Tactics['"][^>]*\/>/gi, '[tactics]');
      t = t.replace(/<img[^>]+class=['"]icon-Spirit['"][^>]*\/>/gi, '[spirit]');
      t = t.replace(/<img[^>]+class=['"]icon-Lore['"][^>]*\/>/gi, '[lore]');
      t = t.replace(/<img[^>]+class=['"]icon-Attack['"][^>]*\/>/gi, '[attack]');
      t = t.replace(/<img[^>]+class=['"]icon-Defense['"][^>]*\/>/gi, '[defense]');
      t = t.replace(/<img[^>]+class=['"]icon-Willpower['"][^>]*\/>/gi, '[willpower]');
      t = t.replace(/<img[^>]+class=['"]icon-Threat['"][^>]*\/>/gi, '[threat]');
      t = t.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
      t = decodeHtmlEntities(t);
      t = t.replace(/<(?!(\/?(b|strong|i|em))\b)[^>]+>/gi, '');
      t = t.replace(/<(\/?)strong>/gi, '<$1b>').replace(/<(\/?)em>/gi, '<$1i>');
      t = t.replace(/<b>(["'“‘])(.*?)(<\/b>)/gi, '$1<b>$2$3');
      return t.trim();
    }).join('\n\n');
  }

  // Flavor text / Tolkien Quote
  const flavorMatches = [...rulesContent.matchAll(/<p[^>]*class=['"][^'"]*flavor-text[^'"]*['"][^>]*>(.*?)<\/p>/gis)];
  let quote = flavorMatches.map(m => {
    let t = m[1];
    t = t.replace(/<br\s*\/?>/gi, '\n');
    t = decodeHtmlEntities(t);
    t = t.replace(/<[^>]+>/g, '');
    return t.trim();
  }).filter(Boolean).join('\n\n');
  if (!quote && type === 'quest') {
    const centered = rulesContent.match(/<div[^>]*text-align:center[^>]*>([\s\S]*?)<\/div>/i);
    if (centered) quote = decodeHtmlEntities(centered[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
  }

  // Shadow text
  let hasShadow = false;
  let shadowText = '';

  const shadowMatch = rulesContent.match(/<p[^>]*class=['"][^'"]*shadow-text[^'"]*['"][^>]*>([\s\S]*?)<\/p>/i);
  if (shadowMatch) {
    hasShadow = true;
    let s = normalizeIcons(shadowMatch[1]);
    s = s.replace(/<img[^>]+class=['"]icon-Leadership['"][^>]*\/>/gi, '[leadership]');
    s = s.replace(/<img[^>]+class=['"]icon-Tactics['"][^>]*\/>/gi, '[tactics]');
    s = s.replace(/<img[^>]+class=['"]icon-Spirit['"][^>]*\/>/gi, '[spirit]');
    s = s.replace(/<img[^>]+class=['"]icon-Lore['"][^>]*\/>/gi, '[lore]');
    s = s.replace(/<img[^>]+class=['"]icon-Attack['"][^>]*\/>/gi, '[attack]');
    s = s.replace(/<img[^>]+class=['"]icon-Defense['"][^>]*\/>/gi, '[defense]');
    s = s.replace(/<img[^>]+class=['"]icon-Willpower['"][^>]*\/>/gi, '[willpower]');
    s = s.replace(/<img[^>]+class=['"]icon-Threat['"][^>]*\/>/gi, '[threat]');
    s = s.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = decodeHtmlEntities(s);
    s = s.replace(/<(?!(\/?(b|strong|i|em))\b)[^>]+>/gi, '');
    s = s.replace(/<(\/?)strong>/gi, '<$1b>').replace(/<(\/?)em>/gi, '<$1i>');
    shadowText = s.trim();
  } else if (ability.includes('Shadow:')) {
    hasShadow = true;
    const shadowIdx = ability.indexOf('Shadow:');
    if (shadowIdx >= 0) {
      shadowText = ability.substring(shadowIdx).trim();
      ability = ability.substring(0, shadowIdx).trim();
    }
  }

  // Unique Symbol
  const isUnique = cardHtml.includes('unique-card.png') || cardHtml.includes('icon-Unique') || name.startsWith('★');

  // Illustrator
  const illusMatch = cardHtml.match(/Illus\.\s*<\/span>\s*<a[^>]*>(.*?)<\/a>/i);
  const illustrator = illusMatch ? `Illus. ${decodeHtmlEntities(illusMatch[1].replace(/<[^>]+>/g, '')).trim()}` : 'Illus. Unknown';

  const encounterMatch = cardHtml.match(/<a[^>]*href=["'][^"']*[?&]EncounterSet=[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  const encounterNameMatch = cardHtml.match(/<a[^>]*title=["']([^"']+)["'][^>]*href=["'][^"']*EncounterSet=/i);
  const encounterName = encounterNameMatch ? decodeHtmlEntities(encounterNameMatch[1]) : encounterMatch ? decodeHtmlEntities(encounterMatch[1].replace(/<[^>]+>/g, '')).trim() : '';
  scenarioName = encounterName || '';
  let encounterSet = '';
  try {
    const manifest = JSON.parse(fs.readFileSync(new URL('./public/assets/manifest.json', import.meta.url), 'utf8'));
    const aliases = { 'passage through mirkwood': 'mirkwood', 'spiders of mirkwood': 'spiders', 'dol guldur orcs': 'orcs', 'escape from dol guldur': 'dolguldur', 'journey along the anduin': 'anduin', 'saurons reach': 'eyeofsauron', 'sauron s reach': 'eyeofsauron', 'wilderlands': 'wilds' };
    encounterSet = manifest.encounterSets.find(e => normalizeStr(e.name) === normalizeStr(encounterName))?.id || aliases[normalizeStr(encounterName)] || '';
  } catch {}
  // Stage and Side
  const encounterIcons = [...divContent(cardHtml, 'statTypeBox').matchAll(/<img\b[^>]*src=["']([^"']+\/Encounters\/[^"']+)["'][^>]*>/gi)]
    .map(match => '/api/card-image?url=' + encodeURIComponent(new URL(decodeHtmlEntities(match[1]), 'https://hallofbeorn.com').href));
  let stage = '1';
  let questSide = 'a';
  let printedQuestSide = 'a';
  if (type === 'quest') {
    const stgMatch = cardHtml.match(/<span[^>]*style="[^"]*font-weight:bold;[^"]*">(\d+)<\/span><span[^>]*>[A-Za-z\-]+<\/span>/i) ||
                     cardHtml.match(/Stage\s*(\d+)/i) ||
                     cardHtml.match(/-(\d+)[AB]/i) ||
                     cardUrl.match(/-(\d+)[AB]/i);
    if (stgMatch) stage = stgMatch[1];

    const sideMatch = cardUrl.match(/-(\d+)([A-Z])-[^/]+$/i) ||
                      cardUrl.match(/-([A-Z])-[^/]+$/i) ||
                      cardUrl.match(/-(\d+)([A-Z])/i) ||
                      cardHtml.match(/-(\d+)([A-Z])\.png/i) ||
                      cardHtml.match(/Stage\s*\d+([A-Z])/i);
    if (sideMatch) {
      printedQuestSide = (sideMatch[2] || sideMatch[1]).toLowerCase();
      questSide = sideIndex ? 'b' : 'a';
    }
    if (ruleBoxes.length > 1) questSide = sideIndex ? 'b' : 'a';
    if (nums.length > 1) stage = nums[0];
  }

  const defaultArt = { sourceKind: 'card', zoom: 1, scaleX: 1, scaleY: 1, lockRatio: true, posX: 0, posY: 0, rotation: 0, brightness: 1, contrast: 1, feather: 0, bottomFade: 0 };

  // Find Local High-DPI Art from D:\LOTR EXPANSIONS\Enhanced Proxies
  let customArt = '';
  let questArtA = null;
  let questArtB = null;

  if (type === 'quest') {
    const firstPrintedSide = printedQuestSide || 'a';
    const secondPrintedSide = String.fromCharCode(firstPrintedSide.charCodeAt(0) + 1);
    const localArtPathA = findLocalArt(name, cardSet, stage, firstPrintedSide, cardNumber) ||
      findLocalArt(name, '', stage, firstPrintedSide, cardNumber);
    const localArtPathB = findLocalArt(name, cardSet, stage, secondPrintedSide, cardNumber) ||
      findLocalArt(name, '', stage, secondPrintedSide, cardNumber);

    const customArtA = localArtPathA ? `/api/local-image?path=${encodeURIComponent(localArtPathA)}` : '';
    const customArtB = localArtPathB ? `/api/local-image?path=${encodeURIComponent(localArtPathB)}` : '';

    questArtA = {
      customArt: customArtA,
      artSample: '',
      art: { ...defaultArt },
      artMaskStrokes: []
    };
    questArtB = {
      customArt: customArtB,
      artSample: '',
      art: { ...defaultArt },
      artMaskStrokes: []
    };

    customArt = questSide === 'b' ? customArtB : customArtA;
  } else {
    const localArtPath = findLocalArt(name, cardSet, '', '', cardNumber);
    customArt = localArtPath ? `/api/local-image?path=${encodeURIComponent(localArtPath)}` : '';
  }

  // Fallback Web Image from Hall of Beorn if local proxy is not available
  if (!customArt) {
    const imgMatch = cardHtml.match(/data-src=["']([^"']+)["']/i) ||
                     cardHtml.match(/data-stripped-src=["']([^"']+)["']/i) ||
                     cardHtml.match(/<img[^>]+class=["'][^"']*card-image[^"']*["'][^>]*src=["']([^"']+)["']/i) ||
                     cardHtml.match(/<img[^>]+src=["'](\/Images\/Cards\/[^"']+)["']/i);
    if (imgMatch) {
      const p = imgMatch[1];
      customArt = p.startsWith('http') ? p : ('https://hallofbeorn.com' + (p.startsWith('/') ? '' : '/') + p);
      if (type === 'quest') {
        const images = [...cardHtml.matchAll(/data-src=["']([^"']+)["']/gi)];
        const selected = images[sideIndex]?.[1];
        if (selected) customArt = new URL(decodeHtmlEntities(selected), 'https://hallofbeorn.com').href;
      }
      customArt = '/api/card-image?url=' + encodeURIComponent(customArt);
    }
  }

  if (type === 'quest') (questSide === 'b' ? questArtB : questArtA).customArt = customArt;
  const result = {
    id: 'hob-' + new URL(cardUrl).pathname.split('/').pop() + (type === 'quest' ? '-' + questSide : ''),
    sourceUrl: cardUrl,
    originalName: name,
    cardSet,
    encounterName,
    language: 'en',
    name,
    rawType,
    type,
    objectiveStyle,
    sphere,
    cost,
    threatCost,
    engagementThreat,
    willpower,
    attack,
    defense,
    health,
    threat,
    questPoints,
    stage,
    stageTitle: name,
    questSide,
    scenarioName,
    victory,
    isUnique,
    traits,
    ability,
    quote,
    hasShadow,
    shadowText,
    encounterSet,
    encounterIcons,
    cardNumber,
    quantity,
    illustrator,
    copyright: '',
    customArt,
    questArtA,
    questArtB,
    art: defaultArt,
    artMaskStrokes: []
  };
  if (type === 'quest' && ruleBoxes.length > 1 && !sideIndex) {
    const otherSide = parseCardDetailHtml(cardHtml, cardUrl, expName, 1);
    result.questSides = { a: { ...result }, b: otherSide };
  }
  return result;
}

const config = defineConfig({
  server: {
    watch: {
      ignored: ['**/layout/**', '**/scripts/**', '**/*.psd', '**/*.rar']
    }
  },
  plugins: [
    {
      name: 'hall-of-beorn-and-local-art-api',
      configurePreviewServer(server) { config.plugins[0].configureServer(server); },
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url.startsWith('/api/generated-art/')) {
            const match = /^\/api\/generated-art\/([a-f0-9]{64})\.png$/.exec(req.url);
            const file = match && path.join(ART_CACHE, match[1], 'extended-art.png');
            if (!file || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            fs.createReadStream(file).pipe(res); return;
          }
          if (req.url === '/api/extend-import-art' && req.method === 'POST') {
            let body = '';
            try {
              for await (const chunk of req) {
                body += chunk;
                if (body.length > 16384) throw Error('Pedido de imagem muito grande.');
              }
              const data = JSON.parse(body);
              const result = await extendLocalArt(data.image, data.type, LOCAL_PROXIES_DIR);
              res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
            } catch (error) {
              res.statusCode = 422; res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message }));
            }
            return;
          }
          if (req.url.startsWith('/api/quest-icons?')) {
            try {
              const source = new URL(req.url, 'http://localhost').searchParams.get('source');
              const url = new URL(source);
              if (!url.pathname.startsWith('/LotR/Details/')) throw Error('Use uma carta do Hall of Beorn.');
              const response = await fetchHall(url.href);
              const html = await response.text();
              const encounterIcons = [...divContent(html, 'statTypeBox').matchAll(/<img\b[^>]*src=["']([^"']+\/Encounters\/[^"']+)["'][^>]*>/gi)]
                .map(match => '/api/card-image?url=' + encodeURIComponent(new URL(decodeHtmlEntities(match[1]), 'https://hallofbeorn.com').href));
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(JSON.stringify({ encounterIcons }));
            } catch (error) { res.statusCode = 502; res.end(JSON.stringify({ error: error.message })); }
            return;
          }
          if (req.url.startsWith('/api/card-image?')) {
            try {
              const url = new URL(new URL(req.url, 'http://localhost').searchParams.get('url'));
              if (url.protocol !== 'https:' || !['hallofbeorn.com', 'hallofbeorn-resources.s3.amazonaws.com', 's3.amazonaws.com'].includes(url.hostname) || !url.pathname.includes('/Images/')) throw Error('Endereço de imagem inválido.');
              // Hall icon URLs redirect to its S3 image storage.
              const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
              if (!['hallofbeorn.com', 'hallofbeorn-resources.s3.amazonaws.com', 's3.amazonaws.com'].includes(new URL(response.url).hostname)) throw Error('Destino de imagem inválido.');
              if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error('Imagem indisponível.');
              res.setHeader('Content-Type', response.headers.get('content-type'));
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end(Buffer.from(await response.arrayBuffer()));
            } catch (e) { res.statusCode = 502; res.end(e.message); }
            return;
          }
          // 1. Local Image endpoint (Serves high-DPI images from D:\LOTR EXPANSIONS\Enhanced Proxies)
          if (req.url.startsWith('/api/local-image')) {
            try {
              const parsed = new URL(req.url, 'http://localhost');
              const filePath = parsed.searchParams.get('path');
              if (!filePath || !fs.existsSync(filePath)) {
                res.statusCode = 404;
                res.end('Image not found');
                return;
              }

              const resolved = fs.realpathSync(filePath);
              const relative = path.relative(fs.realpathSync(LOCAL_PROXIES_DIR), resolved);
              if (relative.startsWith('..') || path.isAbsolute(relative) || !/\.(png|jpe?g)$/i.test(resolved)) { res.statusCode = 403; res.end('Imagem fora da pasta de proxies'); return; }
              const ext = path.extname(filePath).toLowerCase();
              const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
              res.setHeader('Content-Type', contentType);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'public, max-age=86400');

              const stream = fs.createReadStream(filePath);
              stream.pipe(res);
            } catch (err) {
              console.error('[Local Image Error]', err);
              res.statusCode = 500;
              res.end('Local image error');
            }
            return;
          }

          // 2. Find Local Art API
          if (req.url.startsWith('/api/find-local-art')) {
            try {
              const parsed = new URL(req.url, 'http://localhost');
              const cardName = parsed.searchParams.get('name') || '';
              const expansion = parsed.searchParams.get('set') || '';
              let artPath = '';
              const reference = parsed.searchParams.get('reference');
              if (reference) {
                const source = new URL(reference, 'http://localhost');
                const record = localArtIndex.find(r => r.fullPath === source.searchParams.get('path'));
                if (record) {
                  const name = record.fileName.replace(/^\d+\s*-\s*(?:\d+[a-z]\s*-\s*)?/i, '').replace(/\.(png|jpe?g)$/i, '').replace(/\s*\(errata\)/i, '');
                  artPath = selectLocalArt(localArtIndex.filter(r => path.dirname(r.fullPath) === path.dirname(record.fullPath)), name, '', parsed.searchParams.get('stage') || '', parsed.searchParams.get('side') || '');
                }
              }
              artPath ||= findLocalArt(cardName, expansion, parsed.searchParams.get('stage') || '', parsed.searchParams.get('side') || '');
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              if (artPath) {
                res.end(JSON.stringify({ found: true, url: `/api/local-image?path=${encodeURIComponent(artPath)}`, fullPath: artPath }));
              } else {
                res.end(JSON.stringify({ found: false }));
              }
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // 3. Hall of Beorn scraper endpoint
          if (req.url === '/api/import-hall-of-beorn' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const data = JSON.parse(body || '{}');
                const targetUrl = data.url;
                if (!targetUrl) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'URL do Hall of Beorn é obrigatória.' }));
                  return;
                }

                const result = await scrapeHallOfBeorn(targetUrl, data.importScope === 'encounter-quest' ? 'encounter-quest' : 'all');
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify(result));
              } catch (err) {
                console.error('[API Error]', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || 'Erro ao importar do Hall of Beorn' }));
              }
            });
            return;
          }

          // 4. Translation API endpoint (Google Gemini & OpenAI support)
          if (req.url === '/api/translate' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const data = JSON.parse(body || '{}');
                const { provider = 'google', apiKey, model, cards = [] } = data;

                if (!apiKey || !apiKey.trim()) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Chave de API (API Key) não informada. Configure sua chave nas configurações.' }));
                  return;
                }

                if (!cards || cards.length === 0) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Nenhuma carta informada para tradução.' }));
                  return;
                }

                const LOTR_SYSTEM_PROMPT = `Você é um tradutor oficial e especialista em localização para o jogo de cartas 'O Senhor dos Anéis: Card Game' (The Lord of the Rings: The Card Game / LotR LCG) para Português do Brasil (PT-BR), seguindo estritamente a terminologia consagrada pela Galápagos Jogos e Fantasy Flight Games (FFG).

INSTRUÇÕES OBRIGATÓRIAS:
1. Traduza os campos dos objetos fornecidos (name, traits, ability, shadowText, quote, scenarioName, stageTitle) mantendo o tom épico tolkieniano.
2. REGRAS CRÍTICAS PARA O NOME DA CARTA ('name' e 'stageTitle'):
   - Retorne APENAS o nome único e limpo traduzido em português.
   - NUNCA inclua o nome original em inglês entre parênteses, barras, colchetes ou hífens.
   - NUNCA duplique ou repita o nome.
   - Exemplo CORRETO: "name": "Regente de Gondor"
   - Exemplo PROIBIDO: "name": "Regente de Gondor (Steward of Gondor)" ou "name": "Steward of Gondor - Regente de Gondor"
   - Se o nome tiver o símbolo '★' ou '•', remova esses símbolos do texto.
3. REGRAS PARA SUBTIPOS E TRAÇOS ('traits'):
   - Traduza cada traço com pontuação preservada. Exemplos oficiais:
     - "Silvan." -> "Silvestre."
     - "Noble." -> "Nobre."
     - "Scout." -> "Batedor."
     - "Warrior." -> "Guerreiro."
     - "Ranger." -> "Guardião."
     - "Creature." -> "Criatura."
     - "Spider." -> "Aranha."
     - "Orc." -> "Orc."
     - "Item." -> "Item."
     - "Weapon." -> "Arma."
     - "Armor." -> "Armadura."
     - "Condition." -> "Condição."
     - "Title." -> "Título."
     - "Skill." -> "Perícia."
     - "Song." -> "Canção."
     - "Dúnedain." -> "Dúnedain."
     - "Dwarf." -> "Anão."
     - "Hobbit." -> "Hobbit."
     - "Forest." -> "Floresta."
     - "Mountain." -> "Montanha."
     - "River." -> "Rio."
     - "Marsh." -> "Pântano."
     - "Stronghold." -> "Fortaleza."
     - "Undead." -> "Morto-vivo."
     - "Eagle." -> "Águia."
     - "Ent." -> "Ent."
     - "Istari." -> "Istari."
     - "Bree." -> "Bree."
     - "Rohan." -> "Rohan."
     - "Dale." -> "Vale."
     - "Beorning." -> "Beornin."
     - "Nazgûl." -> "Nazgûl."
     - "Disaster." -> "Desastre."
     - "Boon." -> "Dádiva."
     - "Burden." -> "Fardo."
     - "Mount." -> "Montaria."
     - "Signal." -> "Sinal."
     - "Trap." -> "Armadilha."
     - "Record." -> "Registro."
     - "Pipe." -> "Cachimbo."
     - "Escape." -> "Fuga."
     - "Garrison." -> "Guarnição."
     - "Shadow." -> "Sombra."
     - "Hazard." -> "Perigo."
     - "Wilderlands." -> "Terras Ermas."
4. Marcadores como __LOTR_ICON_0__ representam símbolos do jogo protegidos pelo aplicativo. COPIE cada marcador EXATAMENTE, uma única vez por ocorrência, no mesmo campo e na posição correspondente da frase traduzida. NUNCA traduza, remova, duplique ou substitua esses marcadores por palavras ou símbolos. Exemplo: "Attached hero gets +1 __LOTR_ICON_0__." -> "O herói vinculado recebe +1 __LOTR_ICON_0__." Preserve também quaisquer ícones entre colchetes: [leadership], [tactics], [spirit], [lore], [willpower], [attack], [defense], [threat].
5. PRESERVE E FORMATE as palavras-chave e disparadores em negrito com <b>...</b>:
   - "Action:" -> "<b>Ação:</b>"
   - "Response:" -> "<b>Resposta:</b>"
   - "When Revealed:" -> "<b>Quando Revelado:</b>"
   - "Setup:" -> "<b>Preparação:</b>"
   - "Forced:" -> "<b>Forçado:</b>"
   - "Travel:" -> "<b>Viagem:</b>"
   - "Shadow:" -> "<b>Sombra:</b>"
   - "Sentinel." -> "<b>Sentinela.</b>"
   - "Ranged." -> "<b>À Distância.</b>"
   - "Surge." -> "<b>Afluxo.</b>"
   - "Doomed X." -> "<b>Condenado X.</b>"
   - "Guarded." -> "<b>Protegido.</b>"
   - "Permanent." -> "<b>Permanente.</b>"
   - "Restricted." -> "<b>Restrito.</b>"
7. REGRAS DE SINTAXE E HABILIDADES CONCEDIDAS:
   - Quando o texto disser "...it gains: \"[Trigger]: ...\"" ou "...gains: \"Action: ...\"", traduza de forma natural sem aspas ao redor da habilidade concedida.
   - Exemplo CORRETO: "ele ganha: <b>Resposta:</b> Depois que..." ou "ele ganha: <b>Ação:</b>..."
   - NUNCA use aspas soltas ou aninhadas como: 'ele ganha: "<b>Resposta:</b> ..."'
8. Glossário oficial:
   - "staging area" -> "área de preparação"
   - "resource pool" -> "reserva de recursos"
   - "exhaust" -> "esgotar"
   - "ready" -> "preparar"
   - "commit to a quest" -> "comprometer-se a uma missão"
   - "quest phase" -> "fase de missão"
   - "encounter deck" -> "baralho de encontros"
   - "encounter card" -> "carta de encontro"
   - "shadow card" -> "carta de sombra"
   - "progress tokens" / "progress" -> "fichas de progresso" / "progresso"
   - "damage" -> "dano"
   - "threat" / "threat level" -> "ameaça" / "nível de ameaça"
   - "victory display" -> "pilha de vitórias"
   - "discard pile" -> "pilha de descarte"
   - "hand" -> "mão"
   - "engaged with" -> "engajado com"
   - "engagement check" -> "teste de engajamento"
   - "defending character" -> "personagem defensor"
   - "attacking character" -> "personagem atacante"
   - "character" -> "personagem"
   - "attachments" -> "acessórios"
9. Retorne APENAS um JSON válido contendo a chave "cards" com a lista dos objetos traduzidos, contendo exatamente as chaves: id, name, traits, ability, shadowText, quote, scenarioName, stageTitle, victory, heroBannerText. (Para heróis, defina heroBannerText como "HERÓI").`;

                // The Portuguese reference guide is the authority for names, keywords and rules vocabulary.
                // Keep this compact reminder adjacent to the payload so future prompt edits do not lose it.
                const REFERENCE_TERMINOLOGY = `Use exatamente a terminologia oficial da guia: Hero=Herói, Ally=Aliado, Event=Evento, Attachment=Complemento, Enemy=Inimigo, Treachery=Traição, Location=Local, Objective=Objetivo, Quest=Missão; hit points=pontos de vida (PV), willpower=força de vontade, attack=força de ataque, defense=força de defesa, threat=ameaça, quest points=pontos de missão, victory points=pontos de vitória; Action=Ação, Response=Resposta, Forced=Forçado, When Revealed=Ao Revelar, Setup=Preparação, Travel=Viagem, Shadow=Sombra, Surge=Surto, Guarded=Defendido, Sentinel=Sentinela, Ranged=Longo Alcance, Restricted=Restrito, Unique=Único, Doomed X=Amaldiçoado X, Victory X=Vitória X. Ranger=Guerreiro (ou o traço oficial já estabelecido na carta de referência, como Caminheiro em Aragorn); não use Guardião para substituir esse termo. Use staging area=área de organização, engaged with=em confronto com, exhaust=esgotar, ready=preparar, encounter deck=baralho de encontros, shadow card=carta de sombra, progress tokens=fichas de progresso, discard pile=pilha de descartes, victory display=pilha de vitórias, resource pool=reserva de recursos. Inimigos não são personagens; Attachment é Complemento; texto de Sombra é separado; Missões têm Lado A e Lado B. Mantenha a mesma tradução no lote e não invente sinônimos.`;
                const cardsPayload = protectTranslationCards(cards).map(c => ({
                  id: c.id || c.name,
                  name: c.name || '',
                  traits: c.traits || '',
                  ability: c.ability || '',
                  shadowText: c.shadowText || '',
                  quote: c.quote || '',
                  scenarioName: c.scenarioName || '',
                  stageTitle: c.stageTitle || '',
                  victory: c.victory || '',
                  type: c.type || ''
                }));

                const promptText = `Traduza as seguintes cartas de LotR LCG para Português do Brasil (PT-BR) seguindo rigorosamente todas as regras. Aplique também esta terminologia da guia de referência: ${REFERENCE_TERMINOLOGY}\n\n${JSON.stringify({ cards: cardsPayload }, null, 2)}`;

                let translatedJson = null;

                if (provider === 'openai') {
                  const targetModel = model || DEFAULT_OPENAI_MODEL;
                  const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey.trim()}`
                    },
                    body: JSON.stringify({
                      model: targetModel,
                      response_format: { type: 'json_object' },
                      messages: [
                        { role: 'system', content: LOTR_SYSTEM_PROMPT },
                        { role: 'user', content: promptText }
                      ],
                      ...openAITranslationParameters(targetModel)
                    })
                  });

                  if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Erro OpenAI (${response.status}): ${errText}`);
                  }

                  const resJson = await response.json();
                  const content = resJson.choices?.[0]?.message?.content;
                  translatedJson = JSON.parse(content || '{}');
                } else {
                  // Google Gemini Provider with Auto-Detection and Modern Model Priority
                  const cleanKey = apiKey.trim().replace(/^['"]|['"]$/g, '');


                  // Fast-path: If user specified model or we have a cached working model
                  let availableModels = [];
                  let listModelsError = null;

                  if (globalThis.__cachedGeminiModel) {
                    availableModels.push(globalThis.__cachedGeminiModel);
                  } else {
                    try {
                      const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
                      if (listResp.ok) {
                        const listData = await listResp.json();
                        availableModels = (listData.models || [])
                          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                          .map(m => m.name.replace(/^models\//, ''))
                          .filter(m => {
                            const low = m.toLowerCase();
                            return !low.includes('tts') && 
                                   !low.includes('image') && 
                                   !low.includes('audio') && 
                                   !low.includes('transcribe') && 
                                   !low.includes('robotics') && 
                                   !low.includes('computer-use');
                          });
                        console.log('[Gemini API] Filtered Text Models from API:', availableModels);
                      } else {
                        const listErrText = await listResp.text();
                        console.warn(`[Gemini API] ListModels returned ${listResp.status}:`, listErrText);
                        try {
                          const parsedErr = JSON.parse(listErrText);
                          if (parsedErr.error?.message) {
                            listModelsError = parsedErr.error.message;
                          }
                        } catch (_) {
                          listModelsError = listErrText;
                        }
                        
                        if (listResp.status === 403 && listModelsError && listModelsError.includes('Gemini API has not been used')) {
                          throw new Error(`A API do Gemini está desativada no seu projeto do Google Cloud. Ative em: https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview ou gere uma chave direta e gratuita no Google AI Studio: https://aistudio.google.com/app/apikey`);
                        } else if (listResp.status === 400) {
                          throw new Error(`Chave de API do Gemini inválida. Obtenha uma chave gratuita em: https://aistudio.google.com/app/apikey`);
                        }
                      }
                    } catch (e) {
                      if (e.message.includes('Google AI Studio') || e.message.includes('Google Cloud')) {
                        throw e;
                      }
                      console.warn('[Gemini API] Failed to list models:', e.message);
                    }
                  }

                  // Build candidates prioritizing latest active models
                  const priorityModels = [model, ...availableModels].filter(Boolean).map(m => m.replace(/^models\//, ''));

                  const uniqueCandidates = [...new Set(priorityModels)];
                  console.log('[Gemini API] Candidate models to try in order:', uniqueCandidates);

                  let lastGeminiError = null;

                  function extractJson(rawText) {
                    if (!rawText) return null;
                    let clean = rawText.trim();
                    if (clean.startsWith('```json')) clean = clean.slice(7);
                    else if (clean.startsWith('```')) clean = clean.slice(3);
                    if (clean.endsWith('```')) clean = clean.slice(0, -3);
                    clean = clean.trim();
                    
                    try {
                      return JSON.parse(clean);
                    } catch (_) {
                      const firstBrace = clean.indexOf('{');
                      const lastBrace = clean.lastIndexOf('}');
                      if (firstBrace !== -1 && lastBrace > firstBrace) {
                        return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
                      }
                      const firstBracket = clean.indexOf('[');
                      const lastBracket = clean.lastIndexOf(']');
                      if (firstBracket !== -1 && lastBracket > firstBracket) {
                        return JSON.parse(clean.substring(firstBracket, lastBracket + 1));
                      }
                      throw new Error('Não foi possível interpretar o JSON retornado pelo Gemini.');
                    }
                  }

                  for (const mod of uniqueCandidates) {
                    for (const apiVer of ['v1beta', 'v1']) {
                      try {
                        const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${mod}:generateContent?key=${cleanKey}`;
                        
                        const universalPrompt = `${LOTR_SYSTEM_PROMPT}\n\n${promptText}\n\nIMPORTANTE: Responda APENAS um objeto JSON válido com {"cards": [...]}. Sem explicações ou markdown fora do JSON.`;

                        const payload = {
                          contents: [
                            {
                              role: 'user',
                              parts: [{ text: universalPrompt }]
                            }
                          ],
                          generationConfig: {
                            temperature: 0.2
                          }
                        };

                        const resp = await fetch(url, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          signal: AbortSignal.timeout(120000),
                          body: JSON.stringify(payload)
                        });

                        if (resp.ok) {
                          const resJson = await resp.json();
                          const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
                          if (rawText) {
                            console.log(`[Gemini API] Successfully generated content using model "${mod}" (${apiVer})`);
                            globalThis.__cachedGeminiModel = mod;
                            translatedJson = extractJson(rawText);
                            if (translatedJson) break;
                          }
                        } else {
                          const errText = await resp.text();
                          console.warn(`[Gemini API] ${mod} (${apiVer}) returned ${resp.status}:`, errText);
                          lastGeminiError = new Error(`Erro Google Gemini (${resp.status} em ${mod}/${apiVer}): ${errText}`);
                          lastGeminiError.status = resp.status;
                          if (resp.status === 404 || resp.status === 400 || resp.status === 503) {
                            continue;
                          } else {
                            throw lastGeminiError;
                          }
                        }
                      } catch (e) {
                        if ([401, 403, 429].includes(e.status) || e.name === 'TimeoutError') throw e;
                        lastGeminiError = e;
                        console.warn(`[Gemini API] Attempt failed for ${mod} (${apiVer}):`, e.message);
                        if (e.message && (e.message.includes('API_KEY_INVALID') || e.message.includes('PERMISSION_DENIED') || e.message.includes('Google AI Studio'))) {
                          throw e;
                        }
                      }
                    }
                    if (translatedJson) break;
                  }

                  if (!translatedJson) {
                    if (availableModels.length > 0) {
                      throw new Error(`Nenhum modelo compatível respondeu. Modelos de texto disponíveis: ${availableModels.join(', ')}. Detalhe: ${lastGeminiError?.message}`);
                    }
                    if (listModelsError) {
                      throw new Error(`Erro na conta Google: ${listModelsError}. Verifique sua chave no Google AI Studio: https://aistudio.google.com/app/apikey`);
                    }
                    throw lastGeminiError || new Error('Não foi possível conectar ao Google Gemini. Verifique sua chave no Google AI Studio em https://aistudio.google.com/app/apikey');
                  }
                }

                const rawList = translatedJson.cards || (Array.isArray(translatedJson) ? translatedJson : []);
                const translatedCards = mergeTranslations(cards, rawList);

                console.log('[Translation API Success] Processed cards:', translatedCards.map(c => c.name));

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ success: true, cards: translatedCards }));
              } catch (err) {
                console.error('[Translation API Error]', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || 'Erro durante a tradução.' }));
              }
            });
            return;
          }

          next();
        });
      }
    }
  ]
});

export { parseCardDetailHtml, findLocalArt, scrapeHallOfBeorn };

export default config;
