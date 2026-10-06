const fs = require('fs');
const path = require('path');
const { createCanvas, Image, ImageData } = require('canvas');
const agPsd = require('ag-psd');

agPsd.initializeCanvas(createCanvas, (w, h) => new ImageData(w, h));

const TEMPLATES_DIR = path.resolve(__dirname, '../public/assets/templates');
const ART_DIR = path.resolve(__dirname, '../public/assets/sample_art');
const MANIFEST_PATH = path.resolve(__dirname, '../public/assets/manifest.json');

function saveCanvasToPng(canvas, filePath) {
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);
  console.log(`[SAVED] ${path.relative(process.cwd(), filePath)} (${canvas.width}x${canvas.height})`);
}

function findLayer(children, name) {
  if (!children) return null;
  for (const c of children) {
    if (c.name.trim().toLowerCase() === name.trim().toLowerCase()) return c;
    if (c.children) {
      const found = findLayer(c.children, name);
      if (found) return found;
    }
  }
  return null;
}

function main() {
  console.log('=== EXTRACTING ALLY TEMPLATES ===\n');

  if (!fs.existsSync('layout/Ally.psd')) {
    console.error('layout/Ally.psd not found!');
    return;
  }

  const allyPsd = agPsd.readPsd(fs.readFileSync('layout/Ally.psd'));
  const W = allyPsd.width, H = allyPsd.height;

  // Extract Sample Art
  const allyArt = findLayer(allyPsd.children, 'Art');
  if (allyArt && allyArt.canvas) {
    saveCanvasToPng(allyArt.canvas, path.join(ART_DIR, 'sample_ally.png'));
  }

  const allyBg = findLayer(allyPsd.children, 'Card BG');

  // Extract each sphere template
  const sphereMap = {
    neutral: null,
    leadership: 'Leadership',
    tactics: 'Tactics',
    spirit: 'Spirit',
    lore: 'Lore'
  };

  const templates = {};

  for (const [sphere, layerName] of Object.entries(sphereMap)) {
    const cvs = createCanvas(W, H);
    const ctx = cvs.getContext('2d');

    // Draw Card BG
    if (allyBg && allyBg.canvas) {
      ctx.drawImage(allyBg.canvas, allyBg.left || 0, allyBg.top || 0);
    }

    // Draw Sphere Overlay
    if (layerName) {
      const sphereLayer = findLayer(allyPsd.children, layerName);
      if (sphereLayer && sphereLayer.canvas) {
        ctx.drawImage(sphereLayer.canvas, sphereLayer.left || 0, sphereLayer.top || 0);
      }
    }

    const filename = `ally_${sphere}.png`;
    const destPath = path.join(TEMPLATES_DIR, filename);
    saveCanvasToPng(cvs, destPath);
    templates[sphere] = `templates/${filename}`;
  }

  // Update manifest.json
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (!manifest.types) manifest.types = {};
    manifest.types.ally = { templates };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log('[MANIFEST UPDATED] Ally templates added to manifest.json');
  }

  console.log('\n[SUCCESS] Ally templates extracted successfully!');
}

main();
