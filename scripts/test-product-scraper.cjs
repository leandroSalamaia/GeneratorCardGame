const fs = require('fs');

async function scrapeProduct(productUrl) {
  console.log(`Fetching product page: ${productUrl}`);
  const resp = await fetch(productUrl);
  const html = await resp.text();

  // Extract all detail links
  const detailLinkRegex = /href=["'](\/LotR\/Details\/[^"']+)["']/gi;
  const links = new Set();
  let match;
  while ((match = detailLinkRegex.exec(html)) !== null) {
    links.add('https://hallofbeorn.com' + match[1]);
  }

  console.log(`Found ${links.size} unique card links in product!`);
  const cards = [];

  for (const cardUrl of links) {
    try {
      const cardResp = await fetch(cardUrl);
      const cardHtml = await cardResp.text();

      // Name
      const nameMatch = cardHtml.match(/<div style="font-size:1\.75em;font-family:Verdana;">(.*?)<\/div>/i) ||
                        cardHtml.match(/<h2[^>]*>(.*?)<\/h2>/i);
      const name = nameMatch ? nameMatch[1].replace(/&amp;/g, '&').replace(/&#xFA;/g, 'ú').replace(/&#x27;/g, "'").trim() : '';

      // Type
      const typeMatch = cardHtml.match(/<div style="font-weight:bold;font-size:20pt;">(.*?)<\/div>/i);
      const rawType = typeMatch ? typeMatch[1].trim() : '';

      // Map to supported types (attachment, event, location, treachery)
      let type = rawType.toLowerCase();
      if (type === 'hero' || type === 'ally') {
        type = 'attachment'; // or map to event / hero
      }

      // Sphere
      let sphere = 'neutral';
      if (cardHtml.includes('/Images/Leadership')) sphere = 'leadership';
      else if (cardHtml.includes('/Images/Tactics')) sphere = 'tactics';
      else if (cardHtml.includes('/Images/Spirit')) sphere = 'spirit';
      else if (cardHtml.includes('/Images/Lore')) sphere = 'lore';

      // Card Image
      const imgMatch = cardHtml.match(/data-src="([^"]+)"/i) || cardHtml.match(/<img[^>]+class="card-image[^>]+src="([^"]+)"/i);
      let imageUrl = imgMatch ? imgMatch[1] : '';
      if (imageUrl && imageUrl.startsWith('/')) {
        imageUrl = 'https://hallofbeorn.com' + imageUrl;
      }

      // Cost
      const costMatch = cardHtml.match(/<span style="[^"]*">\[<\/span><span[^>]*>(\d+|X|-|\s*)<\/span><span[^>]*>\]<\/span>/i);
      const cost = costMatch ? costMatch[1].trim() : '1';

      // Threat
      const threatMatch = cardHtml.match(/<img[^>]*class=['"]icon-Threat['"][^>]*>\s*<\/div>\s*<div[^>]*>\s*(\d+|X|-)/i) ||
                          cardHtml.match(/(\d+)\s*<img[^>]*class=['"]icon-Threat['"]/i);
      const threat = threatMatch ? threatMatch[1].trim() : '2';

      // Quest Points
      const questMatch = cardHtml.match(/Quest Points:\s*(\d+)/i) ||
                         cardHtml.match(/(\d+)\s*<img[^>]*class=['"]icon-Quest['"]/i);
      const questPoints = questMatch ? questMatch[1].trim() : '2';

      // Victory
      const victoryMatch = cardHtml.match(/class=['"]victory-span['"][^>]*>Victory\s*(\d+)\.?<\/span>/i) ||
                           cardHtml.match(/Victory\s*(\d+)\.?/i);
      const victory = victoryMatch ? `Victory ${victoryMatch[1]}.` : '';

      // Card Number
      const cardNumMatch = cardHtml.match(/#(\d+)\s*\((x\d+)\)/i);
      const cardNumber = cardNumMatch ? `${cardNumMatch[1]}/60` : '1/15';

      // Traits
      const traitsMatch = cardHtml.match(/<a title="Trait Search"[^>]*><b><i>(.*?)<\/i><\/b><\/a>/i);
      const traits = traitsMatch ? traitsMatch[1].replace(/&nbsp;/g, ' ').trim() : '';

      // Ability text
      const mainTextMatches = [...cardHtml.matchAll(/<p class=['"]main-text['"]>(.*?)<\/p>/gi)];
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

      // Shadow text
      let hasShadow = false;
      let shadowText = '';
      if (cardHtml.includes('shadow-divider') || ability.includes('Shadow:')) {
        hasShadow = true;
        const shadowIdx = ability.indexOf('Shadow:');
        if (shadowIdx >= 0) {
          shadowText = ability.substring(shadowIdx).trim();
          ability = ability.substring(0, shadowIdx).trim();
        }
      }

      // Unique
      const isUnique = cardHtml.includes('Unique') || name.startsWith('★') || cardHtml.includes('icon-Unique');

      // Illustrator
      const illusMatch = cardHtml.match(/Illus\.\s*<\/span>\s*<a[^>]*>(.*?)<\/a>/i);
      const illustrator = illusMatch ? `Illus. ${illusMatch[1].trim()}` : 'Illus. Unknown';

      cards.push({
        id: 'hob-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        name,
        rawType,
        type: ['attachment', 'event', 'location', 'treachery'].includes(type) ? type : 'attachment',
        sphere,
        cost,
        threat,
        questPoints,
        victory,
        isUnique,
        traits,
        ability,
        hasShadow,
        shadowText,
        cardNumber,
        illustrator,
        copyright: '©2011 Middle-earth Enterprises ©2011 FFG',
        customArt: imageUrl,
        art: { zoom: 1.0, posX: 0, posY: 0, rotation: 0, brightness: 1.0, contrast: 1.0 }
      });

      console.log(`+ [${cards.length}/${links.size}] ${name} (${rawType}) -> ${type}`);
    } catch (err) {
      console.error(`Failed to parse ${cardUrl}:`, err);
    }
  }

  console.log(`Successfully scraped ${cards.length} cards!`);
  return cards;
}

scrapeProduct('https://hallofbeorn.com/LotR/Products/The-Hunt-for-Gollum?View=Browse');
