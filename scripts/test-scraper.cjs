// Test scraper for Hall of Beorn cards
const fs = require('fs');

async function scrapeCard(url) {
  const resp = await fetch(url);
  const html = await resp.text();

  // Name
  const nameMatch = html.match(/<div style="font-size:1\.75em;font-family:Verdana;">(.*?)<\/div>/i) ||
                    html.match(/<h2[^>]*>(.*?)<\/h2>/i);
  const name = nameMatch ? nameMatch[1].replace(/&amp;/g, '&').replace(/&#xFA;/g, 'ú').replace(/&#x27;/g, "'").trim() : '';

  // Type
  const typeMatch = html.match(/<div style="font-weight:bold;font-size:20pt;">(.*?)<\/div>/i);
  const rawType = typeMatch ? typeMatch[1].trim() : '';

  // Sphere
  let sphere = 'neutral';
  if (html.includes('/Images/Leadership')) sphere = 'leadership';
  else if (html.includes('/Images/Tactics')) sphere = 'tactics';
  else if (html.includes('/Images/Spirit')) sphere = 'spirit';
  else if (html.includes('/Images/Lore')) sphere = 'lore';

  // Card Image
  const imgMatch = html.match(/data-src="([^"]+)"/i) || html.match(/<img[^>]+class="card-image[^>]+src="([^"]+)"/i);
  let imageUrl = imgMatch ? imgMatch[1] : '';
  if (imageUrl && imageUrl.startsWith('/')) {
    imageUrl = 'https://hallofbeorn.com' + imageUrl;
  }

  // Cost / Stats
  // Cost: [X]
  const costMatch = html.match(/<span style="[^"]*">\[<\/span><span[^>]*>(\d+|X|-|\s*)<\/span><span[^>]*>\]<\/span>/i);
  const cost = costMatch ? costMatch[1].trim() : '';

  // Threat (for Location / Enemy)
  // Threat icon is Threat-med or icon-Threat
  const threatMatch = html.match(/<img[^>]*class=['"]icon-Threat['"][^>]*>\s*<\/div>\s*<div[^>]*>\s*(\d+|X|-)/i) ||
                      html.match(/(\d+)\s*<img[^>]*class=['"]icon-Threat['"]/i) ||
                      html.match(/Threat:\s*(\d+)/i);
  
  // Quest Points
  const questMatch = html.match(/Quest Points:\s*(\d+)/i) ||
                     html.match(/(\d+)\s*<img[^>]*class=['"]icon-Quest['"]/i);

  // Victory
  const victoryMatch = html.match(/class=['"]victory-span['"][^>]*>Victory\s*(\d+)\.?<\/span>/i) ||
                       html.match(/Victory\s*(\d+)\.?/i);

  // Card Number
  const cardNumMatch = html.match(/#(\d+)\s*\((x\d+)\)/i);

  // Traits
  const traitsMatch = html.match(/<a title="Trait Search"[^>]*><b><i>(.*?)<\/i><\/b><\/a>/i);
  const traits = traitsMatch ? traitsMatch[1].replace(/&nbsp;/g, ' ').trim() : '';

  // Ability text
  const mainTextMatches = [...html.matchAll(/<p class=['"]main-text['"]>(.*?)<\/p>/gi)];
  let ability = mainTextMatches.map(m => {
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
    return t.trim();
  }).join('\n');

  // Illustrator
  const illusMatch = html.match(/Illus\.\s*<\/span>\s*<a[^>]*>(.*?)<\/a>/i);
  const illustrator = illusMatch ? `Illus. ${illusMatch[1].trim()}` : 'Illus. Unknown';

  console.log(`[PARSED] ${name} (${rawType})`);
  console.log({
    name,
    rawType,
    sphere,
    cost,
    traits,
    ability: ability.substring(0, 80) + '...',
    illustrator,
    imageUrl
  });
}

async function run() {
  await scrapeCard('https://hallofbeorn.com/LotR/Details/Dunedain-Mark-THfG');
  await scrapeCard('https://hallofbeorn.com/LotR/Details/Campfire-Tales-THfG');
  await scrapeCard('https://hallofbeorn.com/LotR/Details/The-Old-Ford-THfG');
  await scrapeCard('https://hallofbeorn.com/LotR/Details/False-Lead-THfG');
}

run();
