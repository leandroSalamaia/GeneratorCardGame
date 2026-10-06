const https = require('https');

function fetchUrl(url) {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const lines = data.split('\n');
      console.log('Lines 245..275:\n', lines.slice(245, 275).join('\n'));
    });
  }).on('error', console.error);
}

fetchUrl('https://hallofbeorn.com/LotR/Details/Flies-and-Spiders-Core?Lang=EN');
