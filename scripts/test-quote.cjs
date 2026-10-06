// Test cleaner for flavor text
function cleanFlavorText(raw) {
  if (!raw) return '';
  let text = raw;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&lsquo;/g, '‘');
  text = text.replace(/&rsquo;/g, '’');
  text = text.replace(/&ldquo;/g, '“');
  text = text.replace(/&rdquo;/g, '”');
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&#x2013;/g, '–');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/<[^>]+>/g, '');
  return text.trim();
}

async function testCards() {
  const urls = [
    'https://hallofbeorn.com/LotR/Details/Bilbo-Baggins-THfG',
    'https://hallofbeorn.com/LotR/Details/Campfire-Tales-THfG',
    'https://hallofbeorn.com/LotR/Details/Winged-Guardian-THfG',
    'https://hallofbeorn.com/LotR/Details/The-Old-Ford-THfG'
  ];

  for (const url of urls) {
    const resp = await fetch(url);
    const html = await resp.text();

    const nameMatch = html.match(/<div style="font-size:1\.75em;font-family:Verdana;">(.*?)<\/div>/i) || html.match(/<h2[^>]*>(.*?)<\/h2>/i);
    const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    const flavorMatches = [...html.matchAll(/<p[^>]*class=['"][^'"]*flavor-text[^'"]*['"][^>]*>(.*?)<\/p>/gis)];
    const quote = flavorMatches.map(m => cleanFlavorText(m[1])).join('\n\n');

    console.log(`=== ${name} ===`);
    console.log('Quote:', quote || '(No quote)');
  }
}

testCards();
