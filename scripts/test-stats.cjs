// Test parsing stats for Hero and Enemy
async function testStats() {
  const r1 = await fetch('https://hallofbeorn.com/LotR/Details/Bilbo-Baggins-THfG');
  const h1 = await r1.text();
  console.log('--- Bilbo Baggins ---');
  const sBox1 = h1.match(/<div class="statValueBox[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="statTextBox/i);
  if (sBox1) {
    console.log(sBox1[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  const r2 = await fetch('https://hallofbeorn.com/LotR/Details/Hunters-from-Mordor-THfG');
  const h2 = await r2.text();
  console.log('--- Hunters from Mordor ---');
  const sBox2 = h2.match(/<div class="statValueBox[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="statTextBox/i);
  if (sBox2) {
    console.log(sBox2[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
}

testStats();
